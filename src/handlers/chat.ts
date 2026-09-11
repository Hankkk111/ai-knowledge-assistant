import { Request, Response } from "express";
import { embedText } from "../services/embedding";
import { findRelevantChunks } from "../services/retrieval";
import { generateAnswer } from "../services/bedrock";
import type { ChatRequest, ChatResponse } from "../types";

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { query } = req.body as ChatRequest;

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const queryEmbedding = await embedText(query);
  const chunks = await findRelevantChunks(queryEmbedding);

  const context = chunks.map((c) => c.content).join("\n\n");
  const answer = await generateAnswer(query, context);

  const response: ChatResponse = {
    answer,
    sources: chunks.map((c) => ({
      documentId: c.documentId,
      snippet: c.content.slice(0, 150),
    })),
  };

  res.json(response);
}
