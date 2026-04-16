'use client'

import { useState } from 'react'
import type { Article, Cluster } from '@/types/article'
import { StoryCard } from './StoryCard'

type ClusterWithArticles = Cluster & { articles: Article[] }

const TOP_COUNT = 10

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-start gap-4">
      <div className="w-10 h-4 bg-zinc-800 rounded animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 bg-zinc-800 rounded-full animate-pulse" />
        <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
        <div className="h-3 w-40 bg-zinc-800 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function SkeletonSection() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-40 bg-zinc-800 rounded animate-pulse" />
      <div className="space-y-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

// ─── Date label helper ────────────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'

  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  date: string
  clusters: ClusterWithArticles[]
  isLoading?: boolean
}

export function DateSection({ date, clusters, isLoading = false }: Props) {
  const [visibleCount, setVisibleCount] = useState(TOP_COUNT)

  if (isLoading) return <SkeletonSection />

  const sorted = [...clusters].sort((a, b) => b.significance_score - a.significance_score)
  const label = formatDateLabel(date)
  const visible = sorted.slice(0, visibleCount)
  const hasMore = visibleCount < sorted.length

  return (
    <section>
      {/* Date header */}
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="text-base font-semibold text-zinc-100">{label}</h2>
        <span className="text-sm text-zinc-500">
          {sorted.length} {sorted.length === 1 ? 'story' : 'stories'}
        </span>
      </div>

      {/* Story cards */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">No stories found for this date.</p>
          <p className="text-xs text-zinc-600 mt-1">Try running the ingestion pipeline.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((cluster) => (
              <StoryCard key={cluster.id} cluster={cluster} />
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setVisibleCount((n) => n + TOP_COUNT)}
              className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
            >
              Show more
            </button>
          )}
        </>
      )}
    </section>
  )
}
