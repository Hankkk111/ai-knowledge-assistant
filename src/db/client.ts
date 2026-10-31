import { Pool, type PoolConfig } from "pg";
import { parsePort } from "../port";

export const DEFAULT_DB_PORT = 5433;

/**
 * Builds the Postgres pool config from environment variables, falling back to
 * the local Docker defaults from the README. An invalid DB_PORT (anything but
 * a plain decimal integer in 1-65535, so also "0x1538" or "1e3") is ignored
 * instead of being passed to pg as NaN or as an unintended port.
 */
export function buildPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  return {
    host: env.DB_HOST || "localhost",
    port: parsePort(env.DB_PORT) ?? DEFAULT_DB_PORT,
    database: env.DB_NAME || "ai_knowledge_assistant",
    user: env.DB_USER || "postgres",
    password: env.DB_PASSWORD || "postgres",
  };
}

/**
 * Logs errors raised by idle pooled clients (e.g. Postgres restarting or the
 * network dropping a connection). pg emits these as an "error" event on the
 * pool; with no listener, Node treats it as an unhandled error and crashes
 * the whole process. The broken client is already removed from the pool, so
 * the next query simply opens a new connection.
 */
export function handleIdleClientError(err: Error): void {
  console.error("Unexpected error on idle Postgres client:", err);
}

export const pool = new Pool(buildPoolConfig());
pool.on("error", handleIdleClientError);
