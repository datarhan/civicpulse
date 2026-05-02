#!/usr/bin/env bash
# Bootstrap helper for the voice-id pipeline.
#
#   bash scripts/bootstrap-voice-id.sh
#
# Walks every prerequisite the diarize / identify chain depends on
# and reports MISSING / OK / ATTEMPTED for each. Best-effort attempts
# the install steps that don't require a human in the loop:
#
#   - python3.10 venv creation
#   - pip install of pyannote.audio + speechbrain
#
# Steps that DO require a human (HuggingFace user agreements, putting
# the token in .env) are flagged with "MISSING (human action)" and the
# script exits non-zero so an automated runner can fail fast.
#
# Run after every Python upgrade or whenever the venvs misbehave;
# safe to re-run repeatedly (idempotent).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$REPO_ROOT"

# Track issues for the final summary.
ISSUES=()

# ─── 1. Operating system tools ─────────────────────────────────────────
echo "[bootstrap] === System binaries ==="
for bin in ffmpeg ffprobe yt-dlp python3.10; do
  if command -v "$bin" >/dev/null 2>&1; then
    version=$("$bin" --version 2>&1 | head -1 || true)
    echo "[bootstrap]   OK     $bin  ($version)"
  else
    echo "[bootstrap]   MISS   $bin"
    case "$bin" in
      ffmpeg|ffprobe) ISSUES+=("$bin: install via 'brew install ffmpeg'") ;;
      yt-dlp)         ISSUES+=("$bin: install via 'brew install yt-dlp'") ;;
      python3.10)     ISSUES+=("$bin: install via 'brew install python@3.10'") ;;
    esac
  fi
done

# ─── 2. .env file with HUGGINGFACE_TOKEN ───────────────────────────────
echo "[bootstrap] === Configuration ==="
if [ -f .env ]; then
  if grep -q '^HUGGINGFACE_TOKEN=.\+' .env 2>/dev/null; then
    echo "[bootstrap]   OK     HUGGINGFACE_TOKEN set in .env"
  else
    echo "[bootstrap]   MISS   HUGGINGFACE_TOKEN in .env (still empty)"
    ISSUES+=("HUGGINGFACE_TOKEN: (1) accept user agreements at:")
    ISSUES+=("    https://huggingface.co/pyannote/speaker-diarization-3.1")
    ISSUES+=("    https://huggingface.co/pyannote/segmentation-3.0")
    ISSUES+=("    https://huggingface.co/pyannote/speaker-diarization-community-1   ← required by pyannote 4.x")
    ISSUES+=("  (2) generate a read token at:")
    ISSUES+=("    https://huggingface.co/settings/tokens")
    ISSUES+=("  (3) set HUGGINGFACE_TOKEN=hf_xxx in .env")
  fi
else
  echo "[bootstrap]   MISS   .env (run cp .env.example .env)"
  ISSUES+=(".env: copy .env.example and fill HUGGINGFACE_TOKEN")
fi

