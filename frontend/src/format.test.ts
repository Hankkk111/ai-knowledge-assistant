import { describe, expect, test } from "vitest";
import { formatCharactersLeft, formatMessageCount } from "./format";

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
