import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { clusterArticles } from '@/ingestion/cluster'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * Re-cluster articles from the last N hours by:
 * 1. Nulling cluster_id on all articles in the window
 * 2. Deleting orphaned clusters (no articles)
 * 3. Re-running clustering with the current threshold
 *
 * Use after changing DISTANCE_THRESHOLD to fix incorrectly split clusters.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit('recluster', { maxRequests: 5, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let windowHours = 48
  try {
    const body = await req.json()
    if (typeof body.windowHours === 'number') {
      windowHours = Math.min(Math.max(body.windowHours, 1), 168) // max 7 days
    }
  } catch {
    // use default
  }

  const supabase = createServiceClient()
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  // 1. Fetch all articles in the window that have embeddings
  const allArticles: { id: string; cluster_id: string | null }[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, cluster_id')
      .gte('published_at', windowStart)
      .not('embedding', 'is', null)
      .range(offset, offset + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allArticles.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  if (allArticles.length === 0) {
    return NextResponse.json({ message: 'No articles in window', reclustered: 0 })
  }

  const articleIds = allArticles.map((a) => a.id)
  const clusterIds = [...new Set(allArticles.map((a) => a.cluster_id).filter(Boolean))] as string[]

  // 2. Null out cluster_id on all articles in window (un-cluster them)
  for (let i = 0; i < articleIds.length; i += 500) {
    await supabase
      .from('articles')
      .update({ cluster_id: null })
      .in('id', articleIds.slice(i, i + 500))
  }

  // 3. Delete the now-orphaned cluster rows
  if (clusterIds.length > 0) {
    for (let i = 0; i < clusterIds.length; i += 500) {
      await supabase
        .from('clusters')
        .delete()
        .in('id', clusterIds.slice(i, i + 500))
    }
  }

  // 4. Re-cluster with the current threshold
  const result = await clusterArticles(articleIds)

  return NextResponse.json({
    windowHours,
    articleIds: articleIds.length,
    clustersDeleted: clusterIds.length,
    reclustered: result.clustered,
    errors: result.errors,
  })
}
