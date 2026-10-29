import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../src/lambda";

// Minimal API Gateway HTTP API (payload format 2.0) event, the shape the
// deployed Lambda receives. Only the fields serverless-http reads are set.
function httpApiEvent(method: string, path: string, body?: string) {
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    requestContext: {
      http: { method, path, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "test" },
      requestId: "test-request",
      stage: "$default",
    },
    body,
    isBase64Encoded: false,
  };
}

async function invoke(method: string, path: string, body?: string) {
  const result = (await handler(httpApiEvent(method, path, body), {})) as {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  };
  return { ...result, json: JSON.parse(result.body) as unknown };
}

describe("Lambda handler", () => {
  test("serves GET /health through the API Gateway adapter", async () => {
    const res = await invoke("GET", "/health");
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json, { status: "ok" });
  });

  test("passes the JSON body through to the /chat validation", async () => {
    const res = await invoke("POST", "/chat", JSON.stringify({ query: 42 }));
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json, { error: "query must be a string" });
  });

  test("returns the JSON 404 for unknown routes", async () => {
    const res = await invoke("GET", "/nope");
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.json, { error: "route not found: GET /nope" });
  });
});
