#!/usr/bin/env bash
# Creates the RTAIP GitHub operating system: labels, phase milestones,
# the "RTAIP Roadmap" Projects board, epic issues and linked sub issues.
# Safe to re run: existing labels, milestones and issues are skipped.
#
# Requirements: gh CLI, logged in with:  gh auth login -s repo,project
# Usage:        scripts/github/bootstrap.sh [owner/repo]
set -euo pipefail

REPO="${1:-kamikaze1120/RTAIP}"
OWNER="${REPO%%/*}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BACKLOG="$HERE/backlog.tsv"

command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login -s repo,project"; exit 1; }
[ -f "$BACKLOG" ] || { echo "Missing $BACKLOG"; exit 1; }

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

# ---------- Labels ----------
log "Labels"
make_label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
for t in "bug:d73a4a:Something is broken" "feature:a2eeef:New capability" "chore:cfd3d7:Maintenance" "docs:0075ca:Documentation" "epic:3e4b9e:Parent issue with sub issues"; do
  IFS=: read -r n c d <<<"$t"; make_label "type: $n" "$c" "$d"
done
for a in frontend backend data infra security design growth; do make_label "area: $a" "1d76db" "Area: $a"; done
for p in 0 1 2 3; do make_label "priority: p$p" "$([ "$p" = 0 ] && echo b60205 || echo fbca04)" "Priority p$p"; done
for n in 0 1 2 3 4 5 6; do make_label "phase $n" "5319e7" "Roadmap phase $n"; done
make_label "blocked" "000000" "Waiting on something else"
make_label "needs design" "f9d0c4" "Needs a design decision first"

# ---------- Milestones ----------
log "Milestones"
declare -A MS_TITLE=(
  [0]="Phase 0: Stabilize"
  [1]="Phase 1: Foundation"
  [2]="Phase 2: Investigation core"
  [3]="Phase 3: Fusion"
  [4]="Phase 4: Cases and AI"
  [5]="Phase 5: Productize"
  [6]="Phase 6: Scale"
)
declare -A MS_DESC=(
  [0]="Exit gate: Enrich on example.com returns a graph in production, health badge is truthful, no admin route reachable anonymously, mock content removed."
  [1]="Exit gate: sign in with roles works, data survives redeploys, CI blocks a failing PR, staging is live."
  [2]="Exit gate: 12 transforms live, a 5 minute investigation produces a PDF report, three design partners using it."
  [3]="Exit gate: clicking an entity flies the map to it, a watched asset near a live event raises an alert within 60 seconds."
  [4]="Exit gate: an analyst completes and exports an investigation inside a case, AI answers cite sources."
  [5]="Exit gate: Stripe billing, plan limits, API keys, docs and landing page live, first paying customer."
  [6]="Exit gate: SSO, STIX and TAXII export, audit retention controls, self hosted option."
)
EXISTING_MS="$(gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title')"
for n in 0 1 2 3 4 5 6; do
  if grep -qxF "${MS_TITLE[$n]}" <<<"$EXISTING_MS"; then continue; fi
  gh api "repos/$REPO/milestones" -f title="${MS_TITLE[$n]}" -f description="${MS_DESC[$n]}" >/dev/null
done

# ---------- Project board ----------
log "Projects board"
PROJECT_TITLE="RTAIP Roadmap"
PNUM="$(gh project list --owner "$OWNER" --format json --jq ".projects[] | select(.title==\"$PROJECT_TITLE\") | .number" | head -n1 || true)"
if [ -z "${PNUM:-}" ]; then
  PNUM="$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq '.number')"
  gh project field-create "$PNUM" --owner "$OWNER" --name "Phase" --data-type SINGLE_SELECT \
    --single-select-options "0 Stabilize,1 Foundation,2 Investigation core,3 Fusion,4 Cases and AI,5 Productize,6 Scale" >/dev/null
  gh project field-create "$PNUM" --owner "$OWNER" --name "Epic" --data-type TEXT >/dev/null
  gh project field-create "$PNUM" --owner "$OWNER" --name "Size" --data-type SINGLE_SELECT \
    --single-select-options "XS,S,M,L,XL" >/dev/null
  gh project field-create "$PNUM" --owner "$OWNER" --name "Area" --data-type SINGLE_SELECT \
    --single-select-options "frontend,backend,data,infra,security,design,growth" >/dev/null
  gh project field-create "$PNUM" --owner "$OWNER" --name "Target date" --data-type DATE >/dev/null
fi
gh project link "$PNUM" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true
echo "Board number: $PNUM  (set views and built in workflows in the project settings: Board by Status, Roadmap by Target date, Backlog grouped by Epic; enable auto add and auto archive)"

# ---------- Issues ----------
log "Epics and sub issues"
EXISTING_ISSUES="$(gh issue list --repo "$REPO" --state all --limit 500 --json title,number --jq '.[] | "\(.number)\t\(.title)"')"
find_issue() { awk -F'\t' -v t="$1" '$2==t {print $1; exit}' <<<"$EXISTING_ISSUES"; }

declare -A EPIC_NUM
while IFS=$'\t' read -r epic title area size phase; do
  [ "$epic" = "epic" ] && continue
  EPIC_TITLE="Epic: $epic"
  if [ -z "${EPIC_NUM[$epic]:-}" ]; then
    num="$(find_issue "$EPIC_TITLE")"
    if [ -z "$num" ]; then
      url="$(gh issue create --repo "$REPO" --title "$EPIC_TITLE" --label "type: epic" \
        --body "Parent issue for **$epic**. Work items are linked as sub issues. See docs/plan for the master plan." )"
      num="${url##*/}"
      gh project item-add "$PNUM" --owner "$OWNER" --url "$url" >/dev/null || true
      EXISTING_ISSUES+=$'\n'"$num"$'\t'"$EPIC_TITLE"
    fi
    EPIC_NUM[$epic]="$num"
  fi

  if [ -n "$(find_issue "$title")" ]; then continue; fi
  url="$(gh issue create --repo "$REPO" --title "$title" \
    --label "type: feature" --label "area: $area" --label "phase $phase" \
    --milestone "${MS_TITLE[$phase]}" \
    --body "Part of **$epic** (#${EPIC_NUM[$epic]}).

**Size:** $size  
**Phase:** $phase

Definition of done: see the master plan checklist (CI green, preview verified, loading and error states, tests, ethics check).")"
  num="${url##*/}"
  EXISTING_ISSUES+=$'\n'"$num"$'\t'"$title"
  gh project item-add "$PNUM" --owner "$OWNER" --url "$url" >/dev/null || true
  child_id="$(gh api "repos/$REPO/issues/$num" --jq .id)"
  gh api -X POST "repos/$REPO/issues/${EPIC_NUM[$epic]}/sub_issues" -F sub_issue_id="$child_id" >/dev/null 2>&1 \
    || echo "  (could not link #$num as sub issue of #${EPIC_NUM[$epic]}; linked in body instead)"
done < "$BACKLOG"

log "Done. Next: enable branch protection on main (required checks, linear history), Dependabot, secret scanning and CodeQL."