# ─── 3. pyannote venv (diarization) ────────────────────────────────────
echo "[bootstrap] === pyannote.audio venv ==="
PYANNOTE_VENV="$HOME/.local/civicpulse-pyannote/venv"
if [ -x "$PYANNOTE_VENV/bin/python" ]; then
  echo "[bootstrap]   OK     venv exists at $PYANNOTE_VENV"
  if "$PYANNOTE_VENV/bin/python" -c 'import pyannote.audio' 2>/dev/null; then
    pyannote_version=$("$PYANNOTE_VENV/bin/python" -c 'import pyannote.audio; print(pyannote.audio.__version__)' 2>/dev/null || echo '?')
    echo "[bootstrap]   OK     pyannote.audio $pyannote_version installed"
    # End-to-end pipeline-load smoke test: catches upstream API drift
    # (torchaudio.AudioMetaData removed, model name renamed to
    # community-1, missing user agreement) that the import alone misses.
    if [ -f .env ] && grep -q '^HUGGINGFACE_TOKEN=.\+' .env 2>/dev/null; then
      pipeline_check=$("$PYANNOTE_VENV/bin/python" - 2>/dev/null <<'PYEOF' | tail -n1
import os, sys
# Load .env so the token is available in this subprocess.
try:
    with open('.env') as f:
        for line in f:
            line = line.strip()
            if line.startswith('HUGGINGFACE_TOKEN='):
                os.environ['HUGGINGFACE_TOKEN'] = line.split('=', 1)[1]
                break
except Exception:
    pass
tok = os.environ.get('HUGGINGFACE_TOKEN', '')
if not tok:
    print('NO_TOKEN'); sys.exit(0)
try:
    from pyannote.audio import Pipeline
    Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', token=tok)
    print('PIPELINE_OK')
except Exception as e:
    msg = (str(e) + ' ' + type(e).__name__).lower()
    if 'gatedrepo' in msg or 'restricted' in msg or 'cannot be accessed' in msg or 'community-1' in msg:
        print('GATED')
    else:
        print(f'ERR:{type(e).__name__}')
PYEOF
)
      case "$pipeline_check" in
        PIPELINE_OK)
          echo "[bootstrap]   OK     pipeline loads end-to-end (HF token + agreements valid)"
          ;;
        GATED)
          echo "[bootstrap]   MISS   pipeline blocked by gated-repo (you need to accept extra agreement)"
          ISSUES+=("pyannote pipeline: accept user conditions at")
          ISSUES+=("    https://huggingface.co/pyannote/speaker-diarization-community-1")
          ISSUES+=("    (pyannote 4.x routes 3.1 through community-1; one-click on HF)")
          ;;
        NO_TOKEN)
          : # already reported above
          ;;
        *)
          echo "[bootstrap]   MISS   pipeline load failed: $pipeline_check"
          ISSUES+=("pyannote pipeline load failed — see error above")
          ;;
      esac
    fi
  else
    echo "[bootstrap]   MISS   pyannote.audio not in venv"
    if command -v python3.10 >/dev/null 2>&1; then
      echo "[bootstrap]   ATTEMPT  pip install pyannote.audio>=4.0,<5 …"
      "$PYANNOTE_VENV/bin/pip" install --quiet 'pyannote.audio>=4.0,<5' || \
        ISSUES+=("pyannote.audio install failed — see pip output above")
    else
      ISSUES+=("pyannote.audio: install python3.10 first")
    fi
  fi
else
  echo "[bootstrap]   MISS   venv at $PYANNOTE_VENV"
  if command -v python3.10 >/dev/null 2>&1; then
    echo "[bootstrap]   ATTEMPT  python3.10 -m venv $PYANNOTE_VENV"
    mkdir -p "$(dirname "$PYANNOTE_VENV")"
    if python3.10 -m venv "$PYANNOTE_VENV"; then
      echo "[bootstrap]   ATTEMPT  pip install pyannote.audio>=4.0,<5 (this takes ~3 min) …"
      "$PYANNOTE_VENV/bin/pip" install --quiet --upgrade pip
      if "$PYANNOTE_VENV/bin/pip" install --quiet 'pyannote.audio>=4.0,<5'; then
        echo "[bootstrap]   OK     pyannote.audio installed"
      else
        ISSUES+=("pyannote.audio install failed")
      fi
    else
      ISSUES+=("python3.10 venv creation failed at $PYANNOTE_VENV")
    fi
  else
    ISSUES+=("pyannote venv: install python3.10 first, then re-run this script")
  fi
fi

# ─── 4. speechbrain venv (voice-id enrollment + matching) ──────────────
echo "[bootstrap] === speechbrain venv ==="
VOICE_VENV="$HOME/.local/civicpulse-voice/venv"
if [ -x "$VOICE_VENV/bin/python" ]; then
  echo "[bootstrap]   OK     venv exists at $VOICE_VENV"
  if "$VOICE_VENV/bin/python" -c 'import speechbrain' 2>/dev/null; then
    sb_version=$("$VOICE_VENV/bin/python" -c 'import speechbrain; print(speechbrain.__version__)' 2>/dev/null || echo '?')
    echo "[bootstrap]   OK     speechbrain $sb_version installed"
  else
    echo "[bootstrap]   MISS   speechbrain not in venv"
    if command -v python3.10 >/dev/null 2>&1; then
      echo "[bootstrap]   ATTEMPT  pip install speechbrain==1.0.2 'huggingface_hub<0.24' soundfile torchaudio==2.5.1 torch==2.5.1 …"
      "$VOICE_VENV/bin/pip" install --quiet \
        speechbrain==1.0.2 'huggingface_hub<0.24' soundfile torchaudio==2.5.1 torch==2.5.1 || \
        ISSUES+=("speechbrain install failed")
    fi
  fi
