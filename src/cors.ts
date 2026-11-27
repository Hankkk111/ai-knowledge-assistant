import type { NextFunction, Request, Response } from "express";

/** Origins allowed to call the API from a browser: any ("*") or an explicit list. */
export type AllowedOrigins = "*" | string[];

// How long a browser may cache a preflight result, so a chat session doesn't
// send an extra OPTIONS request before every question.
export const CORS_MAX_AGE_SECONDS = 600;

/**
 * Reads CORS_ALLOWED_ORIGINS, a comma-separated list of origins such as
 * `https://example.cloudfront.net,http://localhost:5173`. Unset, blank or
 * `*` allows any origin: the API is public, takes no cookies or credentials,
 * and the deployed frontend is served from a different origin (S3/CloudFront)
 * than API Gateway. Entries are trimmed and a trailing slash is dropped,
 * because a browser's Origin header never has one. They are also lowercased:
 * browsers always send the scheme and host in lowercase, so an entry such as
 * `https://App.example.com` would otherwise never match and its requests
 * would be blocked.
 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): AllowedOrigins {
  const raw = env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return "*";

  const origins = raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, "").toLowerCase())
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : "*";
}

/**
 * Adds CORS headers so the browser frontend can read API responses, and
 * answers preflight requests. The frontend sends `Content-Type:
 * application/json`, which makes every /chat call preflighted with an
 * OPTIONS request; without this, that OPTIONS fell through to the 405
 * handler and the browser blocked the real request, so the UI could only
 * report "Couldn't reach the knowledge base". `Retry-After` is exposed so a
 * client can read it from a 503.
 *
 * Must be registered before express.json(), so JSON errors raised while
 * parsing the body (400, 413) also carry the headers and stay readable.
 */
export function createCorsMiddleware(allowed: AllowedOrigins) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    let allowOrigin: string | undefined;

    if (allowed === "*") {
      allowOrigin = "*";
    } else {
      // The response depends on the Origin header, so caches must key on it.
      res.vary("Origin");
      if (origin !== undefined && allowed.includes(origin)) {
        allowOrigin = origin;
      }
    }

    if (allowOrigin !== undefined) {
      res.set("Access-Control-Allow-Origin", allowOrigin);
      res.set("Access-Control-Expose-Headers", "Retry-After");
    }

    // A preflight is an OPTIONS request with Access-Control-Request-Method.
    // A plain OPTIONS request still reaches the routes (and their 405).
    if (req.method === "OPTIONS" && req.headers["access-control-request-method"] !== undefined) {
      if (allowOrigin !== undefined) {
        res.set({
          "Access-Control-Allow-Methods": "GET, HEAD, POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": String(CORS_MAX_AGE_SECONDS),
        });
      }
      res.status(204).end();
      return;
    }

    next();
  };
}
