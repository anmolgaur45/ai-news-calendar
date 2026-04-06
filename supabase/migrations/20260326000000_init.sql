-- Enable pgvector extension for semantic similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Raw ingested articles (pre-clustering)
CREATE TABLE IF NOT EXISTS articles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  body_excerpt   TEXT,
  source_name    TEXT NOT NULL,
  source_url     TEXT NOT NULL UNIQUE,
  author         TEXT,
  published_at   TIMESTAMPTZ NOT NULL,
  raw_category   TEXT,
  embedding      VECTOR(384),
  cluster_id     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Deduplicated story groups
CREATE TABLE IF NOT EXISTS clusters (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headline            TEXT NOT NULL,
  category            TEXT DEFAULT 'uncategorized',
  significance_score  FLOAT DEFAULT 0,
  first_published_at  TIMESTAMPTZ NOT NULL,
  article_count       INT DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE articles
  ADD CONSTRAINT fk_cluster
  FOREIGN KEY (cluster_id) REFERENCES clusters(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_cluster_id   ON articles (cluster_id);
CREATE INDEX IF NOT EXISTS idx_clusters_published_at ON clusters (first_published_at DESC);
CREATE INDEX IF NOT EXISTS idx_clusters_category     ON clusters (category);
