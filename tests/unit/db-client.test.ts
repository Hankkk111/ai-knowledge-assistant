import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DB_CONNECTION_TIMEOUT_MS,
  DB_QUERY_TIMEOUT_MS,
  DEFAULT_DB_PORT,
  buildPoolConfig,
  pool,
} from "../../src/db/client";

test("buildPoolConfig uses the local Docker defaults when nothing is set", () => {
  assert.deepEqual(buildPoolConfig({}), {
    host: "localhost",
    port: DEFAULT_DB_PORT,
    database: "ai_knowledge_assistant",
    user: "postgres",
    password: "postgres",
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
  });
});

test("connection and query timeouts leave time to respond before the Lambda times out", () => {
  const config = buildPoolConfig({});
  const lambdaTimeoutMs = 30_000;

  assert.ok(config.connectionTimeoutMillis! > 0);
  assert.ok(config.query_timeout! > 0);
  assert.ok(config.connectionTimeoutMillis! + config.query_timeout! < lambdaTimeoutMs);
});

test("buildPoolConfig reads connection settings from the environment", () => {
  const config = buildPoolConfig({
    DB_HOST: "db.internal",
    DB_PORT: "5432",
    DB_NAME: "kb",
    DB_USER: "app",
    DB_PASSWORD: "secret",
  });

  assert.equal(config.host, "db.internal");
  assert.equal(config.port, 5432);
  assert.equal(config.database, "kb");
  assert.equal(config.user, "app");
  assert.equal(config.password, "secret");
});

test("buildPoolConfig falls back to the default port for invalid DB_PORT values", () => {
  for (const value of ["abc", "0", "-1", "70000", "54.3", "", "0x1538", "1e3", "5432.0"]) {
    assert.equal(buildPoolConfig({ DB_PORT: value }).port, DEFAULT_DB_PORT, `DB_PORT=${value}`);
  }
});

test("buildPoolConfig ignores surrounding whitespace in DB_PORT", () => {
  assert.equal(buildPoolConfig({ DB_PORT: " 5432 " }).port, 5432);
});

test("an idle client error on the pool is logged instead of crashing the process", (t) => {
  const logged = t.mock.method(console, "error", () => {});

  // Without an "error" listener this emit would throw.
  assert.doesNotThrow(() => pool.emit("error", new Error("connection terminated unexpectedly")));
  assert.equal(logged.mock.callCount(), 1);
});
