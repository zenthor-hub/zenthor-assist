# Architecture Communication Flows

Service-level diagrams for the Web and WhatsApp channels. Both channels share the same Convex backend and agent runtime but differ in ingress/egress paths.

## Service Map

```
Browser (Next.js)  ──WebSocket──▶  Convex (.convex.cloud)  ◀──subscribe──  Agent Runtime (Railway)
                                   Convex (.convex.site)   ◀──webhook────  Meta WhatsApp Cloud API
```

| Service                | Role                                          | Deployment   |
| ---------------------- | --------------------------------------------- | ------------ |
| Browser / Next.js      | Chat UI, real-time subscriptions              | Vercel       |
| Convex Backend         | Schema, mutations, queries, HTTP actions      | Convex Cloud |
| Agent Runtime (core)   | Job processing, AI generation, tool execution | Railway      |
| Agent Runtime (egress) | WhatsApp outbound message delivery            | Railway      |
| Meta Graph API         | WhatsApp Cloud API (send/receive)             | Meta         |
| Vercel AI Gateway      | Model routing proxy to AI providers           | Vercel       |

---

## Web Channel Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant C as Convex Backend
    participant A as Agent Runtime (core)
    participant G as AI Gateway
    participant M as AI Model

    Note over U,M: User sends a message

    U->>C: mutation messages.send(content, conversationId)
    activate C
    C->>C: INSERT messages (role=user)
    C->>C: INSERT agentQueue (status=pending)
    C-->>U: messageId
    deactivate C

    Note over A,C: Agent picks up the job

    A->>C: subscribe agent.getPendingJobs
    C-->>A: [pending job]
    A->>C: mutation agent.claimJob(jobId, processorId, lockMs)
    C-->>A: claimed=true

    loop Every 15s while processing
        A->>C: mutation agent.heartbeatJob(jobId)
    end

    A->>C: query agent.getConversationContext(conversationId)
    C-->>A: {messages, skills, agent config, contact}

    Note over A: Compact messages, evaluate context guard,<br/>resolve tools & policies, wrap approvals

    A->>C: mutation messages.createPlaceholder(conversationId)
    C-->>A: placeholderId

    Note over U,C: Browser sees placeholder via real-time subscription

    C-->>U: real-time push (new assistant message, streaming=true)

    A->>G: streamText(model, messages, tools)
    G->>M: API call (selected tier model)
    activate M

    loop Token streaming
        M-->>G: token chunk
        G-->>A: token chunk
        A->>C: mutation messages.updateStreamingContent(placeholderId, text)
        C-->>U: real-time push (updated content)
    end
    deactivate M

    A->>C: mutation messages.finalizeMessage(placeholderId, content, toolCalls)
    C-->>U: real-time push (streaming=false, final content)

    A->>C: mutation agent.completeJob(jobId, modelUsed)

    Note over U: UI renders complete message with markdown
```

### Key Details

- **Real-time updates**: Convex pushes message changes to the browser via WebSocket subscription on `messages.listByConversation`.
- **Streaming throttle**: Content patches are sent every 200ms to avoid overwhelming the backend.
- **Model selection**: `model-router.ts` picks Standard tier (`AI_MODEL`) for web. Falls back to Power tier on error.
- **Tool approvals (web)**: If a tool requires approval, the agent creates a `toolApprovals` record. The UI renders an ApprovalCard. The user clicks Approve/Reject, which resolves the record. The agent polls and continues.

---

## WhatsApp Channel Flow

```mermaid
sequenceDiagram
    participant W as WhatsApp User
    participant Meta as Meta Cloud API
    participant CH as Convex HTTP (.convex.site)
    participant C as Convex Backend
    participant A as Agent Runtime (core)
    participant G as AI Gateway
    participant M as AI Model
    participant E as Agent Runtime (egress)

    Note over W,E: Inbound: user sends a WhatsApp message

    W->>Meta: WhatsApp message
    Meta->>CH: POST /whatsapp-cloud/webhook (signed payload)
    activate CH
    CH->>CH: Verify X-Hub-Signature-256 (HMAC-SHA256)
    alt Text message
        CH->>C: internalMutation handleIncoming
    else Audio/voice note
        CH->>C: internalMutation handleIncomingMedia
    end
    activate C
    C->>C: Check inboundDedupe (skip if duplicate)
    C->>C: Lookup/create contact by phone
    alt Contact not allowed
        C-->>CH: silent drop
    else Tool approval response (YES/NO)
        C->>C: Resolve pending toolApproval
        C-->>CH: 200 OK (no enqueue)
    else Normal message
        C->>C: Lookup/create conversation (channel=whatsapp)
        C->>C: INSERT messages (role=user, media metadata for audio)
        C->>C: INSERT agentQueue (status=pending)
    end
    deactivate C
    CH-->>Meta: 200 OK
    deactivate CH

    Note over A,C: Agent picks up the job (same as web)

    A->>C: subscribe agent.getPendingJobs
    C-->>A: [pending job]
    A->>C: mutation agent.claimJob(jobId)
    C-->>A: claimed=true

    loop Every 15s while processing
        A->>C: mutation agent.heartbeatJob(jobId)
    end

    A->>C: query agent.getConversationContext(conversationId)

    opt Trigger message is audio (voice note)
        A->>Meta: GET media metadata (Graph API)
        Meta-->>A: {url, mime_type}
        A->>Meta: GET binary download
        Meta-->>A: audio buffer
        par Transcribe + Upload
            A->>A: transcribeAudio (Groq Whisper)
            A->>A: uploadMediaToBlob (Vercel Blob)
        end
        A->>C: mutation messages.updateMediaTranscript
    end
    C-->>A: {messages, skills, agent config, contact}

    Note over A: Compact, resolve tools & policies (same pipeline)

    A->>G: generateText(model, messages, tools)
    G->>M: API call (Lite tier model for WhatsApp)
    M-->>G: complete response
    G-->>A: {content, toolCalls}

    Note over A: sanitizeForWhatsApp(content):<br/>**bold** → *bold*, strip markdown links/images

    A->>C: mutation messages.addAssistantMessage(content, toolCalls)
    C-->>A: assistantMessageId
    A->>C: mutation delivery.enqueueOutbound(to, content, accountId)
    C->>C: INSERT outboundMessages (status=pending)
    A->>C: mutation agent.completeJob(jobId, modelUsed)

    Note over E,Meta: Egress: outbound delivery

    E->>C: mutation delivery.claimNextOutbound(accountId)
    C-->>E: outbound message (status=processing)

    E->>Meta: POST graph.facebook.com/v24.0/{phoneNumberId}/messages
    activate Meta
    Meta-->>E: {messages: [{id: wamid}]}
    deactivate Meta

    E->>C: mutation delivery.completeOutbound(id)
    Meta->>W: WhatsApp message delivered

    Note over Meta,CH: Meta sends delivery status webhook (sent/delivered/read)
    Meta->>CH: POST /whatsapp-cloud/webhook (statuses)
    CH->>C: handleStatus (logged, no DB update yet)
