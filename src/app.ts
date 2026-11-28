import express, { type NextFunction, type Request, type Response } from "express";
import { createCorsMiddleware, resolveAllowedOrigins } from "./cors";
import { handleChat } from "./handlers/chat";

const app = express();
// Don't advertise the framework (and, indirectly, its version range) in an
// `X-Powered-By: Express` header on every response.
app.disable("x-powered-by");
// Before express.json(), so body-parsing errors also get CORS headers.
app.use(createCorsMiddleware(resolveAllowedOrigins()));
// A /chat body is a query of at most MAX_QUERY_LENGTH (2000) UTF-16 units, so
// even with every unit escaped as \uXXXX (6 bytes) it stays below 16kb. The
// express.json() default of 100kb would make the server buffer and parse
// several times more than any valid request needs before rejecting it.
export const JSON_BODY_LIMIT = "16kb";
app.use(express.json({ limit: JSON_BODY_LIMIT }));

/**
 * Answers requests that hit a known route with an unsupported method (e.g.
 * `GET /chat`) with 405 and an `Allow` header, instead of letting them fall
 * through to the 404 handler as if the route did not exist.
 */
export function methodNotAllowed(allowed: string[]) {
  const allow = allowed.join(", ");
  return (req: Request, res: Response) => {
    res
      .status(405)
      .set("Allow", allow)
      .json({ error: `method ${req.method} not allowed on ${req.path}; use ${allow}` });
  };
}

/**
 * Rejects a request body that is not JSON with 415. express.json() silently
 * skips other content types, so e.g. a form post or a curl call without
 * `-H "Content-Type: application/json"` reached the handler with an empty
 * body and got a misleading "query is required". A request with no body at
 * all is passed through, since its Content-Type is irrelevant.
 */
export function requireJsonBody(req: Request, res: Response, next: NextFunction) {
  // An empty body (no Transfer-Encoding and a Content-Length of 0 or none,
  // which is what `fetch` or `curl -X POST` send without a body) has nothing
  // to mis-parse, so let the handler report the missing query instead of
  // blaming the Content-Type.
  const hasBody =
    req.headers["transfer-encoding"] !== undefined ||
    Number(req.headers["content-length"] ?? 0) > 0;
  if (hasBody && !req.is("application/json")) {
    res.status(415).json({ error: "Content-Type must be application/json" });
    return;
  }
  next();
}

app.route("/chat").post(requireJsonBody, handleChat).all(methodNotAllowed(["POST"]));

app
  .route("/health")
  .get((_req, res) => {
    // A health check must reflect the API right now. Without this, a browser
    // or an intermediate proxy may answer a repeated check from cache and
    // keep reporting "ok" after the API has gone down.
    res.set("Cache-Control", "no-store").json({ status: "ok" });
  })
  .all(methodNotAllowed(["GET", "HEAD"]));

// Unknown routes would otherwise get Express's default HTML "Cannot GET /x"
// page. Keep every response from this API JSON, including 404s.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `route not found: ${req.method} ${req.path}` });
});

interface HttpError extends Error {
  status?: number;
  type?: string;
  body?: unknown;
}

/**
 * True when a body that express.json() refused to parse is in fact valid
 * JSON. In its default strict mode express.json() only accepts an object or
 * array, so a top-level string, number, `true` or `null` is reported as a
 * parse failure too, and telling that client its JSON is invalid sends it
 * looking for a syntax error that isn't there.
 */
export function isValidJson(body: unknown): boolean {
  if (typeof body !== "string") return false;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

// Without this, a malformed or oversized JSON body falls through to Express's
// default handler, which replies with an HTML page and a stack trace in dev.
// API clients (and the frontend) expect a JSON error instead.
app.use((err: HttpError, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err.type === "entity.parse.failed") {
    res.status(400).json({
      error: isValidJson(err.body)
        ? "request body must be a JSON object"
        : "request body must be valid JSON",
    });
    return;
  }

  if (err.type === "entity.too.large") {
    res.status(413).json({ error: "request body is too large" });
    return;
  }

  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  // A 4xx here is a problem with the request (e.g. body-parser's 415 for an
  // unsupported charset, or 400 when the client aborts mid-upload), not a
  // server fault, so don't log it with a stack trace as if it were one.
  if (status >= 500) {
    console.error("Unhandled error:", err);
  }
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message });
});

export default app;
