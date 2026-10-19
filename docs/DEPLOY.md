# RTAIP Deployment Runbook

RTAIP has three deployable pieces:

| Piece | Host | Source |
|-------|------|--------|
| Frontend (SPA) | **Vercel** | `frontend-vite/` (Vite + React) |
| Backend (API + ingestion) | **Render** | `backend/` (FastAPI) |
| Database | **Supabase** | project `dxmzzhglwblunszpqkvg` (Postgres + PostGIS + pgvector) |

## Vercel (frontend)

Project settings for the `rtaip` project:

- **Git repository:** `kamikaze1120/RTAIP`, production branch `main`
- **Root Directory:** `frontend-vite`
- **Framework Preset:** Vite
- **Build command:** `npm run build`  ·  **Output:** `dist`

Environment variables (Production + Preview):

```
VITE_BACKEND_URL       = https://<your-backend>.onrender.com
VITE_SUPABASE_URL      = https://dxmzzhglwblunszpqkvg.supabase.co
VITE_SUPABASE_ANON_KEY = sb_publishable_vrYxgM225rq8-ixnkLKPmg_ShJjO38q
```

> The anon/publishable key is safe to expose. Never put the Supabase
> service-role key or `DATABASE_URL` in the frontend.

## Render (backend)

- **Root Directory:** `backend`
- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

Environment variables:

```
DATABASE_URL               = <Supabase -> Settings -> Database -> Session pooler connection string>
SUPABASE_URL               = https://dxmzzhglwblunszpqkvg.supabase.co
SUPABASE_SERVICE_ROLE_KEY  = <secret, from Supabase dashboard>
ALLOWED_ORIGINS            = https://rtaip.vercel.app
# Optional connector keys (features no-op without them):
SHODAN_API_KEY             = <optional>
OPENCORPORATES_API_TOKEN   = <optional>
NASA_FIRMS_MAP_KEY         = <optional>
# Optional email alerts:
SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / EMAIL_FROM
```

Setting `DATABASE_URL` is what moves the backend off local SQLite and onto
Supabase Postgres (the `entities` / `relationships` graph tables + PostGIS geom
+ pgvector are already provisioned there).

## Supabase (database)

- Extensions enabled: `postgis`, `vector`
- Tables: `entities`, `relationships` (graph), plus `data_events`, `anomalies`,
  `alert_rules`, `perf_metrics`
- `entities.geom` auto-populates from `attrs.lat`/`attrs.lon` via a trigger

## Deploy flow

1. Merge to `main` (protected: PR required, CI must pass).
2. Vercel auto-builds `frontend-vite` and promotes to production.
3. Render auto-deploys `backend` (if auto-deploy is enabled).

## Smoke test

1. Open the site -> navigate to **/graph**.
2. Enter a domain you own/are authorized to test -> **Enrich**.
3. Confirm nodes/edges render and rows land in Supabase `entities`.
