export interface Source {
  documentId: string;
  snippet: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}