```

### Key Details

- **Webhook security**: Every inbound webhook is verified with HMAC-SHA256 using `WHATSAPP_CLOUD_APP_SECRET`.
- **Deduplication**: The `inboundDedupe` table prevents Meta webhook retries from creating duplicate messages/jobs.
- **Contact gating**: Unknown contacts are auto-created as `isAllowed: false` and silently dropped until allowed.
- **Tool approval (WhatsApp)**: Users reply YES/NO in chat. The webhook handler intercepts these before enqueuing and resolves the pending approval directly.
- **Non-streaming**: WhatsApp uses `generateText` (batch), not `streamText`, since there's no real-time connection to the user.
- **Model selection**: `model-router.ts` picks Lite tier (`AI_LITE_MODEL`) for WhatsApp. Falls back through Standard → Power on error.
- **Egress lease**: Only one egress worker can send for a given `accountId` at a time, enforced by `whatsappLeases` distributed lock with heartbeat.
- **Formatting**: `sanitizeForWhatsApp()` converts markdown to WhatsApp-compatible formatting before sending.

---

## Shared Infrastructure

```mermaid
flowchart TB
    subgraph "Convex Backend"
        messages[(messages)]
        queue[(agentQueue)]
        outbound[(outboundMessages)]
        approvals[(toolApprovals)]
        dedupe[(inboundDedupe)]
        leases[(whatsappLeases)]
    end

    subgraph "Agent Runtime"
        core[Core Worker]
        egress[Egress Worker]
    end

    subgraph "AI Layer"
        router{model-router}
        fallback[model-fallback]
        gateway[AI Gateway]
        lite[Lite: Grok 4.1]
        standard[Standard: Sonnet 4.5]
        power[Power: Opus 4.6]
    end

    core --> router
    router --> fallback
    fallback --> gateway
    gateway --> lite
    gateway --> standard
    gateway --> power

    core -->|claim/heartbeat/complete| queue
    core -->|read context, write messages| messages
    core -->|enqueue outbound| outbound
    core -->|create/poll approvals| approvals

    egress -->|claim/complete| outbound
    egress -->|acquire/heartbeat| leases

    dedupe -.->|dedup check on inbound| messages
```

---

## Database State Transitions

```mermaid
stateDiagram-v2
    state "agentQueue" as aq {
        [*] --> pending: messages.send / webhook handler
        pending --> processing: agent.claimJob
        processing --> completed: agent.completeJob
        processing --> failed: agent.failJob
        processing --> pending: agent.retryJob / requeueStaleJobs
    }

    state "outboundMessages" as om {
        [*] --> pending_ob: delivery.enqueueOutbound
        pending_ob --> processing_ob: delivery.claimNextOutbound
        processing_ob --> sent: delivery.completeOutbound
        processing_ob --> failed_ob: delivery.failOutbound
        failed_ob --> pending_ob: retry (if attempts < max)

        state "pending" as pending_ob
        state "processing" as processing_ob
        state "sent" as sent
        state "failed" as failed_ob
    }
```
