import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateEmbeddings, chunk } from '@/ingestion/embed'
import { clusterArticles } from '@/ingestion/cluster'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit('embed-backfill', { maxRequests: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let batchSize = 50
  try {
    const body = await req.json()
    if (typeof body.batchSize === 'number') {
      batchSize = Math.min(Math.max(body.batchSize, 1), 200)
    }
  } catch {
    // no body or invalid JSON — use default
  }

  const supabase = createServiceClient()
  const errors: string[] = []

  // Fetch articles without embeddings (newest first)
  const { data: unembedded, error: fetchErr } = await supabase
    .from('articles')
    .select('id, title, body_excerpt')
    .is('embedding', null)
    .order('published_at', { ascending: false })
    .limit(batchSize)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const batch = unembedded ?? []

  if (batch.length > 0) {
    // Generate embeddings in sub-batches of 20
    const subBatches = chunk(batch, 20)
    for (const sub of subBatches) {
      try {
        const texts = sub.map(
          (r: { title: string; body_excerpt: string | null }) =>
            `${r.title}. ${r.body_excerpt ?? ''}`,
        )
        const vectors = await generateEmbeddings(texts)
        await Promise.all(
          sub.map((row: { id: string }, i: number) =>
            supabase.from('articles').update({ embedding: vectors[i] }).eq('id', row.id),
          ),
        )
      } catch (err) {
        errors.push(`Embed batch error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Cluster the embedded articles
    try {
      const clusterResult = await clusterArticles(batch.map((r: { id: string }) => r.id))
      if (clusterResult.errors.length > 0) {
        errors.push(...clusterResult.errors)
      }
    } catch (err) {
      errors.push(`Cluster error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Count remaining articles without embeddings
  const { count: remaining } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  return NextResponse.json({
    processed: batch.length,
    remaining: remaining ?? 0,
    errors,
  })
}
