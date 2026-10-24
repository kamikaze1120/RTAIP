#!/usr/bin/env bash
# RTAIP — GitHub operating-system bootstrap.
# Creates labels, phase milestones (with exit gates), the "RTAIP Roadmap"
# Project (v2) with custom fields, the 12 epics (E0-E11) and their sub-issues
# from the Master Plan backlog. Idempotent: re-running skips what already exists.
#
# Prereqs:  gh auth login   (scopes: repo, project, read:org)
# Usage:    bash scripts/bootstrap_github.sh
set -euo pipefail

OWNER="${RTAIP_OWNER:-kamikaze1120}"
REPO="${RTAIP_REPO:-RTAIP}"
SLUG="$OWNER/$REPO"
PROJECT_TITLE="RTAIP Roadmap"

say() { printf '==> %s\n' "$*"; }

# ---------------------------------------------------------------- labels
label() { # name color description
  gh label create "$1" --repo "$SLUG" --color "$2" --description "$3" --force >/dev/null 2>&1 \
    && echo "  label: $1" || true
}
say "Labels"
label "type: bug"        "d73a4a" "Something is broken"
label "type: feature"    "0e8a16" "New capability"
label "type: chore"      "fef2c0" "Maintenance"
label "type: docs"       "0075ca" "Documentation"
label "area: frontend"   "1d76db" "React / Vite UI"
label "area: backend"    "5319e7" "FastAPI / Python"
label "area: data"       "006b75" "DB / migrations / RLS"
label "area: infra"      "c5def5" "CI / deploy / hosting"
label "area: security"   "b60205" "Auth / RLS / hardening"
label "area: design"     "d4c5f9" "Design system / UX"
label "area: growth"     "fbca04" "GTM / billing / docs site"
label "priority: p0"     "b60205" "Drop everything"
label "priority: p1"     "d93f0b" "High"
label "priority: p2"     "fbca04" "Medium"
label "priority: p3"     "c2e0c6" "Low"
label "phase 0"          "ededed" "Stabilize"
label "phase 1"          "ededed" "Foundation"
label "phase 2"          "ededed" "Investigation core"
label "phase 3"          "ededed" "Fusion"
label "phase 4"          "ededed" "Cases and AI"
label "phase 5"          "ededed" "Productize"
label "phase 6"          "ededed" "Scale"
label "size: XS"         "ffffff" "under 2h"
label "size: S"          "ffffff" "about 1 day"
label "size: M"          "ffffff" "2-3 days"
label "size: L"          "ffffff" "about 1 week"
label "size: XL"         "ffffff" "over 1 week"
label "epic"             "3e4b9e" "Epic / theme"
label "blocked"          "000000" "Blocked by a dependency"
label "needs design"     "d4c5f9" "Needs design input"
label "good first issue" "7057ff" "Good entry point"
label "dependencies"     "0366d6" "Dependency updates"

# ------------------------------------------------------------ milestones
mstone() { # title desc
  local existing
  existing=$(gh api "repos/$SLUG/milestones?state=all" --jq ".[] | select(.title==\"$1\") | .number" 2>/dev/null || true)
  if [ -z "$existing" ]; then
    gh api "repos/$SLUG/milestones" -f title="$1" -f description="$2" >/dev/null && echo "  milestone: $1"
  else
    echo "  milestone exists: $1"
  fi
}
say "Milestones (phases + exit gates)"
mstone "Phase 0 - Stabilize"          "Make production honest and safe. Exit gate: Enrich on example.com returns a graph on rtaip.vercel.app; health badge reflects reality; no admin route reachable anonymously; mock intelligence content removed."
mstone "Phase 1 - Foundation"         "Auth, durable data, clean code, real CI. Exit gate: sign-in with roles; data survives redeploys; CI blocks a failing PR; staging live."
mstone "Phase 2 - Investigation core" "Best-in-class domain and org investigation. Exit gate: 12 transforms live; a 5-minute investigation produces a PDF report; three design partners using it."
mstone "Phase 3 - Fusion"             "Graph, map and timeline as one. Exit gate: click an entity and the map flies to it; a watched asset near a live event alerts within 60s."
mstone "Phase 4 - Cases and AI"       "Work saved, shared, explained. Exit gate: an analyst finishes an investigation in a case and exports it; AI answers cite sources."
mstone "Phase 5 - Productize"         "Charge money. Exit gate: Stripe billing, plan limits, API keys, docs site and landing page live; first paid customer."
mstone "Phase 6 - Scale"              "Enterprise readiness. Exit gate: SSO, STIX/TAXII export, audit retention controls, self-hosted option."

