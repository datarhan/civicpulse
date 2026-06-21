#!/usr/bin/env bash
# Transcribe a single pleno video via yt-dlp + whisper.
#
# Usage:
#   bash scripts/transcribe-pleno.sh <plenoId>
#   WHISPER_ENGINE=mlx    bash scripts/transcribe-pleno.sh <plenoId>   # recommended: ~5× realtime, \$0
#   WHISPER_ENGINE=openai bash scripts/transcribe-pleno.sh <plenoId>   # fastest: ~30s, paid
#   WHISPER_MODEL=medium  bash scripts/transcribe-pleno.sh <plenoId>   # 2-3× faster CPU (local)
#
# Looks up the pleno in public/data/pleno-videos.json, downloads audio (mp3,
# 16kHz mono), transcribes it for Spanish/Catalan mixed content, writes the
# transcript to public/data/pleno-transcripts/<plenoId>.txt, and then runs
# the inference engine to produce suggestions.
#
# Engine choice (WHISPER_ENGINE env):
#   local   (default) · faster-whisper on M-series CPU int8, free, ~0.3× realtime
#   mlx               · lightning-whisper-mlx large-v3 on Apple Neural Engine,
#                       free, ~5× realtime. Better WER on technical terms than
#                       OpenAI's whisper-1 in our benchmark (UNE norms,
#                       "exhaustivo" — mispronounced by OpenAI, correct by MLX).
#                       30-second chunks, local, no data exfil.
#   openai            · OpenAI Whisper API, ~\$0.006/min (\$0.72 / 2h pleno),
#                       done in 30-60s. Requires OPENAI_API_KEY exported.
#                       Audio is re-encoded to 16 kbps mono opus (≈12 MB per
#                       2h pleno) so we stay under the 25 MB upload limit
#                       without chunking.
#
# Model choice (WHISPER_MODEL env — only applies when WHISPER_ENGINE=local|mlx):
#   large-v3 (default) · best WER, ~0.3× realtime on M-series int8 CPU
#   medium            · ~2-3× faster, small quality drop on clean audio
#   small             · ~5-6× faster, noticeable quality drop — not recommended
#
# Prereqs (one-time):
#   brew install yt-dlp ffmpeg
#   Local engine:  pipx install faster-whisper
#   MLX engine:    python3.10 -m venv ~/.local/civicpulse-mlx/venv \
#                  && ~/.local/civicpulse-mlx/venv/bin/pip install lightning-whisper-mlx
#                  (Python 3.10-3.12 — tiktoken has no 3.13+ wheels yet.
#                  First run downloads the model into ~/.cache/huggingface.)
#   OpenAI engine: export OPENAI_API_KEY=sk-…  (add to .env or shell rc)
set -euo pipefail
WHISPER_MODEL="${WHISPER_MODEL:-large-v3}"
WHISPER_ENGINE="${WHISPER_ENGINE:-local}"

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

# Resolve the video URL via the tested matcher (src/scraper/pleno-video-match.ts).
# It matches by date, disambiguates by kind, and ABORTS on a missing/ambiguous
# match rather than risk transcribing the WRONG recording (which would attribute
# claims to the wrong session). Warnings (e.g. kind mismatch) print to stderr.
VIDEO_URL=$(npx tsx "$REPO_ROOT/scripts/resolve-pleno-video.ts" "$PLENO_ID") || {
  echo "[transcribe] video resolution failed (see message above) — refusing to transcribe" >&2
  exit 1
}

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

