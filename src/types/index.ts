export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

// POST /chat body. Each request is answered on its own: the API keeps no
// conversation history, so there is no conversation ID to send.
export interface ChatRequest {
  query: string;
}

export interface ChatResponse {
  answer: string;
  sources: Array<{ documentId: string; snippet: string }>;
}
