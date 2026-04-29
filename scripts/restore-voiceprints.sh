#!/usr/bin/env bash
# Restore the encrypted voiceprints backup produced by
# scripts/backup-voiceprints.sh.
#
#   bash scripts/restore-voiceprints.sh <encrypted-blob.tar.gz.enc>
#
# Refuses to overwrite an existing `.voiceprints/` directory unless
# you confirm. Decrypts via openssl AES-256-CBC + pbkdf2; the
# passphrase prompt is interactive (no stdin redirection).
#
# After a successful restore:
#   1. Verify enrollment list:   curl -s localhost:5173/api/curator/voiceprints
#   2. Re-run any A/B you have queued:  npm run voice-id-ab -- <plenoId>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TARGET_DIR="$REPO_ROOT/.voiceprints"

if [ "$#" -lt 1 ]; then
  echo "usage: restore-voiceprints.sh <encrypted-blob.tar.gz.enc>" >&2
  echo "       (look for the latest one in ~/Documents/civicpulse-backups/)" >&2
  exit 2
fi
BLOB="$1"

if [ ! -f "$BLOB" ]; then
  echo "[restore-voiceprints] file not found: $BLOB" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "[restore-voiceprints] openssl not on PATH — install with 'brew install openssl' first." >&2
  exit 1
fi

if [ -d "$TARGET_DIR" ]; then
  echo "[restore-voiceprints] WARNING: $TARGET_DIR already exists."
  echo "[restore-voiceprints]   The restore will MERGE-overwrite files from the backup;"
  echo "[restore-voiceprints]   any local-only enrollments not in the backup are kept."
  read -r -p "[restore-voiceprints] Continue? (y/N) " confirm
  if [ "${confirm:-N}" != "y" ] && [ "${confirm:-N}" != "Y" ]; then
    echo "[restore-voiceprints] aborted."
    exit 1
  fi
fi

echo "[restore-voiceprints] decrypting + extracting $BLOB → $REPO_ROOT/"
openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -d -in "$BLOB" | \
  tar -xzf - -C "$REPO_ROOT"

# Quick sanity print: how many enrollments did we just restore?
ENROLL_COUNT="?"
if [ -f "$TARGET_DIR/index.json" ]; then
  ENROLL_COUNT=$(node -e "
    const fs = require('fs')
    const idx = JSON.parse(fs.readFileSync('$TARGET_DIR/index.json', 'utf8'))
    console.log((idx.entries || []).length)
  " 2>/dev/null || echo '?')
fi
echo
echo "[restore-voiceprints] ✓ restored $ENROLL_COUNT enrollment(s) into $TARGET_DIR"
echo "[restore-voiceprints]"
echo "[restore-voiceprints] Verify in the curator dashboard:"
echo "[restore-voiceprints]   npm run dev   # then visit /curator → Voice ID enrollment"
