#!/usr/bin/env bash
# Bootstrap the local NLI venv for the verifier grounding engine (P1).
# Mirrors scripts/bootstrap-voice-id.sh. Idempotent — safe to re-run.
#
#   bash scripts/bootstrap-nli.sh              # default: mDeBERTa-v3-xnli
#   bash scripts/bootstrap-nli.sh --minicheck  # also install the MiniCheck benchmark
#
# On success the verifier's nli-client.ts can spawn the venv python. Exits
# non-zero with a punch list if a prerequisite is missing.
set -uo pipefail

VENV="${NLI_VENV:-$HOME/.local/civicpulse-nli/venv}"
MODEL="${NLI_MODEL:-MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7}"
WANT_MINICHECK=0
[ "${1:-}" = "--minicheck" ] && WANT_MINICHECK=1

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; }

HERE="$(cd "$(dirname "$0")" && pwd)"

PY="$(command -v python3.10 || command -v python3 || true)"
if [ -z "$PY" ]; then
  fail "python3.10 / python3 not found — install Python 3.10+ and re-run."
  exit 1
fi
say "Using $("$PY" --version 2>&1) at $PY"

if [ ! -d "$VENV" ]; then
  say "Creating venv at $VENV"
  "$PY" -m venv "$VENV" || { fail "venv creation failed"; exit 1; }
fi
PIP="$VENV/bin/pip"
VPY="$VENV/bin/python"

say "Installing deps (transformers, torch CPU, sentencepiece)…"
"$PIP" install --quiet --upgrade pip >/dev/null 2>&1
if ! "$PIP" install --quiet "transformers>=4.40" "torch" "sentencepiece"; then
  fail "pip install failed (transformers/torch/sentencepiece)"
  exit 1
fi

if [ "$WANT_MINICHECK" = "1" ]; then
  say "Installing minicheck (benchmark model)…"
  "$PIP" install --quiet "git+https://github.com/Liyan06/MiniCheck.git" \
    || fail "minicheck install failed — benchmark path only; default mDeBERTa still works"
fi

say "Pre-downloading model: $MODEL"
if ! NLI_MODEL="$MODEL" "$VPY" - <<'PYEOF'
import os
from transformers import AutoModelForSequenceClassification, AutoTokenizer
m = os.environ["NLI_MODEL"]
AutoTokenizer.from_pretrained(m)
AutoModelForSequenceClassification.from_pretrained(m)
print("model cached")
PYEOF
then
  fail "model download failed for $MODEL"
  exit 1
fi

say "Smoke test (an obviously-entailed Spanish pair)…"
RESULT="$(printf '%s\n' \
  '{"id":"1","premise":"El ayuntamiento adjudicó la obra de la calle Mayor por 482.000 euros.","hypothesis":"La obra de la calle Mayor costó 482000 euros."}' \
  | NLI_MODEL="$MODEL" "$VPY" "$HERE/nli/nli_score.py")"
echo "$RESULT"
if echo "$RESULT" | "$VPY" -c 'import sys,json; sys.exit(0 if json.loads(sys.stdin.read())["entailment"]>0.5 else 1)'; then
  ok "NLI sidecar works — entailment detected. venv: $VENV"
else
  fail "smoke test failed: expected entailment>0.5 for an obvious pair"
  exit 1
fi
