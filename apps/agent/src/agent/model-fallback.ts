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
  fallbackAttempt: number;
  attemptedModels: string[];
}

export async function runWithFallback<T>(params: FallbackParams<T>): Promise<FallbackResult<T>> {
  // Try primary with retry
  try {
    const result = await withRetry(() => params.run(params.primaryModel));
    return {
      result,
      modelUsed: params.primaryModel,
      fallbackAttempt: 0,
      attemptedModels: [params.primaryModel],
    };
  } catch (primaryError) {
    const primaryReason = classifyError(primaryError);
    const allAttempted = [params.primaryModel];

    if (params.fallbackModels.length === 0) {
      throw primaryError;
    }

    // Cascade through fallback models in order
    let lastError: unknown = primaryError;
    for (const [index, fallbackModel] of params.fallbackModels.entries()) {
      const attempt = index + 1;
      void logger.lineWarn(
        `[fallback] Primary model ${params.primaryModel} failed (${primaryReason}), trying fallback ${fallbackModel} (attempt ${attempt})`,
      );
      void logger.warn("agent.model.fallback.used", {
        primaryModel: params.primaryModel,
        fallbackModel,
        reason: primaryReason,
        attempt,
        attemptCount: params.fallbackModels.length,
        attemptedModels: [...allAttempted, fallbackModel],
      });

      try {
        const result = await withRetry(() => params.run(fallbackModel));
        allAttempted.push(fallbackModel);
        return {
          result,
          modelUsed: fallbackModel,
          fallbackAttempt: attempt,
          attemptedModels: allAttempted,
        };
      } catch (fallbackError) {
        lastError = fallbackError;
        const fallbackReason = classifyError(fallbackError);
        void logger.lineWarn(
          `[fallback] Fallback model ${fallbackModel} also failed (${fallbackReason})`,
        );
        allAttempted.push(fallbackModel);
      }
    }

    throw lastError;
  }
}
