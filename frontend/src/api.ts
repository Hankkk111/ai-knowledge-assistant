const API_BASE = "https://xum7phmpeg.execute-api.us-east-1.amazonaws.com";

export interface ChatResponse {
  answer: string;
  sources: Array<{ documentId: string; snippet: string }>;
}

export async function sendMessage(query: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}
