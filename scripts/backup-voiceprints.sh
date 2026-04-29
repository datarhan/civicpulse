#!/usr/bin/env bash
# Encrypted backup of the local-only voiceprint database.
#
#   bash scripts/backup-voiceprints.sh [output-dir]
#
# Why: `.voiceprints/` is gitignored — it lives only on the curator's
# laptop. A bad disk = every enrolled councillor needs re-enrollment
# from scratch, plus the original audio URL re-fetched. The .f32
# embeddings + index.json are the genuinely irreplaceable part
# (~5 KB total per councillor); audio caches are recoverable from
# `sourceUrl` in index.json by re-running `enroll-voice --url`.
#
# This script tar's the directory and pipes through openssl AES-256
# with a passphrase you enter interactively. The encrypted blob is
# tiny (≤20 MB even with all audio for 21 councillors) — drop it on
# Dropbox / iCloud / a USB key / wherever survives the laptop.
#
# Restore is the mirror script: scripts/restore-voiceprints.sh
#
# Defaults to ~/Documents/civicpulse-backups/ — pass an argument to
# override. The output filename includes the ISO timestamp so multiple
# backups coexist; the latest is always the one you want for restore.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
SOURCE_DIR="$REPO_ROOT/.voiceprints"
OUT_DIR="${1:-$HOME/Documents/civicpulse-backups}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "[backup-voiceprints] $SOURCE_DIR does not exist — nothing to back up." >&2
  echo "[backup-voiceprints]   (Run npm run enroll-voice first.)" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "[backup-voiceprints] openssl not on PATH — install with 'brew install openssl' first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_FILE="$OUT_DIR/voiceprints-$TIMESTAMP.tar.gz.enc"

# Quick sanity preview so the curator sees what they're backing up.
SIZE=$(du -sh "$SOURCE_DIR" | cut -f1)
ENROLL_COUNT="?"
if [ -f "$SOURCE_DIR/index.json" ]; then
  ENROLL_COUNT=$(node -e "
    const fs = require('fs')
    const idx = JSON.parse(fs.readFileSync('$SOURCE_DIR/index.json', 'utf8'))
    console.log((idx.entries || []).length)
  " 2>/dev/null || echo '?')
fi
echo "[backup-voiceprints] source: $SOURCE_DIR ($SIZE, $ENROLL_COUNT enrollment(s))"
echo "[backup-voiceprints] target: $OUT_FILE"
echo

# openssl prompts for the passphrase twice (-pass stdin would skip
# confirmation, which is dangerous for backups). pbkdf2 + iter is the
# 2025-recommended KDF; AES-256-CBC for the cipher.
tar -czf - -C "$REPO_ROOT" .voiceprints | \
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -out "$OUT_FILE"

# Sanity check the blob looks right.
if [ ! -s "$OUT_FILE" ]; then
  echo "[backup-voiceprints] FAILED — output file is empty" >&2
  rm -f "$OUT_FILE"
  exit 1
fi
ENC_SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo
echo "[backup-voiceprints] ✓ wrote $OUT_FILE ($ENC_SIZE)"
echo "[backup-voiceprints]"
echo "[backup-voiceprints] Recommended next steps:"
echo "[backup-voiceprints]   · Move the .enc file to off-laptop storage"
echo "[backup-voiceprints]     (Dropbox / iCloud / encrypted USB key)"
echo "[backup-voiceprints]   · Save the passphrase in your password manager"
echo "[backup-voiceprints]     under 'CivicPulse voiceprints backup'"
echo "[backup-voiceprints]   · Re-run this script after every batch enrollment"
