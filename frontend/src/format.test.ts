import { describe, expect, test } from "vitest";
import { formatCharactersLeft, formatDocumentLabel, formatMessageCount } from "./format";

describe("formatMessageCount", () => {
  test("shows ready before any messages", () => {
    expect(formatMessageCount(0)).toBe("ready");
  });

  test("uses the singular for one message", () => {
    expect(formatMessageCount(1)).toBe("1 message");
  });

  test.each([2, 10])("uses the plural for %i messages", (count) => {
    expect(formatMessageCount(count)).toBe(`${count} messages`);
  });
});

describe("formatCharactersLeft", () => {
  test("uses the singular for one character", () => {
    expect(formatCharactersLeft(1)).toBe("1 character left");
  });

  test.each([0, 2, 200])("uses the plural for %i characters", (remaining) => {
    expect(formatCharactersLeft(remaining)).toBe(`${remaining} characters left`);
  });
});

describe("formatDocumentLabel", () => {
  test("shortens a UUID to its first block", () => {
    expect(formatDocumentLabel("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe("3f2504e0");
  });

  test("shows other IDs unchanged apart from surrounding whitespace", () => {
    expect(formatDocumentLabel(" handbook.pdf ")).toBe("handbook.pdf");
  });
});
