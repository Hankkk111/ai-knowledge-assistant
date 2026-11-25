import { pool } from "../db/client";
import type { DocumentChunk } from "../types";

// Default and maximum number of chunks returned for a single query. The cap
// keeps the prompt sent to the model (and its cost) bounded.
export const DEFAULT_CHUNK_LIMIT = 5;
export const MAX_CHUNK_LIMIT = 20;

// Minimal query interface so the database can be stubbed in unit tests.
export interface Queryable {
  query(text: string, values: unknown[]): Promise<{ rows: any[] }>;
}

/**
 * The metadata column is JSONB, which can hold any JSON value, not only an
 * object: a chunk inserted with `'[]'`, `'"pdf"'` or `'null'` is valid SQL.
 * DocumentChunk.metadata is typed as an object, so anything else is replaced
 * with `{}` rather than handed to callers that index into it.
 */
export function normalizeMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Reads the optional MAX_CHUNK_DISTANCE cut-off. Without one, the nearest
 * `limit` chunks are always returned, however unrelated they are, so a
 * question the indexed documents don't cover still gets an answer built on
 * (and citing) irrelevant sources instead of the "couldn't find" reply.
 * Cosine distance runs from 0 (same direction) to 2 (opposite), so only a
 * plain decimal number in (0, 2] is accepted; anything else (blank, "abc",
 * "0", "3") is ignored and no cut-off is applied.
 */
export function resolveMaxChunkDistance(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.MAX_CHUNK_DISTANCE?.trim();
  if (!raw || !/^(\d+\.?\d*|\.\d+)$/.test(raw)) {
    return undefined;
  }

  const distance = Number(raw);
  return distance > 0 && distance <= 2 ? distance : undefined;
}

export async function findRelevantChunks(
  queryEmbedding: number[],
  limit: number = DEFAULT_CHUNK_LIMIT,
  db: Queryable = pool,
  maxDistance: number | undefined = resolveMaxChunkDistance()
): Promise<DocumentChunk[]> {
  if (
    !Array.isArray(queryEmbedding) ||
    queryEmbedding.length === 0 ||
    !queryEmbedding.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    throw new Error("queryEmbedding must be a non-empty array of finite numbers");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CHUNK_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_CHUNK_LIMIT}`);
  }

  if (maxDistance !== undefined && !(maxDistance > 0 && maxDistance <= 2)) {
    throw new RangeError("maxDistance must be a number greater than 0 and at most 2");
  }

  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // The embedding column is nullable (a chunk can be stored before it has
  // been embedded). pgvector's distance to NULL is NULL, which sorts last but
  // is still returned when there are fewer than `limit` embedded chunks, so
  // un-embedded chunks would be sent to the model as "relevant" context.
  const distanceFilter = maxDistance === undefined ? "" : "\n       AND embedding <=> $1 <= $3";
  const result = await db.query(
    `SELECT id, document_id, content, metadata
     FROM document_chunks
     WHERE embedding IS NOT NULL${distanceFilter}
     ORDER BY embedding <=> $1
     LIMIT $2`,
    maxDistance === undefined ? [vectorLiteral, limit] : [vectorLiteral, limit, maxDistance]
  );

  return result.rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    embedding: [],
    metadata: normalizeMetadata(row.metadata),
  }));
}
