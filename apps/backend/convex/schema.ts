import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    externalId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
    emailVerified: v.optional(v.boolean()),
    image: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"]),

  contacts: defineTable({
    phone: v.string(),
    name: v.string(),
    isAllowed: v.boolean(),
    userId: v.optional(v.id("users")),
  })
    .index("by_phone", ["phone"])
    .index("by_userId", ["userId"]),

  phoneVerifications: defineTable({
    userId: v.id("users"),
    phone: v.string(),
    code: v.string(),
    status: v.union(v.literal("pending"), v.literal("verified"), v.literal("expired")),
    createdAt: v.number(),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_userId_status", ["userId", "status"])
    .index("by_phone_status", ["phone", "status"]),

  conversations: defineTable({
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    userId: v.optional(v.id("users")),
    contactId: v.optional(v.id("contacts")),
    agentId: v.optional(v.id("agents")),
    accountId: v.optional(v.string()),
    title: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
  })
    .index("by_userId", ["userId"])
    .index("by_contactId", ["contactId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    toolCalls: v.optional(
      v.array(
        v.object({
          name: v.string(),
          input: v.any(),
          output: v.optional(v.any()),
        }),
      ),
    ),
    modelUsed: v.optional(v.string()),
    streaming: v.optional(v.boolean()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
  }).index("by_conversationId", ["conversationId"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    showModelInfo: v.optional(v.boolean()),
    showToolDetails: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  skills: defineTable({
    ownerUserId: v.optional(v.id("users")),
    name: v.string(),
    description: v.string(),
    enabled: v.boolean(),
    config: v.optional(
      v.object({
        systemPrompt: v.optional(v.string()),
        toolPolicy: v.optional(
          v.object({
            allow: v.optional(v.array(v.string())),
            deny: v.optional(v.array(v.string())),
          }),
        ),
      }),
    ),
  })
    .index("by_name", ["name"])
    .index("by_enabled", ["enabled"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_ownerUserId_enabled", ["ownerUserId", "enabled"]),

  todoistConnections: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    tokenType: v.optional(v.string()),
    scope: v.optional(v.string()),
    accountEmail: v.optional(v.string()),
    accountName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  todoistOauthStates: defineTable({
    userId: v.id("users"),
    state: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_userId", ["userId"]),

  whatsappSession: defineTable({
    key: v.string(),
    data: v.string(),
  }).index("by_key", ["key"]),

  whatsappAccounts: defineTable({
    accountId: v.string(),
    phone: v.string(),
    enabled: v.boolean(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_accountId", ["accountId"]),

  whatsappLeases: defineTable({
    accountId: v.string(),
    ownerId: v.string(),
    expiresAt: v.number(),
    heartbeatAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_ownerId", ["ownerId"]),

  agentQueue: defineTable({
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    agentId: v.optional(v.id("agents")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    errorReason: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    attemptCount: v.optional(v.number()),
    modelUsed: v.optional(v.string()),
    processorId: v.optional(v.string()),
    lockedUntil: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    lastHeartbeatAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_conversationId", ["conversationId"]),

  agents: defineTable({
    name: v.string(),
    description: v.string(),
    systemPrompt: v.string(),
    model: v.optional(v.string()),
    fallbackModel: v.optional(v.string()),
    enabled: v.boolean(),
    toolPolicy: v.optional(
      v.object({
        allow: v.optional(v.array(v.string())),
        deny: v.optional(v.array(v.string())),
      }),
    ),
  })
    .index("by_name", ["name"])
    .index("by_enabled", ["enabled"]),

  memories: defineTable({
    conversationId: v.optional(v.id("conversations")),
    content: v.string(),
    embedding: v.array(v.float64()),
    source: v.union(v.literal("conversation"), v.literal("manual")),
    createdAt: v.number(),
  })
    .index("by_conversationId", ["conversationId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["source", "conversationId"],
    }),

  scheduledTasks: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    cronExpression: v.optional(v.string()),
    intervalMs: v.optional(v.number()),
    payload: v.string(),
    enabled: v.boolean(),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    conversationId: v.optional(v.id("conversations")),
    createdAt: v.number(),
  })
    .index("by_enabled", ["enabled"])
    .index("by_nextRunAt", ["nextRunAt"]),

  toolApprovals: defineTable({
    conversationId: v.id("conversations"),
    jobId: v.id("agentQueue"),
    toolName: v.string(),
    toolInput: v.any(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    channel: v.union(v.literal("web"), v.literal("whatsapp")),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_conversationId_status", ["conversationId", "status"]),

  outboundMessages: defineTable({
    channel: v.union(v.literal("web"), v.literal("whatsapp")),
    accountId: v.optional(v.string()),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    to: v.optional(v.string()),
    payload: v.object({
      content: v.string(),
      metadata: v.optional(
        v.object({
          kind: v.string(),
          toolName: v.optional(v.string()),
        }),
      ),
    }),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    processorId: v.optional(v.string()),
    lockedUntil: v.optional(v.number()),
    attemptCount: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_accountId", ["status", "accountId"])
    .index("by_conversationId", ["conversationId"]),

  pluginDefinitions: defineTable({
    name: v.string(),
    version: v.string(),
    source: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    manifest: v.any(),
    checksum: v.optional(v.string()),
    diagnosticStatus: v.optional(
      v.union(v.literal("activated"), v.literal("conflict"), v.literal("invalid")),
    ),
    diagnosticMessages: v.optional(v.array(v.string())),
    lastDiagnosticAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  pluginInstalls: defineTable({
    workspaceScope: v.string(),
    agentId: v.optional(v.id("agents")),
    channel: v.optional(v.union(v.literal("web"), v.literal("whatsapp"))),
    pluginName: v.string(),
    enabled: v.boolean(),
    config: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_scope_agent_channel", ["workspaceScope", "agentId", "channel"])
    .index("by_pluginName", ["pluginName"]),

  pluginPolicies: defineTable({
    workspaceScope: v.string(),
    agentId: v.optional(v.id("agents")),
    channel: v.optional(v.union(v.literal("web"), v.literal("whatsapp"))),
    allow: v.optional(v.array(v.string())),
    deny: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_agent_channel", ["workspaceScope", "agentId", "channel"]),

  tasks: defineTable({
    userId: v.id("users"),
    conversationId: v.optional(v.id("conversations")),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done")),
    // Todoist-aligned: 1=normal, 2=medium, 3=high, 4=urgent
    priority: v.optional(v.number()),
    // Rich due date object matching Todoist API v2
    due: v.optional(
      v.object({
        date: v.string(), // "2025-02-14" (always present)
        datetime: v.optional(v.string()), // "2025-02-14T09:00:00" (when time is set)
        string: v.optional(v.string()), // human-readable e.g. "every monday"
        isRecurring: v.optional(v.boolean()),
        timezone: v.optional(v.string()),
        lang: v.optional(v.string()),
      }),
    ),
    // Denormalized epoch ms for indexing (computed from due.datetime or due.date)
    dueAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    projectId: v.optional(v.id("taskProjects")),
    sectionId: v.optional(v.id("taskSections")),
    parentId: v.optional(v.id("tasks")),
    order: v.optional(v.number()),
    assigneeId: v.optional(v.id("users")),
    duration: v.optional(
      v.object({
        amount: v.number(),
        unit: v.union(v.literal("minute"), v.literal("day")),
      }),
    ),
    remindAt: v.optional(v.number()),
    todoistTaskId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_dueAt", ["userId", "dueAt"])
    .index("by_userId_projectId", ["userId", "projectId"])
    .index("by_userId_sectionId", ["userId", "sectionId"])
    .index("by_parentId", ["parentId"])
    .index("by_assigneeId_status", ["assigneeId", "status"])
    .index("by_todoistTaskId", ["todoistTaskId"]),

  taskProjects: defineTable({
    userId: v.id("users"),
    name: v.string(),
    color: v.optional(v.string()),
    parentId: v.optional(v.id("taskProjects")),
    order: v.optional(v.number()),
    isFavorite: v.optional(v.boolean()),
    viewStyle: v.optional(v.union(v.literal("list"), v.literal("board"))),
    isInboxProject: v.optional(v.boolean()),
    todoistProjectId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_todoistProjectId", ["todoistProjectId"]),

  taskSections: defineTable({
    userId: v.id("users"),
    projectId: v.id("taskProjects"),
    name: v.string(),
    order: v.optional(v.number()),
    todoistSectionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_todoistSectionId", ["todoistSectionId"]),

  inboundDedupe: defineTable({
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    channelMessageId: v.string(),
    accountId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_channel_messageId", ["channel", "channelMessageId"])
    .index("by_createdAt", ["createdAt"]),
});
