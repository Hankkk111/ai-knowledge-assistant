import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMBEDDING_DIMENSIONS,
  buildEmbeddingRequest,
  parseEmbeddingResponse,
} from "../../src/services/embedding";
import { parseAnswerResponse } from "../../src/services/bedrock";

describe("buildEmbeddingRequest", () => {
  test("requests normalized vectors with the configured dimensions", () => {
    assert.deepEqual(JSON.parse(buildEmbeddingRequest("hello")), {
      inputText: "hello",
      dimensions: EMBEDDING_DIMENSIONS,
      normalize: true,
    });
  });
});

describe("parseEmbeddingResponse", () => {
  test("returns the embedding vector from a valid response", () => {
    assert.deepEqual(parseEmbeddingResponse({ embedding: [0.1, -0.2, 0.3] }, 3), [0.1, -0.2, 0.3]);
  });

  test("accepts a vector of the default configured size", () => {
    const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.01);
    assert.equal(parseEmbeddingResponse({ embedding }).length, EMBEDDING_DIMENSIONS);
  });

  test("throws when the vector size does not match the schema", () => {
    assert.throws(
      () => parseEmbeddingResponse({ embedding: [0.1, 0.2, 0.3] }),
      new RegExp(`3 dimensions, expected ${EMBEDDING_DIMENSIONS}`)
    );
  });

  test("schema.sql column size matches EMBEDDING_DIMENSIONS", () => {
    const schema = readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf8");
    assert.match(schema, new RegExp(`embedding vector\\(${EMBEDDING_DIMENSIONS}\\)`));
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
