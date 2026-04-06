import { createServiceClient } from '@/lib/supabase-server'
import { getOrganization } from './sources'

const DISTANCE_THRESHOLD = 0.25 // cosine distance < 0.25 ≈ similarity > 0.75
const WINDOW_HOURS = 48

/** Coverage multiplier: each additional distinct publisher adds 25% to the score. */
function coverageMultiplier(distinctSources: number): number {
  return 1 + 0.25 * (distinctSources - 1)
}

/**
 * Sum max significance_base per distinct organization.
 * Prevents the same org's multiple channels (e.g. Google AI Blog + Google DeepMind)
 * from inflating the score — they count as one publisher.
 */
function baseScoreFromArticles(articles: { significance_base: number | null; source_name: string }[]): number {
  const maxPerOrg = new Map<string, number>()
  for (const a of articles) {
    const org = getOrganization(a.source_name)
    const cur = maxPerOrg.get(org) ?? 0
    maxPerOrg.set(org, Math.max(cur, a.significance_base ?? 1))
  }
  return Array.from(maxPerOrg.values()).reduce((s, v) => s + v, 0)
}

function distinctOrgs(articles: { source_name: string }[]): number {
  return new Set(articles.map((a) => getOrganization(a.source_name))).size
}

type ScoringArticle = { significance_base: number | null; source_name: string; impact_score: number | null }

/**
 * Compute cluster significance score incorporating LLM impact scoring.
 * Formula: baseScore × (maxImpactScore/5) × coverageMultiplier
 * When no impact scores exist yet, maxImpact defaults to 5 (neutral ×1 — same as old formula).
 */
export function clusterScore(articles: ScoringArticle[]): number {
  const base = baseScoreFromArticles(articles)
  const maxImpact = articles.reduce((m, a) => Math.max(m, a.impact_score ?? 5), 5)
  return Math.round(base * (maxImpact / 5) * coverageMultiplier(distinctOrgs(articles)))
}

/**
 * Assign a cluster to a single article.
 * Uses pgvector cosine distance to find similar articles in the last 48h.
 */
async function clusterArticle(
  articleId: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  // Fetch this article's embedding and metadata
  const { data: article, error: fetchErr } = await supabase
    .from('articles')
    .select('id, title, embedding, published_at, significance_base, source_name, impact_score, cluster_id, raw_category')
    .eq('id', articleId)
    .single()

  if (fetchErr || !article || !article.embedding) return
  if (article.cluster_id) return // already clustered

  const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  // Query nearest neighbor by cosine distance (pgvector <=> operator)
  // Supabase doesn't support ORDER BY with vector operators via the JS client,
  // so we use rpc with a raw SQL function.
  const { data: neighbors, error: nnErr } = await supabase.rpc('find_nearest_article', {
    query_embedding: article.embedding,
    exclude_id: articleId,
    window_start: windowStart,
    distance_threshold: DISTANCE_THRESHOLD,
  })

  if (nnErr) {
    // RPC not available — skip clustering for this article
    return
  }

  type Neighbor = { id: string; cluster_id: string | null; title: string; distance: number }
  const allNeighbors = (neighbors ?? []) as Neighbor[]

  if (allNeighbors.length > 0) {
    // Prefer joining an existing cluster — pick the closest neighbor that has one
    const clusteredNeighbor = allNeighbors.find((n) => n.cluster_id !== null)

    if (clusteredNeighbor) {
      // Join the existing cluster
      await supabase
        .from('articles')
        .update({ cluster_id: clusteredNeighbor.cluster_id })
        .eq('id', articleId)

      const { data: allArticles } = await supabase
        .from('articles')
        .select('significance_base, source_name, impact_score')
        .eq('cluster_id', clusteredNeighbor.cluster_id)

      if (allArticles && allArticles.length > 0) {
        const typed = allArticles as ScoringArticle[]
        const score = clusterScore(typed)
        await supabase
          .from('clusters')
          .update({ article_count: typed.length, significance_score: score })
          .eq('id', clusteredNeighbor.cluster_id)
      }
    } else {
      // No existing cluster among neighbors — create one cluster for the current
      // article + ALL unclustered neighbors found within the threshold.
      const unclustered = allNeighbors.filter((n) => n.cluster_id === null)
      const allIds = [articleId, ...unclustered.map((n) => n.id)]

      const { data: newCluster, error: insertErr } = await supabase
        .from('clusters')
        .insert({
          headline: article.title,
          category: (article.raw_category as string) ?? 'uncategorized',
          significance_score: 0,
          first_published_at: article.published_at,
          article_count: allIds.length,
        })
        .select('id')
        .single()

      if (insertErr || !newCluster) return

      await supabase
        .from('articles')
        .update({ cluster_id: newCluster.id })
        .in('id', allIds)

      const { data: clusterArticles } = await supabase
        .from('articles')
        .select('significance_base, source_name, impact_score')
        .eq('cluster_id', newCluster.id)

      if (clusterArticles && clusterArticles.length > 0) {
        const typed = clusterArticles as ScoringArticle[]
        const score = clusterScore(typed)
        await supabase
          .from('clusters')
          .update({ significance_score: score })
          .eq('id', newCluster.id)
      }
    }
  } else {
    // No similar article found — create a new standalone cluster
    const { data: newCluster, error: insertErr } = await supabase
      .from('clusters')
      .insert({
        headline: article.title,
        category: (article.raw_category as string) ?? 'uncategorized',
        significance_score: clusterScore([{ significance_base: article.significance_base, source_name: article.source_name as string, impact_score: article.impact_score as number | null }]),
        first_published_at: article.published_at,
        article_count: 1,
      })
      .select('id')
      .single()

    if (insertErr || !newCluster) return

    await supabase
      .from('articles')
      .update({ cluster_id: newCluster.id })
      .eq('id', articleId)
  }
}

export interface ClusterResult {
  clustered: number
  errors: string[]
}

/**
 * Cluster multiple articles sequentially (sequential to avoid race conditions
 * when two articles are similar to the same neighbor).
 */
export async function clusterArticles(articleIds: string[]): Promise<ClusterResult> {
  const supabase = createServiceClient()
  const errors: string[] = []
  let clustered = 0

  for (const id of articleIds) {
    try {
      await clusterArticle(id, supabase)
      clustered++
    } catch (err) {
      errors.push(`Cluster error for ${id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { clustered, errors }
}