# ── Optional pre-Whisper denoise ────────────────────────────────────────
# Default OFF. When `WHISPER_DENOISE=1`, we re-encode `$AUDIO` through
# ffmpeg's `afftdn` (FFT-based noise reduction, built-in — no extra
# dependencies) and point all three Whisper backends at the cleaned
# file. Worth a try on noisy plenos (long marathon sessions, distant
# microphones, post-DANA echoey recovery sessions). Skip on already-
# clean audio: aggressive denoise can clip consonant transients.
#
# Filter parameters:
#   nr=12 dB   moderate reduction. <8 dB inaudible; >20 dB starts
#              chewing on speech consonants.
#   nf=-25 dB  noise-floor seed. With tn=1 the filter auto-adapts as
#              the floor drifts (AC hum during quiet passages,
#              applause/cross-talk during debate).
#   tn=1       track noise floor adaptively.
#
# Empirical guidance: A/B word-count between with/without on each
# pleno before adopting. Drop the flag if the cleaned-audio transcript
# loses >5% of words vs the baseline.
if [ "${WHISPER_DENOISE:-0}" = "1" ]; then
  CLEAN="$WORKDIR/audio-clean.mp3"
  echo "[transcribe] WHISPER_DENOISE=1 — running ffmpeg afftdn (FFT noise reduction)…"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$AUDIO" \
    -af "afftdn=nr=12:nf=-25:tn=1" \
    "$CLEAN"
  if [ ! -f "$CLEAN" ]; then
    echo "[transcribe] denoise failed; keeping original audio" >&2
  else
    AUDIO="$CLEAN"
    echo "[transcribe]   denoised audio: $(du -h "$AUDIO" | cut -f1)"
  fi
fi

OUT_PATH="$TRANSCRIPT_DIR/$PLENO_ID.txt"

if [ "$WHISPER_ENGINE" = "openai" ]; then
  # ── OpenAI Whisper API branch ────────────────────────────────────────────
  # Requires OPENAI_API_KEY. Re-encodes to 16 kbps mono opus (small enough
  # that a 3h pleno stays under the 25 MB upload cap) and sends one request.
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    # Fall back to .env in the repo root if the shell env doesn't have it.
    if [ -f "$REPO_ROOT/.env" ]; then
      # shellcheck disable=SC1090
      set -a; . "$REPO_ROOT/.env"; set +a
    fi
  fi
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "[transcribe] OPENAI_API_KEY not set — export it or add to .env" >&2
    exit 1
  fi

  OPUS="$WORKDIR/audio.ogg"
  echo "[transcribe] re-encoding to 16kbps mono opus for upload…"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$AUDIO" \
    -ac 1 -ar 16000 -c:a libopus -b:a 16k \
    "$OPUS"
  echo "[transcribe] opus size: $(du -h "$OPUS" | cut -f1)"

  SIZE_BYTES=$(stat -f%z "$OPUS" 2>/dev/null || stat -c%s "$OPUS")
  # Chunk threshold: 24 MB (1 MB safety margin under OpenAI's 25 MB upload cap).
  # Each chunk is ~1200 seconds (20 minutes) @ 16 kbps opus ≈ 2.4 MB — well
  # under the cap but long enough that segment boundaries don't cut mid-
  # utterance too often.
  CHUNK_SECS=1200
  CHUNK_DIR="$WORKDIR/chunks"
  mkdir -p "$CHUNK_DIR"
  if [ "$SIZE_BYTES" -gt 25165824 ]; then
    echo "[transcribe] opus ${SIZE_BYTES} bytes > 24 MB — splitting into ${CHUNK_SECS}s chunks…"
    ffmpeg -hide_banner -loglevel error -y \
      -i "$OPUS" -f segment -segment_time "$CHUNK_SECS" -c copy \
      "$CHUNK_DIR/chunk-%03d.ogg"
  else
    cp "$OPUS" "$CHUNK_DIR/chunk-000.ogg"
    CHUNK_SECS=0  # marker: single chunk, no time offset needed
  fi
  N_CHUNKS=$(ls "$CHUNK_DIR"/chunk-*.ogg | wc -l | tr -d ' ')
  echo "[transcribe] uploading ${N_CHUNKS} chunk(s) to OpenAI…"

  # Post each chunk and collect verbose_json responses. Chunk index → file.
  : > "$OUT_PATH"
  IDX=0
  for CHUNK in "$CHUNK_DIR"/chunk-*.ogg; do
    OFFSET=$(( IDX * CHUNK_SECS ))
    RESP_JSON="$WORKDIR/response-${IDX}.json"
    # Per-chunk retry with exponential backoff — handles transient SSL /
    # 429 / 5xx without discarding progress from earlier chunks. 4 tries
    # total (0s, 2s, 4s, 8s).
    HTTP_CODE=000
    for TRY in 0 1 2 3; do
      if [ "$TRY" -gt 0 ]; then
        BACKOFF=$(( 2 ** TRY ))
        echo "[transcribe]   chunk ${IDX} retry ${TRY}/3 after ${BACKOFF}s (prev HTTP $HTTP_CODE)" >&2
        sleep "$BACKOFF"
      fi
      HTTP_CODE=$(curl -sS -o "$RESP_JSON" -w "%{http_code}" \
        https://api.openai.com/v1/audio/transcriptions \
        -H "Authorization: Bearer $OPENAI_API_KEY" \
        -F file="@$CHUNK" \
        -F model="whisper-1" \
        -F language="es" \
        -F response_format="verbose_json" 2>/dev/null || echo "000")
      if [ "$HTTP_CODE" = "200" ]; then
        break
      fi
    done
    if [ "$HTTP_CODE" != "200" ]; then
      echo "[transcribe] chunk ${IDX} gave up after 4 attempts (last HTTP $HTTP_CODE)" >&2
      cat "$RESP_JSON" >&2 2>/dev/null || true
      exit 1
    fi
    # Append segments with cumulative time offset. Node invocation runs
    # under env vars so bash doesn't try to expand JS template literals.
    OFFSET_S="$OFFSET" CHUNK_IDX="$IDX" N_CHUNKS="$N_CHUNKS" RESP_JSON="$RESP_JSON" OUT_PATH="$OUT_PATH" node -e '
      const fs = require("fs")
      const data = JSON.parse(fs.readFileSync(process.env.RESP_JSON, "utf8"))
      const segs = data.segments || []
      const offset = Number(process.env.OFFSET_S)
      const out = fs.createWriteStream(process.env.OUT_PATH, { flags: "a" })
      for (const s of segs) out.write(`[${(s.start + offset).toFixed(1)} → ${(s.end + offset).toFixed(1)}] ${s.text.trim()}\n`)
      out.end()
      console.error(`[transcribe]   chunk ${Number(process.env.CHUNK_IDX) + 1}/${process.env.N_CHUNKS}: ${segs.length} segs · +${offset}s offset · lang=${data.language || "n/a"}`)
    '
    IDX=$(( IDX + 1 ))
  done
