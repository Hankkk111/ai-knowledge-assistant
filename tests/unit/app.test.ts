import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../../src/app";
import { MAX_QUERY_LENGTH } from "../../src/handlers/chat";

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function postChat(body: string) {
  return fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("app error handling", () => {
  test("GET /health returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });

  test("responses do not advertise the framework in X-Powered-By", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  test("malformed JSON body returns a 400 JSON error", async () => {
    const res = await postChat('{"query": "unterminated');
    assert.equal(res.status, 400);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { error: "request body must be valid JSON" });
  });

  test("oversized JSON body returns a 413 JSON error", async () => {
    const res = await postChat(JSON.stringify({ query: "x".repeat(20 * 1024) }));
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: "request body is too large" });
  });

  test("a maximum-length query fully escaped as \\uXXXX fits within the body limit", async () => {
    // MAX_QUERY_LENGTH counts UTF-16 units and each escapes to 6 bytes, so
    // this is the largest body a valid request can produce. The query is
    // wrapped in an array so the handler rejects it (400) without calling
    // Bedrock; a 413 would mean the body parser refused it first.
    const body = `{"query":["${"\\u00e9".repeat(MAX_QUERY_LENGTH)}"]}`;
    const res = await postChat(body);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "query must be a string" });
  });

  test("missing query is still validated by the chat handler", async () => {
    const res = await postChat("{}");
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "query is required" });
  });

  test("a /chat body that is not JSON returns a 415 JSON error", async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: '{"query":"what is RAG?"}',
    });
    assert.equal(res.status, 415);
    assert.deepEqual(await res.json(), { error: "Content-Type must be application/json" });
  });

  test("a JSON content type with a charset is accepted", async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: "{}",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "query is required" });
  });

  test("wrong method on /chat returns a 405 JSON error with an Allow header", async () => {
    const res = await fetch(`${baseUrl}/chat`);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
    assert.deepEqual(await res.json(), { error: "method GET not allowed on /chat; use POST" });
  });

  test("wrong method on /health returns a 405 JSON error", async () => {
    const res = await fetch(`${baseUrl}/health`, { method: "DELETE" });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET, HEAD");
  });

  test("HEAD /health is still served by the GET route", async () => {
    const res = await fetch(`${baseUrl}/health`, { method: "HEAD" });
    assert.equal(res.status, 200);
  });

  test("unknown route returns a 404 JSON error", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await res.json(), { error: "route not found: GET /does-not-exist" });
  });
});
