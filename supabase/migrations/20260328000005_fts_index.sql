-- Phase 4: Full-text search on cluster headlines.
-- Generated column keeps tsvector automatically in sync with headline changes.
-- GIN index supports the @@ operator efficiently.

ALTER TABLE clusters
  ADD COLUMN IF NOT EXISTS headline_tsv TSVECTOR
    GENERATED ALWAYS AS (to_tsvector('english', headline)) STORED;

CREATE INDEX IF NOT EXISTS idx_clusters_headline_fts
  ON clusters USING GIN (headline_tsv);
