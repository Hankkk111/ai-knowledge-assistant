import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BEDROCK_REGION, resolveBedrockRegion } from "../../src/services/bedrockClient";

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
