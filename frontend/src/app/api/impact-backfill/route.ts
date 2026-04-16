import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { scoreImpactBatch } from '@/ingestion/impact'
import { clusterScore } from '@/ingestion/cluster'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

type ScoringArticle = { significance_base: number | null; source_name: string; impact_score: number | null }

export async function POST(req: NextRequest) {
  // Auth check
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit('impact-backfill', { maxRequests: 30, windowMs: 60_000 })
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
      batchSize = Math.min(Math.max(body.batchSize, 1), 100)
    }
  } catch {
    // no body or invalid JSON — use default
  }

  const supabase = createServiceClient()
  const errors: string[] = []
  let scoredCount = 0

  // Fetch articles without impact scores (newest first)
  const { data: unscored, error: fetchErr } = await supabase
    .from('articles')
    .select('id, title, body_excerpt')
    .is('impact_score', null)
    .order('published_at', { ascending: false })
    .limit(batchSize)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const batch = (unscored ?? []) as { id: string; title: string; body_excerpt: string | null }[]

  if (batch.length > 0) {
    // Score all articles in batch with Claude Haiku
    let scores = new Map<string, number>()
    try {
      scores = await scoreImpactBatch(batch)
    } catch (err) {
      errors.push(`Haiku scoring error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Update each scored article and collect affected cluster ids
    const affectedClusterIds = new Set<string>()
    for (const article of batch) {
      const score = scores.get(article.id)
      if (score == null) continue
      const { data: updated, error: updateErr } = await supabase
        .from('articles')
        .update({ impact_score: score })
        .eq('id', article.id)
        .select('cluster_id')
        .single()
      if (updateErr) {
        errors.push(`Update error for ${article.id}: ${updateErr.message}`)
      } else {
        scoredCount++
        if (updated?.cluster_id) {
          affectedClusterIds.add(updated.cluster_id)
        }
      }
    }

    // Recalculate significance_score for each affected cluster
    for (const clusterId of affectedClusterIds) {
      try {
        const { data: clusterArticles } = await supabase
          .from('articles')
          .select('significance_base, source_name, impact_score')
          .eq('cluster_id', clusterId)

        if (clusterArticles && clusterArticles.length > 0) {
          const newScore = clusterScore(clusterArticles as ScoringArticle[])
          await supabase
            .from('clusters')
            .update({ significance_score: newScore })
            .eq('id', clusterId)
        }
      } catch (err) {
        errors.push(`Cluster recalc error for ${clusterId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // Count remaining articles without impact scores
  const { count: remaining } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .is('impact_score', null)

  return NextResponse.json({
    processed: batch.length,
    scored: scoredCount,
    remaining: remaining ?? 0,
    errors,
  })
}
