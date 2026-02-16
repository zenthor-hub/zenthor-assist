import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";

interface TelegramWebhookPayload {
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  [key: string]: unknown;
}

interface TelegramMessage {
  message_id?: number | string;
  text?: string;
  caption?: string;
  date?: number;
  from?: TelegramContact;
  chat?: TelegramChat;
}

interface TelegramContact {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id?: number | string;
  title?: string;
  username?: string;
}

function asStringId(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}

function normalizeIncomingMessage(payload: TelegramWebhookPayload): TelegramMessage | undefined {
  return (
    payload.message ?? payload.channel_post ?? payload.edited_message ?? payload.edited_channel_post
  );
}

function extractText(message: TelegramMessage): string | undefined {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text.trim();
  }

  if (typeof message.caption === "string" && message.caption.trim().length > 0) {
    return message.caption.trim();
  }

  return undefined;
}

function resolveSenderName(from: TelegramContact | undefined): string | undefined {
  if (!from) return undefined;
  const names = [from.first_name, from.last_name].filter((value): value is string =>
    Boolean(value && value.length > 0),
  );
  if (names.length > 0) return names.join(" ");
  if (typeof from.username === "string" && from.username.length > 0) return `@${from.username}`;
  return undefined;
}

export async function handleIncomingWebhook(
  ctx: Pick<ActionCtx, "runMutation">,
  request: Request,
): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[telegram] TELEGRAM_WEBHOOK_SECRET not set");
    return new Response("Server configuration error", { status: 500 });
  }

  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!providedSecret || providedSecret !== secret) {
    console.warn("[telegram] Invalid webhook secret");
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.text();
  let payload: TelegramWebhookPayload;
  try {
    payload = JSON.parse(body) as TelegramWebhookPayload;
  } catch {
    console.error("[telegram] Failed to parse webhook payload");
    return new Response("Bad request", { status: 400 });
  }

  const message = normalizeIncomingMessage(payload);
  if (!message) return new Response("OK", { status: 200 });

  const text = extractText(message);
  if (!text) return new Response("OK", { status: 200 });

  const chatId = asStringId(message.chat?.id);
  if (!chatId) return new Response("OK", { status: 200 });

  const messageId = asStringId(message.message_id);
  if (!messageId) return new Response("OK", { status: 200 });

  const accountId = process.env.TELEGRAM_ACCOUNT_ID;
  const timestamp = (message.date ? Number(message.date) : Math.floor(Date.now() / 1000)) * 1000;

  try {
    await ctx.runMutation(internal.telegram.mutations.handleIncoming, {
      chatId,
      messageId,
      text,
      timestamp,
      messageType: typeof message.text === "string" ? "text" : "caption",
      accountId,
      senderName: resolveSenderName(message.from),
      chatTitle: message.chat?.title ?? undefined,
      senderId: asStringId(message.from?.id),
    });
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[telegram] Mutation failed", { error: String(error) });
    return new Response("Internal error", { status: 500 });
  }
}

export const incoming = httpAction(handleIncomingWebhook);