elif [ "$WHISPER_ENGINE" = "mlx" ]; then
  # ── Apple Neural Engine (lightning-whisper-mlx) branch ───────────────────
  # 5-10× realtime, \$0, local. Better WER on technical/legal terms than
  # OpenAI whisper-1 in our benchmark (e.g. "UNE 93200:2008" captured
  # correctly by MLX, mangled as "norma 1 en 93.200" by OpenAI).
  MLX_PY="$HOME/.local/civicpulse-mlx/venv/bin/python"
  if [ ! -x "$MLX_PY" ]; then
    echo "[transcribe] lightning-whisper-mlx venv missing at $MLX_PY" >&2
    echo "[transcribe] bootstrap with:" >&2
    echo "[transcribe]   python3.10 -m venv ~/.local/civicpulse-mlx/venv" >&2
    echo "[transcribe]   ~/.local/civicpulse-mlx/venv/bin/pip install lightning-whisper-mlx" >&2
    exit 1
  fi
  # batch_size vs audio size heuristic: Metal GPU Timeout kicks in on long
  # inputs (~4+ hour sessions) because each command-buffer exceeds the OS
  # timeout. The cut-offs below are empirical (observed on M1 Max with
  # lightning-whisper-mlx large-v3):
  #   · up to 120 MB → batch_size=12 (fastest)
  #   · 120-150 MB   → batch_size=4  (observed success on qz6weg @ 138 MB)
  #   · >150 MB      → batch_size=2  (qz6weg/1du4rf5 territory; >5h audio)
  # Caller can override via WHISPER_BATCH_SIZE env.
  AUDIO_MB=$(( $(stat -f%z "$AUDIO" 2>/dev/null || stat -c%s "$AUDIO") / 1048576 ))
  if [ -z "${WHISPER_BATCH_SIZE:-}" ]; then
    if [ "$AUDIO_MB" -gt 150 ]; then
      WHISPER_BATCH_SIZE=2
      echo "[transcribe] audio ${AUDIO_MB}MB > 150 MB threshold — batch_size auto-set to 2 (safest for 5h+ sessions)"
    elif [ "$AUDIO_MB" -gt 120 ]; then
      WHISPER_BATCH_SIZE=4
      echo "[transcribe] audio ${AUDIO_MB}MB > 120 MB threshold — batch_size auto-set to 4"
    else
      WHISPER_BATCH_SIZE=12
    fi
  fi
  echo "[transcribe] running lightning-whisper-mlx (model=$WHISPER_MODEL batch_size=$WHISPER_BATCH_SIZE on Apple Neural Engine)…"
  WHISPER_MODEL="$WHISPER_MODEL" WHISPER_BATCH_SIZE="$WHISPER_BATCH_SIZE" "$MLX_PY" - "$AUDIO" "$OUT_PATH" <<'PYEOF'
