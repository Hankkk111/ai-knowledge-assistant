import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BEDROCK_REGION,
  decodeJsonBody,
  resolveBedrockRegion,
} from "../../src/services/bedrockClient";

test("resolveBedrockRegion defaults to us-east-1 when BEDROCK_REGION is unset", () => {
  assert.equal(resolveBedrockRegion({}), DEFAULT_BEDROCK_REGION);
  assert.equal(DEFAULT_BEDROCK_REGION, "us-east-1");
});

test("resolveBedrockRegion uses BEDROCK_REGION when set", () => {
  assert.equal(resolveBedrockRegion({ BEDROCK_REGION: "us-west-2" }), "us-west-2");
});

test("resolveBedrockRegion trims whitespace and ignores blank values", () => {
  assert.equal(resolveBedrockRegion({ BEDROCK_REGION: "  eu-central-1 " }), "eu-central-1");
  assert.equal(resolveBedrockRegion({ BEDROCK_REGION: "   " }), DEFAULT_BEDROCK_REGION);
});

const encode = (text: string) => new TextEncoder().encode(text);

test("decodeJsonBody parses a JSON response body", () => {
  assert.deepEqual(decodeJsonBody(encode('{"embedding":[1,2]}'), "model-x"), { embedding: [1, 2] });
});

test("decodeJsonBody names the model when the body is missing or blank", () => {
  for (const body of [undefined, encode(""), encode("  \n")]) {
    assert.throws(() => decodeJsonBody(body, "model-x"), /empty response body for model-x/);
  }
});

test("decodeJsonBody names the model when the body is not JSON", () => {
  assert.throws(
    () => decodeJsonBody(encode("<html>Service Unavailable</html>"), "model-x"),
    /model-x that is not valid JSON/
  );
});
