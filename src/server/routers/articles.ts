import { z } from 'zod'
import { router, publicProcedure } from '../trpc'
import type { Article, Cluster, Category } from '@/types/article'

// ── Search synonym expansion ────────────────────────────────────────────────
// Maps brand names, product names, and abbreviations to related search terms.
// Each entry expands the user's query so "chatgpt" also finds "gpt" headlines
// and "openai" source_name matches.
const SEARCH_SYNONYMS: Record<string, string[]> = {
  chatgpt:   ['openai', 'gpt'],
  openai:    ['gpt', 'dall-e', 'sora', 'codex', 'whisper'],
  gpt:       ['openai'],
  anthropic: ['claude'],
  claude:    ['anthropic'],
  google:    ['gemini', 'deepmind', 'bard'],
  gemini:    ['google', 'deepmind'],
  deepmind:  ['google', 'gemini'],
  meta:      ['llama', 'meta ai'],
  llama:     ['meta'],
  mistral:   ['mixtral'],
  microsoft: ['copilot', 'phi'],
  copilot:   ['microsoft', 'github'],
  apple:     ['apple intelligence'],
  nvidia:    ['tensorrt', 'cuda'],
  huggingface: ['hugging face', 'transformers'],
  'hugging face': ['huggingface'],
  // International AI labs
  deepseek:  ['deep seek'],
  qwen:      ['alibaba', 'tongyi'],
  alibaba:   ['qwen', 'tongyi'],
  zhipu:     ['glm', 'chatglm', 'z.ai'],
  chatglm:   ['zhipu', 'glm'],
  kimi:      ['moonshot'],
  moonshot:  ['kimi'],
  cohere:    ['command-r', 'command r'],
  stability: ['stable diffusion', 'sdxl', 'stability ai'],
  'stable diffusion': ['stability', 'sdxl'],
  falcon:    ['tii', 'technology innovation institute'],
  sakana:    ['sakana ai'],
  reka:      ['reka ai', 'reka flash'],
  ai21:      ['jamba', 'ai21 labs'],
  jamba:     ['ai21', 'ai21 labs'],
  sarvam:    ['sarvam ai'],
}

/** Expand a search query into FTS terms joined by OR (for websearch mode). */
function expandForFTS(query: string): string {
  const lower = query.toLowerCase().trim()
  const synonyms = SEARCH_SYNONYMS[lower]
  if (!synonyms) return query
  // websearch type supports OR: "openai" OR "gpt" OR "dall-e"
  const terms = [query, ...synonyms]
  return terms.map((t) => `"${t}"`).join(' OR ')
}

/** Expand a search query into all source_name ILIKE patterns. */
function expandForILIKE(query: string): string[] {
  const lower = query.toLowerCase().trim()
  const synonyms = SEARCH_SYNONYMS[lower]
  if (!synonyms) return [query]
  return [query, ...synonyms]
}

