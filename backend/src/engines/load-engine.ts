import axios, { AxiosError } from "axios";
import type { GraphNode, RequestResult } from "../types";

const TIMEOUT_MS  = parseInt(process.env.HTTP_REQUEST_TIMEOUT_MS ?? "10000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? "2", 10);

// ─── Back-off helper ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, baseMs = 200, jitterMs = 100): number {
  return baseMs * Math.pow(2, attempt - 1) + Math.random() * jitterMs;
}

// ─── Request classifier ───────────────────────────────────────────────────────

function isRetryableError(err: unknown): boolean {
  if (err instanceof AxiosError) {
    return !err.response;
  }
  return false;
}

// ─── Body parser ──────────────────────────────────────────────────────────────

function parseBody(body: string | undefined): unknown {
  if (!body?.trim()) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Public API
//
// FIX #3: The `timestamp` field is intentionally left as 0 here.
//   The simulation engine always overwrites it with `clock.virtualElapsedMs`
//   immediately after the call returns — including on the retry-exhausted path.
//   Previously, setting `timestamp = Date.now()` (a wall-clock epoch value)
//   and then forgetting to overwrite it on failure caused those results to be
//   sorted into completely wrong time buckets during aggregation.
// ═════════════════════════════════════════════════════════════════════════════

export async function executeRequest(
  node: GraphNode,
  signal?: AbortSignal
): Promise<RequestResult> {
  const { id: nodeId, apiConfig } = node;
  const { url, method, headers = {}, body } = apiConfig;

  let attempt = 0;
  let lastError: unknown;
  let lastResponseTime = 0;

  while (attempt <= MAX_RETRIES) {
    if (signal?.aborted) {
      return {
        nodeId,
        statusCode: 0,
        responseTime: 0,
        success: false,
        error: "CANCELLED",
        timestamp: 0,   // caller stamps virtual time
      };
    }

    const start = performance.now();

    try {
      const response = await axios({
        method,
        url,
        headers,
        data: parseBody(body),
        timeout: TIMEOUT_MS,
        signal,
        validateStatus: () => true,
      });

      const responseTime = Math.round(performance.now() - start);
      // FIX #14 (partial): 2xx and 3xx are both successful; 4xx+ are errors.
      const success = response.status >= 200 && response.status < 400;

      return { nodeId, statusCode: response.status, responseTime, success, timestamp: 0 };

    } catch (err) {
      const currentResponseTime = Math.round(performance.now() - start);
      if (axios.isCancel(err)) {
        return {
          nodeId,
          statusCode: 0,
          responseTime: currentResponseTime,
          success: false,
          error: "CANCELLED",
          timestamp: 0,   // caller stamps virtual time
        };
      }

      if (!isRetryableError(err)) {
        return {
          nodeId,
          statusCode: 0,
          responseTime: currentResponseTime,
          success: false,
          error: String(err),
          timestamp: 0,   // caller stamps virtual time
        };
      }

      lastError = err;
      lastResponseTime = currentResponseTime;
      attempt++;

      if (attempt > MAX_RETRIES) break;

      await sleep(backoffMs(attempt));
    }
  }

  // All retries exhausted.
  // FIX #3: timestamp is 0 — simulation engine overwrites it with virtualElapsedMs.
  const error =
    lastError instanceof AxiosError
      ? `${lastError.code ?? "NETWORK_ERROR"}: ${lastError.message}`
      : String(lastError);

  return { nodeId, statusCode: 0, responseTime: lastResponseTime, success: false, error, timestamp: 0 };
}
