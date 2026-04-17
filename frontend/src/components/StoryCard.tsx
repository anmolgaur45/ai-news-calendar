'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Article, Cluster, Category } from '@/types/article'

// ─── Significance score display ────────────────────────────────────────────

// significance_score is already stored as a normalized 1–10 value by the pipeline
function scoreColor(score: number): string {
  if (score >= 8) return 'text-amber-400'
  if (score >= 5) return 'text-blue-400'
  return 'text-zinc-500'
}

// ─── Category pill ──────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<Category, string> = {
  'model-releases': 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  'research-papers': 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20',
  'company-news': 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  'product-launches': 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20',
  'regulation-policy': 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  'hardware-infrastructure': 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20',
  'open-source': 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  'opinion-analysis': 'bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-700',
  uncategorized: 'bg-zinc-800 text-zinc-500',
}

const CATEGORY_LABELS: Record<Category, string> = {
  'model-releases': 'Models',
  'research-papers': 'Research',
  'company-news': 'Companies',
  'product-launches': 'Products',
  'regulation-policy': 'Policy',
  'hardware-infrastructure': 'Hardware',
  'open-source': 'Open Source',
  'opinion-analysis': 'Opinion',
  uncategorized: 'Other',
}

function CategoryPill({ category }: { category: Category }) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.uncategorized
  const label = CATEGORY_LABELS[category] ?? category
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}

// ─── Source favicon ──────────────────────────────────────────────────────────

function sourceFavicon(sourceUrl: string): string {
  try {
    const domain = new URL(sourceUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

// ─── Relative time ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── External link icon ───────────────────────────────────────────────────────

function ExternalLinkIcon() {
  return (
    <svg className="inline h-3 w-3 ml-0.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6m0 0v6m0-6L10 14" />
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  cluster: Cluster & { articles: Article[] }
  showDate?: boolean
}

export function StoryCard({ cluster, showDate = false }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const primaryArticle = cluster.articles[0]
  const category = (cluster.category as Category) ?? 'uncategorized'
  const score = Math.min(10, Math.max(1, Math.round(cluster.significance_score ?? 0)))

  return (
    <div
      className={`group rounded-xl border border-zinc-800 bg-zinc-900 transition-colors ${
        isOpen ? 'border-zinc-700' : 'hover:border-zinc-700'
      }`}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full text-left p-4 flex items-start gap-4"
      >
        {/* Significance score */}
        <div
          className={`shrink-0 w-10 text-right text-sm font-mono font-semibold tabular-nums mt-0.5 ${scoreColor(score)}`}
          title={`Significance score: ${score}/10`}
        >
          {score}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <CategoryPill category={category} />
            {cluster.article_count > 1 && (
              <span className="text-xs text-zinc-500">{cluster.article_count} sources</span>
            )}
            {showDate && (
              <span className="text-xs text-zinc-600 font-mono">
                {formatDate(cluster.first_published_at)}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-zinc-100 leading-snug">
            {cluster.headline}
          </h3>
          {primaryArticle && (
            <p className="mt-1 text-xs text-zinc-500 flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sourceFavicon(primaryArticle.source_url)}
                alt=""
                width={14}
                height={14}
                className="rounded-sm opacity-70 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <span className="text-zinc-400">{primaryArticle.source_name}</span>
              {' · '}
              {timeAgo(cluster.first_published_at)}
            </p>
          )}
        </div>

        {/* Expand chevron */}
        <div className={`shrink-0 mt-1 text-zinc-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded section */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
              {/* Excerpt */}
              {primaryArticle?.body_excerpt && (
                <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4">
                  {primaryArticle.body_excerpt}
                </p>
              )}

              {/* All sources */}
              {cluster.articles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">
                    {cluster.articles.length === 1 ? 'Source' : `Covered by ${cluster.articles.length} sources`}
                  </p>
                  <ul className="space-y-1.5">
                    {cluster.articles.map((article) => (
                      <li key={article.id} className="flex items-center justify-between gap-3 text-sm">
                        <a
                          href={article.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-300 hover:text-zinc-100 truncate transition-colors flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={sourceFavicon(article.source_url)}
                            alt=""
                            width={13}
                            height={13}
                            className="rounded-sm opacity-60 shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          {article.source_name}
                          <ExternalLinkIcon />
                        </a>
                        <span className="shrink-0 text-xs text-zinc-600">
                          {timeAgo(article.published_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Read original CTA */}
              {primaryArticle && (
                <a
                  href={primaryArticle.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Read original
                  <ExternalLinkIcon />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
