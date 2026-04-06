-- HNSW index on article embeddings for fast approximate nearest-neighbor search
-- Used by Phase 2 clustering (cosine distance queries)
CREATE INDEX IF NOT EXISTS idx_articles_embedding
  ON articles USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
