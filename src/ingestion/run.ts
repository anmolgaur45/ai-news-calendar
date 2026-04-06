import { createServiceClient } from '@/lib/supabase-server'
import { ingestRSS } from './ingest-rss'
import { ingestHN } from './ingest-hn'
import { ingestGitHub } from './ingest-github'
import { RSS_SOURCES } from './sources'
import type { NormalizedArticle } from './normalize'
import { generateEmbeddings, chunk } from './embed'
import { clusterArticles } from './cluster'

export interface IngestResult {
  ingested: number
  skipped: number
  errors: string[]
}

export async function run(): Promise<IngestResult> {
  const errors: string[] = []

  // 1. Run all sources in parallel
  const [rssResults, hnResult, githubResult] = await Promise.allSettled([
    Promise.allSettled(RSS_SOURCES.map((source) => ingestRSS(source))),
    ingestHN(),
    ingestGitHub(),
  ])

  const allArticles: NormalizedArticle[] = []

  if (rssResults.status === 'fulfilled') {
    for (const result of rssResults.value) {
      if (result.status === 'fulfilled') allArticles.push(...result.value)
      else errors.push(`RSS error: ${result.reason}`)
    }
  } else {
    errors.push(`RSS batch error: ${rssResults.reason}`)
  }

  if (hnResult.status === 'fulfilled') {
    allArticles.push(...hnResult.value)
  } else {
    errors.push(`HN error: ${hnResult.reason}`)
  }

  if (githubResult.status === 'fulfilled') {
    allArticles.push(...githubResult.value)
  } else {
    errors.push(`GitHub error: ${githubResult.reason}`)
  }

  if (allArticles.length === 0) {
    return { ingested: 0, skipped: 0, errors }
  }

  // 2. Deduplicate by URL within the current batch
  const uniqueByUrl = new Map<string, NormalizedArticle>()
  for (const article of allArticles) {
    if (!uniqueByUrl.has(article.source_url)) {
      uniqueByUrl.set(article.source_url, article)
    }
  }
  const candidates = Array.from(uniqueByUrl.values())

  // 3. Check which URLs already exist in DB (batch query, last 30 days)
  const supabase = createServiceClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: existingRows, error: fetchError } = await supabase
    .from('articles')
    .select('source_url')
    .gte('created_at', thirtyDaysAgo)

  if (fetchError) {
    errors.push(`DB read error: ${fetchError.message}`)
    return { ingested: 0, skipped: 0, errors }
  }

  const existingUrls = new Set((existingRows ?? []).map((r: { source_url: string }) => r.source_url))
  const newArticles = candidates.filter((a) => !existingUrls.has(a.source_url))
  const skipped = candidates.length - newArticles.length

  if (newArticles.length === 0) {
    return { ingested: 0, skipped, errors }
  }

  // 4. Upsert new articles (ON CONFLICT source_url DO NOTHING)
  const rows = newArticles.map((a) => ({
    title: a.title,
    body_excerpt: a.body_excerpt,
    source_name: a.source_name,
    source_url: a.source_url,
    author: a.author,
    published_at: a.published_at,
    raw_category: a.raw_category,
    significance_base: a.significance_base,
  }))

  const { error: upsertError } = await supabase
    .from('articles')
    .upsert(rows, { onConflict: 'source_url', ignoreDuplicates: true })

  if (upsertError) {
    errors.push(`DB upsert error: ${upsertError.message}`)
    return { ingested: 0, skipped, errors }
  }

  // 5. Embed and cluster newly inserted articles
  try {
    // 5a. Fetch rows that were just inserted and still lack embeddings
    const { data: unembedded } = await supabase
      .from('articles')
      .select('id, title, body_excerpt')
      .in('source_url', newArticles.map((a) => a.source_url))
      .is('embedding', null)

    if (unembedded && unembedded.length > 0) {
      // 5b. Generate embeddings in batches of 20
      const batches = chunk(unembedded, 20)
      for (const batch of batches) {
        const texts = batch.map(
          (r: { title: string; body_excerpt: string | null }) =>
            `${r.title}. ${r.body_excerpt ?? ''}`,
        )
        const vectors = await generateEmbeddings(texts)
        await Promise.all(
          batch.map((row: { id: string }, i: number) =>
            supabase.from('articles').update({ embedding: vectors[i] }).eq('id', row.id),
          ),
        )
      }

      // 5c. Cluster the newly embedded articles
      const clusterResult = await clusterArticles(unembedded.map((r: { id: string }) => r.id))
      if (clusterResult.errors.length > 0) {
        errors.push(...clusterResult.errors)
      }
    }
  } catch (embedErr) {
    errors.push(`Embed/cluster error: ${embedErr instanceof Error ? embedErr.message : String(embedErr)}`)
  }

  return { ingested: newArticles.length, skipped, errors }
}
