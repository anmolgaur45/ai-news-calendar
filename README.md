# AI News Calendar

A date-organized timeline for AI news. Pulls from 46 sources, deduplicates via sentence embeddings, scores by significance, and surfaces the day's most important stories.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Python](https://img.shields.io/badge/Python-3.12-3776AB) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-336791) ![GCP](https://img.shields.io/badge/GCP-Cloud_Run-4285F4)

## Architecture

```
Vercel (Frontend)                    Google Cloud (Backend)
┌─────────────────────┐     ┌──────────────────────────────┐
│ Next.js + tRPC      │────▶│ Cloud SQL (Postgres+pgvector) │
│ Timeline UI         │ SSL │                               │
└─────────────────────┘     │ Cloud Run Job (Python)        │
                            │  └─ ingest → embed → cluster  │
                            │     → impact score             │
                            │                               │
                            │ Cloud Scheduler (every 6h)    │
                            └──────────────────────────────┘
```

## Monorepo structure

```
frontend/       # Next.js web application (TypeScript)
  src/
    app/        # Pages and API routes
    components/ # UI components
    server/     # tRPC routers (read-only DB access)
    lib/        # Database client, utilities
    types/      # Shared TypeScript types

pipeline/       # Data ingestion pipeline (Python)
  src/ainews/
    ingestors/  # RSS, Hacker News, GitHub release parsers
    processing/ # Embeddings, clustering, impact scoring
    sources.py  # Source registry (46 feeds)
    main.py     # Pipeline orchestrator
```

## Features

- **Timeline view** — stories organized by date, sorted by significance score
- **Deduplication** — sentence embeddings (all-MiniLM-L6-v2) cluster the same story from multiple outlets
- **Significance scoring** — source authority, coverage breadth, and LLM-assessed impact
- **Category filtering** — Models, Research, Companies, Products, Policy, Hardware, Open Source, Opinion
- **Full-text search** — PostgreSQL FTS with synonym expansion
- **Source citations** — every card shows the original source, direct link, and timestamp

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4, tRPC v11 |
| Pipeline | Python 3.12, sentence-transformers, feedparser, httpx |
| Database | PostgreSQL 15 + pgvector (GCP Cloud SQL) |
| Scoring | Claude Haiku for per-article impact scoring (1–10) |
| Hosting | Vercel (frontend), GCP Cloud Run (pipeline) |
| Scheduling | GCP Cloud Scheduler (cron every 6 hours) |

## Running locally

### Frontend

```bash
cd frontend
pnpm install
cp .env.local.example .env.local  # fill in DB credentials
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Pipeline

```bash
cd pipeline
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
python -m ainews.main
```

## Database

Migrations live in `pipeline/migrations/` and target PostgreSQL 15 with the `vector` extension. The schema includes:

- `articles` — ingested articles with 384-dim embeddings and impact scores
- `clusters` — deduplicated story groups with significance scores and FTS index
- `find_nearest_article()` — pgvector ANN search function for clustering

## Deduplication

Articles are embedded with `all-MiniLM-L6-v2` (384-dim vectors). On ingestion, an ANN search finds similar articles in the last 48 hours. If cosine distance is below 0.25, articles are clustered together. The algorithm prefers joining existing clusters over creating new pairings, which handles syndicated news effectively.

## License

MIT
