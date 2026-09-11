import express from "express";
import { handleChat } from "./handlers/chat";

const app = express();
app.use(express.json());

app.post("/chat", handleChat);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
