-- Safe to run more than once (e.g. after pulling a newer version): existing
-- objects are left in place instead of failing with "already exists".
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  content TEXT NOT NULL,
  -- Must match EMBEDDING_DIMENSIONS in src/services/embedding.ts
  -- (Titan Text Embeddings v2 returns 1024-dimensional vectors).
  embedding vector(1024),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Named so IF NOT EXISTS can match it; an unnamed index would get a fresh
-- auto-generated name and be duplicated on every run.
-- HNSW rather than IVFFlat: an IVFFlat index builds its lists from the rows
-- present when it is created, and this script creates it on an empty table,
-- so similarity searches would probe untrained lists and miss relevant
-- chunks. HNSW needs no training data (pgvector 0.5.0+). Re-running this file
-- does not replace an existing index; drop document_chunks_embedding_idx
-- first to switch an older database over.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
