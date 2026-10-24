import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  buildSnippet,
  createChatHandler,
  MAX_QUERY_LENGTH,
  SNIPPET_LENGTH,
  NO_CONTEXT_ANSWER,
  type ChatDependencies,
} from "../../src/handlers/chat";
import type { DocumentChunk } from "../../src/types";

interface CapturedResponse {
  statusCode: number;
  body: unknown;
}

function mockResponse(): { res: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, captured };
}

function mockRequest(body: unknown): Request {
  return { body } as Request;
}

function chunk(documentId: string, content: string): DocumentChunk {
  return { id: `${documentId}-1`, documentId, content, embedding: [], metadata: {} };
}

function fakeDeps(overrides: Partial<ChatDependencies> = {}) {
  const calls = { embedText: [] as string[], generateAnswer: [] as [string, string][] };
  const deps: ChatDependencies = {
    embedText: async (text) => {
      calls.embedText.push(text);
      return [0.1, 0.2, 0.3];
    },
    findRelevantChunks: async () => [
      chunk("doc-a", "Refunds are processed within 5 business days."),
      chunk("doc-b", "x".repeat(300)),
    ],
    generateAnswer: async (query, context) => {
      calls.generateAnswer.push([query, context]);
      return "Within 5 business days.";
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("POST /chat handler", () => {
  test("returns the answer with source snippets", async () => {
    const { deps, calls } = fakeDeps();
    const { res, captured } = mockResponse();

    await createChatHandler(deps)(mockRequest({ query: "How long do refunds take?" }), res);

    assert.equal(captured.statusCode, 200);
    assert.deepEqual(captured.body, {
      answer: "Within 5 business days.",
      sources: [
        { documentId: "doc-a", snippet: "Refunds are processed within 5 business days." },
        { documentId: "doc-b", snippet: `${"x".repeat(150)}…` },
      ],
    });
    assert.equal(
      calls.generateAnswer[0][1],
      `Refunds are processed within 5 business days.\n\n${"x".repeat(300)}`
    );
  });

  test("does not call the model when no chunks are retrieved", async () => {
    const { deps, calls } = fakeDeps({ findRelevantChunks: async () => [] });
    const { res, captured } = mockResponse();

    await createChatHandler(deps)(mockRequest({ query: "What is our refund policy?" }), res);

    assert.equal(captured.statusCode, 200);
    assert.deepEqual(captured.body, { answer: NO_CONTEXT_ANSWER, sources: [] });
    assert.equal(calls.generateAnswer.length, 0);
  });

  test("trims whitespace before embedding and generating", async () => {
    const { deps, calls } = fakeDeps();
    const { res } = mockResponse();

    await createChatHandler(deps)(mockRequest({ query: "  hello  \n" }), res);

    assert.deepEqual(calls.embedText, ["hello"]);
    assert.equal(calls.generateAnswer[0][0], "hello");
  });

  for (const [label, body] of [
    ["missing body", undefined],
    ["missing query", {}],
    ["non-string query", { query: 42 }],
    ["empty query", { query: "" }],
    ["whitespace-only query", { query: "   \t\n" }],
  ] as const) {
    test(`rejects ${label} with 400`, async () => {
      const { deps, calls } = fakeDeps();
      const { res, captured } = mockResponse();

      await createChatHandler(deps)(mockRequest(body), res);

      assert.equal(captured.statusCode, 400);
      assert.deepEqual(captured.body, { error: "query is required" });
      assert.equal(calls.embedText.length, 0, "services must not be called");
    });
  }

  test("accepts a query of exactly MAX_QUERY_LENGTH characters", async () => {
    const { deps } = fakeDeps();
    const { res, captured } = mockResponse();

    await createChatHandler(deps)(mockRequest({ query: "a".repeat(MAX_QUERY_LENGTH) }), res);

    assert.equal(captured.statusCode, 200);
  });

  test("rejects a query longer than MAX_QUERY_LENGTH with 400", async () => {
    const { deps, calls } = fakeDeps();
    const { res, captured } = mockResponse();

    await createChatHandler(deps)(
      mockRequest({ query: "a".repeat(MAX_QUERY_LENGTH + 1) }),
      res
    );

    assert.equal(captured.statusCode, 400);
    assert.deepEqual(captured.body, {
      error: `query must be at most ${MAX_QUERY_LENGTH} characters`,
    });
    assert.equal(calls.embedText.length, 0);
  });

  test("returns 502 when an upstream service fails", async (t) => {
    t.mock.method(console, "error", () => {});
    const { deps } = fakeDeps({
      findRelevantChunks: async () => {
        throw new Error("connection refused");
      },
    });
    const { res, captured } = mockResponse();

    await createChatHandler(deps)(mockRequest({ query: "anything" }), res);

    assert.equal(captured.statusCode, 502);
    assert.deepEqual(captured.body, {
      error: "Failed to generate an answer. Please try again later.",
    });
  });
});

describe("buildSnippet", () => {
  test("returns short content unchanged", () => {
    assert.equal(buildSnippet("Refunds take 5 days."), "Refunds take 5 days.");
  });

  test("does not add an ellipsis when content is exactly the limit", () => {
    const content = "a".repeat(SNIPPET_LENGTH);
    assert.equal(buildSnippet(content), content);
  });

  test("truncates long content and marks it with an ellipsis", () => {
    assert.equal(buildSnippet("a".repeat(SNIPPET_LENGTH + 1)), `${"a".repeat(SNIPPET_LENGTH)}…`);
  });

  test("collapses line breaks and indentation into single spaces", () => {
    assert.equal(
      buildSnippet("  Refund policy\n\n\tRefunds take\r\n5 days.  "),
      "Refund policy Refunds take 5 days."
    );
  });

  test("never splits a surrogate pair when truncating", () => {
    const snippet = buildSnippet("😀".repeat(10), 3);
    assert.equal(snippet, "😀😀😀…");
    assert.ok(snippet.isWellFormed());
  });

  test("drops trailing whitespace before the ellipsis", () => {
    assert.equal(buildSnippet("abc def", 4), "abc…");
  });
});
