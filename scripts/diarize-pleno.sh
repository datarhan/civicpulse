#!/usr/bin/env bash
# Speaker diarization post-processor for Whisper transcripts.
#
#   bash scripts/diarize-pleno.sh <plenoId>
#
# Reads `public/data/pleno-transcripts/<plenoId>.txt` (Whisper output)
# plus the cached audio at `tmp/transcribe/<plenoId>/audio.mp3`
# (download via transcribe-pleno.sh first), runs pyannote.audio's
# `speaker-diarization-3.1` pipeline, and rewrites the transcript with
# per-line speaker tags:
#
#   [12.3 → 18.7]                  Aprobamos el orden del día.       # before
#   [12.3 → 18.7] (SPEAKER_00)     Aprobamos el orden del día.       # after
#
# `(SPEAKER_NN)` is the diarizer's anonymous label — pyannote doesn't
# know which physical voice maps to which political bloc. Mapping
# from speaker label → bloc is editorial: the curator looks up which
# concejal sat at SPEAKER_00's microphone for this session and patches
# the LLM prompt accordingly. (Future improvement: a per-pleno
# `pleno-speakers/<plenoId>.json` mapping file.)
#
# This script is OPT-IN — `transcribe-pleno.sh` only invokes it when
# `WHISPER_DIARIZE=1`. Default behaviour stays plain Whisper output.
#
# ── Bootstrap (one-time) ───────────────────────────────────────────────
# 1. Create a HuggingFace account, accept the user agreements at:
#    https://huggingface.co/pyannote/speaker-diarization-3.1
#    https://huggingface.co/pyannote/segmentation-3.0
#    https://huggingface.co/pyannote/speaker-diarization-community-1
#      (pyannote 4.x routes 3.1 model loads through community-1; one-click)
# 2. Generate a read-only token at https://huggingface.co/settings/tokens
# 3. Set HUGGINGFACE_TOKEN in .env (or shell) — same .env transcribe-pleno
#    already sources.
# 4. Bootstrap the pyannote venv (or run scripts/bootstrap-voice-id.sh):
#      python3.10 -m venv ~/.local/civicpulse-pyannote/venv
#      ~/.local/civicpulse-pyannote/venv/bin/pip install 'pyannote.audio>=4.0,<5'
# 5. Optional smoke: bash scripts/diarize-pleno.sh <known-plenoId>
#
# Runtime: ~0.5× realtime on Apple Silicon CPU (so a 2h pleno = ~1h
# wall-clock). MPS GPU support exists but is finicky on this version.
set -euo pipefail

PLENO_ID="${1:-}"
if [ -z "$PLENO_ID" ]; then
  echo "usage: diarize-pleno.sh <plenoId>" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TRANSCRIPT="$REPO_ROOT/public/data/pleno-transcripts/$PLENO_ID.txt"
WORKDIR="$REPO_ROOT/tmp/transcribe/$PLENO_ID"
AUDIO="$WORKDIR/audio.mp3"

if [ ! -f "$TRANSCRIPT" ]; then
  echo "[diarize] transcript missing: $TRANSCRIPT" >&2
  echo "[diarize]   run transcribe-pleno first:" >&2
  echo "[diarize]   bash scripts/transcribe-pleno.sh $PLENO_ID" >&2
  exit 1
fi
if [ ! -f "$AUDIO" ]; then
  # Try the alternative working dir transcribe-pleno may have used.
  echo "[diarize] audio not found at $AUDIO" >&2
  echo "[diarize]   re-run transcribe-pleno (the WORKDIR is auto-cleaned" >&2
  echo "[diarize]   after a successful run) or stash audio.mp3 manually." >&2
  exit 1
fi

PY="$HOME/.local/civicpulse-pyannote/venv/bin/python"
if [ ! -x "$PY" ]; then
  echo "[diarize] pyannote venv missing at $PY" >&2
  echo "[diarize]   bootstrap with:" >&2
  echo "[diarize]     python3.10 -m venv ~/.local/civicpulse-pyannote/venv" >&2
  echo "[diarize]     ~/.local/civicpulse-pyannote/venv/bin/pip install pyannote.audio==3.3" >&2
  exit 1
fi

# Source .env for HUGGINGFACE_TOKEN if not already in shell.
if [ -z "${HUGGINGFACE_TOKEN:-}" ] && [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$REPO_ROOT/.env"
  set +a
fi
if [ -z "${HUGGINGFACE_TOKEN:-}" ]; then
  echo "[diarize] HUGGINGFACE_TOKEN not set — required for pyannote model download" >&2
  echo "[diarize]   add to .env or export in shell. See https://huggingface.co/settings/tokens" >&2
  exit 1
fi

OUT_TMP="$TRANSCRIPT.tagged.tmp"

HUGGINGFACE_TOKEN="$HUGGINGFACE_TOKEN" "$PY" - "$AUDIO" "$TRANSCRIPT" "$OUT_TMP" <<'PYEOF'
import os, re, sys, time
from pyannote.audio import Pipeline

audio_path, transcript_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
hf_token = os.environ['HUGGINGFACE_TOKEN']

print(f'[diarize] loading speaker-diarization-3.1…', flush=True)
t0 = time.time()
pipe = Pipeline.from_pretrained(
    'pyannote/speaker-diarization-3.1',
    token=hf_token,  # `use_auth_token=` was renamed in pyannote.audio 4.x
)
print(f'[diarize]   model load: {time.time()-t0:.1f}s', flush=True)

t1 = time.time()
diar = pipe(audio_path)
print(f'[diarize]   diarize:    {time.time()-t1:.1f}s · {len(set(diar.labels()))} speakers', flush=True)

# Build a list of (start, end, label) tuples sorted by start.
segments = sorted(
    [(turn.start, turn.end, label) for turn, _, label in diar.itertracks(yield_label=True)],
    key=lambda x: x[0],
)

def dominant_speaker(start: float, end: float) -> str:
    """Return the speaker label that overlaps the most with [start, end]."""
    overlap = {}
    for s, e, lbl in segments:
        if e <= start:
            continue
        if s >= end:
            break
        ov = max(0.0, min(end, e) - max(start, s))
        if ov > 0:
            overlap[lbl] = overlap.get(lbl, 0.0) + ov
    if not overlap:
        return 'UNKNOWN'
    return max(overlap.items(), key=lambda kv: kv[1])[0]

# Whisper transcript line format: "[start → end] text"
LINE_RE = re.compile(r'^\[(\d+\.?\d*) → (\d+\.?\d*)\] (.*)$')
written = 0
with open(transcript_path, 'r', encoding='utf-8') as fin, \
     open(out_path, 'w', encoding='utf-8') as fout:
    for line in fin:
        m = LINE_RE.match(line.rstrip('\n'))
        if not m:
            fout.write(line)
            continue
        start_s, end_s, text = float(m.group(1)), float(m.group(2)), m.group(3)
        spk = dominant_speaker(start_s, end_s)
        fout.write(f'[{start_s:.1f} → {end_s:.1f}] ({spk}) {text}\n')
        written += 1

print(f'[diarize]   tagged {written} line(s)', flush=True)
PYEOF

# Atomic move on the same FS so a half-written file never replaces the
# original.
mv -- "$OUT_TMP" "$TRANSCRIPT"
echo "[diarize] tagged transcript: $TRANSCRIPT"
