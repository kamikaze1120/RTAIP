# RTAIP Web

Open source intelligence workspace built on public and authorized data.

## What it does

- Investigate: enter a domain, IP address or email address. Results stream in as a relationship graph with provenance on every entity, a risk score and plain language findings.
- Map: live earthquakes, natural events, weather alerts and aircraft on one map with a priority feed.
- Sources: live health of every data source the app relies on.

## Run it

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Scripts: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Data sources (no API keys needed)

Cloudflare DNS over HTTPS, RDAP, crt.sh with a Cert Spotter fallback, ipwho.is, USGS, NASA EONET, NWS alerts, and community ADS-B feeds. OpenSky is optional through `OPENSKY_*` variables.

## Ethics and safety

- Public and authorized data only.
- Emails are used only to reach their domain. There are no person or breach lookups.
- Private, local and reserved IP ranges are refused to prevent server side request forgery.
- Investigations are rate limited per client.

## Layout

- `src/lib/transforms`: one file per investigation transform, registered in `registry.ts`.
- `src/lib/layers`: live map layers.
- `src/app/api`: streaming investigation, layer and health routes.
- `src/components`: shell, graph canvas, investigation view and map explorer.
