import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

/**
 * Resets cluster assignments for articles in the last N hours.
 * After running this, execute the Python pipeline to re-cluster.
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
      windowHours = Math.min(Math.max(body.windowHours, 1), 168)
    }
  } catch {
    // use default
  }

  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  const articles = await sql<{ id: string; cluster_id: string | null }[]>`
    SELECT id, cluster_id FROM articles
    WHERE published_at >= ${windowStart}
    AND embedding IS NOT NULL
  `

  if (articles.length === 0) {
    return NextResponse.json({ message: 'No articles in window', reset: 0 })
  }

  const articleIds = articles.map((a) => a.id)
  const clusterIds = [...new Set(
    articles.map((a) => a.cluster_id).filter(Boolean)
  )] as string[]

  await sql`UPDATE articles SET cluster_id = NULL WHERE id = ANY(${articleIds})`

  if (clusterIds.length > 0) {
    await sql`DELETE FROM clusters WHERE id = ANY(${clusterIds})`
  }

  return NextResponse.json({
    windowHours,
    reset: articleIds.length,
    clustersDeleted: clusterIds.length,
    message: 'Clusters reset. Run the Python pipeline to re-cluster.',
  })
}
