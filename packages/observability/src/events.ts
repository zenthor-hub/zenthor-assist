/**
 * Typed operational event catalog.
 *
 * Each key is a dot-delimited event name; the value is the expected payload shape.
 * Use `OperationalEventName` for compile-time event name validation and
 * `OperationalEventPayload<E>` to look up the payload type for a given event.
 *
 * Convention:
 *   - namespace.entity.verb (e.g. `agent.job.claimed`)
 *   - durations in ms, timestamps as epoch numbers
 *   - IDs as strings (Convex IDs are opaque strings at the telemetry layer)
 */

// ---------------------------------------------------------------------------
// Queue / Job lifecycle
// ---------------------------------------------------------------------------

export interface AgentJobClaimedPayload {
  jobId: string;
  conversationId: string;
  workerId: string;
  agentId?: string;
  modelName?: string;
}

export interface AgentJobCompletedPayload {
  jobId: string;
  conversationId: string;
  workerId: string;
  durationMs: number;
  tokensUsed?: number;
  modelUsed?: string;
}

export interface AgentJobFailedPayload {
  jobId: string;
  conversationId: string;
  workerId: string;
  errorReason: string;
  errorMessage: string;
}

export interface AgentJobRetriedPayload {
  jobId: string;
  conversationId: string;
  attemptCount: number;
}

export interface AgentJobLeaseLostPayload {
  jobId: string;
  conversationId: string;
  workerId: string;
}

// ---------------------------------------------------------------------------
// Lease lifecycle (WhatsApp)
// ---------------------------------------------------------------------------

export interface WhatsAppLeaseAcquireSuccessPayload {
  accountId: string;
  ownerId: string;
  expiresAt: number;
}

export interface WhatsAppLeaseAcquireContendedPayload {
  accountId: string;
  ownerId: string;
  currentOwnerId: string;
  expiresAt: number;
}

export interface WhatsAppLeaseHeartbeatLostPayload {
  accountId: string;
  ownerId: string;
}

export interface WhatsAppLeaseHeartbeatErrorPayload {
  accountId: string;
  ownerId: string;
}

export interface WhatsAppLeaseReleasedPayload {
  accountId: string;
  ownerId: string;
}

// ---------------------------------------------------------------------------
// Recovery / Resilience
// ---------------------------------------------------------------------------

export interface AgentConversationCompactedPayload {
  conversationId: string;
  jobId: string;
  beforeTokens: number;
  afterTokens: number;
}

export interface AgentConversationTruncatedPayload {
  conversationId: string;
  jobId: string;
  originalCount: number;
  truncatedCount: number;
}

export interface AgentModelPreGenerationDiagnosticsPayload {
  conversationId: string;
  jobId: string;
  shouldCompact: boolean;
  shouldBlock: boolean;
  contextMessageCount: number;
  contextTokenEstimate: number;
}

export interface AgentModelRouteSelectedPayload {
  conversationId?: string;
  jobId?: string;
  channel: string;
  toolCount: number;
  messageCount: number;
  routeTier: "lite" | "standard" | "power";
  reason: string;
  model: string;
  fallbackModels: string[];
}

export interface AgentModelFallbackUsedPayload {
  jobId?: string;
  originalModel: string;
  fallbackModel: string;
  reason: string;
  attempt: number;
  attemptCount: number;
  attemptedModels?: string[];
}

