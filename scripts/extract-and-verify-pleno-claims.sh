#!/usr/bin/env bash
# Runs claim extraction over the requested pleno(s), then the deterministic
# verifier pass. Curator can now use one command instead of two.
#
#   npm run extract-and-verify:pleno-claims -- <plenoId|--all> [--min-confidence 0.5]
#
# Exit code is the first non-zero of the two steps so CI-style callers can
# still detect failures.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "usage: $0 <plenoId|--all> [--min-confidence 0.5]" >&2
  exit 2
fi

echo "[extract-and-verify] Step 1/2 — extracting claims…"
npx tsx scripts/extract-pleno-claims.ts "$@"

echo "[extract-and-verify] Step 2/2 — verifying against datasets…"
npx tsx scripts/verify-pleno-claims.ts

echo "[extract-and-verify] done. Review:"
echo "  public/data/pleno-claims-suggestions.json"
echo "  public/data/pleno-claims-verified.json"
echo "Promote via: npm run promote-claim -- <claimId> --title … --summary …"
