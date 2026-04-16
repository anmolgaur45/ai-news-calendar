import { buildNormalizedArticle, type NormalizedArticle } from './normalize'
import { HN_SOURCE } from './sources'

const HN_BASE = 'https://hacker-news.firebaseio.com/v0'
const FETCH_LIMIT = 150 // top N story IDs to scan
const BATCH_SIZE = 20 // parallel requests per batch

const AI_KEYWORDS = [
  'ai', 'llm', 'gpt', 'claude', 'gemini', 'openai', 'anthropic', 'hugging',
  'transformer', 'mistral', 'llama', 'deepseek', 'neural', 'diffusion',
  'machine learning', 'deep learning', 'language model', 'inference',
]

function isAIRelated(title: string): boolean {
  const lower = title.toLowerCase()
  return AI_KEYWORDS.some((kw) => lower.includes(kw))
}

interface HNItem {
  id: number
  type: string
  title?: string
  url?: string
  time?: number
  by?: string
  score?: number
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json() as Promise<T>
}

async function fetchBatch(ids: number[]): Promise<HNItem[]> {
  return Promise.all(
    ids.map((id) =>
      fetchJSON<HNItem>(`${HN_BASE}/item/${id}.json`).catch(() => ({ id, type: 'error' } as HNItem)),
    ),
  )
}

export async function ingestHN(): Promise<NormalizedArticle[]> {
  let topIds: number[]
  try {
    topIds = await fetchJSON<number[]>(`${HN_BASE}/topstories.json`)
  } catch (err) {
    console.warn(`[ingest-hn] Failed to fetch top stories: ${(err as Error).message}`)
    return []
  }

  const idsToFetch = topIds.slice(0, FETCH_LIMIT)
  const results: NormalizedArticle[] = []

  for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
    const batch = idsToFetch.slice(i, i + BATCH_SIZE)
    const items = await fetchBatch(batch)

    for (const item of items) {
      if (item.type !== 'story' || !item.title || !isAIRelated(item.title)) continue

      const url = item.url ?? `https://news.ycombinator.com/item?id=${item.id}`

      const article = buildNormalizedArticle(
        {
          title: item.title,
          url,
          excerpt: null, // HN stories have no body
          author: item.by,
          publishedAt: item.time,
        },
        HN_SOURCE,
      )

      if (article) results.push(article)
    }
  }

  return results
}
