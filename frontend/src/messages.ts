import type { Message } from "./types";

/**
 * Removes the question that just failed from the conversation. After an
 * error the question is put back in the input box so it can be retried, and
 * retrying adds it to the conversation again; keeping the failed copy would
 * show the same question twice in a row with no answer between them. Only a
 * trailing user message with exactly this content is removed, so nothing
 * else in the history is touched.
 */
export function dropFailedQuestion(messages: Message[], query: string): Message[] {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && last.content === query) {
    return messages.slice(0, -1);
  }
  return messages;
}

/**
 * True when a question has nothing to search for: it is empty or made only of
 * whitespace and invisible format characters such as a zero-width space
 * (U+200B), which trim() leaves in place. The API rejects such a query with
 * "query is required", so the form doesn't offer to send it.
 */
export function isBlankQuery(query: string): boolean {
  return /^[\s\p{Cf}]*$/u.test(query);
}
