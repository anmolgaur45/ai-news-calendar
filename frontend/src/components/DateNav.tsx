'use client'

import { useState } from 'react'

interface Props {
  selectedDate: string
  onSelect: (date: string) => void
}

function getRecentDates(count: number): string[] {
  const dates: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() - i * 86_400_000)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

function formatNavDate(dateStr: string): { label: string; sub: string } {
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

  if (dateStr === today) return { label: 'Today', sub: '' }
  if (dateStr === yesterday) return { label: 'Yesterday', sub: '' }

  const d = new Date(dateStr + 'T12:00:00Z')
  return {
    label: d.toLocaleDateString('en-US', { weekday: 'short' }),
    sub: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

export function DateNav({ selectedDate, onSelect }: Props) {
  const [weeksShown, setWeeksShown] = useState(1)
  const dates = getRecentDates(weeksShown * 7)

  return (
    <nav className="sticky top-24 space-y-0.5">
      <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest mb-3 px-2">
        Browse by date
      </p>
      {dates.map((date) => {
        const { label, sub } = formatNavDate(date)
        const isSelected = date === selectedDate
        return (
          <button
            key={date}
            onClick={() => onSelect(date)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
              isSelected
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
            }`}
            suppressHydrationWarning
          >
            <span>{label}</span>
            {sub && <span className="text-xs text-zinc-600">{sub}</span>}
          </button>
        )
      })}
      <button
        onClick={() => setWeeksShown((w) => w + 1)}
        className="w-full text-left px-3 py-2 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1.5 mt-1"
        suppressHydrationWarning
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        Older
      </button>
    </nav>
  )
}