export interface AgentRetryAttemptPayload {
  jobId?: string;
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Model generation
// ---------------------------------------------------------------------------

export interface AgentModelGenerateStartedPayload {
  conversationId: string;
  jobId: string;
  model: string;
  messageCount: number;
  toolCount: number;
  contextMessageCount?: number;
  contextTokenEstimate?: number;
  shouldCompact?: boolean;
  shouldBlock?: boolean;
  systemPromptChars?: number;
  activeToolCount?: number;
  policyFingerprint?: string;
  policyMergeSource?: string;
  routeTier?: "lite" | "standard" | "power";
  routeReason?: string;
  providerMode?: "gateway" | "openai_subscription";
  resolveMode?: string;
  fallbackAttempt?: number;
  attemptedModels?: string[];
  mode?: "non_streaming" | "streaming";
}

export interface AgentModelGenerateCompletedPayload {
  conversationId: string;
  jobId: string;
  model: string;
  durationMs: number;
  routeTier?: "lite" | "standard" | "power";
  providerMode?: "gateway" | "openai_subscription";
  contextMessageCount?: number;
  contextTokenEstimate?: number;
  fallbackAttempt?: number;
  attemptedModels?: string[];
  shouldCompact?: boolean;
  shouldBlock?: boolean;
  mode?: "non_streaming" | "streaming" | "stream_consumed";
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
}

// ---------------------------------------------------------------------------
// Tool approval
// ---------------------------------------------------------------------------

export interface AgentToolApprovalRequestedPayload {
  approvalId: string;
  conversationId: string;
  jobId: string;
  toolName: string;
  channel: string;
}

export interface AgentToolApprovalResolvedPayload {
  approvalId: string;
  conversationId: string;
  status: "approved" | "rejected" | "timeout";
  channel: string;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API
// ---------------------------------------------------------------------------

export interface WhatsAppCloudSendSuccessPayload {
  phone: string;
  wamid: string;
  messageLength: number;
}

export interface WhatsAppCloudSendFailedPayload {
  phone: string;
  error: string;
  statusCode: number;
}

// ---------------------------------------------------------------------------
// WhatsApp connection
// ---------------------------------------------------------------------------

export interface WhatsAppConnectionEstablishedPayload {}

export interface WhatsAppConnectionClosedPayload {
  statusCode?: number;
  shouldReconnect: boolean;
}

// ---------------------------------------------------------------------------
// WhatsApp inbound / outbound
// ---------------------------------------------------------------------------

export interface WhatsAppInboundReceivedPayload {
  phone: string;
  jid: string;
  messageLength: number;
}

export interface WhatsAppInboundQueuedPayload {
  phone: string;
  conversationId: string;
}

export interface WhatsAppInboundDedupeSkippedPayload {
  phone: string;
  channelMessageId: string;
}

export interface WhatsAppInboundIgnoredPayload {
  phone: string;
}

export interface WhatsAppOutboundSentPayload {
  phone: string;
  jid: string;
  messageLength: number;
}

export interface WhatsAppOutboundLoopStartedPayload {
  accountId: string;
  ownerId: string;
}

export interface WhatsAppOutboundLoopErrorPayload {
  accountId: string;
  ownerId: string;
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export interface AgentPluginsSyncFailedPayload {}

export interface AgentStartingPayload {
  role: string;
  enableWhatsApp: boolean;
}

export interface AgentReadyPayload {
  role: string;
  enableWhatsApp: boolean;
}

// ---------------------------------------------------------------------------
// Event map — maps event name → payload type
// ---------------------------------------------------------------------------

export interface OperationalEventMap {
  // Queue / Job
  "agent.job.claimed": AgentJobClaimedPayload;
  "agent.job.completed": AgentJobCompletedPayload;
  "agent.job.failed": AgentJobFailedPayload;
  "agent.job.retried": AgentJobRetriedPayload;
  "agent.job.lease_lost": AgentJobLeaseLostPayload;

  // Lease
  "whatsapp.lease.acquire.success": WhatsAppLeaseAcquireSuccessPayload;
  "whatsapp.lease.acquire.contended": WhatsAppLeaseAcquireContendedPayload;
  "whatsapp.lease.heartbeat.lost": WhatsAppLeaseHeartbeatLostPayload;
  "whatsapp.lease.heartbeat.error": WhatsAppLeaseHeartbeatErrorPayload;
  "whatsapp.lease.released": WhatsAppLeaseReleasedPayload;

