/**
 * Zenthor Finance HTTP Client
 *
 * Wraps fetch() with service key auth headers for calling
 * the Zenthor Finance REST API v1 endpoints.
 */

import { env } from "@zenthor-assist/env/agent";

interface FinanceClientConfig {
  baseUrl: string;
  serviceKey: string;
  organizationId: string;
}

function getConfig(): FinanceClientConfig | null {
  const baseUrl = env.ZENTHOR_FINANCE_API_URL;
  const serviceKey = env.ZENTHOR_FINANCE_SERVICE_KEY;
  const organizationId = env.ZENTHOR_FINANCE_ORG_ID;

  if (!baseUrl || !serviceKey || !organizationId) return null;
  return { baseUrl, serviceKey, organizationId };
}

function buildHeaders(config: FinanceClientConfig): Record<string, string> {
  return {
    "X-Service-Key": config.serviceKey,
    "X-Organization-Id": config.organizationId,
    "Content-Type": "application/json",
  };
}

interface ApiError {
  title?: string;
  detail?: string;
  status?: number;
}

function parseErrorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const err = body as ApiError;
    return err.detail ?? err.title ?? "Unknown API error";
  }
  return String(body);
}

/**
 * Make a GET request to the Finance API.
 */
export async function financeGet<T>(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Zenthor Finance API is not configured");

  const url = new URL(`${config.baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: buildHeaders(config),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(parseErrorMessage(body));
  }

  return body as T;
}

/**
 * Make a POST request to the Finance API.
 */
export async function financePost<T>(path: string, data: unknown): Promise<T> {
  const config = getConfig();
  if (!config) throw new Error("Zenthor Finance API is not configured");

  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(data),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(parseErrorMessage(body));
  }

  return body as T;
}

/**
 * Check if the Finance API is configured.
 */
export function isFinanceConfigured(): boolean {
  return getConfig() !== null;
}