import sys, os, time, json
from lightning_whisper_mlx import LightningWhisperMLX

audio_path, out_path = sys.argv[1], sys.argv[2]
model_name = os.environ.get('WHISPER_MODEL', 'large-v3')
# batch_size controls how many 30s audio windows MLX pipelines through
# Metal simultaneously. Default 12 is fast but can overwhelm the Neural
# Engine's command-buffer timeout on very long audio (>4h). Drop to 4
# via WHISPER_BATCH_SIZE=4 env for sessions that fail with a Metal GPU
# Timeout Error (libc++abi terminating on kIOGPUCommandBufferCallbackErrorTimeout).
batch_size = int(os.environ.get('WHISPER_BATCH_SIZE', '12'))

t0 = time.time()
whisper = LightningWhisperMLX(model=model_name, batch_size=batch_size, quant=None)
print(f'[transcribe]   model load: {time.time()-t0:.1f}s', flush=True)

t1 = time.time()
result = whisper.transcribe(audio_path=audio_path, language='es')
elapsed = time.time() - t1
print(f'[transcribe]   transcribe: {elapsed:.1f}s', flush=True)

# lightning-whisper-mlx returns {'text': str, 'segments': [[start_cs, end_cs, text], ...], 'language': str}
# where timestamps are in centiseconds (1/100s). Coarser than faster-whisper's
# per-sentence segments (typically 30s chunks) but downstream extractors don't
# care — they slide 1200-char windows over the text regardless of seg bounds.
segs = result.get('segments') or []
with open(out_path, 'w', encoding='utf-8') as f:
    for s in segs:
        start_s = s[0] / 100.0
        end_s = s[1] / 100.0
        text = s[2].strip()
        f.write(f'[{start_s:.1f} → {end_s:.1f}] {text}\n')
        f.flush()
print(f'[transcribe]   segments: {len(segs)} · lang: {result.get("language", "n/a")}', flush=True)
PYEOF
else
  # ── Local faster-whisper branch ──────────────────────────────────────────
  echo "[transcribe] running faster-whisper (model=$WHISPER_MODEL)…"
  # Use the dedicated venv if it exists (avoids PEP 668 on system Python);
  # fall back to python3 if the user prefers global installs.
  if [ -x "$HOME/.local/civicpulse-whisper/venv/bin/python" ]; then
    PY="$HOME/.local/civicpulse-whisper/venv/bin/python"
  else
    PY="python3"
  fi
  WHISPER_MODEL="$WHISPER_MODEL" "$PY" - "$AUDIO" "$OUT_PATH" <<'PYEOF'
import sys, os, time
from faster_whisper import WhisperModel

audio_path, out_path = sys.argv[1], sys.argv[2]
model_name = os.environ.get('WHISPER_MODEL', 'large-v3')

# Use CPU on M-series Macs (CUDA not available); int8 compute for speed.
# large-v3 handles Spanish + Valencian mixed audio at ~0.3× realtime on CPU.
model = WhisperModel(model_name, device='auto', compute_type='int8')

segments, info = model.transcribe(
    audio_path,
    language='es',              # base language — Whisper handles CA/VA code-switching
    beam_size=5,
    vad_filter=True,            # drop long silences (typical of council debate pauses)
    vad_parameters={'min_silence_duration_ms': 800},
)

print(f'[transcribe] lang={info.language} duration={info.duration:.1f}s model={model_name}', flush=True)

