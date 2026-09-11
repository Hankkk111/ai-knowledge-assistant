export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface ChatRequest {
  query: string;
  conversationId?: string;
}

export interface ChatResponse {
  answer: string;
  sources: Array<{ documentId: string; snippet: string }>;
}
