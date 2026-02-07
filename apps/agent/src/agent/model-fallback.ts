import { logger } from "../observability/logger";
import { classifyError } from "./errors";
import { withRetry } from "./retry";

interface FallbackParams<T> {
  primaryModel: string;
  fallbackModel?: string;
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
    const reason = classifyError(primaryError);

    // If no fallback configured, re-throw
    if (!params.fallbackModel) {
      throw primaryError;
    }

    // Primary retries are exhausted — try fallback
    void logger.lineWarn(
      `[fallback] Primary model ${params.primaryModel} failed (${reason}), trying fallback ${params.fallbackModel}`,
    );
    void logger.warn("agent.model.fallback.used", {
      primaryModel: params.primaryModel,
      fallbackModel: params.fallbackModel,
      reason,
    });

    const result = await withRetry(() => params.run(params.fallbackModel!));
    return { result, modelUsed: params.fallbackModel };
  }
}
