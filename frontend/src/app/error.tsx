'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <p className="text-zinc-100 font-semibold text-base">Something went wrong</p>
        <p className="text-sm text-zinc-500 leading-relaxed">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="rounded-full px-5 py-2 text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
