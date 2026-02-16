import { env } from "@zenthor-assist/env/agent";

import { logger, typedEvent } from "../observability/logger";

const SEND_TIMEOUT_MS = 30_000;

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramMessage {
  message_id: number;
}

function getBotToken(): string {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  return token;
}

function getBaseUrl(): string {
  return `https://api.telegram.org/bot${getBotToken()}`;
}

function normalizeChatId(chatId: string): string {
  return chatId.startsWith("telegram:")
    ? chatId.slice("telegram:".length)
    : chatId.startsWith("tg:")
      ? chatId.slice(3)
      : chatId;
}

function sanitizeText(text: string): string {
  return text.trim();
}

async function request<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const response = await fetch(`${getBaseUrl()}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  const rawBody = await response.text();
  let payload: TelegramApiResponse<T> = { ok: false };
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as TelegramApiResponse<T>;
    } catch {
      payload = { ok: false };
    }
  }

  if (!response.ok || payload.ok === false) {
    const errorMsg = payload.description ?? `HTTP ${response.status}`;
    void logger.lineError(`[telegram] Telegram API request failed: ${errorMsg}`);
    typedEvent.error("telegram.api.failed", {
      method,
      error: errorMsg,
      statusCode: response.status,
    });
    throw new Error(`Telegram API error (${method}): ${errorMsg}`);
  }

  return payload;
}

export async function sendMessage(chatId: string, content: string): Promise<number> {
  const normalized = normalizeChatId(chatId);
  const payload = await request<TelegramMessage>("sendMessage", {
    chat_id: normalized,
    text: sanitizeText(content),
    parse_mode: "MarkdownV2",
  });
  const messageId = payload.result?.message_id;
  if (!messageId) {
    throw new Error("Telegram API did not return message_id");
  }

  void logger.lineInfo(`[telegram] Sent message to ${normalized} (message_id: ${messageId})`);
  return messageId;
}

export async function editMessage(
  chatId: string,
  messageId: number,
  content: string,
): Promise<void> {
  const normalized = normalizeChatId(chatId);
  await request<unknown>("editMessageText", {
    chat_id: normalized,
    message_id: messageId,
    text: sanitizeText(content),
    parse_mode: "MarkdownV2",
  });

  void logger.lineInfo(`[telegram] Edited message ${messageId} in chat ${normalized}`);
}

export async function sendTypingIndicator(chatId: string): Promise<void> {
  const normalized = normalizeChatId(chatId);
  await request<unknown>("sendChatAction", {
    chat_id: normalized,
    action: "typing",
  });
}

export async function deleteMessage(chatId: string, messageId: number): Promise<void> {
  const normalized = normalizeChatId(chatId);
  await request<unknown>("deleteMessage", {
    chat_id: normalized,
    message_id: messageId,
  });
}
