import { Request, Response } from "express";
import { embedText } from "../services/embedding";
import { findRelevantChunks } from "../services/retrieval";
import { generateAnswer } from "../services/bedrock";
import type { ChatRequest, ChatResponse } from "../types";

// Upper bound on query length, to keep embedding and generation costs predictable.
const MAX_QUERY_LENGTH = 2000;

export async function handleChat(req: Request, res: Response): Promise<void> {
  const { query } = (req.body ?? {}) as Partial<ChatRequest>;

  if (typeof query !== "string" || query.trim().length === 0) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const trimmedQuery = query.trim();

  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    res
      .status(400)
      .json({ error: `query must be at most ${MAX_QUERY_LENGTH} characters` });
    return;
  }

  // Express 4 does not catch rejected promises from async handlers, so a
  // failure in Bedrock or Postgres would otherwise leave the request hanging
  // until the Lambda times out. Catch it here and return a clear error.
  try {
    const queryEmbedding = await embedText(trimmedQuery);
    const chunks = await findRelevantChunks(queryEmbedding);

    const context = chunks.map((c) => c.content).join("\n\n");
    const answer = await generateAnswer(trimmedQuery, context);

    const response: ChatResponse = {
      answer,
      sources: chunks.map((c) => ({
        documentId: c.documentId,
        snippet: c.content.slice(0, 150),
      })),
    };

    res.json(response);
  } catch (err) {
    console.error("Chat request failed:", err);
    res
      .status(502)
      .json({ error: "Failed to generate an answer. Please try again later." });
  }
}
