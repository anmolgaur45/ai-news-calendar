// In-memory sliding window rate limiter.
// Module-level Map persists across requests within the same process/warm invocation.
// Cold starts reset the window — acceptable for owner-only, Bearer-protected endpoints.

const windows = new Map<string, number[]>()

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const timestamps = (windows.get(key) ?? []).filter(
    (t) => now - t < config.windowMs,
  )

  if (timestamps.length >= config.maxRequests) {
    const retryAfterSec = Math.ceil(
      (config.windowMs - (now - timestamps[0])) / 1000,
    )
    return { allowed: false, retryAfterSec }
  }

  timestamps.push(now)
  windows.set(key, timestamps)
  return { allowed: true, retryAfterSec: 0 }
}
