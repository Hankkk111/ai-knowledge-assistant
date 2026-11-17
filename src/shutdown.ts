/** Minimal parts of http.Server and pg.Pool needed to shut down cleanly. */
export interface Closable {
  close(callback: (err?: Error) => void): unknown;
}

export interface Endable {
  end(): Promise<void>;
}

/**
 * How long to wait for in-flight requests and the Postgres pool to close
 * before exiting anyway. server.close() waits for every open request, so a
 * request stuck on a stalled Bedrock or database call would otherwise keep
 * the process alive after SIGTERM until the supervisor kills it.
 */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

export interface ShutdownDeps {
  server: Closable;
  pool: Endable;
  log?: (message: string) => void;
  exit?: (code: number) => void;
  timeoutMs?: number;
}

/**
 * Returns a SIGTERM/SIGINT handler that stops accepting connections, lets
 * in-flight requests finish, closes the Postgres pool and then exits.
 * Without it, Node's default signal handling kills the process mid-request
 * and drops open database connections instead of closing them. A second
 * signal while shutting down is ignored, and any close error exits with 1,
 * as does a shutdown that takes longer than `timeoutMs`.
 */
export function createShutdownHandler({
  server,
  pool,
  log = console.log,
  exit = (code) => process.exit(code),
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}, shutting down`);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`Shutdown did not finish within ${timeoutMs} ms, exiting anyway`);
      exit(1);
    }, timeoutMs);
    // Don't let the timer itself keep the event loop alive.
    timer.unref?.();

    try {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await pool.end();
      if (!timedOut) exit(0);
    } catch (err) {
      if (timedOut) return;
      console.error("Error during shutdown:", err);
      exit(1);
    } finally {
      clearTimeout(timer);
    }
  };
}
