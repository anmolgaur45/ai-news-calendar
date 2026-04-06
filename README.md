# AI News Calendar

A date-organized timeline for AI news. Think Product Hunt's daily feed, but for everything happening in artificial intelligence — model releases, research papers, company announcements, policy changes, and open source.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-336791)

## What it does

Stories from 46 sources — AI labs, research institutions, and tech press — get pulled in, deduplicated via sentence embeddings, scored by significance, and presented in a clean vertical timeline. Each date section shows the day's most important stories first, with source citations on every card.

**Sources include:** OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral, DeepSeek, Qwen/Alibaba, Hugging Face, Hacker News, arXiv, MIT Technology Review, The Decoder, Wired, IEEE Spectrum, and more.

## Features

- **Timeline view** — stories organized by date, sorted by significance score within each day
- **Deduplication** — sentence embeddings (all-MiniLM-L6-v2) cluster the same story from multiple outlets into one card
- **Significance scoring** — weighted by source authority, coverage breadth, and LLM-assessed impact
- **Category filtering** — Models, Research, Companies, Products, Policy, Hardware, Open Source, Opinion
- **Full-text search** — PostgreSQL FTS with synonym expansion (e.g. searching "chatgpt" also hits OpenAI results)
- **Source citations** — every card shows the original source, direct link, and timestamp

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript, Tailwind CSS v4 |
| API | tRPC v11 + Zod |
| Database | PostgreSQL with pgvector (local: Supabase) |
| Embeddings | `all-MiniLM-L6-v2` via `@huggingface/transformers` (ONNX, runs locally) |
| Scoring | Claude Haiku for per-article impact scoring (1–10) |
| Search | PostgreSQL FTS with GIN index on `headline_tsv` |

## Running locally

**Prerequisites:** Node.js 18+, pnpm, Docker Desktop (for local Supabase)

```bash
# Install deps
pnpm install

# Start the local database
pnpm db:start

# Copy env template and fill in values
cp .env.local.example .env.local

# Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

See `.env.local.example` for all required variables. The main ones:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INGEST_SECRET=
ANTHROPIC_API_KEY=        # only needed for impact scoring
NEXT_PUBLIC_URL=          # base URL, defaults to http://localhost:3000
```

### Running the data pipeline

Once the dev server is running, seed data by calling the API endpoints in order:

```bash
# 1. Ingest articles from all sources
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer <your-ingest-secret>"

# 2. Generate embeddings (run until remaining hits 0)
curl -X POST http://localhost:3000/api/embed-backfill \
  -H "Authorization: Bearer <your-ingest-secret>"

# 3. Score articles with LLM impact scoring
curl -X POST http://localhost:3000/api/impact-backfill \
  -H "Authorization: Bearer <your-ingest-secret>"
```

Steps 2 and 3 process 50 articles per call — loop until `remaining` returns 0.

## Database

Migrations live in `supabase/migrations/` and are applied in order. To reset the local DB:

```bash
pnpm db:reset   # wipes data and reapplies all migrations
pnpm db:status  # show local URLs and connection string
```

The local Supabase Studio (DB GUI) runs at [http://127.0.0.1:54323](http://127.0.0.1:54323) when the stack is up.

## Project structure

```
src/
  app/          # Next.js app router pages and API routes
  components/   # UI components (StoryCard, DateSection, SearchBar, etc.)
  ingestion/    # Feed parsers, clustering, significance scoring
  lib/          # Supabase client, rate limiting, utilities
  server/       # tRPC routers
  types/        # Shared TypeScript types
supabase/
  migrations/   # PostgreSQL schema and function migrations
```

## Deduplication

Articles are embedded using `all-MiniLM-L6-v2` (384-dim vectors stored in pgvector). When a new article is ingested, an ANN search finds similar articles published in the last 48 hours. If cosine distance is below 0.25, the article is clustered with its neighbors. The cluster headline comes from the highest-significance article in the group.

## License

MIT
