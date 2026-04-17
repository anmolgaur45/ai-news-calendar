import re
from datetime import datetime, timezone
from html.parser import HTMLParser

from ..models import NormalizedArticle
from ..sources import Source


CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "model-releases": [
        "release", "launches", "launched", "introducing", "new model", "gpt-", "claude",
        "gemini", "llama", "mistral", "grok", "phi-", "qwen", "deepseek", "weights",
        "checkpoint", "fine-tun", "instruct", "chat model",
    ],
    "research-papers": [
        "arxiv", "paper", "research", "study", "we propose", "we present", "benchmark",
        "dataset", "training", "preprint", "journal", "conference", "icml", "neurips",
        "iclr", "acl", "emnlp",
    ],
    "company-news": [
        "funding", "raises", "acquisition", "acquires", "partnership",
        "valuation", "billion", "million", "ceo", "executive", "leadership", "series",
        "venture", "ipo", "layoffs", "hired",
    ],
    "product-launches": [
        "api", "integration", "feature", "update", "plugin", "app", "tool", "platform",
        "service", "product", "available now", "generally available", "ga ", "beta",
        "preview", "copilot", "assistant", "chatbot",
    ],
    "regulation-policy": [
        "regulation", "policy", "law", "congress", "senate", "eu ", "government",
        "act ", "ban", "safety", "alignment", "risk", "guidelines", "compliance",
        "gdpr", "executive order", "legislation",
    ],
    "hardware-infrastructure": [
        "gpu", "tpu", "chip", "nvidia", "amd", "intel", "hardware", "compute",
        "data center", "inference", "h100", "h200", "blackwell", "cuda", "cluster",
        "supercomputer", "training infrastructure",
    ],
    "open-source": [
        "open source", "open-source", "github", "release v", "v0.", "v1.", "v2.",
        "repo", "repository", "hugging face", "weights", "community", "apache",
        "mit license", "ollama", "llama.cpp", "vllm", "langchain",
    ],
    "opinion-analysis": [
        "opinion", "analysis", "commentary", "editorial", "perspective", "why ",
        "how ", "what ", "should", "future of", "impact of", "the case for",
        "the case against", "reflections",
    ],
}

AI_RELEVANCE_KEYWORDS = [
    # Multi-word or unambiguous single-word AI terms
    "artificial intelligence", "machine learning", "deep learning",
    "language model", "llm", "neural network", "neural net",
    "generative model", "foundation model",
    # Specific model/product names
    "chatgpt", "gpt-", "claude", "gemini", "llama", "mistral",
    "grok", "phi-", "qwen", "deepseek", "copilot", "dall-e",
    "midjourney", "stable diffusion", "sora", "glm-", "codex",
    # AI company names (unambiguous even without "AI" suffix)
    "openai", "anthropic", "deepmind", "hugging face", "huggingface",
    "sakana", "sarvam",
    # Technical terms
    "fine-tun", "rlhf", "diffusion model", "embedding model", "chatbot", "deepfake",
]

# Word-boundary regex for "AI" as a standalone word (avoids "email", "paid", "Taiwan")
_AI_WORD_RE = re.compile(r'\bai\b', re.IGNORECASE)


def is_ai_relevant(title: str, body: str | None) -> bool:
    """Return True if an article is actually about AI/ML topics.

    Used for sources with ai_filter=True to block non-AI articles that slip
    through categorization (e.g. titles with 'billion'/'million' get tagged
    'company-news' even when they're about GDP or VR hardware).

    Strategy: word-boundary regex for "AI" as a standalone word handles the
    majority of cases cleanly (avoids false matches on "email", "paid", etc.).
    Falls back to specific keyword list for AI articles that don't use the word
    "AI" but reference model names, company names, or technical terms.
    """
    combined = (title + " " + (body or "")).lower()
    if _AI_WORD_RE.search(combined):
        return True
    return any(kw in combined for kw in AI_RELEVANCE_KEYWORDS)


FINANCIAL_NOISE_PATTERNS = [
    "stock", "stocks", "shares", "buy hand over fist", "investor", "portfolio",
    "etf", "nasdaq", "wall street", "earnings", "valuation", "market cap",
    "price target", "analyst", "bull case", "bear case", "to buy in",
    "top pick", "strong buy", "undervalued", "overvalued",
    "sell-off", "selloff", "worth a fortune", "getting cheaper",
    "could be worth", "motley fool", "the motley fool",
    "trillion in sales", "revenue forecast", "market share",
    "buy before", "before it", "don't miss", "missed out",
    "billionaire", "hedge fund",
]


def is_english(text: str) -> bool:
    """Return True if text is likely English.

    langdetect is unreliable on short text (< ~15 words) and mis-fires often on
    technical AI titles full of proper nouns. Strategy:
    - Short text → assume English (safe default).
    - Longer text → run langdetect; reject only if confidently non-English (score > 0.98).
    This keeps false-positive deletions near zero while still catching long
    Spanish/French/German articles like Bloomberg's international content.
    """
    words = text.split()
    if len(words) < 10:
        return True  # Too short to classify reliably — keep it
    try:
        from langdetect import detect_langs
        results = detect_langs(text)
        # Only reject if the top language is non-English with very high confidence
        if results and results[0].lang != "en" and results[0].prob > 0.98:
            return False
        return True
    except Exception:
        return True  # Default to include on any error


def is_financial_noise(title: str) -> bool:
    t = title.lower()
    return any(p in t for p in FINANCIAL_NOISE_PATTERNS)


def is_github_rolling_build(tag_name: str, release_name: str | None) -> bool:
    if "." in tag_name:
        return False
    if re.match(r"^[a-f0-9]{5,}$", tag_name, re.IGNORECASE):
        return True
    if re.match(r"^b\d+$", tag_name):
        return True
    if release_name is not None and release_name == tag_name:
        return True
    return False


def categorize(title: str, body: str | None) -> str:
    title_lower = title.lower()
    body_lower = (body or "").lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in title_lower for kw in keywords):
            return category
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in body_lower for kw in keywords):
            return category
    return "uncategorized"


class _HTMLStripper(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts)


def strip_html(html: str) -> str:
    stripper = _HTMLStripper()
    stripper.feed(html)
    text = stripper.get_text()
    return re.sub(r"\s+", " ", text).strip()


def truncate_words(text: str, max_words: int = 150) -> str:
    words = text.strip().split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + "…"


def normalize_excerpt(raw: str | None) -> str | None:
    if not raw:
        return None
    stripped = strip_html(raw)
    if not stripped:
        return None
    return truncate_words(stripped)


def to_iso_string(val: str | int | float | datetime | None) -> str | None:
    if val is None:
        return None
    try:
        if isinstance(val, (int, float)):
            dt = datetime.fromtimestamp(val, tz=timezone.utc)
        elif isinstance(val, datetime):
            dt = val if val.tzinfo else val.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
        return dt.isoformat()
    except (ValueError, OSError):
        return None


def build_normalized_article(
    title: str,
    url: str,
    excerpt: str | None,
    author: str | None,
    published_at: str | int | float | datetime | None,
    source: Source,
) -> NormalizedArticle | None:
    title = (title or "").strip()
    if not title or not url:
        return None

    iso = to_iso_string(published_at)
    if not iso:
        return None

    body_excerpt = normalize_excerpt(excerpt)
    raw_category = categorize(title, body_excerpt)

    return NormalizedArticle(
        title=title,
        body_excerpt=body_excerpt,
        source_name=source.name,
        source_url=url,
        author=author,
        published_at=iso,
        raw_category=raw_category,
        significance_base=float(source.authority),
    )
