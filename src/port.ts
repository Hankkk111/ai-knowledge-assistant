export const DEFAULT_PORT = 3000;

/**
 * Picks the port for the local dev server from `PORT`. A value that is not
 * an integer in 1-65535 (e.g. "abc" or "70000") falls back to the default
 * instead of being passed to `app.listen`, which would otherwise throw
 * ERR_SOCKET_BAD_PORT or treat a non-numeric string as a named pipe path.
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_PORT;
  }

  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}
