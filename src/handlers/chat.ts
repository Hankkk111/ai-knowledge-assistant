import { Request, Response } from "express";
import { embedText } from "../services/embedding";
import { findRelevantChunks } from "../services/retrieval";
import { generateAnswer } from "../services/bedrock";
import type { ChatRequest, ChatResponse } from "../types";

// Returned when retrieval finds nothing, so the model is never asked to answer
// without any indexed context (it would otherwise answer from general
// knowledge, with no sources to back it up).
export const NO_CONTEXT_ANSWER =
  "I couldn't find any indexed documents relevant to that question.";

// Upper bound on query length, to keep embedding and generation costs predictable.
export const MAX_QUERY_LENGTH = 2000;

// External services the chat pipeline depends on. Injectable so the handler
// can be unit-tested without calling Bedrock or Postgres.
export interface ChatDependencies {
  embedText: typeof embedText;
  findRelevantChunks: typeof findRelevantChunks;
  generateAnswer: typeof generateAnswer;
}

const defaultDependencies: ChatDependencies = {
  embedText,
  findRelevantChunks,
  generateAnswer,
};

export function createChatHandler(
  deps: ChatDependencies = defaultDependencies
): (req: Request, res: Response) => Promise<void> {
  return async function handleChat(req: Request, res: Response): Promise<void> {
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
      const queryEmbedding = await deps.embedText(trimmedQuery);
      const chunks = await deps.findRelevantChunks(queryEmbedding);

      if (chunks.length === 0) {
        res.json({ answer: NO_CONTEXT_ANSWER, sources: [] } satisfies ChatResponse);
        return;
      }

      const context = chunks.map((c) => c.content).join("\n\n");
      const answer = await deps.generateAnswer(trimmedQuery, context);

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
  };
}

export const handleChat = createChatHandler();
