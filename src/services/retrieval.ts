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

export async function findRelevantChunks(
  queryEmbedding: number[],
  limit: number = DEFAULT_CHUNK_LIMIT,
  db: Queryable = pool
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

  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // The embedding column is nullable (a chunk can be stored before it has
  // been embedded). pgvector's distance to NULL is NULL, which sorts last but
  // is still returned when there are fewer than `limit` embedded chunks, so
  // un-embedded chunks would be sent to the model as "relevant" context.
  const result = await db.query(
    `SELECT id, document_id, content, metadata
     FROM document_chunks
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vectorLiteral, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    embedding: [],
    metadata: row.metadata ?? {},
  }));
}
