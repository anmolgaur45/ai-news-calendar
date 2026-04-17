from datetime import datetime, timedelta, timezone

import psycopg
import structlog
from sentence_transformers import SentenceTransformer

log = structlog.get_logger()

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        log.info("embeddings.loading_model")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        log.info("embeddings.model_loaded")
    return _model


_BACKFILL_MIN = 300
_BACKFILL_DAYS = 4


def embed_pending(conn: psycopg.Connection, batch_size: int = 64) -> int:
    """Encode articles with no embedding and write 384-dim vectors to DB.

    Only processes the latest 300 articles or the last 4 days, whichever is more.
    """
    four_days_ago = datetime.now(timezone.utc) - timedelta(days=_BACKFILL_DAYS)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM articles WHERE embedding IS NULL AND published_at >= %s",
            (four_days_ago,),
        )
        count_4days = cur.fetchone()[0]
    limit = max(_BACKFILL_MIN, count_4days)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, title, body_excerpt FROM articles WHERE embedding IS NULL ORDER BY published_at DESC LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()

    if not rows:
        log.info("embeddings.none_pending")
        return 0

    model = _get_model()
    ids = [r[0] for r in rows]
    texts = [f"{r[1]}. {r[2] or ''}" for r in rows]
    total = 0

    for i in range(0, len(texts), batch_size):
        batch_ids = ids[i : i + batch_size]
        batch_texts = texts[i : i + batch_size]

        vectors = model.encode(batch_texts, normalize_embeddings=True, show_progress_bar=False)

        with conn.cursor() as cur:
            for article_id, vec in zip(batch_ids, vectors):
                cur.execute(
                    "UPDATE articles SET embedding = %s WHERE id = %s",
                    (vec.tolist(), article_id),
                )
        conn.commit()
        total += len(batch_ids)
        log.info("embeddings.batch", done=total, total=len(ids))

    return total
