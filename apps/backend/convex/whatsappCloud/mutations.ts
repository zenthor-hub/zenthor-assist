import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const CLOUD_API_ACCOUNT_ID = "cloud-api";

/**
 * Handle an incoming WhatsApp Cloud API message.
 * Dedupes, gates on contact allowlist, checks tool approvals, then enqueues for the agent.
 */
export const handleIncoming = internalMutation({
  args: {
    from: v.string(),
    messageId: v.string(),
    text: v.string(),
    timestamp: v.number(),
    messageType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // 1. Dedupe via inboundDedupe (channelMessageId = wamid)
    const existing = await ctx.db
      .query("inboundDedupe")
      .withIndex("by_channel_messageId", (q) =>
        q.eq("channel", "whatsapp").eq("channelMessageId", args.messageId),
      )
      .first();

    if (existing) {
      console.info(`[whatsapp-cloud] Skipping duplicate message ${args.messageId}`);
      return null;
    }

    await ctx.db.insert("inboundDedupe", {
      channel: "whatsapp",
      channelMessageId: args.messageId,
      accountId: CLOUD_API_ACCOUNT_ID,
      createdAt: Date.now(),
    });

    // 2. Contact lookup + isAllowed gate
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_phone", (q) => q.eq("phone", args.from))
      .first();

    if (!contact) {
      // Auto-create contact as not-allowed
      await ctx.db.insert("contacts", {
        phone: args.from,
        name: args.from,
        isAllowed: false,
      });
      console.info(`[whatsapp-cloud] Created non-allowed contact for ${args.from}`);
      return null;
    }

    if (!contact.isAllowed) {
      console.info(`[whatsapp-cloud] Ignoring message from non-allowed contact: ${args.from}`);
      return null;
    }

    // 3. Get or create conversation with accountId: "cloud-api"
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
      .filter((q) => q.eq(q.field("channel"), "whatsapp"))
      .filter((q) => q.eq(q.field("status"), "active"))
      .filter((q) => q.eq(q.field("accountId"), CLOUD_API_ACCOUNT_ID))
      .collect();

    let conversationId = conversations[0]?._id;

    if (!conversationId) {
      conversationId = await ctx.db.insert("conversations", {
        contactId: contact._id,
        channel: "whatsapp",
        accountId: CLOUD_API_ACCOUNT_ID,
        status: "active",
      });
    }

    // 4. Check for pending tool approvals (YES/NO flow)
    const pendingApprovals = await ctx.db
      .query("toolApprovals")
      .withIndex("by_conversationId_status", (q) =>
        q.eq("conversationId", conversationId).eq("status", "pending"),
      )
      .collect();

    if (pendingApprovals.length > 0) {
      const normalized = args.text.trim().toUpperCase();
      const approveWords = new Set(["YES", "Y", "APPROVE", "SIM"]);
      const rejectWords = new Set(["NO", "N", "REJECT", "NAO", "NÃO"]);

      if (approveWords.has(normalized) || rejectWords.has(normalized)) {
        const status = approveWords.has(normalized) ? "approved" : "rejected";
        const approval = pendingApprovals[0]!;
        await ctx.db.patch(approval._id, {
          status,
          resolvedAt: Date.now(),
        });
        console.info(
          `[whatsapp-cloud] Tool approval ${status} by ${args.from} for ${approval._id}`,
        );
        return null;
      }
    }

    // 5. Insert user message
    const msgId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.text,
      channel: "whatsapp",
      status: "sent",
    });

    // Auto-title if needed
    const conversation = await ctx.db.get(conversationId);
    if (conversation && (!conversation.title || conversation.title === "New chat")) {
      const title = args.text.length > 50 ? `${args.text.slice(0, 50)}…` : args.text;
      await ctx.db.patch(conversationId, { title });
    }

    // 6. Enqueue agent job
    await ctx.db.insert("agentQueue", {
      messageId: msgId,
      conversationId,
      status: "pending",
    });

    console.info(`[whatsapp-cloud] Queued message from ${args.from} for processing`);
    return null;
  },
});

/**
 * Handle a status update from WhatsApp Cloud API.
 * MVP: log only. Future: update outboundMessages status.
 */
export const handleStatus = internalMutation({
  args: {
    messageId: v.string(),
    status: v.string(),
    recipientId: v.string(),
    timestamp: v.number(),
    errors: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    console.info(
      `[whatsapp-cloud] Status update: ${args.status} for message ${args.messageId} to ${args.recipientId}`,
    );
    if (args.errors.length > 0) {
      console.warn(
        `[whatsapp-cloud] Status errors for ${args.messageId}: ${args.errors.join(", ")}`,
      );
    }
    return null;
  },
});
