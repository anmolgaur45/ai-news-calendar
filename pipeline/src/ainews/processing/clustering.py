import uuid
from datetime import datetime, timedelta, timezone

import psycopg
import structlog

from ..sources import get_organization

log = structlog.get_logger()


def _coverage_multiplier(distinct_orgs: int) -> float:
    return 1.0 + 0.25 * (distinct_orgs - 1)


def compute_cluster_score(conn: psycopg.Connection, cluster_id: str) -> float:
    """Compute and return the significance score for a cluster."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT source_name, significance_base, impact_score FROM articles WHERE cluster_id = %s",
            (cluster_id,),
        )
        articles = cur.fetchall()

    if not articles:
        return 0.0

    # Max significance_base per organization (so Google DM + Google AI = 1 org)
    org_base: dict[str, float] = {}
    impact_scores: list[float] = []

    for source_name, sig_base, impact_score in articles:
        org = get_organization(source_name)
        org_base[org] = max(org_base.get(org, 0.0), float(sig_base or 0.0))
        if impact_score is not None:
            impact_scores.append(float(impact_score))

    # Default to neutral 5 only when no articles have been scored yet
    max_impact = max(impact_scores) if impact_scores else 5.0

    base_score = sum(org_base.values())
    distinct_orgs = len(org_base)
    raw = base_score * (max_impact / 5.0) * _coverage_multiplier(distinct_orgs)

    # Normalize to 1–10 display scale
    # Divisor 20: single top-lab article (sig_base=10) with impact=5 → 5; impact=9 → 9
    return min(10.0, max(1.0, round(raw * 10.0 / 20.0)))


def _create_cluster(
    conn: psycopg.Connection,
    headline: str,
    category: str,
    published_at: datetime,
) -> str:
    cluster_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO clusters (id, headline, category, significance_score, first_published_at, article_count)
            VALUES (%s, %s, %s, 0, %s, 0)
            """,
            (cluster_id, headline, category, published_at),
        )
    return cluster_id


def _assign_articles(conn: psycopg.Connection, article_ids: list[str], cluster_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE articles SET cluster_id = %s WHERE id = ANY(%s)",
            (cluster_id, article_ids),
        )
        # Keep article_count and first_published_at in sync
        cur.execute(
            """
            UPDATE clusters c SET
                article_count     = (SELECT COUNT(*) FROM articles a WHERE a.cluster_id = c.id),
                first_published_at = (SELECT MIN(published_at) FROM articles a WHERE a.cluster_id = c.id)
            WHERE c.id = %s
            """,
            (cluster_id,),
        )


_BACKFILL_MIN = 300
_BACKFILL_DAYS = 4


def cluster_pending(
    conn: psycopg.Connection,
    distance_threshold: float,
    window_hours: int,
) -> int:
    """Assign cluster_id to every article that has an embedding but no cluster yet.

    Only processes the latest 300 articles or the last 4 days, whichever is more.
    Uses article-relative windowing: each article searches for neighbors within
    ±window_hours of its own published_at. This lets late-ingested articles still
    cluster with contemporaneous articles, and naturally prevents cross-temporal
    contamination (old articles only find other old articles as neighbors).
    """
    four_days_ago = datetime.now(timezone.utc) - timedelta(days=_BACKFILL_DAYS)
    window_td = timedelta(hours=window_hours)
    affected_clusters: set[str] = set()
    total = 0

    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM articles WHERE cluster_id IS NULL AND embedding IS NOT NULL AND published_at >= %s",
            (four_days_ago,),
        )
        count_4days = cur.fetchone()[0]
    limit = max(_BACKFILL_MIN, count_4days)

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, title, raw_category, published_at, embedding
            FROM articles
            WHERE cluster_id IS NULL AND embedding IS NOT NULL
            ORDER BY published_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    # Process oldest-first so early articles become cluster seeds for later ones
    rows = list(reversed(rows))

    log.info("clustering.pending", count=len(rows))

    for article_id, title, category, published_at, embedding in rows:
        # A previous iteration in this same batch may have already assigned this article
        with conn.cursor() as cur:
            cur.execute("SELECT cluster_id FROM articles WHERE id = %s", (article_id,))
            row = cur.fetchone()
            if row and row[0] is not None:
                affected_clusters.add(str(row[0]))
                continue

        # Article-relative window: search for neighbors within ±window_hours of this
        # article's publication date. Using the article's own date (not NOW()) means:
        # - Late-ingested articles still find contemporaneous articles as neighbors
        # - Old articles (e.g. 2023) only find other articles from 2023 — naturally
        #   preventing cross-temporal contamination without a special guard
        article_window_start = published_at - window_td
        article_window_end = published_at + window_td

        # Find up to 10 nearest neighbors inside the article-relative time window
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM find_nearest_article(%s, %s, %s, %s, %s)",
                (embedding, str(article_id), article_window_start, distance_threshold, article_window_end),
            )
            neighbors = cur.fetchall()
            # Columns: id, cluster_id, title, distance

        if not neighbors:
            # No similar articles → create solo cluster
            cluster_id = _create_cluster(conn, title, category or "uncategorized", published_at)
            _assign_articles(conn, [str(article_id)], cluster_id)
            affected_clusters.add(cluster_id)
            conn.commit()
            total += 1
            continue

        # Prefer joining an existing cluster if any neighbor has one
        existing_cluster: str | None = None
        for n in neighbors:
            if n[1] is not None:  # n[1] = cluster_id column
                existing_cluster = str(n[1])
                break

        if existing_cluster:
            _assign_articles(conn, [str(article_id)], existing_cluster)
            affected_clusters.add(existing_cluster)
        else:
            # No neighbor has a cluster → create new one for all of them + this article
            cluster_id = _create_cluster(conn, title, category or "uncategorized", published_at)
            neighbor_ids = [str(n[0]) for n in neighbors]
            _assign_articles(conn, [str(article_id)] + neighbor_ids, cluster_id)
            affected_clusters.add(cluster_id)

        conn.commit()
        total += 1

    # Recompute significance scores for every touched cluster
    log.info("clustering.rescoring", clusters=len(affected_clusters))
    for cluster_id in affected_clusters:
        score = compute_cluster_score(conn, cluster_id)
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE clusters SET significance_score = %s WHERE id = %s",
                (score, cluster_id),
            )
    conn.commit()

    return total
