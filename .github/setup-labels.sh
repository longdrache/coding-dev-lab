#!/usr/bin/env bash
# Idempotent label setup: `gh label create` fails if the label exists, so
# delete-then-create keeps colors/descriptions in sync on re-runs.
# Usage: gh auth login  # once
#        bash .github/setup-labels.sh
set -euo pipefail

mk() { # name color description
  gh label delete "$1" --yes >/dev/null 2>&1 || true
  gh label create "$1" --color "$2" --description "$3"
}

# type: — what the work is
mk "type/bug"      "D73A4A" "Behavior differs from expectation"
mk "type/feature"  "0E8A16" "New functionality"
mk "type/chore"    "FEF2C0" "Chores: deps, config, cleanup"
mk "type/docs"     "0075CA" "Documentation"
mk "type/refactor" "CFD3D7" "Structural change, same behavior"
mk "type/test"     "006B75" "Test-only change"
mk "type/security" "B60205" "Security — handle before everything else"
mk "type/ci"       "5319E7" "Pipeline, workflow, CI infra"

# priority: — when (p0 = drop everything)
mk "p0-critical" "B60205" "Prod down / data loss"
mk "p1-high"     "D93F0B" "Current sprint"
mk "p2-medium"   "FBCA04" "Next sprint"
mk "p3-low"      "0E8A16" "Whenever"

# status: — where it stands (drives the Projects board)
mk "status/triage"       "E99695" "Not triaged yet"
mk "status/in-progress"  "D4C5F9" "Being worked on"
mk "status/blocked"      "000000" "Blocked — blocker stated in a comment"
mk "status/needs-review" "FBCA04" "Waiting for review"

echo "labels synced"
