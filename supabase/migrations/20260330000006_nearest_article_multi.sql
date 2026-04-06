-- Update find_nearest_article to return multiple candidates (up to 10)
-- so the clustering algorithm can prefer joining existing clusters over
-- creating new pairings, and handle syndicated stories with varied headlines.
CREATE OR REPLACE FUNCTION find_nearest_article(
  query_embedding VECTOR(384),
  exclude_id       UUID,
  window_start     TIMESTAMPTZ,
  distance_threshold FLOAT DEFAULT 0.15
)
RETURNS TABLE (
  id          UUID,
  cluster_id  UUID,
  title       TEXT,
  distance    FLOAT
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    a.id,
    a.cluster_id,
    a.title,
    (a.embedding <=> query_embedding)::FLOAT AS distance
  FROM articles a
  WHERE
    a.published_at >= window_start
    AND a.embedding IS NOT NULL
    AND a.id != exclude_id
    AND (a.embedding <=> query_embedding) < distance_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT 10;
$$;
