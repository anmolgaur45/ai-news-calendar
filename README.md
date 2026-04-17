# AI News Calendar

A date-organized timeline for AI news. Stories are pulled from 46 sources, deduplicated via sentence embeddings, and sorted by a significance score that accounts for source authority and coverage breadth.

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

- Timeline view with stories grouped by date and sorted by significance score
- Deduplication via `all-MiniLM-L6-v2` embeddings; same story from multiple outlets gets merged into one card
- Significance score based on source authority, number of distinct outlets covering the story, and per-article impact scores
- Category filters: Models, Research, Companies, Products, Policy, Hardware, Open Source, Opinion
- Full-text search with PostgreSQL FTS and synonym expansion
- Every card links to the original source with a timestamp

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4, tRPC v11 |
| Pipeline | Python 3.12, sentence-transformers, feedparser, httpx |
| Database | PostgreSQL 15 + pgvector (GCP Cloud SQL) |
| Scoring | LLM API for per-article impact scoring (1-10) |
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
- `find_nearest_article()` — pgvector ANN search function used during clustering

## Deduplication

Articles are embedded with `all-MiniLM-L6-v2` (384-dim vectors). On ingestion, an ANN search finds similar articles within a 48-hour window centered on the article's publication date. If cosine distance is below 0.38, the articles are clustered together. New articles prefer joining an existing cluster over forming a new pairing, which handles syndicated stories where the same news gets picked up by several outlets hours apart.

## License

MIT
