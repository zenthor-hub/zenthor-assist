import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { classifyApprovalText } from "../lib/approvalKeywords";

/**
 * Find an existing contact for Telegram chat id.
 * Unlike WhatsApp, Telegram IDs are mostly globally unique numeric identifiers.
 */
async function findContactByPhone(ctx: MutationCtx, chatId: string) {
  return await ctx.db
    .query("contacts")
    .withIndex("by_phone", (q) => q.eq("phone", chatId))
    .first();
}

/**
 * Resolve a single active telegram conversation for a contact/account.
 * Keeps newest active conversation and archives older duplicates.
 */
async function getOrCreateTelegramConversation(
  ctx: MutationCtx,
  contactId: Id<"contacts">,
  accountId: string,
) {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_contactId", (q) => q.eq("contactId", contactId))
    .filter((q) => q.eq(q.field("channel"), "telegram"))
    .filter((q) => q.eq(q.field("status"), "active"))
    .filter((q) => q.eq(q.field("accountId"), accountId))
    .collect();

  const sorted = conversations.sort((a, b) => b._creationTime - a._creationTime);
  const [conversation, ...duplicates] = sorted;

  for (const duplicate of duplicates) {
    await ctx.db.patch(duplicate._id, { status: "archived" });
  }

  if (conversation) {
    return conversation._id;
  }

  return await ctx.db.insert("conversations", {
    contactId,
    channel: "telegram",
    accountId,
    status: "active",
  });
}

/**
 * Check for pending tool approvals by interpreting user text as an approval keyword.
 */
async function resolveApprovalByText(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  text: string,
): Promise<{ _id: Id<"toolApprovals">; status: string } | null> {
  const status = classifyApprovalText(text);
  if (!status) return null;

  const pending = await ctx.db
    .query("toolApprovals")
    .withIndex("by_conversationId_status", (q) =>
      q.eq("conversationId", conversationId).eq("status", "pending"),
    )
    .first();

  if (!pending) return null;

  await ctx.db.patch(pending._id, { status, resolvedAt: Date.now() });
  return { _id: pending._id, status };
}

export const handleIncoming = internalMutation({
  args: {
    chatId: v.string(),
    messageId: v.string(),
    text: v.string(),
    timestamp: v.number(),
    messageType: v.string(),
    accountId: v.optional(v.string()),
    senderName: v.optional(v.string()),
    chatTitle: v.optional(v.string()),
    senderId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const channelMessageId = `${args.chatId}:${args.messageId}`;

    const existing = await ctx.db
      .query("inboundDedupe")
      .withIndex("by_channel_messageId", (q) =>
        q.eq("channel", "telegram").eq("channelMessageId", channelMessageId),
      )
      .first();

    if (existing) {
      console.info(`[telegram] Skipping duplicate message ${channelMessageId}`);
      return null;
    }

    await ctx.db.insert("inboundDedupe", {
      channel: "telegram",
      channelMessageId,
      accountId: args.accountId,
      createdAt: Date.now(),
    });

    let contact = await findContactByPhone(ctx, args.chatId);
    const contactName = args.senderName || args.chatTitle || args.chatId;

    if (!contact) {
      const fallbackSender = args.senderName ?? "unknown";
      await ctx.db.insert("contacts", {
        phone: args.chatId,
        name: contactName || fallbackSender,
        isAllowed: false,
      });
      console.info(`[telegram] Created non-allowed contact for ${args.chatId}`);
      return null;
    }

    // A contact is authorized if explicitly allowed OR linked to a user account.
    if (!contact.isAllowed && !contact.userId) {
      console.info(`[telegram] Ignoring message from non-allowed telegram chat: ${args.chatId}`);
      return null;
    }

    const accountId = args.accountId ?? "default";
    const conversationId = await getOrCreateTelegramConversation(ctx, contact._id, accountId);

    const resolved = await resolveApprovalByText(ctx, conversationId, args.text);
    if (resolved) {
      console.info(
        `[telegram] Tool approval ${resolved.status} by ${args.chatId} for ${resolved._id}`,
      );
      return null;
    }

    const msgId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.text,
      channel: "telegram",
      status: "sent",
    });

    // Auto-title if needed.
    const conversation = await ctx.db.get(conversationId);
    if (conversation && (!conversation.title || conversation.title === "New chat")) {
      const title = args.text.length > 50 ? `${args.text.slice(0, 50)}…` : args.text;
      await ctx.db.patch(conversationId, { title });
    }

    await ctx.db.insert("agentQueue", {
      messageId: msgId,
      conversationId,
      status: "pending",
    });

    console.info(`[telegram] Queued message from ${args.chatId} for processing`);
    return null;
  },
});
