import { test } from "node:test";
import assert from "node:assert/strict";
import { createShutdownHandler, type Closable, type Endable } from "../../src/shutdown";

function fakes(closeError?: Error, endError?: Error) {
  const calls: string[] = [];
  const server: Closable = {
    close(callback) {
      calls.push("server.close");
      callback(closeError);
    },
  };
  const pool: Endable = {
    async end() {
      calls.push("pool.end");
      if (endError) throw endError;
    },
  };
  const exitCodes: number[] = [];
  const handler = createShutdownHandler({
    server,
    pool,
    log: () => {},
    exit: (code) => {
      exitCodes.push(code);
    },
  });
  return { calls, exitCodes, handler };
}

test("shutdown closes the server, then the pool, then exits with 0", async () => {
  const { calls, exitCodes, handler } = fakes();
  await handler("SIGTERM");
  assert.deepEqual(calls, ["server.close", "pool.end"]);
  assert.deepEqual(exitCodes, [0]);
});

test("shutdown ignores a second signal while already shutting down", async () => {
  const { calls, exitCodes, handler } = fakes();
  await Promise.all([handler("SIGTERM"), handler("SIGINT")]);
  assert.deepEqual(calls, ["server.close", "pool.end"]);
  assert.deepEqual(exitCodes, [0]);
});

test("shutdown exits with 1 and skips the pool when the server fails to close", async (t) => {
  t.mock.method(console, "error", () => {});
  const { calls, exitCodes, handler } = fakes(new Error("not running"));
  await handler("SIGTERM");
  assert.deepEqual(calls, ["server.close"]);
  assert.deepEqual(exitCodes, [1]);
});

test("shutdown exits with 1 when closing the pool fails", async (t) => {
  t.mock.method(console, "error", () => {});
  const { exitCodes, handler } = fakes(undefined, new Error("pool already ended"));
  await handler("SIGTERM");
  assert.deepEqual(exitCodes, [1]);
});
