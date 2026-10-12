const API_BASE = "https://xum7phmpeg.execute-api.us-east-1.amazonaws.com";

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
    const body: unknown = await res.json();
    const error = (body as { error?: unknown } | null)?.error;
    if (typeof error === "string" && error.trim()) return error;
  } catch {
    // Non-JSON body (e.g. a gateway error page); fall through.
  }
  return `Request failed: ${res.status}`;
}

export async function sendMessage(query: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }

  return res.json();
}
