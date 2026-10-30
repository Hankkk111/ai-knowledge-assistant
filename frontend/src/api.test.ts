import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, RequestTimeoutError, parseChatResponse, sendMessage } from "./api";

describe("parseChatResponse", () => {
  test("returns the answer and sources of a valid body", () => {
    const body = {
      answer: "Paris",
      sources: [{ documentId: "doc-1", snippet: "Paris is the capital" }],
    };

    expect(parseChatResponse(body)).toEqual(body);
  });

  test("defaults to no sources when the field is missing", () => {
    expect(parseChatResponse({ answer: "Paris" })).toEqual({ answer: "Paris", sources: [] });
  });

  test("drops malformed source entries", () => {
    const result = parseChatResponse({
      answer: "Paris",
      sources: [
        { documentId: "doc-1", snippet: "ok" },
        { documentId: 42, snippet: "bad id" },
        null,
        "doc-2",
      ],
    });

    expect(result.sources).toEqual([{ documentId: "doc-1", snippet: "ok" }]);
  });

  test.each([
    ["null", null],
    ["an empty object", {}],
    ["a non-string answer", { answer: 42 }],
    ["an empty answer", { answer: "" }],
    ["a whitespace-only answer", { answer: "  \n " }],
  ])("throws on %s", (_name, body) => {
    expect(() => parseChatResponse(body)).toThrow("API response did not contain an answer");
  });
});

describe("sendMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  test("posts the query as JSON to /chat", async () => {
    const fetchMock = stubFetch(Response.json({ answer: "Paris", sources: [] }));

    await expect(sendMessage("capital of France?")).resolves.toEqual({
      answer: "Paris",
      sources: [],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/chat$/);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "capital of France?" }),
    });
  });

  test("throws an ApiError with the server's error message", async () => {
    stubFetch(Response.json({ error: "query is required" }, { status: 400 }));

    const error = await sendMessage("").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: "query is required" });
  });

  test("uses API Gateway's message field when there is no error field", async () => {
    stubFetch(Response.json({ message: "Too Many Requests" }, { status: 429 }));

    await expect(sendMessage("hi")).rejects.toMatchObject({
      status: 429,
      message: "Too Many Requests",
    });
  });

  test("falls back to the status code when the error body is not JSON", async () => {
    stubFetch(new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(sendMessage("hi")).rejects.toMatchObject({
      status: 502,
      message: "Request failed: 502",
    });
  });

  test("rejects a successful response that is not JSON", async () => {
    stubFetch(new Response("<html>ok</html>", { status: 200 }));

    await expect(sendMessage("hi")).rejects.toThrow("API response was not valid JSON");
  });

  test("passes an abort signal so a hung request can time out", async () => {
    const fetchMock = stubFetch(Response.json({ answer: "Paris", sources: [] }));

    await sendMessage("hi");

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test("throws a RequestTimeoutError when the API does not respond in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          })
      )
    );

    const error = await sendMessage("hi", 10).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RequestTimeoutError);
    expect(error).toMatchObject({ message: "The request timed out after 0.01 seconds" });
  });
});
