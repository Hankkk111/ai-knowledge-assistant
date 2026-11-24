import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockClient } from "../../src/services/bedrockClient";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL_ID,
  embedText,
} from "../../src/services/embedding";
import { ANSWER_MODEL_ID, generateAnswer } from "../../src/services/bedrock";

// Replaces the shared client's send() for one test, so embedText and
// generateAnswer run end to end without calling AWS. Returns the commands
// that were sent.
function stubSend(responseBody: unknown): InvokeModelCommand[] {
  const sent: InvokeModelCommand[] = [];
  mock.method(bedrockClient, "send", async (command: InvokeModelCommand) => {
    sent.push(command);
    return { body: new TextEncoder().encode(JSON.stringify(responseBody)) };
  });
  return sent;
}

afterEach(() => {
  mock.restoreAll();
});

describe("embedText", () => {
  test("invokes the Titan embeddings model and returns the vector", async () => {
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / EMBEDDING_DIMENSIONS);
    const sent = stubSend({ embedding: vector });

    assert.deepEqual(await embedText("refund policy"), vector);

    assert.equal(sent.length, 1);
    const { modelId, contentType, body } = sent[0].input;
    assert.equal(modelId, EMBEDDING_MODEL_ID);
    assert.equal(contentType, "application/json");
    assert.equal(JSON.parse(body as string).inputText, "refund policy");
  });

  test("rejects a vector of the wrong size", async () => {
    stubSend({ embedding: [0.1, 0.2, 0.3] });

    await assert.rejects(embedText("refund policy"), /3 dimensions, expected 1024/);
  });

  test("passes on errors from the SDK", async () => {
    const throttled = Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" });
    mock.method(bedrockClient, "send", async () => {
      throw throttled;
    });

    await assert.rejects(embedText("refund policy"), throttled);
  });
});

describe("generateAnswer", () => {
  test("invokes the answer model with the query and context", async () => {
    const sent = stubSend({ content: [{ type: "text", text: " Within 30 days. " }] });

    assert.equal(
      await generateAnswer("How long do refunds take?", "Refunds take 30 days."),
      "Within 30 days."
    );

    assert.equal(sent.length, 1);
    const { modelId, contentType, body } = sent[0].input;
    assert.equal(modelId, ANSWER_MODEL_ID);
    assert.equal(contentType, "application/json");
    const prompt = JSON.parse(body as string).messages[0].content as string;
    assert.match(prompt, /Refunds take 30 days\./);
    assert.match(prompt, /Question: How long do refunds take\?$/);
  });

  test("names the model when the response body is empty", async () => {
    mock.method(bedrockClient, "send", async () => ({ body: new Uint8Array() }));

    await assert.rejects(
      generateAnswer("q", "c"),
      new RegExp(`empty response body for ${ANSWER_MODEL_ID.replace(/[.]/g, "\\.")}`)
    );
  });
});
