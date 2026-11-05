import { describe, expect, it } from "vitest";
import { ApiError, RequestTimeoutError } from "./api";
import { describeChatError, TIMEOUT_MESSAGE, UNREACHABLE_MESSAGE } from "./errors";

describe("describeChatError", () => {
  it("shows the API's reason for a 4xx response", () => {
    expect(describeChatError(new ApiError(400, "query must be at most 2000 characters"))).toBe(
      "query must be at most 2000 characters"
    );
  });

  it("explains a timeout", () => {
    expect(describeChatError(new RequestTimeoutError(45_000))).toBe(TIMEOUT_MESSAGE);
  });

  it("does not show the server's text for a 5xx response", () => {
    expect(describeChatError(new ApiError(500, "Internal server error"))).toBe(UNREACHABLE_MESSAGE);
  });

  it("falls back to the generic message for network and unknown errors", () => {
    expect(describeChatError(new TypeError("Failed to fetch"))).toBe(UNREACHABLE_MESSAGE);
    expect(describeChatError("boom")).toBe(UNREACHABLE_MESSAGE);
  });
});
