from dataclasses import dataclass


@dataclass
class NormalizedArticle:
    title: str
    body_excerpt: str | None
    source_name: str
    source_url: str
    author: str | None
    published_at: str  # ISO 8601
    raw_category: str
    significance_base: float
