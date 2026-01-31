import { api } from "@gbarros-assistant/backend/convex/_generated/api";
import type { WAMessage } from "baileys";

import { getConvexClient } from "../convex/client";

export async function handleIncomingMessage(message: WAMessage) {
  const client = getConvexClient();

  const jid = message.key.remoteJid;
  if (!jid || jid === "status@broadcast") return;
  if (message.key.fromMe) return;

  const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
  if (!text) return;

  const phone = jid.replace("@s.whatsapp.net", "");
  console.info(`[whatsapp] Incoming from ${phone}: ${text.substring(0, 50)}...`);

  let contact = await client.query(api.contacts.getByPhone, { phone });

  if (!contact) {
    await client.mutation(api.contacts.create, {
      phone,
      name: phone,
      isAllowed: false,
    });
    contact = await client.query(api.contacts.getByPhone, { phone });
  }

  if (!contact || !contact.isAllowed) {
    console.info(`[whatsapp] Ignoring message from non-allowed contact: ${phone}`);
    return;
  }

  const conversationId = await client.mutation(api.conversations.getOrCreate, {
    contactId: contact._id,
    channel: "whatsapp",
  });

  await client.mutation(api.messages.send, {
    conversationId,
    content: text,
    channel: "whatsapp",
  });

  console.info(`[whatsapp] Queued message from ${phone} for processing`);
}
