import { pool } from "../db/client";
import type { DocumentChunk } from "../types";

export async function findRelevantChunks(
  queryEmbedding: number[],
  limit: number = 5
): Promise<DocumentChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const result = await pool.query(
    `SELECT id, document_id, content, metadata
     FROM document_chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [vectorLiteral, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    embedding: [],
    metadata: row.metadata,
  }));
}
