import express, { type NextFunction, type Request, type Response } from "express";
import { handleChat } from "./handlers/chat";

const app = express();
app.use(express.json());

app.post("/chat", handleChat);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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
