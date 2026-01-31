import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  contacts: defineTable({
    phone: v.optional(v.string()),
    name: v.string(),
    isAllowed: v.boolean(),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    clerkUserId: v.optional(v.string()),
  })
    .index("by_phone", ["phone"])
    .index("by_clerkUserId", ["clerkUserId"]),

  conversations: defineTable({
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    contactId: v.id("contacts"),
    title: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("archived")),
  }).index("by_contactId", ["contactId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    channel: v.union(v.literal("whatsapp"), v.literal("web")),
    toolCalls: v.optional(v.any()),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("delivered"), v.literal("failed")),
  }).index("by_conversationId", ["conversationId"]),

  skills: defineTable({
    name: v.string(),
    description: v.string(),
    enabled: v.boolean(),
    config: v.optional(v.any()),
  }).index("by_name", ["name"]),

  whatsappSession: defineTable({
    key: v.string(),
    data: v.string(),
  }).index("by_key", ["key"]),

  agentQueue: defineTable({
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
  })
    .index("by_status", ["status"])
    .index("by_conversationId", ["conversationId"]),
});
