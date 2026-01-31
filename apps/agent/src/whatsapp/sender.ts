import type { WASocket } from "baileys";

let socket: WASocket | null = null;

export function setWhatsAppSocket(sock: WASocket) {
  socket = sock;
}

export async function sendWhatsAppMessage(phone: string, text: string) {
  if (!socket) {
    console.warn("[whatsapp] Socket not connected, cannot send message");
    return;
  }

  const jid = `${phone}@s.whatsapp.net`;
  await socket.sendMessage(jid, { text });
  console.info(`[whatsapp] Sent message to ${phone}`);
}
