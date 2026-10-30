/** Minimal parts of http.Server and pg.Pool needed to shut down cleanly. */
export interface Closable {
  close(callback: (err?: Error) => void): unknown;
}

export interface Endable {
  end(): Promise<void>;
}

export interface ShutdownDeps {
  server: Closable;
  pool: Endable;
  log?: (message: string) => void;
  exit?: (code: number) => void;
}

/**
 * Returns a SIGTERM/SIGINT handler that stops accepting connections, lets
 * in-flight requests finish, closes the Postgres pool and then exits.
 * Without it, Node's default signal handling kills the process mid-request
 * and drops open database connections instead of closing them. A second
 * signal while shutting down is ignored, and any close error exits with 1.
 */
export function createShutdownHandler({
  server,
  pool,
  log = console.log,
  exit = (code) => process.exit(code),
}: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}, shutting down`);

    try {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await pool.end();
      exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      exit(1);
    }
  };
}
