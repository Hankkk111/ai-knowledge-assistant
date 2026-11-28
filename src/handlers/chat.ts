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

// Matches text with no visible content: only whitespace and Unicode format
// characters (category Cf, e.g. U+200B ZERO WIDTH SPACE).
const BLANK_TEXT = /^[\s\p{Cf}]*$/u;

// Maximum length, in Unicode code points, of the source snippet returned per chunk.
export const SNIPPET_LENGTH = 150;

// Soft hyphens (U+00AD), zero-width spaces (U+200B) and byte order marks
// (U+FEFF) are common leftovers from extracting PDFs and web pages. They are
// invisible, but still count toward SNIPPET_LENGTH, and a zero-width space
// inside a word stops the cut from backing up to the end of that word, so
// they are removed from the preview. Other format characters, such as the
// zero-width joiner in emoji sequences, are kept because they change how
// the text renders.
const INVISIBLE_BREAK_CHARS = /[\u00AD\u200B\uFEFF]/g;

/**
 * Builds the short preview of a chunk that is returned in `sources`.
 * Soft hyphens, zero-width spaces and byte order marks are dropped, and
 * whitespace runs (chunks often keep the line breaks and indentation of the
 * original document) are collapsed to single spaces so the preview reads as
 * one line. Truncation counts Unicode code points rather than UTF-16 units,
 * so an emoji or other astral character is never split into a lone surrogate
 * (which would render as "\uFFFD"), the cut is moved back to the end of a word
 * when one is close by, and an ellipsis marks that the text was cut.
 */
export function buildSnippet(content: string, maxLength: number = SNIPPET_LENGTH): string {
  const normalized = content
    .replace(INVISIBLE_BREAK_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  const codePoints = Array.from(normalized);

  if (codePoints.length <= maxLength) {
    return normalized;
  }

  let cut = codePoints.slice(0, maxLength);

  // Cutting at exactly maxLength usually ends the preview mid-word
  // ("Refunds are proc…"). If the cut falls inside a word, back up to the
  // last space, unless that would drop more than a quarter of the snippet
  // (e.g. one very long token such as a URL), in which case keep the hard cut.
  if (codePoints[maxLength] !== " ") {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace >= Math.ceil(maxLength * 0.75)) {
      cut = cut.slice(0, lastSpace);
    }
  }

  // A cut right after a comma or other separator would read "processed,…";
  // drop trailing separators so the ellipsis follows the last word. Closing
  // brackets, quotes and sentence-ending punctuation are kept.
  const text = cut.join("").replace(/[\s,;:\-–—]+$/u, "");

  return `${text || cut.join("").trimEnd()}…`;
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
 * True when an error from the AWS SDK means Bedrock could not take the call
 * right now: it was throttled for request rate or quota (ThrottlingException,
 * or any response with HTTP status 429), or the service was temporarily
 * unavailable (ServiceUnavailableException, or HTTP status 503). Both are
 * temporary and worth retrying, not a broken upstream, so they are reported
 * as 503 with Retry-After instead of 502.
 */
export function isThrottlingError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { name, $metadata } = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    name === "ThrottlingException" ||
    name === "ServiceUnavailableException" ||
    $metadata?.httpStatusCode === 429 ||
    $metadata?.httpStatusCode === 503
  );
}

/**
 * True when Bedrock gave up because the model took too long to process the
 * request (ModelTimeoutException, HTTP 408). That is a timeout rather than a
 * broken upstream, so it is reported as 504 instead of the generic 502.
 */
export function isModelTimeoutError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { name, $metadata } = err as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return name === "ModelTimeoutException" || $metadata?.httpStatusCode === 408;
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
    // express.json() also accepts a top-level array (e.g. `["hello"]`), which
    // has no `query` property and would otherwise be reported as "query is
    // required" even though the client did send a question.
    if (
      req.body !== undefined &&
      (typeof req.body !== "object" || req.body === null || Array.isArray(req.body))
    ) {
      res.status(400).json({ error: "request body must be a JSON object" });
      return;
    }

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

    // trim() keeps invisible format characters such as a zero-width space
    // (U+200B) or soft hyphen, which come along when text is copied from web
    // pages or documents. A query made only of those has nothing to search
    // for, so treat it like a blank one instead of paying for an embedding.
    if (BLANK_TEXT.test(query)) {
      res.status(400).json({ error: "query is required" });
      return;
    }

    const trimmedQuery = query.trim();

    // Say how long the query was, so a client that built it programmatically
    // (e.g. by pasting a document in) knows how much to cut.
    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
      res.status(400).json({
        error: `query must be at most ${MAX_QUERY_LENGTH} characters (got ${trimmedQuery.length})`,
      });
      return;
    }

    // Express 4 does not catch rejected promises from async handlers, so a
    // failure in Bedrock or Postgres would otherwise leave the request hanging
    // until the Lambda times out. Catch it here and return a clear error.
    try {
      const queryEmbedding = await deps.embedText(trimmedQuery);
      // A chunk whose content is empty, only whitespace or only invisible
      // format characters (e.g. zero-width spaces left over from extracting a
      // PDF or web page) adds nothing to the prompt and would be listed as a
      // source with a blank-looking snippet, so it must not count as relevant
      // context.
      const chunks = dedupeChunks(
        (await deps.findRelevantChunks(queryEmbedding)).filter(
          (c) => !BLANK_TEXT.test(c.content)
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
      if (isModelTimeoutError(err)) {
        res
          .status(504)
          .json({ error: "The assistant took too long to answer. Please try again." });
        return;
      }
      res
        .status(502)
        .json({ error: "Failed to generate an answer. Please try again later." });
    }
  };
}

export const handleChat = createChatHandler();
