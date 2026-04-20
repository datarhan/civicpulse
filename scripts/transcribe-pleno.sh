#!/usr/bin/env bash
# Transcribe a single pleno video via yt-dlp + faster-whisper.
#
# Usage:
#   bash scripts/transcribe-pleno.sh <plenoId>
#
# Looks up the pleno in public/data/pleno-videos.json, downloads audio (mp3,
# 16kHz mono), runs faster-whisper large-v3 for Spanish/Catalan mixed content,
# writes the transcript to public/data/pleno-transcripts/<plenoId>.txt, and
# then runs the inference engine to produce suggestions.
#
# Prereqs (one-time):
#   brew install yt-dlp ffmpeg
#   pipx install faster-whisper   # or: pip install -U faster-whisper
#   # (first run downloads the ~1.5GB model into ~/.cache/huggingface)
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: bash scripts/transcribe-pleno.sh <plenoId>" >&2
  exit 2
fi

PLENO_ID="$1"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS_JSON="$REPO_ROOT/public/data/pleno-videos.json"
TRANSCRIPT_DIR="$REPO_ROOT/public/data/pleno-transcripts"
WORKDIR="$(mktemp -d -t civicpulse-pleno-XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$TRANSCRIPT_DIR"

# Look up the video URL (requires node + jq-style lookup via node inline).
VIDEO_URL=$(node -e "
const fs = require('fs')
const plenos = JSON.parse(fs.readFileSync(process.env.HOME + '/dummy/plenos.json', 'utf8').catch ? '{\"items\":[]}' : '{\"items\":[]}')
" 2>/dev/null || true)

VIDEO_URL=$(node -e "
const fs = require('fs')
const plenos = JSON.parse(fs.readFileSync('$REPO_ROOT/public/data/plenos.json','utf8')).items
const videos = JSON.parse(fs.readFileSync('$VIDEOS_JSON','utf8')).items
const target = plenos.find(p => p.id === '$PLENO_ID')
if (!target) { console.error('pleno not found'); process.exit(1) }
const v = videos.find(x => x.plenoDate === target.date)
if (!v) { console.error('no video matched for date ' + target.date); process.exit(1) }
process.stdout.write(v.url)
") || { echo "lookup failed"; exit 1; }

echo "[transcribe] pleno $PLENO_ID → $VIDEO_URL"
echo "[transcribe] workdir: $WORKDIR"

# Reject live streams — yt-dlp would loop indefinitely on an ongoing broadcast.
IS_LIVE=$(yt-dlp --print "%(is_live)s" --skip-download "$VIDEO_URL" 2>/dev/null | head -1)
if [ "$IS_LIVE" = "True" ]; then
  echo "[transcribe] video is still LIVE — can't transcribe an ongoing stream. Retry once the recording is archived." >&2
  exit 1
fi

echo "[transcribe] downloading audio via yt-dlp…"
yt-dlp \
  -x --audio-format mp3 --audio-quality 5 \
  --output "$WORKDIR/audio.%(ext)s" \
  --quiet --no-warnings \
  "$VIDEO_URL"

AUDIO="$WORKDIR/audio.mp3"
if [ ! -f "$AUDIO" ]; then
  echo "[transcribe] audio download failed" >&2
  exit 1
fi
echo "[transcribe] audio size: $(du -h "$AUDIO" | cut -f1)"

echo "[transcribe] running faster-whisper (large-v3)…"
# Use the dedicated venv if it exists (avoids PEP 668 on system Python);
# fall back to python3 if the user prefers global installs.
if [ -x "$HOME/.local/civicpulse-whisper/venv/bin/python" ]; then
  PY="$HOME/.local/civicpulse-whisper/venv/bin/python"
else
  PY="python3"
fi
"$PY" - "$AUDIO" "$TRANSCRIPT_DIR/$PLENO_ID.txt" <<'PYEOF'
import sys, os
from faster_whisper import WhisperModel

audio_path, out_path = sys.argv[1], sys.argv[2]

# Use CPU on M-series Macs (CUDA not available); int8 compute for speed.
# large-v3 handles Spanish + Valencian mixed audio at ~0.3× realtime.
model = WhisperModel('large-v3', device='auto', compute_type='int8')

segments, info = model.transcribe(
    audio_path,
    language='es',              # base language — Whisper handles CA/VA code-switching
    beam_size=5,
    vad_filter=True,            # drop long silences (typical of council debate pauses)
    vad_parameters={'min_silence_duration_ms': 800},
)

print(f'[transcribe] lang={info.language} duration={info.duration:.1f}s')

with open(out_path, 'w', encoding='utf-8') as f:
    for seg in segments:
        f.write(f'[{seg.start:.1f} → {seg.end:.1f}] {seg.text.strip()}\n')
PYEOF

echo "[transcribe] transcript: $TRANSCRIPT_DIR/$PLENO_ID.txt"
echo "[transcribe] running vote inference…"

cd "$REPO_ROOT"
npx tsx scripts/extract-pleno-votes.ts "$PLENO_ID"

echo "[transcribe] done."
