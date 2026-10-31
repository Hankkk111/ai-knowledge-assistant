export const DEFAULT_PORT = 3000;

/**
 * Parses a TCP port from an environment variable. Only plain decimal digits
 * in 1-65535 are accepted: `Number()` alone would also accept "0x1538",
 * "1e3" or "5432.0", silently turning a typo into a different port.
 * Returns undefined for anything else so callers can fall back to a default.
 */
export function parsePort(value: string | undefined): number | undefined {
  const raw = value?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return undefined;
  }

  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : undefined;
}

/**
 * Picks the port for the local dev server from `PORT`. A value that is not
 * an integer in 1-65535 (e.g. "abc" or "70000") falls back to the default
 * instead of being passed to `app.listen`, which would otherwise throw
 * ERR_SOCKET_BAD_PORT or treat a non-numeric string as a named pipe path.
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  return parsePort(env.PORT) ?? DEFAULT_PORT;
}

/**
 * Turns an error from `server.listen` into a one-line hint for the common
 * local cases (port taken, or a privileged port without permission), so
 * `npm run dev` doesn't end in an unhandled 'error' event stack trace.
 * Returns undefined for anything else, which should be rethrown.
 */
export function describeListenError(err: NodeJS.ErrnoException, port: number): string | undefined {
  if (err.code === "EADDRINUSE") {
    return `Port ${port} is already in use. Stop the other process or set PORT to a free port.`;
  }
  if (err.code === "EACCES") {
    return `Permission denied to listen on port ${port}. Set PORT to a value above 1023.`;
  }
  return undefined;
}
