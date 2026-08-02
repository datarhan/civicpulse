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
CURL_AUTH_CONF="$WORKDIR/curl-auth.conf"
(umask 077; : > "$CURL_AUTH_CONF")
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

# ── Pre-flight: refuse silent/broken audio before paying for ASR ────────
# A dead audio track (e.g. the 22-min "Part I" 2023 upload that produced an
# all-dots transcript on 2026-07-10) still costs real money to "transcribe"
# and can only yield hallucination. Whole-file mean level below -45 dB means
# there is no speech to find — bail while it's still free.
MEAN_DB=$(ffmpeg -hide_banner -i "$AUDIO" -af volumedetect -f null - 2>&1 | sed -n 's/.*mean_volume: \(-*[0-9.]*\) dB.*/\1/p')
if [ -n "$MEAN_DB" ] && awk "BEGIN{exit !($MEAN_DB < -45)}"; then
  echo "[transcribe] audio mean level ${MEAN_DB} dB < -45 dB — track is silent/broken, refusing to transcribe" >&2
  exit 1
fi
echo "[transcribe] audio mean level: ${MEAN_DB:-n/a} dB"

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
  # Written once per run, mode 0600, inside the per-run temp dir the script's
  # trap removes. `printf %s` (not echo) so a key containing a backslash or a
  # leading dash survives verbatim.
  printf 'header = "Authorization: Bearer %s"\n' "$OPENAI_API_KEY" > "$CURL_AUTH_CONF"

  # ── Chunked upload (duration-based) ──────────────────────────────────────
  # POSTMORTEM 2026-07-29: whisper-1 given ONE multi-hour request reliably
  # degenerates into a hallucination loop on this corpus — the music/silence
  # intro seeds a repeated line ("Más información www.alimmenta.com", "Más
  # palabras"…) that conditioning never escapes, and the WHOLE session comes
  # back as garbage (brxx5g, rmtyr, anrfd5, 1r6yy0; five published transcripts
  # were 100% loop before the 2026-07-29 sweep caught them). The old trigger
  # split only above 24 MB, but 3 h at the old 16 kbps ≈ 21-23 MB — long
  # plenos ALWAYS went single-shot. So: split by DURATION. Anything over
  # 25 min is segmented into 20-min chunks re-encoded straight from the
  # source audio (fresh headers per chunk; -reset_timestamps keeps whisper's
  # per-chunk times at 0 so the offset math below holds), and a loop can
  # contaminate at most one chunk — the sanity gate below catches what's left.
  # Per-chunk uploads also lift the 25 MB single-file pressure, so chunks get
  # 64 kbps (A/B on real pleno audio 2026-07-29: measurably better WER than
  # 16 kbps; same API price — whisper-1 bills minutes, not bytes). 20 min @
  # 64 kbps ≈ 9.6 MB; a ≤25-min single file ≤ 12 MB. Both far under the cap.
  DUR_S=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO" 2>/dev/null | cut -d. -f1)
  DUR_S=${DUR_S:-0}
  CHUNK_SECS=1200
  CHUNK_DIR="$WORKDIR/chunks"
  mkdir -p "$CHUNK_DIR"
  if [ "$DUR_S" -gt 1500 ]; then
    echo "[transcribe] audio ${DUR_S}s > 1500s — splitting into ${CHUNK_SECS}s chunks @ 64 kbps mono opus…"
    ffmpeg -hide_banner -loglevel error -y \
      -i "$AUDIO" -f segment -segment_time "$CHUNK_SECS" -reset_timestamps 1 \
      -ac 1 -ar 16000 -c:a libopus -b:a 64k \
      "$CHUNK_DIR/chunk-%03d.ogg"
  else
    echo "[transcribe] audio ${DUR_S}s ≤ 1500s — single upload @ 64 kbps mono opus…"
    ffmpeg -hide_banner -loglevel error -y \
      -i "$AUDIO" -ac 1 -ar 16000 -c:a libopus -b:a 64k \
      "$CHUNK_DIR/chunk-000.ogg"
    CHUNK_SECS=0  # marker: single chunk, no time offset needed
  fi
  N_CHUNKS=$(ls "$CHUNK_DIR"/chunk-*.ogg | wc -l | tr -d ' ')
  # A partial download decodes to far less audio than its container header
  # claims, and ffmpeg then emits correspondingly fewer segments without
  # failing. That is exactly how session rx4hb4 was published covering 17.5
  # minutes of a 4h21m pleno: DUR_S said 15650, the segmenter produced ONE
  # chunk, every upload returned 200, and 44 claims were extracted from 7% of
  # the session. Comparing the two numbers costs nothing and catches it.
  if [ "$CHUNK_SECS" -gt 0 ]; then
    EXPECTED_CHUNKS=$(( (DUR_S + CHUNK_SECS - 1) / CHUNK_SECS ))
    if [ "$N_CHUNKS" -lt "$EXPECTED_CHUNKS" ]; then
      echo "[transcribe] FATAL: ${DUR_S}s of audio should split into ${EXPECTED_CHUNKS} chunk(s), got ${N_CHUNKS}." >&2
      echo "[transcribe] The download is truncated or corrupt. Refusing to publish a partial transcript." >&2
      exit 1
    fi
  fi
  echo "[transcribe] uploading ${N_CHUNKS} chunk(s) to OpenAI…"

  # Post each chunk and collect verbose_json responses. Chunk index → file.
  # Accumulate in the WORKDIR (auto-cleaned by the EXIT trap) and mv into
  # place only after EVERY chunk succeeded — writing $OUT_PATH directly left
  # a 0-byte transcript behind on upload failure, which the pipeline's
  # backlog detector counted as "transcribed" and silently skipped forever.
  TMP_TXT="$WORKDIR/transcript-openai.txt"
  : > "$TMP_TXT"
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
      # --max-time caps a wedged connection (server-side transcription of a
      # 3h pleno takes ~5-15 min; 30 min is generous). `|| true` keeps the
      # -w %{http_code} output (curl prints 000 itself on connect failure —
      # the old `|| echo 000` double-appended it as "000000").
      # gpt-4o-transcribe-diarize, NOT whisper-1. Benchmarked on a real pleno
      # 2026-08-01: whisper-1 invented speaker headers ("SEÑOR PRESIDENTE DE
      # LA ASAMBLEA DE EXTREMADURA" in a Riba-roja session), garbled the
      # contractor Hidraqua into "hidracoa", wrote "Riva Roja", and flattened
      # the bilingual chamber into Spanish. Those transcripts feed the claim
      # extractor, so a fabricated speaker header is a fabricated attribution.
      #
      # BOTH language hints matter. With a single `language=` the model
      # normalises the session into one tongue; with ca+es it follows the
      # speakers' real mid-sentence code-switching, which is how this council
      # actually talks.
      #
      # NO known_speaker_references. Enrolling a subset of speakers from this
      # same room made the API dump 90%+ of a session onto them — the chair's
      # own "Passem a la votació" landed on another councillor. Anonymous
      # clusters are honest; naming waits for a reference set that does not
      # over-match. See the voice-id channel-bias note.
      # The key goes in a 0600 config file, not on the command line: curl's
      # argv is world-readable in the process table, so `ps ax` on this machine
      # printed the full OPENAI_API_KEY for the entire duration of every upload
      # — and a pleno upload runs for tens of minutes.
      HTTP_CODE=$(curl -sS -o "$RESP_JSON" -w "%{http_code}" \
        --config "$CURL_AUTH_CONF" \
        --connect-timeout 30 --max-time 1800 \
        https://api.openai.com/v1/audio/transcriptions \
        -F file="@$CHUNK" \
        -F model="${OPENAI_TRANSCRIBE_MODEL:-gpt-4o-transcribe-diarize}" \
        -F "language[]=ca" \
        -F "language[]=es" \
        -F chunking_strategy="auto" \
        -F response_format="diarized_json" 2>/dev/null || true)
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
    OFFSET_S="$OFFSET" CHUNK_IDX="$IDX" N_CHUNKS="$N_CHUNKS" RESP_JSON="$RESP_JSON" OUT_PATH="$TMP_TXT" node -e '
      const fs = require("fs")
      const data = JSON.parse(fs.readFileSync(process.env.RESP_JSON, "utf8"))
      const segs = data.segments || []
      const offset = Number(process.env.OFFSET_S)
      const chunkIdx = Number(process.env.CHUNK_IDX)
      const out = fs.createWriteStream(process.env.OUT_PATH, { flags: "a" })
      // Speaker labels are CHUNK-LOCAL: "A" in chunk 2 is not "A" in chunk 1,
      // because each upload is diarized independently. Offsetting the numbering
      // per chunk keeps two different people from being silently merged into
      // one speaker across a session.
      //
      // The SPEAKER_NN spelling is required, not cosmetic: voice-id.ts parses
      // transcripts with /\((SPEAKER_\d+|UNKNOWN)\)/ and would silently match
      // zero lines against any other label. The tag stays anonymous — nothing
      // here claims to know who any of these speakers are.
      const order = []
      const label = (sp) => {
        if (!sp) return "UNKNOWN"
        if (!order.includes(sp)) order.push(sp)
        return `SPEAKER_${String(chunkIdx * 20 + order.indexOf(sp)).padStart(2, "0")}`
      }
      for (const s of segs) {
        out.write(`[${(s.start + offset).toFixed(1)} → ${(s.end + offset).toFixed(1)}] (${label(s.speaker)}) ${String(s.text).trim()}\n`)
      }
      out.end()
      const speakers = [...new Set(segs.map((s) => s.speaker).filter(Boolean))]
      console.error(`[transcribe]   chunk ${chunkIdx + 1}/${process.env.N_CHUNKS}: ${segs.length} segs · +${offset}s offset · ${speakers.length} speaker cluster(s)`)
    '
    IDX=$(( IDX + 1 ))
  done
  # Every chunk succeeded — but "succeeded" only means every HTTP call
  # returned 200. Coverage is the thing that matters and nothing upstream
  # measures it, so check it here, against two references.
  #
  # `check:transcripts` cannot do this job: it sees only the finished file,
  # where a 91-line transcript of a 4-hour session looks identical to a
  # 91-line transcript of a 15-minute one. Duration is knowable only here.
  COVERAGE_MSG=$(DUR_S="$DUR_S" NEW="$TMP_TXT" OLD="$OUT_PATH" node -e '
    const fs = require("fs")
    const lastTs = (p) => {
      if (!p || !fs.existsSync(p)) return null
      let last = 0
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\[\s*[\d.]+\s*→\s*([\d.]+)\s*\]/)
        if (m) last = Math.max(last, Number(m[1]))
      }
      return last
    }
    const dur = Number(process.env.DUR_S)
    const now = lastTs(process.env.NEW)
    const prev = lastTs(process.env.OLD)
    const pct = (n) => (dur > 0 ? ((n / dur) * 100).toFixed(1) : "?")
    // Calibrated on the 2026-08 re-transcription batch: ten healthy sessions
    // landed at 98.8-99.6% coverage, a very tight cluster — trailing silence
    // and music cost seconds, not minutes. The original 0.6 floor was set by
    // guesswork and would have PASSED `15uvjew` at 66.3% (106.8 of 160.9 min,
    // 54 minutes missing). 0.85 leaves a wide margin under every genuine run
    // while catching a loss that size.
    if (now !== null && dur > 0 && now < dur * 0.85)
      console.log(`FAIL covers ${(now/60).toFixed(1)} min of ${(dur/60).toFixed(1)} min (${pct(now)}%)`)
    // A shorter re-transcription is the batch-regression case: the published
    // file is evidence that more of this session is reachable.
    else if (prev !== null && now !== null && prev > 0 && now < prev * 0.7)
      console.log(`FAIL shrank from ${(prev/60).toFixed(1)} min to ${(now/60).toFixed(1)} min`)
    else console.log("OK")
  ')
  if [ "${COVERAGE_MSG#FAIL}" != "$COVERAGE_MSG" ]; then
    if [ "${TRANSCRIBE_ALLOW_SHRINK:-0}" = "1" ]; then
      echo "[transcribe] coverage check ${COVERAGE_MSG} — overridden by TRANSCRIBE_ALLOW_SHRINK=1" >&2
    else
      mv "$TMP_TXT" "$OUT_PATH.rejected"
      echo "[transcribe] REJECTED: ${COVERAGE_MSG}" >&2
      echo "[transcribe] candidate kept at $OUT_PATH.rejected; the published transcript is untouched." >&2
      echo "[transcribe] Re-run, or set TRANSCRIBE_ALLOW_SHRINK=1 if the shorter one is genuinely correct." >&2
      exit 1
    fi
  fi
  # Keep what we are replacing. Published findings quote councillors verbatim
  # from whatever transcript was current when the quote was lifted, and a
  # re-transcription rewrites punctuation, proper nouns and segmentation — so
  # an honest citation stops matching the file it came from. Without the old
  # text, `check:finding-quotes` cannot tell that apart from a fabrication.
  if [ -f "$OUT_PATH" ]; then
    mkdir -p "$(dirname "$OUT_PATH")/superseded"
    cp "$OUT_PATH" "$(dirname "$OUT_PATH")/superseded/$(basename "$OUT_PATH")"
  fi
  # Record what this cost, so `npm run llm:cost` can see it.
  #
  # This script calls the audio API with raw curl and, until now, wrote no
  # telemetry at all — while the chat client writes a .llm-cache record per
  # call. So the cost dashboard reported "$0 billed" on days when
  # transcription was spending real metered money, and the first anyone knew
  # was `credit_balance_exhausted` mid-batch. A blind spot in the one place
  # you look to answer "did that run cost anything".
  #
  # Estimated, not billed: whisper-1 / gpt-4o-transcribe are priced per minute
  # of audio (~$0.006), and the response carries no usage figures. Good enough
  # to make the spend visible, which is the whole point.
  AUDIO_MIN=$(python3 -c "print(f'{${DUR_S:-0}/60:.2f}')" 2>/dev/null || echo 0)
  COST=$(python3 -c "print(f'{${DUR_S:-0}/60*0.006:.4f}')" 2>/dev/null || echo 0)
  mkdir -p "$REPO_ROOT/.llm-cache"
  printf '{"backend":"openai-audio","model":"%s","promptVersion":"transcribe-v1","tokenCount":0,"costUSD":%s,"latencyMs":0,"retryCount":0,"createdAt":"%s","result":"%s (%s min)"}\n' \
    "${OPENAI_TRANSCRIBE_MODEL:-gpt-4o-transcribe-diarize}" \
    "$COST" \
    "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
    "$PLENO_ID" "$AUDIO_MIN" \
    > "$REPO_ROOT/.llm-cache/audio-$PLENO_ID-$(date -u +%s).json"

  # Only now does the transcript become visible to the backlog detector.
  mv "$TMP_TXT" "$OUT_PATH"

  # Re-check the corpus against this new transcript.
  #
  # Replacing a transcript can strand a published verbatim: the quote was lifted
  # from the old text and the new one words it differently. That is not a
  # failure of THIS run, so it never blocks the transcription (|| true) — but it
  # is something a curator has to see, and it used to surface only if somebody
  # happened to run the checks by hand.
  #
  # Reports the DELTA, not the totals: "30 untraceable" reads the same whether
  # it is yesterday's 30 or 30 the run just created.
  if [ "${SKIP_CORPUS_CHECK:-0}" != "1" ] && [ -x "$REPO_ROOT/scripts/verify-transcript-corpus.sh" ]; then
    echo "[transcribe] re-checking the transcript corpus…"
    bash "$REPO_ROOT/scripts/verify-transcript-corpus.sh" || true
  fi
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

# ── Sanity gate: quarantine degenerate output instead of publishing ─────
# See src/scraper/transcript-sanity.ts for the postmortem + thresholds
# (calibrated so all 38 genuine transcripts pass and the 6 hallucination-
# loop files fail). On failure the transcript moves into the auto-cleaned
# workdir: nothing is published, the pipeline's backlog selector keeps the
# pleno pending, and the next run retries; repeat offenders get
# TRANSCRIBE_BLOCKLIST'ed by the operator.
if ! (cd "$REPO_ROOT" && npx tsx scripts/check-transcript-sanity.ts "$OUT_PATH"); then
  echo "[transcribe] SANITY GATE FAILED — transcript quarantined, NOT published" >&2
  mv "$OUT_PATH" "$WORKDIR/rejected-$PLENO_ID.txt" 2>/dev/null || rm -f "$OUT_PATH"
  exit 1
fi

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
