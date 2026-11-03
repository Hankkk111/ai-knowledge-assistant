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

/**
 * Short label for the document a source snippet came from. Document IDs are
 * UUIDs, which are too long to show next to every snippet, so only the first
 * block is kept (enough to tell documents apart in one answer); the full ID
 * stays available as a tooltip. IDs that aren't UUIDs are shown as they are.
 */
export function formatDocumentLabel(documentId: string): string {
  const match = /^([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(
    documentId.trim()
  );
  return match ? match[1].toLowerCase() : documentId.trim();
}