# --------------------------------------------------------------- project
say "Project: $PROJECT_TITLE"
PNUM=$(gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" 2>/dev/null | head -1 || true)
if [ -z "${PNUM:-}" ]; then
  PNUM=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq '.number')
  echo "  created project #$PNUM"
else
  echo "  project exists #$PNUM"
fi

field_single() { # name options-csv
  if ! gh project field-list "$PNUM" --owner "$OWNER" --format json --jq '.fields[].name' 2>/dev/null | grep -qx "$1"; then
    gh project field-create "$PNUM" --owner "$OWNER" --name "$1" --data-type SINGLE_SELECT --single-select-options "$2" >/dev/null && echo "  field: $1" || true
  else
    echo "  field exists: $1"
  fi
}
field_single "Phase"    "0,1,2,3,4,5,6"
field_single "Priority" "P0,P1,P2,P3"
field_single "Size"     "XS,S,M,L,XL"
field_single "Area"     "frontend,backend,data,infra,security,design,growth"
# Note: the built-in "Status" field and saved Views (Board / Roadmap / Backlog /
# This week / Security / Bugs) are configured once in the Projects UI - the API
# cannot create views. Suggested Status options: Backlog, Ready, In progress,
# In review, Verify on preview, Done.

add_to_project() { gh project item-add "$PNUM" --owner "$OWNER" --url "$1" >/dev/null 2>&1 || true; }

# -------------------------------------------------------- issue helpers
issue_url_by_title() {
  gh issue list --repo "$SLUG" --state all --limit 200 --json title,url \
    --jq ".[] | select(.title==\"$1\") | .url" 2>/dev/null | head -1
}
mk_issue() { # title body labels-csv milestone
  local title="$1" body="$2" labels="$3" ms="$4" url
  url=$(issue_url_by_title "$title")
  if [ -n "$url" ]; then echo "  exists: $title" 1>&2; add_to_project "$url"; echo "$url"; return; fi
  local args=(--repo "$SLUG" --title "$title" --body "$body")
  IFS=',' read -ra L <<< "$labels"
  local l; for l in "${L[@]}"; do args+=(--label "$l"); done
  [ -n "$ms" ] && args+=(--milestone "$ms")
  url=$(gh issue create "${args[@]}")
  echo "  created: $title" 1>&2
  add_to_project "$url"
  echo "$url"
}

# ------------------------------------------------------------- epics
say "Epics"
declare -A EPIC
epic() { # key title phaseLabel
  EPIC["$1"]=$(mk_issue "$2" "Epic - see RTAIP Master Plan. Sub-issues link here as they are filed." "epic,$3" "")
}
epic E0  "E0 - Stabilize"        "phase 0"
epic E1  "E1 - Security and auth" "phase 1"
epic E2  "E2 - Platform"         "phase 1"
epic E3  "E3 - Transforms"       "phase 2"
epic E4  "E4 - Graph UX"         "phase 2"
epic E5  "E5 - Fusion"           "phase 3"
epic E6  "E6 - Alerts"           "phase 3"
epic E7  "E7 - Cases and reports" "phase 4"
epic E8  "E8 - AI analyst"       "phase 4"
epic E9  "E9 - Design system"    "phase 1"
epic E10 "E10 - Quality"         "phase 1"
epic E11 "E11 - Launch"          "phase 5"

