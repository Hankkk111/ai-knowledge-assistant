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
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING ivfflat (embedding vector_cosine_ops);
