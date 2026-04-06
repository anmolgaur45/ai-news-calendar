import type { Category } from '@/types/article'

export interface Source {
  name: string
  organization: string  // parent company/org — used for dedup so Google AI Blog + Google DeepMind count as 1
  feed_url: string
  type: 'rss' | 'hn' | 'github'
  authority: number // tier-1 AI labs=10, major AI media=7, tech press/arXiv=5, aggregators=3, community=2
  default_category: Category
  aiFilter?: boolean  // drop articles that don't match any AI category
}

/** Map source_name → organization for scoring deduplication. */
export function getOrganization(sourceName: string): string {
  return SOURCE_ORG_MAP[sourceName] ?? sourceName
}

export const RSS_SOURCES: Source[] = [
  // Tier 1 — AI lab primary blogs (authority 10)
  {
    name: 'OpenAI Blog',
    organization: 'OpenAI',
    feed_url: 'https://openai.com/news/rss.xml',
    type: 'rss',
    authority: 10,
    default_category: 'model-releases',
  },
  {
    // Anthropic has no RSS feed — use Google News site: query restricted to
    // /news and /research paths to avoid product pages (/claude/sonnet),
    // API docs, and CDN PDFs being ingested as news articles.
    name: 'Anthropic News',
    organization: 'Anthropic',
    feed_url: 'https://news.google.com/rss/search?q=site:anthropic.com/news+OR+site:anthropic.com/research&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 10,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Google DeepMind Blog',
    organization: 'Google',
    feed_url: 'https://deepmind.google/blog/rss.xml',
    type: 'rss',
    authority: 10,
    default_category: 'research-papers',
  },
  {
    name: 'Google AI Blog',
    organization: 'Google',
    feed_url: 'https://blog.google/technology/ai/rss/',
    type: 'rss',
    authority: 10,
    default_category: 'product-launches',
  },
  {
    // ai.meta.com has no RSS — engineering.fb.com is the closest working Meta feed
    name: 'Meta AI Blog',
    organization: 'Meta',
    feed_url: 'https://engineering.fb.com/feed/',
    type: 'rss',
    authority: 10,
    default_category: 'research-papers',
    aiFilter: true,
  },
  {
    name: 'Microsoft AI Blog',
    organization: 'Microsoft',
    feed_url: 'https://blogs.microsoft.com/ai/feed/',
    type: 'rss',
    authority: 10,
    default_category: 'product-launches',
  },
  {
    // Mistral has no RSS feed — use Google News targeted search
    name: 'Mistral AI News',
    organization: 'Mistral',
    feed_url: 'https://news.google.com/rss/search?q=mistral+AI&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 5,  // secondary coverage, not the primary source
    default_category: 'model-releases',
    aiFilter: true,
  },
  // Tier 2 — Major AI-specific media (authority 7)
  {
    name: 'NVIDIA AI Blog',
    organization: 'NVIDIA',
    feed_url: 'https://blogs.nvidia.com/feed/',
    type: 'rss',
    authority: 7,
    default_category: 'hardware-infrastructure',
  },
  {
    name: 'Hugging Face Blog',
    organization: 'Hugging Face',
    feed_url: 'https://huggingface.co/blog/feed.xml',
    type: 'rss',
    authority: 7,
    default_category: 'open-source',
  },
  {
    name: 'Apple Machine Learning Blog',
    organization: 'Apple',
    feed_url: 'https://machinelearning.apple.com/rss.xml',
    type: 'rss',
    authority: 7,
    default_category: 'research-papers',
  },
  // Tier 3 — Tech press & research (authority 5)
  {
    name: 'arXiv CS.AI',
    organization: 'arXiv',
    feed_url: 'https://rss.arxiv.org/rss/cs.AI+cs.CL+cs.LG+cs.CV',
    type: 'rss',
    authority: 5,
    default_category: 'research-papers',
  },
  {
    name: 'TechCrunch AI',
    organization: 'TechCrunch',
    feed_url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
  },
  {
    // AI section RSS was removed — use general feed with aiFilter to drop non-AI articles
    name: 'The Verge',
    organization: 'The Verge',
    feed_url: 'https://www.theverge.com/rss/index.xml',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
    aiFilter: true,
  },
  {
    name: 'VentureBeat AI',
    organization: 'VentureBeat',
    feed_url: 'https://venturebeat.com/category/ai/feed/',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
  },
  // Tier 4 — Aggregators (authority 3)
  {
    name: 'Google News: AI',
    organization: 'Google News',
    feed_url:
      'https://news.google.com/rss/search?q=artificial+intelligence+AI&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 3,
    default_category: 'company-news',
  },
  // Reddit RSS is hard-blocked (403) — requires OAuth API; deferred to later phase

  // ─── International AI Labs ─────────────────────────────────────────────────
  // China — no direct English RSS; Google News site: queries catch official announcements
  {
    name: 'DeepSeek News',
    organization: 'DeepSeek',
    feed_url: 'https://news.google.com/rss/search?q=DeepSeek+AI+model&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 10,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Qwen News',
    organization: 'Alibaba',
    feed_url: 'https://news.google.com/rss/search?q=Qwen+AI+OR+Alibaba+Qwen+model&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 10,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Zhipu AI News',
    organization: 'Zhipu AI',
    feed_url: 'https://news.google.com/rss/search?q=Zhipu+AI+GLM+OR+ChatGLM&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Moonshot AI News',
    organization: 'Moonshot AI',
    feed_url: 'https://news.google.com/rss/search?q=Moonshot+AI+Kimi&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  // International labs
  {
    name: 'Cohere News',
    organization: 'Cohere',
    feed_url: 'https://news.google.com/rss/search?q=Cohere+AI+Command&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Stability AI News',
    organization: 'Stability AI',
    feed_url: 'https://news.google.com/rss/search?q=Stability+AI+Stable+Diffusion&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Sakana AI News',
    organization: 'Sakana AI',
    feed_url: 'https://news.google.com/rss/search?q=Sakana+AI&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'research-papers',
    aiFilter: true,
  },
  {
    name: 'TII Falcon News',
    organization: 'TII',
    feed_url: 'https://news.google.com/rss/search?q=Technology+Innovation+Institute+Falcon+AI&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'Reka AI News',
    organization: 'Reka AI',
    feed_url: 'https://news.google.com/rss/search?q=Reka+AI+model&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  {
    name: 'AI21 Labs News',
    organization: 'AI21 Labs',
    feed_url: 'https://news.google.com/rss/search?q=AI21+Labs+Jamba&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },
  // India AI
  {
    name: 'Sarvam AI News',
    organization: 'Sarvam AI',
    feed_url: 'https://news.google.com/rss/search?q=Sarvam+AI&hl=en-US&gl=US&ceid=US:en',
    type: 'rss',
    authority: 7,
    default_category: 'model-releases',
    aiFilter: true,
  },

  // ─── AI Publications ───────────────────────────────────────────────────────
  {
    name: 'The Decoder',
    organization: 'The Decoder',
    feed_url: 'https://the-decoder.com/feed/',
    type: 'rss',
    authority: 7,
    default_category: 'company-news',
  },
  {
    name: 'Synced Review',
    organization: 'Synced Review',
    feed_url: 'https://syncedreview.com/feed/',
    type: 'rss',
    authority: 5,
    default_category: 'research-papers',
  },
  {
    name: 'MIT Technology Review',
    organization: 'MIT Technology Review',
    feed_url: 'https://www.technologyreview.com/feed/',
    type: 'rss',
    authority: 7,
    default_category: 'research-papers',
    aiFilter: true,
  },
  {
    name: 'Ars Technica',
    organization: 'Ars Technica',
    feed_url: 'https://feeds.arstechnica.com/arstechnica/index',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
    aiFilter: true,
  },
  {
    name: 'Wired AI',
    organization: 'Wired',
    feed_url: 'https://www.wired.com/feed/tag/ai/latest/rss',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
  },
  {
    name: 'IEEE Spectrum AI',
    organization: 'IEEE Spectrum',
    feed_url: 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss',
    type: 'rss',
    authority: 5,
    default_category: 'research-papers',
  },
  {
    name: 'The Register AI',
    organization: 'The Register',
    feed_url: 'https://www.theregister.com/software/ai_ml/headlines.atom',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
  },
  {
    name: 'Rest of World',
    organization: 'Rest of World',
    feed_url: 'https://restofworld.org/feed/latest',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
    aiFilter: true,
  },
  {
    name: 'MarkTechPost',
    organization: 'MarkTechPost',
    feed_url: 'https://www.marktechpost.com/feed',
    type: 'rss',
    authority: 5,
    default_category: 'research-papers',
  },
  {
    name: 'InfoQ AI',
    organization: 'InfoQ',
    feed_url: 'https://feed.infoq.com/ai-ml-data-eng/',
    type: 'rss',
    authority: 5,
    default_category: 'research-papers',
  },
  {
    name: 'Last Week in AI',
    organization: 'Last Week in AI',
    feed_url: 'https://lastweekin.ai/feed',
    type: 'rss',
    authority: 5,
    default_category: 'company-news',
  },
  {
    name: 'Bloomberg Technology',
    organization: 'Bloomberg',
    feed_url: 'https://feeds.bloomberg.com/technology/news.rss',
    type: 'rss',
    authority: 7,
    default_category: 'company-news',
    aiFilter: true,
  },
]

export const HN_SOURCE: Source = {
  name: 'Hacker News',
  organization: 'Hacker News',
  feed_url: 'https://hacker-news.firebaseio.com/v0',
  type: 'hn',
  authority: 3,
  default_category: 'company-news',
}

export const GITHUB_REPOS: Array<{ owner: string; repo: string }> = [
  { owner: 'huggingface', repo: 'transformers' },
  { owner: 'langchain-ai', repo: 'langchain' },
  { owner: 'vllm-project', repo: 'vllm' },
  { owner: 'ollama', repo: 'ollama' },
  { owner: 'ggml-org', repo: 'llama.cpp' },
  { owner: 'deepseek-ai', repo: 'DeepSeek-V3' },
  { owner: 'QwenLM', repo: 'Qwen2.5' },
  { owner: 'cohere-ai', repo: 'cohere-toolkit' },
]

export const GITHUB_SOURCE: Source = {
  name: 'GitHub Releases',
  organization: 'GitHub',
  feed_url: 'https://api.github.com',
  type: 'github',
  authority: 3,
  default_category: 'open-source',
}

// Derived lookup map for cluster.ts (avoids importing the full arrays there)
const SOURCE_ORG_MAP: Record<string, string> = Object.fromEntries(
  [...RSS_SOURCES, HN_SOURCE, GITHUB_SOURCE].map((s) => [s.name, s.organization]),
)
