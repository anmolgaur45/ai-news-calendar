import { buildNormalizedArticle, isGitHubRollingBuild, type NormalizedArticle } from './normalize'
import { GITHUB_SOURCE, GITHUB_REPOS } from './sources'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Strip noise from GitHub release bodies before storing as excerpt:
 * - Fenced code blocks (raw terminal output, strace, diffs)
 * - Lines that are pure git commit bullets ("* author: message (#123)")
 * - Lines that are bare PR/commit references
 */
function cleanGitHubBody(body: string | null): string | null {
  if (!body) return null
  return body
    .replace(/```[\s\S]*?```/g, '')           // fenced code blocks
    .replace(/`[^`\n]+`/g, '')                // inline code
    .replace(/^\s*\*\s+[\w\s]+:.*$/gm, '')    // "* author: commit message" lines
    .replace(/^\s*[-*]\s+[a-f0-9]{7,}\b.*$/gm, '') // "- abc1234f commit hash" lines
    .replace(/\n{3,}/g, '\n\n')               // collapse excess blank lines
    .trim() || null
}

interface GitHubRelease {
  html_url: string
  tag_name: string
  name: string | null
  body: string | null
  published_at: string | null
  prerelease: boolean
  draft: boolean
}

async function fetchReleases(owner: string, repo: string): Promise<NormalizedArticle[]> {
  let releases: GitHubRelease[]
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
      {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        next: { revalidate: 0 },
      },
    )
    if (!res.ok) {
      console.warn(`[ingest-github] ${owner}/${repo}: HTTP ${res.status}`)
      return []
    }
    releases = await res.json() as GitHubRelease[]
  } catch (err) {
    console.warn(`[ingest-github] ${owner}/${repo}: ${(err as Error).message}`)
    return []
  }

  const cutoff = Date.now() - SEVEN_DAYS_MS
  const results: NormalizedArticle[] = []

  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    if (!release.published_at) continue
    if (new Date(release.published_at).getTime() < cutoff) continue

    // Skip rolling builds (e.g. llama.cpp "b8560 — b8560")
    if (isGitHubRollingBuild(release.tag_name, release.name)) continue

    const title = `${repo} ${release.tag_name}${release.name && release.name !== release.tag_name ? ` — ${release.name}` : ''}`

    const article = buildNormalizedArticle(
      {
        title,
        url: release.html_url,
        excerpt: cleanGitHubBody(release.body),
        author: null,
        publishedAt: release.published_at,
      },
      GITHUB_SOURCE,
    )

    if (article) results.push(article)
  }

  return results
}

export async function ingestGitHub(): Promise<NormalizedArticle[]> {
  const batches = await Promise.allSettled(
    GITHUB_REPOS.map(({ owner, repo }) => fetchReleases(owner, repo)),
  )

  return batches.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )
}
