import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { classifyApprovalText } from "../lib/approvalKeywords";

const CLOUD_API_ACCOUNT_ID = "cloud-api";

/**
 * Generate phone number variants for lookup.
 * Handles the Brazilian 9th digit issue: mobile numbers may appear as
 * 55{area}{8digits} or 55{area}9{8digits} depending on the source.
 */
function phoneVariants(phone: string): string[] {
  const variants = [phone];
  // Brazilian numbers: country code 55, 2-digit area code
  if (phone.startsWith("55") && phone.length >= 12) {
    const area = phone.slice(2, 4);
    const local = phone.slice(4);
    if (local.length === 8) {
      // 8-digit local → try adding leading 9
      variants.push(`55${area}9${local}`);
    } else if (local.length === 9 && local.startsWith("9")) {
      // 9-digit local → try removing leading 9
      variants.push(`55${area}${local.slice(1)}`);
    }
  }
  return variants;
}

/**
 * Look up a contact by phone, trying normalized variants.
 * Prefers contacts linked to a user account over unlinked ones.
 */
async function findContactByPhone(ctx: MutationCtx, phone: string) {
  const variants = phoneVariants(phone);
  let fallbackContact: Doc<"contacts"> | null = null;

  for (const variant of variants) {
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_phone", (q) => q.eq("phone", variant))
      .first();
    if (!contact) continue;
    // Prefer authorized contacts (linked to a user or explicitly allowed)
    if (contact.userId || contact.isAllowed) return contact;
    // Keep first non-authorized match as fallback
    if (!fallbackContact) fallbackContact = contact;
  }
  return fallbackContact;
}

/**
 * Attempt to resolve the first pending tool approval for a conversation
 * by interpreting user text as an approval keyword.
 * Returns the resolved status or null if no match / no pending approvals.
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

    // 2. Contact lookup + isAllowed gate (with phone normalization)
    const contact = await findContactByPhone(ctx, args.from);

    if (!contact) {
      // Auto-create contact as not-allowed (no linked user account yet)
      await ctx.db.insert("contacts", {
        phone: args.from,
        name: args.from,
        isAllowed: false,
      });
      console.info(`[whatsapp-cloud] Created non-allowed contact for ${args.from}`);
      return null;
    }

    // A contact is authorized if explicitly allowed OR linked to a user account
    if (!contact.isAllowed && !contact.userId) {
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

    // 4. Check for pending tool approvals (YES/NO flow) — shared keyword logic
    const resolved = await resolveApprovalByText(ctx, conversationId, args.text);
    if (resolved) {
      console.info(
        `[whatsapp-cloud] Tool approval ${resolved.status} by ${args.from} for ${resolved._id}`,
      );
      return null;
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
 * Handle an incoming WhatsApp Cloud API media message (audio, image, etc).
 * Stores media metadata; the agent downloads and transcribes when processing.
 */
export const handleIncomingMedia = internalMutation({
  args: {
    from: v.string(),
    messageId: v.string(),
    timestamp: v.number(),
    messageType: v.string(),
    mediaId: v.string(),
    mimetype: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // 1. Dedupe
    const existing = await ctx.db
      .query("inboundDedupe")
      .withIndex("by_channel_messageId", (q) =>
        q.eq("channel", "whatsapp").eq("channelMessageId", args.messageId),
      )
      .first();

    if (existing) {
      console.info(`[whatsapp-cloud] Skipping duplicate media message ${args.messageId}`);
      return null;
    }

    await ctx.db.insert("inboundDedupe", {
      channel: "whatsapp",
      channelMessageId: args.messageId,
      accountId: CLOUD_API_ACCOUNT_ID,
      createdAt: Date.now(),
    });

    // 2. Contact lookup + isAllowed gate (with phone normalization)
    const contact = await findContactByPhone(ctx, args.from);

    if (!contact) {
      await ctx.db.insert("contacts", {
        phone: args.from,
        name: args.from,
        isAllowed: false,
      });
      console.info(`[whatsapp-cloud] Created non-allowed contact for ${args.from}`);
      return null;
    }

    // A contact is authorized if explicitly allowed OR linked to a user account
    if (!contact.isAllowed && !contact.userId) {
      console.info(`[whatsapp-cloud] Ignoring media from non-allowed contact: ${args.from}`);
      return null;
    }

    // 3. Get or create conversation
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

    // 4. Insert message with media metadata and placeholder content
    const msgId = await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: "[Audio message]",
      channel: "whatsapp",
      media: {
        type: "audio",
        sourceId: args.mediaId,
        mimetype: args.mimetype,
      },
      status: "sent",
    });

    // Auto-title for audio conversations
    const conversation = await ctx.db.get(conversationId);
    if (conversation && (!conversation.title || conversation.title === "New chat")) {
      await ctx.db.patch(conversationId, { title: "Voice message" });
    }

    // 5. Enqueue agent job
    await ctx.db.insert("agentQueue", {
      messageId: msgId,
      conversationId,
      status: "pending",
    });

    console.info(`[whatsapp-cloud] Queued audio message from ${args.from} for processing`);
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
