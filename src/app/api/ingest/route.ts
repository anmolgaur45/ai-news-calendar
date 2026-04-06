import { run } from '@/ingestion/run'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

export const maxDuration = 60 // Vercel function timeout in seconds

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET
  const auth = req.headers.get('authorization') ?? ''

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit('ingest', { maxRequests: 5, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  try {
    const result = await run()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[api/ingest]', err)
    return NextResponse.json(
      { error: 'Ingestion failed', detail: (err as Error).message },
      { status: 500 },
    )
  }
}
