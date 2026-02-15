import { api } from "@zenthor-assist/backend/convex/_generated/api";
import { env } from "@zenthor-assist/env/agent";
import type { WAMessage } from "baileys";

import { getConvexClient } from "../convex/client";
import { logger, typedEvent } from "../observability/logger";

export async function handleIncomingMessage(message: WAMessage) {
  const client = getConvexClient();

  const jid = message.key.remoteJid;
  if (!jid || jid === "status@broadcast") return;
  if (message.key.fromMe) return;

  const imageMessage = message.message?.imageMessage;
  const videoMessage = message.message?.videoMessage;
  const documentMessage = message.message?.documentMessage;

  const rawText =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    imageMessage?.caption ||
    videoMessage?.caption ||
    documentMessage?.caption;
  const fallbackText = imageMessage
    ? "[Image message]"
    : videoMessage
      ? "[Video message]"
      : documentMessage
        ? "[Document message]"
        : "";
  const text = rawText?.trim() ? rawText : fallbackText;

  if (!text) return;

  const media = imageMessage
    ? {
        type: "image" as const,
        sourceId: message.key.id ?? `wa-${Date.now()}`,
        mimetype: imageMessage.mimetype ?? "image/jpeg",
      }
    : videoMessage
      ? {
          type: "video" as const,
          sourceId: message.key.id ?? `wa-${Date.now()}`,
          mimetype: videoMessage.mimetype ?? "video/mp4",
        }
      : documentMessage
        ? {
            type: "document" as const,
            sourceId: message.key.id ?? `wa-${Date.now()}`,
            mimetype: documentMessage.mimetype ?? "application/octet-stream",
          }
        : undefined;

  const phone = jid.replace("@s.whatsapp.net", "");
  void logger.lineInfo(`[whatsapp] Incoming from ${phone}: ${text.substring(0, 50)}...`);
  typedEvent.info("whatsapp.inbound.received", {
    phone,
    jid,
    messageLength: text.length,
  });

  // Dedupe inbound messages to prevent duplicate processing from provider retries
  const channelMessageId = message.key.id;
  if (channelMessageId) {
    const { isDuplicate } = await client.mutation(api.inboundDedupe.checkAndRegister, {
      serviceKey: env.AGENT_SECRET,
      channel: "whatsapp",
      channelMessageId,
    });

    if (isDuplicate) {
      void logger.lineInfo(
        `[whatsapp] Skipping duplicate message ${channelMessageId} from ${phone}`,
      );
      typedEvent.info("whatsapp.inbound.dedupe_skipped", {
        phone,
        channelMessageId,
      });
      return;
    }
  }

  let contact = await client.query(api.contacts.getByPhone, {
    serviceKey: env.AGENT_SECRET,
    phone,
  });

  if (!contact) {
    await client.mutation(api.contacts.create, {
      serviceKey: env.AGENT_SECRET,
      phone,
      name: phone,
      isAllowed: false,
    });
    contact = await client.query(api.contacts.getByPhone, { serviceKey: env.AGENT_SECRET, phone });
  }

  if (!contact || !contact.isAllowed) {
    void logger.lineInfo(`[whatsapp] Ignoring message from non-allowed contact: ${phone}`);
    typedEvent.warn("whatsapp.inbound.ignored_not_allowed", { phone });
    return;
  }

  const conversationId = await client.mutation(api.conversations.getOrCreate, {
    serviceKey: env.AGENT_SECRET,
    contactId: contact._id,
    channel: "whatsapp",
    accountId: env.WHATSAPP_ACCOUNT_ID ?? "default",
  });

  // Check for pending tool approvals before normal message handling
  const pendingApprovals = await client.query(api.toolApprovals.getPendingByConversationService, {
    serviceKey: env.AGENT_SECRET,
    conversationId,
  });

  if (pendingApprovals.length > 0) {
    const normalized = text.trim().toUpperCase();
    const approveWords = new Set(["YES", "Y", "APPROVE", "SIM"]);
    const rejectWords = new Set(["NO", "N", "REJECT", "NAO", "NÃO"]);

    if (approveWords.has(normalized) || rejectWords.has(normalized)) {
      const status = approveWords.has(normalized) ? "approved" : "rejected";
      await client.mutation(api.toolApprovals.resolveService, {
        serviceKey: env.AGENT_SECRET,
        approvalId: pendingApprovals[0]!._id,
        status,
      });
      void logger.lineInfo(
        `[whatsapp] Tool approval ${status} by ${phone} for approval ${pendingApprovals[0]!._id}`,
      );
      typedEvent.info("agent.tool.approval.resolved_whatsapp", {
        approvalId: pendingApprovals[0]!._id,
        conversationId,
        status,
        channel: "whatsapp",
      });
      return;
    }
  }

  await client.mutation(api.messages.sendService, {
    serviceKey: env.AGENT_SECRET,
    conversationId,
    content: text,
    channel: "whatsapp",
    ...(media ? { media } : {}),
  });

  void logger.lineInfo(`[whatsapp] Queued message from ${phone} for processing`);
  typedEvent.info("whatsapp.inbound.queued", {
    phone,
    conversationId,
  });
}
