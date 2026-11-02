/**
 * Header status text: "ready" before the first question, then the number of
 * messages in the conversation with the noun matching the count.
 */
export function formatMessageCount(count: number): string {
  if (count === 0) return "ready";
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

/**
 * Hint shown under the input as the query nears MAX_QUERY_LENGTH, with the
 * noun matching the count ("1 character left", not "1 characters left").
 */
export function formatCharactersLeft(remaining: number): string {
  return `${remaining} ${remaining === 1 ? "character" : "characters"} left`;
}
