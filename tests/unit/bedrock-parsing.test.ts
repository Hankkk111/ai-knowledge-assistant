import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseEmbeddingResponse } from "../../src/services/embedding";
import { parseAnswerResponse } from "../../src/services/bedrock";

describe("parseEmbeddingResponse", () => {
  test("returns the embedding vector from a valid response", () => {
    assert.deepEqual(parseEmbeddingResponse({ embedding: [0.1, -0.2, 0.3] }), [0.1, -0.2, 0.3]);
  });

  for (const [name, body] of [
    ["null body", null],
    ["missing embedding", { inputTextTokenCount: 3 }],
    ["non-array embedding", { embedding: "0.1,0.2" }],
    ["empty embedding", { embedding: [] }],
    ["non-numeric values", { embedding: [0.1, "0.2"] }],
    ["non-finite values", { embedding: [0.1, Number.NaN] }],
  ] as const) {
    test(`throws on ${name}`, () => {
      assert.throws(() => parseEmbeddingResponse(body), /valid embedding vector/);
    });
  }
});

describe("parseAnswerResponse", () => {
  test("returns the text of a single text block", () => {
    assert.equal(
      parseAnswerResponse({ content: [{ type: "text", text: "Hello" }] }),
      "Hello"
    );
  });

  test("joins multiple text blocks and skips non-text blocks", () => {
    const body = {
      content: [
        { type: "text", text: "Part one. " },
        { type: "tool_use", id: "x", name: "y", input: {} },
        { type: "text", text: "Part two." },
      ],
    };
    assert.equal(parseAnswerResponse(body), "Part one. Part two.");
  });

  test("throws when content is missing", () => {
    assert.throws(() => parseAnswerResponse({}), /content array/);
    assert.throws(() => parseAnswerResponse(null), /content array/);
  });

  test("throws when content has no text", () => {
    assert.throws(() => parseAnswerResponse({ content: [] }), /generated text/);
    assert.throws(
      () => parseAnswerResponse({ content: [{ type: "text", text: "   " }] }),
      /generated text/
    );
  });
});