  // Recovery
  "agent.conversation.compacted": AgentConversationCompactedPayload;
  "agent.conversation.truncated": AgentConversationTruncatedPayload;
  "agent.model.pre_generation_diagnostics": AgentModelPreGenerationDiagnosticsPayload;
  "agent.model.route.selected": AgentModelRouteSelectedPayload;
  "agent.model.fallback.used": AgentModelFallbackUsedPayload;
  "agent.retry.attempt": AgentRetryAttemptPayload;

  // Model generation
  "agent.model.generate.started": AgentModelGenerateStartedPayload;
  "agent.model.generate.completed": AgentModelGenerateCompletedPayload;

  // Tool approval
  "agent.tool.approval.requested": AgentToolApprovalRequestedPayload;
  "agent.tool.approval.approved": AgentToolApprovalResolvedPayload;
  "agent.tool.approval.rejected": AgentToolApprovalResolvedPayload;
  "agent.tool.approval.timeout": AgentToolApprovalResolvedPayload;
  "agent.tool.approval.resolved_whatsapp": AgentToolApprovalResolvedPayload;

  // WhatsApp connection
  "whatsapp.connection.established": WhatsAppConnectionEstablishedPayload;
  "whatsapp.connection.closed": WhatsAppConnectionClosedPayload;
  "whatsapp.qr.available": Record<string, never>;
  "whatsapp.baileys.version": { version: string };
  "whatsapp.auth.mode_selected": { mode: string };
  "whatsapp.ingress.disabled": Record<string, never>;
  "whatsapp.message.handling_error": Record<string, never>;
  "whatsapp.baileys.warning": { message: string };
  "whatsapp.baileys.error": { message: string };

  // WhatsApp inbound / outbound
  "whatsapp.inbound.received": WhatsAppInboundReceivedPayload;
  "whatsapp.inbound.queued": WhatsAppInboundQueuedPayload;
  "whatsapp.inbound.dedupe_skipped": WhatsAppInboundDedupeSkippedPayload;
  "whatsapp.inbound.ignored_not_allowed": WhatsAppInboundIgnoredPayload;
  "whatsapp.outbound.sent": WhatsAppOutboundSentPayload;
  "whatsapp.outbound.loop.started": WhatsAppOutboundLoopStartedPayload;
  "whatsapp.outbound.loop.error": WhatsAppOutboundLoopErrorPayload;

  // WhatsApp Cloud API
  "whatsapp.cloud.lease.acquire.success": WhatsAppLeaseAcquireSuccessPayload;
  "whatsapp.cloud.lease.acquire.contended": WhatsAppLeaseAcquireContendedPayload;
  "whatsapp.cloud.lease.heartbeat.lost": WhatsAppLeaseHeartbeatLostPayload;
  "whatsapp.cloud.lease.heartbeat.error": WhatsAppLeaseHeartbeatErrorPayload;
  "whatsapp.cloud.lease.released": WhatsAppLeaseReleasedPayload;
  "whatsapp.cloud.outbound.loop.started": WhatsAppOutboundLoopStartedPayload;
  "whatsapp.cloud.outbound.loop.error": WhatsAppOutboundLoopErrorPayload;
  "whatsapp.cloud.send.success": WhatsAppCloudSendSuccessPayload;
  "whatsapp.cloud.send.failed": WhatsAppCloudSendFailedPayload;

  // Plugin lifecycle
  "agent.plugins.sync.failed": AgentPluginsSyncFailedPayload;

  // Agent lifecycle
  "agent.starting": AgentStartingPayload;
  "agent.ready": AgentReadyPayload;
  "agent.whatsapp.disabled": { role: string };
  "agent.missing_required_env": { key: string };
  "agent.fatal": Record<string, never>;

  // Memory
  "agent.compact.memory_store_failed": Record<string, never>;
}

/** Union of all registered event names. */
export type OperationalEventName = keyof OperationalEventMap;

/** Look up the payload type for a given event name. */
export type OperationalEventPayload<E extends OperationalEventName> = OperationalEventMap[E];
