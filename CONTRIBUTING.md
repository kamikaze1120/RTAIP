# Contributing to RTAIP

Thanks for your interest in improving the **Real-Time Analysis & Intelligence
Platform (RTAIP)** -- an open-source OSINT + open-geo intelligence fusion
platform. This guide gets you productive fast.

## Code of Conduct

By participating you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Golden Rule: Public & Authorized Data Only

Every contribution must respect [docs/ETHICS.md](docs/ETHICS.md). We **do not
accept** connectors or features whose purpose is tracking or deanonymizing
private individuals, facial-recognition surveillance, accessing devices or
accounts without authorization, or scraping data in violation of a source's
Terms of Service. When in doubt, open a discussion first.

## Project Layout

```
backend/            FastAPI + SQLAlchemy service (ingestion, correlation, graph API)
  ingestion.py      Open-feed connectors (NOAA, USGS, NASA, ADS-B, AIS, ...)
  graph.py          Entity/relationship persistence + OSINT transforms
  graph_api.py      /graph/* REST endpoints (entity graph & pivots)
  anomaly.py        IsolationForest + rule-based anomaly detection
  database.py       SQLAlchemy models + schema bootstrap
frontend-vite/      React 18 + Vite + TypeScript client (active frontend)
docs/               Architecture, ethics, roadmap
```

## Local Development

**Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend-vite
npm install
echo "VITE_BACKEND_URL=http://localhost:8000" > .env.local
npm run dev
```

## Adding a Connector / Transform

1. Write an `async def ingest_<name>()` (scheduled feed) in `backend/ingestion.py`
   following the `fetch_data -> save_event` pattern, **or** an
   `async def transform_<name>(value)` in `backend/graph.py` using
   `save_entity` / `save_relationship`.
2. Register scheduled feeds in the `CONNECTORS` dict.
3. Document the source, its license/ToS, and rate limits in the PR.

## Branching & PRs

- Branch from `main`: `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Keep PRs focused; link the issue (`Closes #123`).
- Run `npm run lint` (frontend) before pushing.
- Fill out the PR template, including the **ethics checklist**.

## Commit Style

Conventional Commits are encouraged: `feat:`, `fix:`, `docs:`, `refactor:`,
`chore:`, `test:`.