export const articlesRouter = router({
  getClusters: publicProcedure
    .input(
      z.object({
        date: z.string().optional(),       // ISO date string e.g. "2026-03-26"
        category: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Query clusters table ordered by significance
      let clusterQuery = ctx.supabase
        .from('clusters')
        .select('*')
        .order('significance_score', { ascending: false })
        .limit(input.limit)

      if (input.category) {
        clusterQuery = clusterQuery.eq('category', input.category)
      }

      if (input.date) {
        const start = new Date(input.date)
        start.setUTCHours(0, 0, 0, 0)
        const end = new Date(input.date)
        end.setUTCHours(23, 59, 59, 999)
        clusterQuery = clusterQuery
          .gte('first_published_at', start.toISOString())
          .lte('first_published_at', end.toISOString())
      }

      const { data: clusters, error: clusterErr } = await clusterQuery

      if (clusterErr) throw new Error(clusterErr.message)
      if (!clusters || clusters.length === 0) return []

      // Fetch top 3 articles per cluster
      const clusterIds = clusters.map((c: Cluster) => c.id)
      const { data: articlesData, error: articlesErr } = await ctx.supabase
        .from('articles')
        .select('*')
        .in('cluster_id', clusterIds)
        .order('significance_base', { ascending: false })
        .range(0, 999) // explicit cap — prevents silent Supabase 1,000-row truncation

      if (articlesErr) throw new Error(articlesErr.message)

      const articlesByCluster = new Map<string, Article[]>()
      for (const article of (articlesData ?? []) as Article[]) {
        if (!article.cluster_id) continue
        const arr = articlesByCluster.get(article.cluster_id) ?? []
        if (arr.length < 3) arr.push(article)
        articlesByCluster.set(article.cluster_id, arr)
      }

      return clusters
        .map((c: Cluster) => ({
          ...c,
          articles: articlesByCluster.get(c.id) ?? [],
        }))
        .filter((c) => c.articles.length > 0) as (Cluster & { articles: Article[] })[]
    }),

  getCluster: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: cluster, error: clusterErr } = await ctx.supabase
        .from('clusters')
        .select('*')
        .eq('id', input.id)
        .single()

      if (clusterErr) {
        // Fallback: treat id as article id (Phase 1 pre-clustering)
        const { data: article, error: articleErr } = await ctx.supabase
          .from('articles')
          .select('*')
          .eq('id', input.id)
          .single()

        if (articleErr) throw new Error(articleErr.message)
        const a = article as Article
        return {
          id: a.id,
          headline: a.title,
          category: (a.raw_category as Category) ?? 'uncategorized',
          significance_score: 0,
          first_published_at: a.published_at,
          article_count: 1,
          created_at: a.created_at,
          articles: [a],
        } satisfies Cluster & { articles: Article[] }
      }

      const { data: articles } = await ctx.supabase
        .from('articles')
        .select('*')
        .eq('cluster_id', input.id)
        .order('significance_base', { ascending: false })

      return {
        ...(cluster as Cluster),
        articles: (articles ?? []) as Article[],
      }
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        category: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      // ── Query 1: FTS on cluster headlines (with synonym expansion) ──────
      const ftsQuery = expandForFTS(input.query)
      let headlineQ = ctx.supabase
        .from('clusters')
        .select('*')
        .textSearch('headline_tsv', ftsQuery, { type: 'websearch', config: 'english' })
        .order('significance_score', { ascending: false })
        .limit(100)
      if (input.category) headlineQ = headlineQ.eq('category', input.category)
      if (input.dateFrom) {
        const s = new Date(input.dateFrom); s.setUTCHours(0, 0, 0, 0)
        headlineQ = headlineQ.gte('first_published_at', s.toISOString())
      }
      if (input.dateTo) {
        const e = new Date(input.dateTo); e.setUTCHours(23, 59, 59, 999)
        headlineQ = headlineQ.lte('first_published_at', e.toISOString())
      }

      // ── Query 2: source_name ILIKE match on articles (with synonyms) ──────
      // Catches "openai" → "OpenAI Blog", "chatgpt" → expands to also match "openai"
      const ilikeTerms = expandForILIKE(input.query)
      // Build OR filter: source_name ILIKE any of the expanded terms
      const ilikeFilter = ilikeTerms.map((t) => `source_name.ilike.%${t}%`).join(',')
      let sourceQ = ctx.supabase
        .from('articles')
        .select('cluster_id')
        .or(ilikeFilter)
        .not('cluster_id', 'is', null)
        .limit(500)

      const [headlineRes, sourceRes] = await Promise.all([headlineQ, sourceQ])
      if (headlineRes.error) throw new Error(headlineRes.error.message)
      if (sourceRes.error) throw new Error(sourceRes.error.message)

      // Build unified cluster map (headline results first)
      const clusterMap = new Map<string, Cluster>()
      for (const c of (headlineRes.data ?? []) as Cluster[]) {
        clusterMap.set(c.id, c)
      }

      // Collect extra cluster IDs from source-name matches not already in map
      const extraIds = [...new Set(
        (sourceRes.data ?? [])
          .map((a: { cluster_id: string | null }) => a.cluster_id)
          .filter((id): id is string => !!id && !clusterMap.has(id))
      )]

      // Fetch extra clusters if any
      if (extraIds.length > 0) {
        let extraQ = ctx.supabase
          .from('clusters')
          .select('*')
          .in('id', extraIds)
          .order('significance_score', { ascending: false })
          .limit(100)
        if (input.category) extraQ = extraQ.eq('category', input.category)
        if (input.dateFrom) {
          const s = new Date(input.dateFrom); s.setUTCHours(0, 0, 0, 0)
          extraQ = extraQ.gte('first_published_at', s.toISOString())
        }
        if (input.dateTo) {
          const e = new Date(input.dateTo); e.setUTCHours(23, 59, 59, 999)
          extraQ = extraQ.lte('first_published_at', e.toISOString())
        }
        const { data: extraClusters } = await extraQ
        for (const c of (extraClusters ?? []) as Cluster[]) {
          clusterMap.set(c.id, c)
        }
      }

      if (clusterMap.size === 0) return []

      // ── Hybrid sort: significance × recency (half-life 60 days) ──────────
      const now = Date.now()
      const sortedClusters = [...clusterMap.values()].sort((a, b) => {
        const daysA = (now - new Date(a.first_published_at).getTime()) / 86_400_000
        const daysB = (now - new Date(b.first_published_at).getTime()) / 86_400_000
        const hybridA = (a.significance_score ?? 0) / (1 + daysA / 60)
        const hybridB = (b.significance_score ?? 0) / (1 + daysB / 60)
        return hybridB - hybridA
      })

      // JS-level pagination (offset applied after union + sort)
      const page = sortedClusters.slice(input.offset, input.offset + input.limit)
      if (page.length === 0) return []

      // ── Fetch top 3 articles per cluster ─────────────────────────────────
      const clusterIds = page.map((c) => c.id)
      const { data: articlesData, error: aErr } = await ctx.supabase
        .from('articles')
        .select('*')
        .in('cluster_id', clusterIds)
        .order('significance_base', { ascending: false })
        .range(0, clusterIds.length * 3 - 1)

      if (aErr) throw new Error(aErr.message)

      const byCluster = new Map<string, Article[]>()
      for (const article of (articlesData ?? []) as Article[]) {
        if (!article.cluster_id) continue
        const arr = byCluster.get(article.cluster_id) ?? []
        if (arr.length < 3) arr.push(article)
        byCluster.set(article.cluster_id, arr)
      }

      return page
        .map((c) => ({ ...c, articles: byCluster.get(c.id) ?? [] }))
        .filter((c) => c.articles.length > 0) as (Cluster & { articles: Article[] })[]
    }),
})
