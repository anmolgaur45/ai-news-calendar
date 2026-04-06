'use client'

import type { Category } from '@/types/article'

export type CategoryOption = Category | 'all'

const CATEGORY_LABELS: Record<CategoryOption, string> = {
  all: 'All',
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

const CATEGORY_ORDER: CategoryOption[] = [
  'all',
  'model-releases',
  'research-papers',
  'company-news',
  'product-launches',
  'regulation-policy',
  'hardware-infrastructure',
  'open-source',
  'opinion-analysis',
]

interface Props {
  selected: CategoryOption
  onChange: (cat: CategoryOption) => void
}

export function CategoryFilter({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {CATEGORY_ORDER.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            selected === cat
              ? 'bg-zinc-100 text-zinc-900'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
          suppressHydrationWarning
        >
          {CATEGORY_LABELS[cat]}
        </button>
      ))}
    </div>
  )
}
