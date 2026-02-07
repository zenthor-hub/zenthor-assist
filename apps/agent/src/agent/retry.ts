import { logger } from "../observability/logger";
import { classifyError, isRetryable } from "./errors";

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitter: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, jitter } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const reason = classifyError(err);

      if (!isRetryable(reason)) {
        throw err;
      }

      if (attempt >= maxRetries) {
        break;
      }

      let delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);

      if (jitter) {
        delay += Math.random() * delay * 0.2;
      }

      void logger.lineInfo(
        `[retry] Attempt ${attempt + 1}/${maxRetries} after ${reason}, waiting ${Math.round(delay)}ms`,
      );
      void logger.info("agent.retry.attempt", {
        attempt: attempt + 1,
        maxRetries,
        reason,
        delayMs: Math.round(delay),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
