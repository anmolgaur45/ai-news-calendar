'use client'

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import type { Category, Cluster, Article } from '@/types/article'
import { CategoryFilter, type CategoryOption } from '@/components/CategoryFilter'
import { SearchBar } from '@/components/SearchBar'
import { DateSection, SkeletonSection } from '@/components/DateSection'
import { DateNav } from '@/components/DateNav'
import { StoryCard } from '@/components/StoryCard'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>('all')
  const [search, setSearch] = useState('')
  const [mobileDaysShown, setMobileDaysShown] = useState(7)

  // Search pagination state
  const [searchOffset, setSearchOffset] = useState(0)
  const [searchAccumulated, setSearchAccumulated] = useState<(Cluster & { articles: Article[] })[]>([])

  const isSearchMode = search.trim().length > 0
  const categoryParam = selectedCategory === 'all' ? undefined : (selectedCategory as Category)

  // Clicking a date in the sidebar always exits search mode and navigates to that day
  const handleDateSelect = useCallback((date: string) => {
    setSearch('')
    setSelectedDate(date)
  }, [])

  // ── Timeline query (normal mode) ────────────────────────────────────────────
  const { data: timelineData, isLoading: timelineLoading } = trpc.articles.getClusters.useQuery(
    { date: selectedDate, category: categoryParam, limit: 100 },
    { enabled: !isSearchMode },
  )

  // ── Search query (search mode) ───────────────────────────────────────────────
  const { data: searchPage, isLoading: searchLoading, isFetching: searchFetching } =
    trpc.articles.search.useQuery(
      { query: search.trim(), category: categoryParam, limit: 20, offset: searchOffset },
      { enabled: isSearchMode },
    )

  // Reset accumulated results when query or category changes
  useEffect(() => {
    setSearchAccumulated([])
    setSearchOffset(0)
  }, [search, selectedCategory])

  // Append new page to accumulated results
  useEffect(() => {
    if (searchPage?.length) {
      setSearchAccumulated((prev) =>
        searchOffset === 0 ? searchPage : [...prev, ...searchPage],
      )
    }
  }, [searchPage, searchOffset])

  const handleLoadMore = useCallback(() => {
    setSearchOffset((prev) => prev + 20)
  }, [])

  const hasMoreSearchResults = searchPage?.length === 20

  return (
    <div className="min-h-screen bg-zinc-950" suppressHydrationWarning>
      {/* ── Top header ─────────────────────────────────────── */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-zinc-100 font-semibold text-base tracking-tight">
              AI News Calendar
            </span>
          </div>
          <div className="w-56 sm:w-72">
            <SearchBar value={search} onChange={setSearch} />
          </div>
        </div>
      </header>

      {/* ── Category filter bar ────────────────────────────── */}
      <div className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-14 z-10">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          <CategoryFilter selected={selectedCategory} onChange={setSelectedCategory} />
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-8 flex gap-8">
        {/* Sidebar — clicking a date exits search mode */}
        <aside className="hidden lg:block w-44 shrink-0">
          <DateNav selectedDate={selectedDate} onSelect={handleDateSelect} />
        </aside>

        {/* Timeline / Search results */}
        <main className="flex-1 min-w-0">
          {isSearchMode ? (
            // ── Search results mode ───────────────────────────────────────────
            <div>
              <div className="flex items-baseline gap-3 mb-4">
                <h2 className="text-base font-semibold text-zinc-100">Search results</h2>
                {!searchLoading && (
                  <span className="text-sm text-zinc-500">
                    {searchAccumulated.length} {searchAccumulated.length === 1 ? 'story' : 'stories'}
                  </span>
                )}
              </div>

              {searchLoading && searchOffset === 0 ? (
                <SkeletonSection />
              ) : searchAccumulated.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                  <p className="text-sm text-zinc-500">No stories found for &ldquo;{search}&rdquo;.</p>
                  <p className="text-xs text-zinc-600 mt-1">Try different keywords or clear the search.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {searchAccumulated.map((cluster) => (
                      <StoryCard key={cluster.id} cluster={cluster} showDate />
                    ))}
                  </div>

                  {hasMoreSearchResults && (
                    <div className="mt-6 text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={searchFetching}
                        className="rounded-full px-5 py-2 text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-zinc-100 hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {searchFetching ? 'Loading…' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            // ── Normal timeline mode ──────────────────────────────────────────
            <>
              {/* Mobile date strip */}
              <div className="flex gap-2 overflow-x-auto pb-3 lg:hidden mb-4">
                {Array.from({ length: mobileDaysShown }, (_, i) => {
                  const d = new Date(Date.now() - i * 86_400_000).toISOString().split('T')[0]
                  const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        d === selectedDate
                          ? 'bg-zinc-100 text-zinc-900'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
                <button
                  onClick={() => setMobileDaysShown((n) => n + 7)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-400 transition-colors border border-zinc-800 hover:border-zinc-700"
                >
                  Older →
                </button>
              </div>

              {timelineLoading ? (
                <SkeletonSection />
              ) : (
                <DateSection date={selectedDate} clusters={timelineData ?? []} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
