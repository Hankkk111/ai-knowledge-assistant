import { ApiError, RequestTimeoutError } from "./api";

export const TIMEOUT_MESSAGE = "The knowledge base took too long to answer. Please try again.";
export const UNREACHABLE_MESSAGE =
  "Couldn't reach the knowledge base. Check the API and try again.";

/**
 * Turns an error from sendMessage into the message shown under the chat.
 * 4xx responses carry a specific reason from the API (e.g. the query is too
 * long), so it is shown as is to tell the user what to change. A timeout and
 * anything else (a network or server failure) get a generic message.
 */
export function describeChatError(err: unknown): string {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return err.message;
  }
  if (err instanceof RequestTimeoutError) {
    return TIMEOUT_MESSAGE;
  }
  return UNREACHABLE_MESSAGE;
}
