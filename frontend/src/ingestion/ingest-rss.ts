import Parser from 'rss-parser'
import { buildNormalizedArticle, isFinancialNoise, type NormalizedArticle } from './normalize'
import type { Source } from './sources'

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'AI-News-Calendar/1.0 (news aggregator)' },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['dc:creator', 'dcCreator'],
    ],
  },
})

export async function ingestRSS(source: Source): Promise<NormalizedArticle[]> {
  let feed
  try {
    feed = await parser.parseURL(source.feed_url)
  } catch (err) {
    console.warn(`[ingest-rss] Failed to fetch ${source.name}: ${(err as Error).message}`)
    return []
  }

  const results: NormalizedArticle[] = []

  for (const item of feed.items ?? []) {
    const url = item.link ?? item.guid
    if (!url) continue

    const article = buildNormalizedArticle(
      {
        title: item.title ?? '',
        url,
        excerpt: item.contentSnippet ?? item.content ?? item.summary,
        author: item.creator ?? (item as unknown as Record<string, unknown>).dcCreator as string ?? null,
        publishedAt: item.isoDate ?? item.pubDate,
      },
      source,
    )

    if (!article) continue

    // Drop financial/investment noise (stock picks, analyst ratings, etc.)
    if (isFinancialNoise(article.title)) continue

    // If the source requires AI-only content, drop articles that don't match any category
    if (source.aiFilter && article.raw_category === 'uncategorized') continue

    results.push(article)
  }

  return results
}
