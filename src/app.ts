import express, { type NextFunction, type Request, type Response } from "express";
import { handleChat } from "./handlers/chat";

const app = express();
// Don't advertise the framework (and, indirectly, its version range) in an
// `X-Powered-By: Express` header on every response.
app.disable("x-powered-by");
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

app.route("/chat").post(handleChat).all(methodNotAllowed(["POST"]));

app
  .route("/health")
  .get((_req, res) => {
    res.json({ status: "ok" });
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
    res.status(400).json({ error: "request body must be valid JSON" });
    return;
  }

  if (err.type === "entity.too.large") {
    res.status(413).json({ error: "request body is too large" });
    return;
  }

  console.error("Unhandled error:", err);
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status >= 500 ? "Internal server error" : err.message });
});

export default app;
