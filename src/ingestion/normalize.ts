import type { Category } from '@/types/article'
import type { Source } from './sources'

export interface NormalizedArticle {
  title: string
  body_excerpt: string | null
  source_name: string
  source_url: string
  author: string | null
  published_at: string // ISO 8601
  raw_category: string
  significance_base: number
}

// Keyword map for category classification. Title match beats body match.
const CATEGORY_KEYWORDS: Record<Exclude<Category, 'uncategorized'>, string[]> = {
  'model-releases': [
    'release', 'launches', 'launched', 'introducing', 'new model', 'gpt-', 'claude',
    'gemini', 'llama', 'mistral', 'grok', 'phi-', 'qwen', 'deepseek', 'weights',
    'checkpoint', 'fine-tun', 'instruct', 'chat model',
  ],
  'research-papers': [
    'arxiv', 'paper', 'research', 'study', 'we propose', 'we present', 'benchmark',
    'dataset', 'training', 'preprint', 'journal', 'conference', 'icml', 'neurips',
    'iclr', 'acl', 'emnlp',
  ],
  'company-news': [
    'funding', 'raises', 'acquisition', 'acquires', 'partnership', 'partnership',
    'valuation', 'billion', 'million', 'ceo', 'executive', 'leadership', 'series',
    'venture', 'ipo', 'layoffs', 'hired',
  ],
  'product-launches': [
    'api', 'integration', 'feature', 'update', 'plugin', 'app', 'tool', 'platform',
    'service', 'product', 'available now', 'generally available', 'ga ', 'beta',
    'preview', 'copilot', 'assistant', 'chatbot',
  ],
  'regulation-policy': [
    'regulation', 'policy', 'law', 'congress', 'senate', 'eu ', 'government',
    'act ', 'ban', 'safety', 'alignment', 'risk', 'guidelines', 'compliance',
    'gdpr', 'executive order', 'legislation',
  ],
  'hardware-infrastructure': [
    'gpu', 'tpu', 'chip', 'nvidia', 'amd', 'intel', 'hardware', 'compute',
    'data center', 'inference', 'h100', 'h200', 'blackwell', 'cuda', 'cluster',
    'supercomputer', 'training infrastructure',
  ],
  'open-source': [
    'open source', 'open-source', 'github', 'release v', 'v0.', 'v1.', 'v2.',
    'repo', 'repository', 'hugging face', 'weights', 'community', 'apache',
    'mit license', 'ollama', 'llama.cpp', 'vllm', 'langchain',
  ],
  'opinion-analysis': [
    'opinion', 'analysis', 'commentary', 'editorial', 'perspective', 'why ',
    'how ', 'what ', 'should', 'future of', 'impact of', 'the case for',
    'the case against', 'reflections',
  ],
}

// Titles matching these patterns are financial content, not AI news — drop them
const FINANCIAL_NOISE_PATTERNS = [
  'stock', 'stocks', 'shares', 'buy hand over fist', 'investor', 'portfolio',
  'etf', 'nasdaq', 'wall street', 'earnings', 'valuation', 'market cap',
  'price target', 'analyst', 'bull case', 'bear case', 'to buy in',
  'top pick', 'strong buy', 'undervalued', 'overvalued',
  // Additional investment/financial noise patterns
  'sell-off', 'selloff', 'worth a fortune', 'getting cheaper',
  'could be worth', 'motley fool', 'the motley fool',
  'trillion in sales', 'revenue forecast', 'market share',
  'buy before', 'before it', "don't miss", 'missed out',
  'billionaire', 'hedge fund',
]

/** Returns true if the title looks like financial noise rather than AI news. */
export function isFinancialNoise(title: string): boolean {
  const t = title.toLowerCase()
  return FINANCIAL_NOISE_PATTERNS.some((p) => t.includes(p))
}

/**
 * Returns true if a GitHub release looks like a rolling/incremental build rather
 * than a named release worth showing (e.g. llama.cpp "b8560 — b8560").
 * Semver tags (containing a dot) are always kept.
 */
export function isGitHubRollingBuild(tagName: string, releaseName: string | null): boolean {
  // Semver tags (v4.50.0, 0.8.1) are always meaningful — keep them
  if (tagName.includes('.')) return false

  // Pure hex hash — a raw commit SHA used as a tag (e.g. "abc1234f")
  if (/^[a-f0-9]{5,}$/i.test(tagName)) return true

  // llama.cpp rolling build numbers: "b8560", "b9001"
  if (/^b\d+$/.test(tagName)) return true

  // Tag and name are identical with no version structure — no extra context
  if (releaseName !== null && releaseName === tagName) return true

  return false
}

export function categorize(title: string, body: string | null): Category {
  const titleLower = title.toLowerCase()
  const bodyLower = (body ?? '').toLowerCase()

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => titleLower.includes(kw))) {
      return category as Category
    }
  }
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => bodyLower.includes(kw))) {
      return category as Category
    }
  }
  return 'uncategorized'
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Truncate to at most 150 words (copyright compliance) */
function truncateWords(text: string, maxWords = 150): string {
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ') + '…'
}

export function normalizeExcerpt(raw: string | null | undefined): string | null {
  if (!raw) return null
  const stripped = stripHtml(raw)
  if (!stripped) return null
  return truncateWords(stripped)
}

/** Base significance score. Social signals added in Phase 2. */
export function scoreSignificance(authority: number): number {
  return authority
}

function coerceAuthor(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') return val.trim() || null
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>
    return coerceAuthor(obj.name ?? obj.text ?? obj['#text'])
  }
  return null
}

export function buildNormalizedArticle(
  params: {
    title: string
    url: string
    excerpt: string | null | undefined
    author: unknown
    publishedAt: string | Date | number | null | undefined
  },
  source: Source,
): NormalizedArticle | null {
  const title = params.title?.trim()
  if (!title || !params.url) return null

  const body_excerpt = normalizeExcerpt(params.excerpt)
  const published_at = toISOString(params.publishedAt)
  if (!published_at) return null

  const raw_category = categorize(title, body_excerpt)

  return {
    title,
    body_excerpt,
    source_name: source.name,
    source_url: params.url,
    author: coerceAuthor(params.author),
    published_at,
    raw_category,
    significance_base: scoreSignificance(source.authority),
  }
}

function toISOString(val: string | Date | number | null | undefined): string | null {
  if (!val) return null
  try {
    const d = new Date(typeof val === 'number' ? val * 1000 : val)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  } catch {
    return null
  }
}