# Stream segments to disk progressively so a mid-run interrupt (Ctrl-C, OOM
# kill, laptop sleep) leaves a partial transcript on disk — the extract
# pipeline's cache-keyed LLM calls can still consume what's there.
t0 = time.time()
last_progress = 0.0
with open(out_path, 'w', encoding='utf-8') as f:
    for seg in segments:
        f.write(f'[{seg.start:.1f} → {seg.end:.1f}] {seg.text.strip()}\n')
        f.flush()
        # Log progress at most every 10% of audio processed, keeps stdout quiet.
        pct = seg.end / max(info.duration, 1)
        if pct - last_progress >= 0.1:
            elapsed = time.time() - t0
            rate = seg.end / elapsed if elapsed > 0 else 0
            eta = (info.duration - seg.end) / rate if rate > 0 else 0
            print(f'[transcribe]   {pct*100:.0f}% · {rate:.2f}× realtime · ETA {eta/60:.1f}min', flush=True)
            last_progress = pct
PYEOF
fi

echo "[transcribe] transcript: $OUT_PATH"

# ── Optional speaker diarization (post-Whisper) ─────────────────────────
# Default OFF to keep the pipeline's wall-time + dependency surface
# minimal. Enable per-run with WHISPER_DIARIZE=1, or per-shell with
# `export WHISPER_DIARIZE=1`. Adds ~0.5× realtime on CPU plus a
# pyannote.audio venv + HuggingFace token requirement (one-time
# bootstrap — see scripts/diarize-pleno.sh header).
#
# Result: every transcript line is rewritten with a (SPEAKER_NN) tag
# that the LLM extractor can use to attribute claims more reliably.
# Without diarization the extractor must guess from prose alone, which
# produces ~62-65% null-speakerGroup attribution on this corpus.
if [ "${WHISPER_DIARIZE:-0}" = "1" ]; then
  echo "[transcribe] WHISPER_DIARIZE=1 — running pyannote diarization (post-Whisper)…"
  if bash "$REPO_ROOT/scripts/diarize-pleno.sh" "$PLENO_ID"; then
    echo "[transcribe] diarization tags applied"
  else
    echo "[transcribe] diarization FAILED — keeping un-tagged transcript" >&2
    # Don't abort: a tagged transcript is a quality lift, not a hard
    # requirement. Plain Whisper output is still usable downstream.
  fi
fi

# ── Optional voice-id assignment (post-diarization) ─────────────────────
# Default OFF. Enable per-run with WHISPER_IDENTIFY=1.
# Pre-requisite: WHISPER_DIARIZE=1 (or a pre-tagged transcript) AND ≥1
# enrolled voiceprint in `.voiceprints/`.
#
# Slices each SPEAKER_NN cluster's longest contiguous segments out of
# the cached audio, embeds them via the same speechbrain ECAPA-TDNN
# model `enroll-voice` used, and matches against the enrolled set.
# High-confidence matches (cosine ≥ 0.6 AND margin ≥ 0.15) get rewritten
# from `(SPEAKER_NN)` to `(<councillor name>)`. Medium-confidence matches
# stay as `(SPEAKER_NN ≈ <name>?)` for curator review.
#
# Always writes the audit JSON to `pleno-speakers/<plenoId>.json` —
# downstream (LLM extractor, dashboard) can consult it without
# re-doing the embedding work.
if [ "${WHISPER_IDENTIFY:-0}" = "1" ]; then
  if [ "${WHISPER_DIARIZE:-0}" != "1" ]; then
    echo "[transcribe] WHISPER_IDENTIFY=1 needs WHISPER_DIARIZE=1 — skipping" >&2
  else
    echo "[transcribe] WHISPER_IDENTIFY=1 — running voice-id matcher (post-diarization)…"
    cd "$REPO_ROOT"
    if npx tsx scripts/identify-pleno-speakers.ts "$PLENO_ID" --apply; then
      echo "[transcribe] voice-id assignments written"
    else
      echo "[transcribe] voice-id matcher FAILED — keeping diarized transcript untouched" >&2
    fi
  fi
fi

echo "[transcribe] running vote inference…"

cd "$REPO_ROOT"
npx tsx scripts/extract-pleno-votes.ts "$PLENO_ID"

echo "[transcribe] done."
