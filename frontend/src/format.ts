/**
 * Header status text: "ready" before the first question, then the number of
 * messages in the conversation with the noun matching the count.
 */
export function formatMessageCount(count: number): string {
  if (count === 0) return "ready";
  return `${count} ${count === 1 ? "message" : "messages"}`;
}
