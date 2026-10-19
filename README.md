<div align="center">

# 🛰️ RTAIP

### Real-Time Analysis & Intelligence Platform

**An open-source OSINT + open-geo intelligence fusion platform.**
A live situational-awareness map fused with an entity-correlation graph — the "see everything" experience, built **only on public and authorized data**.

<br/>

[![Live Demo](https://img.shields.io/badge/demo-rtaip.vercel.app-0ea5e9?style=for-the-badge&logo=vercel&logoColor=white)](https://rtaip.vercel.app)
[![License: MIT](https://img.shields.io/github/license/kamikaze1120/RTAIP?style=for-the-badge&color=22c55e)](LICENSE)
[![Ethics](https://img.shields.io/badge/data-public%20%26%20authorized%20only-8b5cf6?style=for-the-badge)](docs/ETHICS.md)

![Last commit](https://img.shields.io/github/last-commit/kamikaze1120/RTAIP?color=06b6d4)
![Repo size](https://img.shields.io/github/repo-size/kamikaze1120/RTAIP?color=f59e0b)
![Top language](https://img.shields.io/github/languages/top/kamikaze1120/RTAIP?color=3178c6)
![Open issues](https://img.shields.io/github/issues/kamikaze1120/RTAIP)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)
![Stars](https://img.shields.io/github/stars/kamikaze1120/RTAIP?style=social)

</div>

---

## 🔭 What is RTAIP?

RTAIP ingests **open intelligence feeds** and **public OSINT sources**, correlates
them into an **entity graph**, and renders everything on a **real-time
geospatial map / globe** with anomaly detection and alerting. It is designed to
*feel* like a global all-seeing dashboard while remaining strictly ethical and
legal: **no private-individual tracking, no surveillance, no unauthorized
access** — see the [Responsible-Use Policy](docs/ETHICS.md).

> **Two linked brains:** a **map** streaming open geo-feeds (quakes, weather,
> disasters, flights, vessels) and an **entity graph** where you pivot across
> public footprints (domains → subdomains → IPs). Click an entity, see it in
> context; expand it, watch the network grow.

---

## ✨ Features

| | Capability | Status |
|---|---|---|
| 🧠 | **Entity-correlation graph** — nodes/edges, click-to-expand OSINT pivots | ✅ |
| 🌍 | **Geospatial fusion** — NOAA, USGS, NASA EONET, ADS-B, AIS on a live map/globe | ✅ |
| 🔌 | **Connector registry** — pluggable, enable/disable public feeds | ✅ |
| 🚨 | **Anomaly detection** — IsolationForest + rule-based + geofenced alerts | ✅ |
| 🗂️ | **Cases & workspaces** — multi-tenant orgs, audit & consent logs | ✅ |
| 🔎 | **OSINT transforms** — Certificate Transparency (crt.sh), public DNS | ✅ |
| 🧾 | **Provenance** — every datapoint carries source, timestamp, confidence | ✅ |
| 🛰️ | Vessel/aircraft live layers, GDELT events, pgvector entity resolution | 🚧 |

---

## 🧩 Architecture

```mermaid
flowchart LR
  subgraph Sources["Public / Authorized Sources"]
    G1[NOAA / USGS / NASA]
    G2[ADS-B / AIS]
    O1[crt.sh CT logs]
    O2[Public DNS]
  end
  subgraph Backend["FastAPI Backend"]
    ING[ingestion.py<br/>feed connectors]
    GR[graph.py<br/>entity transforms]
    AN[anomaly.py<br/>IsolationForest]
    API[graph_api.py<br/>/graph/*]
    DB[(PostgreSQL / SQLite)]
  end
  subgraph Frontend["React + Vite Client"]
    MAP[Map / Globe<br/>OpenLayers + Three.js]
    EG[Entity Graph<br/>force-directed SVG]
    AL[Alerts / Cases]
  end
  G1 & G2 --> ING --> DB
  O1 & O2 --> GR --> DB
  DB --> AN --> AL
  DB --> API --> EG
  DB --> MAP
```

```mermaid
sequenceDiagram
  participant U as Analyst
  participant FE as Entity Graph (UI)
  participant API as /graph/enrich
  participant T as Transforms
  participant S as crt.sh / DNS
  U->>FE: enter "example.com"
  FE->>API: POST { type, value }
  API->>T: run_transform(domain)
  T->>S: fetch subdomains + resolve A records
  S-->>T: public records
  T-->>API: nodes + edges (deduped, with provenance)
  API-->>FE: sub-graph
  FE-->>U: live force-directed graph
```

---

## 🔌 Connectors

**Geospatial (open feeds):** `noaa_alerts` · `usgs_quakes` · `nasa_eonet` · `adsb_aircraft` · `ais_maritime` · `reddit_keywords`

**OSINT transforms (keyless, public):** `crt.sh` (Certificate Transparency → subdomains) · `dns.google` (DoH A-record resolution → IPs)

> Adding a connector? Follow [CONTRIBUTING.md](CONTRIBUTING.md) — document the
> source, its license/ToS, and rate limits. OSINT-targeting-individuals
> connectors are rejected by policy.

---

## 🚀 Quickstart

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend-vite
npm install
echo "VITE_BACKEND_URL=http://localhost:8000" > .env.local
npm run dev     # http://localhost:5173  → open /graph
```

---

## 🛰️ Graph API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET`  | `/graph/full?limit=400` | Load recent entities + edges |
| `GET`  | `/graph/pivot/{id}` | 1-hop neighborhood (click-to-expand) |
| `POST` | `/graph/enrich` | Run an OSINT transform on a seed (`{type,value}`) |
| `GET`  | `/graph/stats` | Entity/relationship counts by type |

---

## 🗺️ Roadmap

- [x] Entity-graph schema + correlation engine
- [x] crt.sh + public-DNS OSINT transforms
- [x] Force-directed graph UI with pivots
- [ ] Map ⟷ graph cross-linking (click entity → pin on map)
- [ ] More OSINT connectors (Shodan, HIBP, WHOIS, OpenCorporates)
- [ ] Real-time push (Supabase Realtime) + watchlists
- [ ] Postgres + PostGIS + pgvector for scale & entity resolution
- [ ] SaaS hardening (RLS, billing, rate-limit, audit export)

📋 Track progress on the [**Project board**](https://github.com/kamikaze1120/RTAIP/projects).

---

## 🤝 Contributing & Community

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Responsible-Use / Ethics](docs/ETHICS.md)

## 🧱 Tech Stack

![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=kamikaze1120/RTAIP&type=Date)](https://star-history.com/#kamikaze1120/RTAIP&Date)

---

<div align="center">

**RTAIP** · Built by [@kamikaze1120](https://github.com/kamikaze1120) · Licensed under [MIT](LICENSE)
<br/>
<sub>Open intelligence, responsibly. Public data only.</sub>

</div>
