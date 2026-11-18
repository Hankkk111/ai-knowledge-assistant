import { describe, expect, it } from "vitest";
import { dropFailedQuestion } from "./messages";
import type { Message } from "./types";

describe("dropFailedQuestion", () => {
  const history: Message[] = [
    { role: "user", content: "What is RAG?" },
    { role: "assistant", content: "Retrieval-augmented generation.", sources: [] },
  ];

  it("removes the trailing question that failed", () => {
    const messages: Message[] = [...history, { role: "user", content: "How do I deploy?" }];
    expect(dropFailedQuestion(messages, "How do I deploy?")).toEqual(history);
  });

  it("leaves the history alone when the last message is an answer", () => {
    expect(dropFailedQuestion(history, "What is RAG?")).toBe(history);
  });

  it("leaves the history alone when the last question is a different one", () => {
    const messages: Message[] = [...history, { role: "user", content: "Something else" }];
    expect(dropFailedQuestion(messages, "How do I deploy?")).toBe(messages);
  });

  it("handles an empty conversation", () => {
    expect(dropFailedQuestion([], "How do I deploy?")).toEqual([]);
  });

  it("does not modify the array it was given", () => {
    const messages: Message[] = [{ role: "user", content: "How do I deploy?" }];
    dropFailedQuestion(messages, "How do I deploy?");
    expect(messages).toHaveLength(1);
  });
});
