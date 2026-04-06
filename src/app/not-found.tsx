import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-zinc-100 font-semibold text-base">Page not found</p>
        <p className="text-sm text-zinc-500">This page doesn&apos;t exist.</p>
        <Link
          href="/"
          className="inline-block rounded-full px-5 py-2 text-sm font-medium text-zinc-400 border border-zinc-700 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
