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

// Maximum length, in Unicode code points, of the source snippet returned per chunk.
export const SNIPPET_LENGTH = 150;

/**
 * Builds the short preview of a chunk that is returned in `sources`.
 * Whitespace runs (chunks often keep the line breaks and indentation of the
 * original document) are collapsed to single spaces so the preview reads as
 * one line. Truncation counts Unicode code points rather than UTF-16 units,
 * so an emoji or other astral character is never split into a lone surrogate
 * (which would render as "\uFFFD"), and an ellipsis marks that the text was cut.
 */
export function buildSnippet(content: string, maxLength: number = SNIPPET_LENGTH): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const codePoints = Array.from(normalized);

  if (codePoints.length <= maxLength) {
    return normalized;
  }

  return `${codePoints.slice(0, maxLength).join("").trimEnd()}…`;
}

/**
 * Drops chunks whose document and text repeat an earlier chunk (ignoring
 * whitespace differences), keeping the first, i.e. most relevant, copy.
 * Re-ingesting a document without deleting its old rows stores every chunk
 * twice; both copies are retrieved together, which repeats the same text in
 * the prompt and lists the same source twice in the response.
 */
export function dedupeChunks<T extends { documentId: string; content: string }>(chunks: T[]): T[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = `${c.documentId}\u0000${c.content.replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Seconds a client should wait before retrying after Bedrock throttled us.
export const THROTTLED_RETRY_AFTER_SECONDS = 5;

/**
 * True when an error from the AWS SDK means Bedrock rejected the call
 * because of request rate or quota (ThrottlingException, or any response
 * with HTTP status 429). That is a temporary condition on our side, not a
 * broken upstream, so it is reported as 503 with Retry-After instead of 502.
 */
export function isThrottlingError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { name, $metadata } = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return name === "ThrottlingException" || $metadata?.httpStatusCode === 429;
}

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

    if (query === undefined || query === null) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    // A number or object would otherwise be reported as "query is required",
    // which misleads clients that did send a query, just of the wrong type.
    if (typeof query !== "string") {
      res.status(400).json({ error: "query must be a string" });
      return;
    }

    if (query.trim().length === 0) {
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
      // A chunk whose content is empty or only whitespace adds nothing to the
      // prompt and would be listed as a source with a blank snippet, so it
      // must not count as relevant context.
      const chunks = dedupeChunks(
        (await deps.findRelevantChunks(queryEmbedding)).filter(
          (c) => c.content.trim().length > 0
        )
      );

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
          snippet: buildSnippet(c.content),
        })),
      };

      res.json(response);
    } catch (err) {
      console.error("Chat request failed:", err);
      if (isThrottlingError(err)) {
        res
          .status(503)
          .set("Retry-After", String(THROTTLED_RETRY_AFTER_SECONDS))
          .json({ error: "The assistant is busy right now. Please try again in a few seconds." });
        return;
      }
      res
        .status(502)
        .json({ error: "Failed to generate an answer. Please try again later." });
    }
  };
}

export const handleChat = createChatHandler();
