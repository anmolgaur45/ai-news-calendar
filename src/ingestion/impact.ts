import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

/**
 * Score a batch of articles for impact using Claude Haiku.
 * Returns a Map from article id → impact_score (1–10).
 * On parse failure returns an empty Map — articles stay null and are retried next run.
 */
export async function scoreImpactBatch(
  articles: { id: string; title: string; body_excerpt: string | null }[],
): Promise<Map<string, number>> {
  if (articles.length === 0) return new Map()

  const itemList = articles
    .map(
      (a, i) =>
        `${i + 1}. Title: ${a.title}\n   Excerpt: ${a.body_excerpt ?? '(none)'}`,
    )
    .join('\n')

  const prompt = `You are scoring AI news articles for a dashboard read by AI engineers, researchers, and developers who build with AI daily.
Rate each item 1–10 based on how important it is to this technical audience.

10 = Frontier model launch (GPT-5, Claude 4, Gemini 2.0), paradigm-shifting new capability, landmark AI regulation or policy
9 = New major model version with significant capability jump (o3, GPT-4.5, Llama 3), large open-source model release, critical safety finding, $1B+ acquisition
8 = Primary announcement of a new capability in a widely-used AI product (ChatGPT feature, Claude Code update, GitHub Copilot change, Cursor update), research with clear near-term practical impact (new training method, architecture), major AI chip or hardware launch, substantial new open-source tool release — must announce something NEW; guides or tutorials about existing features score 3–4 even if they mention high-profile products
7 = Meaningful developer tool or API update, strong research paper (new benchmark result, scaling finding), $100M+ funding for a known company, notable new AI feature or product from a major lab (Google, Meta, Apple, Mistral, xAI)
5–6 = Incremental product improvement or minor feature, interesting but narrow research, partnership without immediate impact, mid-size funding
3–4 = Opinion piece, analysis or editorial, explainer of existing technology, interview, "what we shipped" recap, Q&A session, tips and tricks post, office hours, AMA, community roundup post, team update blog
1–2 = Job posting, company culture post, tutorial, event announcement, milestone celebration, behind-the-scenes blog

Return ONLY a JSON array of integers in the same order, e.g. [7,3,9,2]

Items:
${itemList}`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content.find((b) => b.type === 'text')?.text ?? ''
    // Extract JSON array from response (may have surrounding text)
    const match = text.match(/\[[\d,\s]+\]/)
    if (!match) return new Map()

    const scores: number[] = JSON.parse(match[0])
    if (!Array.isArray(scores) || scores.length !== articles.length) return new Map()

    const result = new Map<string, number>()
    for (let i = 0; i < articles.length; i++) {
      const score = scores[i]
      if (typeof score === 'number' && score >= 1 && score <= 10) {
        result.set(articles[i].id, Math.round(score))
      }
    }
    return result
  } catch {
    return new Map()
  }
}