# -------------------------------------------------------- sub-issues
# Format: epic|title|area|size|phase
say "Sub-issues"
SUBS='
E0|Deploy compute for Enrich and ingestion; point frontend at it; confirm graph routes respond|infra|S|0
E0|Real /health with dependency checks; header badge reads it|backend|S|0
E0|Error, loading and retry states on Enrich, Dashboard, Graph|frontend|M|0
E0|Remove forced isAdmin and gate Admin/Security/Settings routes|security|S|0
E0|Remove mock Intelligence reports and FOUO badge; real feed or empty state|frontend|S|0
E0|Fix Supabase data_events 400 and the globe texture 404|frontend|S|0
E1|Supabase Auth sign-in with email and OAuth|security|M|1
E1|JWT verification middleware and role model in FastAPI|backend|M|1
E1|Row-level security on every table, with automated policy tests|data|L|1
E1|Rate limiting, CORS lockdown, input validation, security headers|backend|M|1
E1|Remove Puter.js and audit third-party scripts|frontend|S|1
E2|Postgres migration with Alembic|data|L|1
E2|Split main.py into routers and schemas|backend|L|1
E2|Staging environment with its own Supabase project|infra|M|1
E2|Background worker with per-feed schedules|backend|L|3
E3|Transform plugin interface with timeouts and caching|backend|M|2
E3|RDAP and WHOIS, ASN and BGP, IP geolocation|backend|M|2
E3|Subdomain discovery, URL scan, tech fingerprint|backend|L|2
E3|Exposure sources: breach/certificate/reputation via user keys|backend|L|2
E3|Org transforms: OpenCorporates, OpenSanctions, GDELT mentions|backend|L|2
E4|WebGL graph with expand, filter, path-finding, pin, group|frontend|XL|2
E4|Streaming results as transforms resolve|backend|M|2
E4|Node detail panel with provenance and confidence|frontend|M|2
E4|Exposure risk score and plain-language summary|backend|M|2
E5|Map and graph cross-linking|backend|L|3
E5|MapLibre and deck.gl map with clustering and time window|frontend|XL|3
E5|Timeline with event clustering and entity filter|frontend|L|3
E6|Watchlists for entities and geofences|backend|L|3
E6|Realtime push and alert delivery by email and webhook|backend|L|3
E7|Cases with annotations, tags and sharing|backend|XL|4
E7|PDF and STIX export|backend|L|4
E8|Retrieval with citations over case data|backend|L|4
E8|Entity resolution with pgvector|data|L|4
E9|Tokens, components, empty/error patterns, mobile layout|design|L|1
E9|Dashboard redesign: live activity, top risks, recent cases|frontend|M|2
E10|Vitest, pytest, Playwright smoke suite in CI|infra|L|1
E10|CodeQL, Dependabot, gitleaks, release automation|infra|M|1
E10|Sentry and uptime monitoring|infra|S|1
E11|Stripe billing, plan limits and usage metering|backend|L|5
E11|API keys and public API docs|backend|M|5
E11|Landing page, pricing page and docs site|growth|M|5
E11|Design-partner program: 3-5 pilot users, weekly feedback loop|growth|M|2
'
PHASE_MS=( "Phase 0 - Stabilize" "Phase 1 - Foundation" "Phase 2 - Investigation core" "Phase 3 - Fusion" "Phase 4 - Cases and AI" "Phase 5 - Productize" "Phase 6 - Scale" )
while IFS='|' read -r ek title area size phase; do
  [ -z "$ek" ] && continue
  parent="${EPIC[$ek]:-}"
  body="Part of epic $ek"
  [ -n "$parent" ] && body="$body ($parent)"
  body="$body"$'\n\n'"From the RTAIP Master Plan backlog."
  mk_issue "$title" "$body" "area: $area,size: $size,phase $phase" "${PHASE_MS[$phase]}" >/dev/null
done <<< "$SUBS"

say "Done. Configure Project Views and Status options in the Projects UI (the API cannot create views)."
