const DEPLOYED_API_BASE = "https://xum7phmpeg.execute-api.us-east-1.amazonaws.com";

/**
 * Base URL for API requests. VITE_API_BASE overrides it when set. Otherwise
 * production builds call the deployed API, and `npm run dev` uses relative
 * paths so the Vite dev server can proxy them to the local backend (see
 * vite.config.ts), which avoids CORS and keeps local testing off the live API.
 */
const API_BASE = (
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "" : DEPLOYED_API_BASE)
).replace(/\/+$/, "");

/**
 * Longest query the API accepts (MAX_QUERY_LENGTH in src/handlers/chat.ts).
 * The chat input enforces it so users aren't sent a 400 for an over-long
 * question.
 */
export const MAX_QUERY_LENGTH = 2000;

/**
 * How long to wait for /chat before giving up. The Lambda behind the API is
 * limited to 30 seconds (infra/lambda.tf), so a request still pending well
 * after that is stuck (e.g. a dropped connection) and would otherwise leave
 * the UI on "searching…" indefinitely.
 */
export const REQUEST_TIMEOUT_MS = 45_000;

/** Thrown when /chat does not respond within the timeout. */
export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request timed out after ${timeoutMs / 1000} seconds`);
    this.name = "RequestTimeoutError";
  }
}

export interface ChatResponse {
  answer: string;
  sources: Array<{ documentId: string; snippet: string }>;
}

/**
 * Error thrown when the API responds with a non-2xx status. `message` holds
 * the server's `{ "error": "..." }` text when the body provides one.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown } | null;
    // Our API reports `{ "error": "..." }`. API Gateway's own responses (e.g.
    // a 429 when the stage is throttled) use `{ "message": "..." }` instead.
    for (const text of [body?.error, body?.message]) {
      if (typeof text === "string" && text.trim()) return text;
    }
  } catch {
    // Non-JSON body (e.g. a gateway error page); fall through.
  }
  return `Request failed: ${res.status}`;
}

/**
 * Checks that a successful /chat body has the expected shape before the UI
 * renders it. A proxy or gateway can answer 200 with something else (an HTML
 * page, `{}`), which would otherwise show up as a blank assistant message.
 * An empty or whitespace-only answer is rejected for the same reason.
 * Malformed source entries are dropped rather than failing the whole answer.
 */
export function parseChatResponse(body: unknown): ChatResponse {
  const { answer, sources } = (body ?? {}) as { answer?: unknown; sources?: unknown };

  if (typeof answer !== "string" || answer.trim().length === 0) {
    throw new Error("API response did not contain an answer");
  }

  const validSources = Array.isArray(sources)
    ? sources.filter(
        (s): s is ChatResponse["sources"][number] =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as { documentId?: unknown }).documentId === "string" &&
          typeof (s as { snippet?: unknown }).snippet === "string"
      )
    : [];

  return { answer, sources: validSources };
}

export async function sendMessage(
  query: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw err;
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("API response was not valid JSON");
  }

  return parseChatResponse(body);
}
