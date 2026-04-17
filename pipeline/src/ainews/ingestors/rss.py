from calendar import timegm
from datetime import datetime, timezone

import feedparser
import structlog

from ..models import NormalizedArticle
from ..processing.normalize import build_normalized_article, is_financial_noise, is_english, is_ai_relevant
from ..sources import Source

log = structlog.get_logger()


def ingest_rss(source: Source) -> list[NormalizedArticle]:
    try:
        feed = feedparser.parse(
            source.feed_url,
            request_headers={"User-Agent": "AI-News-Calendar/1.0 (news aggregator)"},
        )
    except Exception as exc:
        log.warning("rss.fetch_failed", source=source.name, error=str(exc))
        return []

    results: list[NormalizedArticle] = []

    for entry in feed.entries:
        url = entry.get("link") or entry.get("id")
        if not url:
            continue

        excerpt = (
            entry.get("summary")
            or entry.get("content", [{}])[0].get("value")
            or None
        )
        author = entry.get("author") or entry.get("dc_creator") or None
        # Use parsed struct_time (always UTC) — raw strings are RFC 2822 which
        # fromisoformat() cannot handle.
        parsed_time = entry.get("published_parsed") or entry.get("updated_parsed")
        published_at = (
            datetime.fromtimestamp(timegm(parsed_time), tz=timezone.utc)
            if parsed_time else None
        )

        article = build_normalized_article(
            title=entry.get("title", ""),
            url=url,
            excerpt=excerpt,
            author=author,
            published_at=published_at,
            source=source,
        )
        if not article:
            continue
        if is_financial_noise(article.title):
            continue
        if not is_english(article.title):
            continue
        if source.ai_filter and not is_ai_relevant(article.title, article.body_excerpt):
            continue

        results.append(article)

    log.info("rss.ingested", source=source.name, count=len(results))
    return results
