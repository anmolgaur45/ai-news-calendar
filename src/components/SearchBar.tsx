'use client'

import { useState, useEffect } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function SearchBar({ value, onChange }: Props) {
  const [localValue, setLocalValue] = useState(value)

  // Sync if parent resets value externally
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Debounce: fire onChange 300ms after the user stops typing
  useEffect(() => {
    const t = setTimeout(() => onChange(localValue), 300)
    return () => clearTimeout(t)
  }, [localValue, onChange])

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
        />
      </svg>
      <input
        type="search"
        placeholder="Search stories…"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="w-full rounded-lg bg-zinc-900 border border-zinc-800 pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-colors"
        suppressHydrationWarning
      />
    </div>
  )
}
