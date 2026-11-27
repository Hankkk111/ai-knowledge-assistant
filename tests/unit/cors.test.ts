import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import app from "../../src/app";
import {
  CORS_MAX_AGE_SECONDS,
  createCorsMiddleware,
  resolveAllowedOrigins,
  type AllowedOrigins,
} from "../../src/cors";

describe("resolveAllowedOrigins", () => {
  test("allows any origin when CORS_ALLOWED_ORIGINS is unset, blank or *", () => {
    assert.equal(resolveAllowedOrigins({}), "*");
    assert.equal(resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: "  " }), "*");
    assert.equal(resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: " * " }), "*");
  });

  test("splits a comma-separated list, trimming entries and trailing slashes", () => {
    assert.deepEqual(
      resolveAllowedOrigins({
        CORS_ALLOWED_ORIGINS: " https://app.example.com/ , http://localhost:5173,, ",
      }),
      ["https://app.example.com", "http://localhost:5173"]
    );
  });

  test("lowercases entries to match the Origin header browsers send", () => {
    assert.deepEqual(
      resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: "https://App.Example.com,HTTP://LOCALHOST:5173" }),
      ["https://app.example.com", "http://localhost:5173"]
    );
  });

  test("falls back to any origin when the list has no entries", () => {
    assert.equal(resolveAllowedOrigins({ CORS_ALLOWED_ORIGINS: " , ," }), "*");
  });
});

function listen(allowed: AllowedOrigins): Promise<{ server: Server; url: string }> {
  const testApp = express();
  testApp.use(createCorsMiddleware(allowed));
  testApp.post("/chat", (_req, res) => {
    res.json({ ok: true });
  });
  testApp.all("/chat", (_req, res) => {
    res.status(405).end();
  });
  const server = testApp.listen(0);
  return new Promise((resolve) =>
    server.once("listening", () =>
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })
    )
  );
}

function preflight(url: string, origin: string) {
  return fetch(`${url}/chat`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
}

describe("createCorsMiddleware with an origin list", () => {
  let server: Server;
  let url: string;

  before(async () => {
    ({ server, url } = await listen(["https://app.example.com"]));
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("echoes an allowed origin and varies on Origin", async () => {
    const res = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { Origin: "https://app.example.com" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.match(res.headers.get("vary") ?? "", /Origin/);
  });

  test("sends no allow-origin header for an origin that is not listed", async () => {
    const res = await fetch(`${url}/chat`, {
      method: "POST",
      headers: { Origin: "https://evil.example.net" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.match(res.headers.get("vary") ?? "", /Origin/);
  });

  test("answers a preflight from an unlisted origin without granting it", async () => {
    const res = await preflight(url, "https://evil.example.net");
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
    assert.equal(res.headers.get("access-control-allow-methods"), null);
  });

  test("grants a preflight from a listed origin", async () => {
    const res = await preflight(url, "https://app.example.com");
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /POST/);
  });
});

describe("CORS on the app (default: any origin)", () => {
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

  test("a preflight for POST /chat is answered with 204 instead of 405", async () => {
    const res = await preflight(baseUrl, "https://frontend.example.com");
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.match(res.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(res.headers.get("access-control-allow-headers") ?? "", /Content-Type/i);
    assert.equal(res.headers.get("access-control-max-age"), String(CORS_MAX_AGE_SECONDS));
  });

  test("a plain OPTIONS request (not a preflight) still gets the 405", async () => {
    const res = await fetch(`${baseUrl}/chat`, { method: "OPTIONS" });
    assert.equal(res.status, 405);
  });

  test("JSON error responses carry CORS headers so the browser can read them", async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://frontend.example.com" },
      body: '{"query": "unterminated',
    });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("access-control-expose-headers"), "Retry-After");
  });

  test("GET /health carries the allow-origin header", async () => {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://frontend.example.com" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });
});
