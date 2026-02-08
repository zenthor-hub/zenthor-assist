import { logger } from "../observability/logger";
import { classifyError } from "./errors";
import { withRetry } from "./retry";

interface FallbackParams<T> {
  primaryModel: string;
  fallbackModels: string[];
  run: (modelName: string) => Promise<T>;
}

interface FallbackResult<T> {
  result: T;
  modelUsed: string;
}

export async function runWithFallback<T>(params: FallbackParams<T>): Promise<FallbackResult<T>> {
  // Try primary with retry
  try {
    const result = await withRetry(() => params.run(params.primaryModel));
    return { result, modelUsed: params.primaryModel };
  } catch (primaryError) {
    const primaryReason = classifyError(primaryError);

    if (params.fallbackModels.length === 0) {
      throw primaryError;
    }

    // Cascade through fallback models in order
    let lastError: unknown = primaryError;
    for (const fallbackModel of params.fallbackModels) {
      void logger.lineWarn(
        `[fallback] Primary model ${params.primaryModel} failed (${primaryReason}), trying fallback ${fallbackModel}`,
      );
      void logger.warn("agent.model.fallback.used", {
        primaryModel: params.primaryModel,
        fallbackModel,
        reason: primaryReason,
      });

      try {
        const result = await withRetry(() => params.run(fallbackModel));
        return { result, modelUsed: fallbackModel };
      } catch (fallbackError) {
        lastError = fallbackError;
        const fallbackReason = classifyError(fallbackError);
        void logger.lineWarn(
          `[fallback] Fallback model ${fallbackModel} also failed (${fallbackReason})`,
        );
      }
    }

    throw lastError;
  }
}