else
  echo "[bootstrap]   MISS   venv at $VOICE_VENV"
  if command -v python3.10 >/dev/null 2>&1; then
    echo "[bootstrap]   ATTEMPT  python3.10 -m venv $VOICE_VENV"
    mkdir -p "$(dirname "$VOICE_VENV")"
    if python3.10 -m venv "$VOICE_VENV"; then
      echo "[bootstrap]   ATTEMPT  pip install speechbrain==1.0.2 'huggingface_hub<0.24' soundfile torchaudio==2.5.1 torch==2.5.1 (this takes ~5 min — torch is ~700 MB) …"
      "$VOICE_VENV/bin/pip" install --quiet --upgrade pip
      if "$VOICE_VENV/bin/pip" install --quiet \
        speechbrain==1.0.2 'huggingface_hub<0.24' soundfile torchaudio==2.5.1 torch==2.5.1; then
        echo "[bootstrap]   OK     speechbrain stack installed"
      else
        ISSUES+=("speechbrain install failed")
      fi
    else
      ISSUES+=("python3.10 venv creation failed at $VOICE_VENV")
    fi
  else
    ISSUES+=("voice venv: install python3.10 first, then re-run this script")
  fi
fi

# ─── 5. Voiceprint enrollment status (informational) ───────────────────
echo "[bootstrap] === Voiceprint enrollments ==="
INDEX=".voiceprints/index.json"
OFFICIALS="public/data/officials.json"
if [ -f "$INDEX" ]; then
  count=$(node -e "console.log((JSON.parse(require('fs').readFileSync('$INDEX','utf8')).entries||[]).length)" 2>/dev/null || echo '?')
  echo "[bootstrap]   INFO   $count councillor(s) enrolled (see /curator → Voice ID enrollment)"
  if [ -f "$OFFICIALS" ]; then
    # Cross-reference: which parties already have a voice + one suggested
    # councillor for each missing party. Surfaces the actual gap instead
    # of a generic "PSOE+PP+VOX+Compromís" reminder.
    coverage=$(node -e "
      const idx = JSON.parse(require('fs').readFileSync('$INDEX','utf8'));
      const off = JSON.parse(require('fs').readFileSync('$OFFICIALS','utf8'));
      const enrolledSlugs = new Set((idx.entries||[]).map(e=>e.slug));
      const all = off.items||off.officials||off.councillors||[];
      const partyOf = {};
      for (const x of all) partyOf[x.slug] = x.party || 'Otro';
      const enrolledParties = new Set([...enrolledSlugs].map(s=>partyOf[s]).filter(Boolean));
      const required = ['PSOE','PP','VOX','Compromís'];
      const missing = required.filter(p => !enrolledParties.has(p));
      const suggest = {};
      for (const p of missing) {
        const cand = all.find(x => (x.party||'')===p && !enrolledSlugs.has(x.slug));
        if (cand) suggest[p] = cand.slug + ' (' + (cand.name||'?') + ')';
      }
      console.log(JSON.stringify({missing, suggest}));
    " 2>/dev/null || echo '{}')
    missing=$(node -e "console.log((JSON.parse(\`$coverage\`).missing||[]).join(','))" 2>/dev/null || echo "")
    if [ -n "$missing" ]; then
      echo "[bootstrap]   HINT   missing parties for cross-bloc validation: $missing"
      echo "[bootstrap]          enroll one councillor per missing party via:"
      node -e "
        const c = JSON.parse(\`$coverage\`);
        for (const [p,row] of Object.entries(c.suggest||{})) {
          console.log('[bootstrap]            npm run enroll-voice -- --slug ' + row.split(' ')[0] + ' --url <pleno-audio-url>   # ' + p);
        }
      " 2>/dev/null
    else
      echo "[bootstrap]   OK     all 4 main parties have ≥1 voiceprint"
    fi
  fi
else
  echo "[bootstrap]   INFO   no enrollments yet — open /curator → Voice ID enrollment"
fi

# ─── Summary ───────────────────────────────────────────────────────────
echo
if [ "${#ISSUES[@]}" -eq 0 ]; then
  echo "[bootstrap] ✓ all prerequisites satisfied — voice-id chain ready to run"
  echo "[bootstrap]   Next: enroll councillors via /curator, then run"
  echo "[bootstrap]     WHISPER_DIARIZE=1 WHISPER_IDENTIFY=1 bash scripts/transcribe-pleno.sh <plenoId>"
  exit 0
fi

echo "[bootstrap] ✗ ${#ISSUES[@]} issue(s) need attention:"
for i in "${ISSUES[@]}"; do
  echo "[bootstrap]   · $i"
done
echo
echo "[bootstrap] Re-run this script after addressing the above."
exit 1
