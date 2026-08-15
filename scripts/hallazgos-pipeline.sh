#!/usr/bin/env bash
# CivicPulse — /hallazgos full-refresh pipeline (transcribe → extract →
# verify → auto-curate → commit → push). Keeps public/data/pleno-findings.json
# (rendered at /hallazgos) fresh end-to-end.
#
# Chain:
#   scrape:pleno-videos          refresh the YouTube video index (cheap)
#   → for each pleno that HAS a video but NO transcript (newest first,
#     capped at MAX_PLENOS per run):
#         transcribe             Whisper mlx · $0 · ~20 min/pleno · local
#         extract:pleno-claims   claude-code · sonnet · $0 (Max plan)
#   → verify:pleno-claims        overlay-safe deterministic re-verify
#   → auto-curate                claude-code · sonnet · libel-safe gates
#   → commit + push              deploy-vercel.yml redeploys on push-to-main
#
# Safe to run unattended:
#   · No new pleno video → the transcribe/extract loop is a no-op; the
#     cheap auto-curate still runs to promote any pending verified claims.
#   · MAX_PLENOS (default 2) bounds each run's wall-clock; a backlog is
#     cleared a couple plenos per run (weekly cron chews through it).
#   · verify:pleno-claims is OVERLAY-SAFE — it writes the gitignored base
#     (pleno-claims-verified-base.json) then re-applies the committed
#     public/data/pleno-claims-overlay.json via rebuildVerified(), so it
#     can NOT wipe the LLM/NLI/curator verdicts. NEVER call
#     verify:pleno-claims:llm here — that legacy runner bypasses the overlay.
#   · LOREG electoral freeze → auto-curate exits 0 without writing.
#   · One pleno failing (yt-dlp hiccup, quota) is logged + skipped; the
#     batch continues. The extract checkpoint preserves completed plenos.
#
# Host-only: the claude CLI needs an interactive login (can't containerize). (Whisper now
# defaults to the OpenAI API; the mlx/ANE path remains as an env override.)
# macOS TCC: cron needs Full Disk Access on
# /usr/sbin/cron + node + git, and origin must be SSH — same gauntlet as the
# quejas + promises crons (see project memory).
#
# Run manually:   bash scripts/hallazgos-pipeline.sh          # MAX_PLENOS=2
#                 MAX_PLENOS=1 bash scripts/hallazgos-pipeline.sh
# Install cron:   bash scripts/cron-install-hallazgos.sh
set -euo pipefail

MAX_PLENOS="${MAX_PLENOS:-2}"

# Plenos that repeatedly abort transcription are blocklisted so they stop
# burning a MAX_PLENOS slot on every run without ever succeeding.
# Space/comma-separated; override via env.
#   1l7hhu7 · 2023-02-13 — the only channel upload is "Part I", a 22:36 clip
#             whose audio carries no intelligible speech (whisper returns
#             all-dots; volumedetect near-silence). Even a clean transcript
#             of a Part-I-only video would misrepresent the session, so this
#             pleno stays honest-empty until a full recording appears.
TRANSCRIBE_BLOCKLIST="${TRANSCRIBE_BLOCKLIST:-1l7hhu7}"

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

log() { echo "[hallazgos-pipeline] [$(date '+%F %T')] $*"; }

# ---- branch guard + pathspec-limited commit (shared) ------------------
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"
# Before the lock, before the pull, before Whisper and the extractor: off main
# this run would rebase the checked-out branch onto origin/main, commit there,
# and push an untouched local main — hours of transcription that can never be
# published.
cron_require_main "hallazgos-pipeline"

# ---- single-instance lock (a run can take hours) ----------------------
LOCK_DIR="$REPO_DIR/scripts/.hallazgos-pipeline.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if find "$LOCK_DIR" -maxdepth 0 -mmin +360 >/dev/null 2>&1; then
    log "stealing stale lock (>6h)"; rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || { log "lock contended — exiting"; exit 0; }
  else
    log "another run holds the lock — exiting"; exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# ---- env --------------------------------------------------------------
if [ -f "$REPO_DIR/.env" ]; then set -a; . "$REPO_DIR/.env"; set +a; fi
# Claim extraction runs on claude-code/sonnet (operator decision 2026-08-02),
# not agy/gemini-flash. Measured with `npm run eval:extractor` on a diarized
# pleno: sonnet reproduced 100% of extracted quotes verbatim against the
# transcript, haiku only 97% — one reworded councillor sentence out of 33. The
# published contract of /declaraciones is that a quote is what was SAID, so a
# model that paraphrases is unusable at any price. gemini-flash was never
# measured at all, and it produced every one of the 6,359 claims on disk.
#
# agy also fails in the worst possible way: with its daily Google quota spent it
# prints "Individual quota reached" to stdout and exits **0**, so nothing
# downstream can tell success from exhaustion by return code. Quota observed
# spent 2026-08-02 with a 62-hour reset.
export LLM_BACKEND="${LLM_BACKEND:-claude-code}"
export CLAUDE_CODE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
export AGY_MODEL="${AGY_MODEL:-gemini-3.5-flash-medium}"  # only read if LLM_BACKEND=agy

# Preflight, same as press-lab-pipeline: if the chosen backend cannot answer a
# one-word prompt, skip the steps that need it rather than let per-call failures
# drain the chain to a metered fallback. Cheap, and it turns a silent leak into
# a named skip.
#
# It used to `exit 0` on the whole run, and that cost real work. The speaker-map
# step does not touch this backend at all — it runs on `GEMINI_API_KEY`, a
# different key with a different quota, and that quota is 20 requests a day that
# do NOT accumulate. On 2026-08-15 claude-code did not answer at 09:30, the run
# deferred within a second, and a night of Gemini quota went unspent for want of
# a backend it never needed. A twenty-night sweep cannot afford to lose nights
# to an unrelated outage.
#
# So: TEXT_BACKEND is the gate for the steps that genuinely need it —
# extraction and auto-curation. The map's own back-reference adjudication also
# goes through it and degrades safely on its own (an unadjudicated row stays
# `weak` and yields no attribution), and the post-map re-extraction already
# knows how to say «map kept, claims still unattributed» and come back tomorrow.
TEXT_BACKEND=ok
if [ "$LLM_BACKEND" = claude-code ] &&
   ! claude -p "ok" --strict-mcp-config --model "$CLAUDE_CODE_MODEL" >/dev/null 2>&1; then
  TEXT_BACKEND=down
  log "claude-code unavailable (quota or auth) — pasada DEGRADADA: se saltan extracción y auto-curación,"
  log "  se mantienen los pasos que no dependen de ese backend (mapas de hablantes, cuota Gemini aparte)"
fi
# openai (API, metered ~$0.006/min ≈ $0.72 per 2h pleno) replaced mlx as the
# default on 2026-07-07: MLX large-v3 pinned the local GPU for ~30 min/run and
# tripped the Metal watchdog on long sessions. Requires OPENAI_API_KEY (from
# .env above). Override via env for a local run: WHISPER_ENGINE=mlx.
export WHISPER_ENGINE="${WHISPER_ENGINE:-openai}"

log "starting · MAX_PLENOS=$MAX_PLENOS · llm=$LLM_BACKEND/${CLAUDE_CODE_MODEL:-$AGY_MODEL} · whisper=$WHISPER_ENGINE · blocklist=[${TRANSCRIBE_BLOCKLIST:-none}]"

# ---- always start from origin -----------------------------------------
# cron_git_pull_rebase, not a bare pull: the lock, the .env and the `claude -p`
# probe above are seconds of window since the branch guard, and on the wrong
# branch this pull would rebase THAT branch onto origin/main.
cron_git_pull_rebase "git pull inicial" || { log "git pull failed — aborting before LLM work"; exit 1; }

# ---- refresh the video index (cheap) ----------------------------------
npm run scrape:pleno-videos || log "warn: scrape:pleno-videos failed — continuing with existing index"

# ---- refresh the agenda snapshot (best-effort) ------------------------
# regmeet.com blackholes GitHub-runner IPs, so the nightly workflow's
# breaker skips scrape:pleno-agendas there — which froze the snapshot for
# 3 weeks in July 2026 (the 2026-07-06 pleno rendered with an empty orden
# del día). This residential-IP run is the snapshot's only reliable
# refresh path. Polite crawl (1.5 s/request, sequential), non-fatal.
npm run scrape:pleno-agendas || log "warn: scrape:pleno-agendas failed — continuing with existing snapshot"

# ---- transcribable backlog: missing transcript AND has a video, newest first
TARGETS=$(TRANSCRIBE_BLOCKLIST="$TRANSCRIBE_BLOCKLIST" node -e '
  const fs=require("fs");
  const block=new Set((process.env.TRANSCRIBE_BLOCKLIST||"").split(/[\s,]+/).filter(Boolean));
  const plenos=(require("./public/data/plenos.json").items)||[];
  const videos=(require("./public/data/pleno-videos.json").items)||[];
  const vdates=new Set(videos.map(v=>v.plenoDate));
  const have=new Set(fs.readdirSync("public/data/pleno-transcripts").filter(f=>f.endsWith(".txt")).map(f=>f.replace(/\.txt$/,"")));
  const t=plenos.filter(p=>!have.has(p.id)&&vdates.has(p.date)&&!block.has(p.id)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  process.stdout.write(t.map(x=>x.id).join("\n"));
')

NEW=0
COUNT=0
# Counted so the final line can say it. A map that covers part of a session is
# a useful, resumable result — but it is not a ✓, and 2026-08-11 shipped one
# under a ✓.
PARTIAL_MAPS=0
if [ "$TEXT_BACKEND" != ok ]; then
  # Transcription itself is whisper, not this backend — but its only consumer
  # is the extraction two lines down, and transcribing a pleno costs ~$0.72 of
  # metered OpenAI. Paying for a transcript nothing can read tonight is not a
  # saving of any kind; it waits for a healthy run.
  log "backlog transcribible: $(echo "${TARGETS:-}" | grep -c . || true) sesión(es) EN ESPERA — sin backend de texto no hay extracción que las consuma"
  TARGETS=""
fi
if [ -n "$TARGETS" ]; then
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$COUNT" -ge "$MAX_PLENOS" ]; then
      log "reached MAX_PLENOS=$MAX_PLENOS — remaining backlog deferred to next run"; break
    fi
    COUNT=$((COUNT+1))
    log "[$COUNT/$MAX_PLENOS] transcribing $id (whisper=$WHISPER_ENGINE)…"
    # mlx can abort on a Metal GPU command-buffer timeout on very long
    # sessions (5h+, ~140MB+ audio) — a C++ abort we can't catch in-process.
    # Retry once at batch_size=1 (shortest Metal command buffers, safest
    # against the driver watchdog) before giving up on the pleno.
    ok=0
    if bash scripts/transcribe-pleno.sh "$id"; then
      ok=1
    elif [ "$WHISPER_ENGINE" = mlx ]; then
      log "transcription failed for $id — retry at batch_size=1 (Metal GPU timeout guard)…"
      if WHISPER_BATCH_SIZE=1 bash scripts/transcribe-pleno.sh "$id"; then ok=1; fi
    fi
    if [ "$ok" = 1 ]; then
      log "extracting claims from $id ($LLM_BACKEND/${CLAUDE_CODE_MODEL:-$AGY_MODEL} · \$0 backends only)…"
      # Same $0 policy the auto-curate step below already enforces. The
      # transcription step above legitimately needs OPENAI_API_KEY, so the key
      # is present in this shell — which meant the extractor's backend chain
      # could walk agy → claude-code → openai and bill silently whenever the
      # $0 backends were throttled. (Exactly how the press-lab pipeline leaked
      # on 2026-08-01; there it was masked only by the account being out of
      # credits.) Strip the metered keys for THIS command only, so a throttled
      # $0 backend defers the extraction instead of paying for it.
      if env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY npm run extract:pleno-claims -- "$id"; then
        NEW=$((NEW+1)); log "✓ $id claims extracted"
      else
        log "warn: claim extract failed for $id — transcript kept, claims incomplete"
      fi
      # Refresh the curator's VOTE-suggestion queue for this pleno. Libel-safe:
      # writes ONLY pleno-votes-suggestions.json (every row requiresHumanApproval),
      # stamps each with the authoritative regmeet.com orden-del-día outcome
      # cross-check, and NEVER writes the published pleno-votes.json — a curator
      # promotes by hand via `npm run promote-vote`. Non-fatal on failure.
      log "extracting vote suggestions for $id (regmeet cross-check)…"
      if npm run extract:pleno-votes -- "$id" --engine llm --min-confidence 0.5 --cross-check; then
        log "✓ $id vote suggestions refreshed"
      else
        log "warn: vote-suggestion extraction failed for $id (non-fatal)"
      fi
    else
      log "warn: transcription failed for $id (even at batch_size=1) — skipping"
    fi
  done <<< "$TARGETS"
else
  log "no transcribable backlog"
fi

# ---- what the dependency graph says is owed ----------------------------
# The graph answers WHETHER LLM work is owed — it hashes the transcript and
# speaker-map directories against what the claims corpus was built from. It
# does NOT choose sessions: it knows nothing about quota, chunk budgets or
# which pleno is newest, and those are exactly what the backlogs below are for.
# Asking it first means a run that finds nothing to do can say so on evidence
# rather than because its own selector happened to come up empty.
GRAPH_OWED=$(npm run --silent refresh -- --list llm 2>/dev/null || true)
if [ -n "$GRAPH_OWED" ]; then
  log "grafo: trabajo LLM pendiente → $(echo "$GRAPH_OWED" | tr '\n' ' ')"
else
  log "grafo: el corpus de claims está al día respecto a transcripciones y mapas"
fi

# ---- speaker maps: who was actually speaking ---------------------------
# The claim extractor no longer guesses `speakerGroup`; it joins it from
# pleno-speaker-map/<id>.json, where every speaker is backed by a turn-grant the
# chair said out loud. A session with no map yields claims with speakerGroup
# null — honest, and better than the inversion it replaces, but not attribution.
#
# BUDGET, not MAX_PLENOS. The Gemini free tier is 20 requests/day, measured by
# exhausting it on 2026-08-10, and one 4-hour session is 25 chunks of 600s. So
# the cap here counts CHUNKS across the whole run, and a session that does not
# finish is resumed on a later day rather than abandoned: extract-speaker-map.ts
# records the untouched chunks as "never attempted", which is a different fact
# from "the model found no speakers" and must stay that way.
#
# No $0 fallback exists for this step. claude-code cannot take audio (`claude -p`
# has no attachment path), and a text model handed an audio job with no audio
# invents a plausible map. A 429 therefore stops the run; it never degrades.
# 14, not 18, and the difference is measured. The 2026-08-15 probe needed 4
# calls for 3 chunks — one retry, n=3, so weak evidence but the only evidence
# there is. At ~1.33 calls a chunk, 18 chunks asks for ~24 calls against a
# 20-request quota, so EVERY night would end on a 429 instead of on its budget.
# That is not harmful in itself (it is recorded as `quota-exhausted` and
# resumes) but it makes "the quota ran out" the normal ending, and then a quota
# that genuinely dies at chunk 3 — because something else drank it — reads
# exactly the same. Rule 3 of DATA_INTEGRITY: a sentinel that is also the
# ordinary case has stopped saying anything. Raise it only with a fresh
# measurement of the retry rate.
SPEAKER_MAP_BUDGET="${SPEAKER_MAP_BUDGET:-14}"
if [ "$SPEAKER_MAP_BUDGET" -gt 0 ] && [ -n "${GEMINI_API_KEY:-}" ]; then
  MAP_TARGETS=$(npm run --silent speaker-map:backlog 2>/dev/null || true)
  if [ -n "$MAP_TARGETS" ]; then
    REMAINING="$SPEAKER_MAP_BUDGET"
    MAPPED=0
    PARTIAL=$(npm run --silent speaker-map:backlog -- --why 2>/dev/null | grep -c parcial || true)
    log "speaker-map backlog: $(echo "$MAP_TARGETS" | wc -l | tr -d ' ') session(s) unfinished ($PARTIAL of them partial, resuming) · budget ${SPEAKER_MAP_BUDGET} chunk(s)"
    while IFS= read -r mid; do
      [ -z "$mid" ] && continue
      if [ "$REMAINING" -le 0 ]; then
        log "speaker-map budget spent — remaining backlog deferred to the next run"; break
      fi
      log "speaker map for $mid (up to ${REMAINING} chunk(s))…"
      if npm run extract:speaker-map -- "$mid" --chunks "$REMAINING"; then
        # What the run COST, not what the map now holds. chunksTranscribed
        # counts chunks carried forward for free, so subtracting it charged a
        # session resuming at 16/17 a full 17 against an 18-chunk budget and
        # stopped the loop before it reached the next session. Falls back to
        # chunksTranscribed only for maps written before the field existed —
        # `?? ` and not `|| `, because 0 attempts is a real, and cheap, answer.
        SPENT=$(node -e 'try{const m=require("./pleno-speaker-map/"+process.argv[1]+".json");process.stdout.write(String(m.stats.attemptedThisRun ?? m.stats.chunksTranscribed ?? 0))}catch(e){process.stdout.write("0")}' "$mid" 2>/dev/null || echo 0)
        EXPECTED=$(node -e 'try{const m=require("./pleno-speaker-map/"+process.argv[1]+".json");process.stdout.write(String(m.stats.chunksExpected||0))}catch(e){process.stdout.write("0")}' "$mid" 2>/dev/null || echo 0)
        REMAINING=$((REMAINING - SPENT))
        MAPPED=$((MAPPED+1))
        # A ✓ beside a map covering 7 of 17 chunks is how the 2026-08-11 run
        # read as clean. `extract:speaker-map` exits 0 whenever it writes a map
        # at all — partial is a legitimate, resumable outcome, and refusing to
        # write it would throw away the chunks that did succeed — so the exit
        # code cannot carry this. The line has to read the stats itself.
        if [ "${EXPECTED:-0}" -gt 0 ] && [ "${SPENT:-0}" -lt "${EXPECTED:-0}" ]; then
          PARTIAL_MAPS=$((PARTIAL_MAPS+1))
          log "⚠ $mid mapeado PARCIAL ($SPENT/$EXPECTED chunk(s) · ver failedChunks) · $REMAINING left"
        else
          log "✓ $mid mapped ($SPENT/$EXPECTED chunk(s), $REMAINING left)"
        fi
        # Re-extract so the claims actually carry the attribution the map
        # just established. Same $0 policy as every other model call here.
        if [ "$TEXT_BACKEND" != ok ]; then
          # The map is on disk and that is the expensive half. The claims pick
          # it up on the next healthy night; until then they carry no bloc,
          # which is honest rather than wrong.
          log "· $mid mapeado, re-extracción EN ESPERA (sin backend de texto) — el mapa queda guardado"
        elif env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY npm run extract:pleno-claims -- "$mid"; then
          NEW=$((NEW+1)); log "✓ $mid claims re-extracted with map attribution"
          # Tell the graph the work landed. Without this the llm node reports
          # stale forever, and a permanently-stale node trains people to stop
          # reading the report.
          npm run --silent refresh -- --stamp pleno-claims-suggestions.json || true
        else
          log "warn: re-extract failed for $mid — map kept, claims still unattributed"
        fi
      else
        # Quota, or a session whose chunks would not transcribe. Either way the
        # map is absent rather than wrong, and absent means no attribution.
        log "warn: speaker map failed for $mid — claims stay unattributed (see the map's failedChunks)"
        break
      fi
    done <<< "$MAP_TARGETS"
    log "speaker maps built this run: $MAPPED"
  else
    log "speaker-map backlog: none — every transcript has a map"
  fi
else
  log "speaker-map step skipped ($([ -z "${GEMINI_API_KEY:-}" ] && echo "no GEMINI_API_KEY" || echo "budget 0")) — claims will carry speakerGroup:null"
fi

# ---- re-verify only if new claims landed (overlay-safe) ---------------
if [ "$NEW" -gt 0 ]; then
  log "re-verifying claims ($NEW new pleno(s)) — overlay-safe…"
  npm run verify:pleno-claims
else
  log "no new extractions — skipping verify"
fi

# ---- refresh the agent semantic corpus (incremental, best-effort) -----
# Transcript chunks + press headlines → .embed-cache/agent-corpus.jsonl
# (gitignored, local to this Mac — exactly where the journalist agent
# runs). Sha-keyed incremental: a no-change night embeds nothing and
# costs nothing; a new transcript adds ~200 chunks (~fractions of a
# cent). EMBED_BACKEND is PINNED to openai to block an accidental
# ollama fallback (mixed dims = junk ranking). Since 2026-07-31 the
# embed client auto-falls openai→gemini on insufficient_quota (latch),
# and the corpus script probes the active dimensionality first and
# FULL-REBUILDS the cache on a dim change — so a quota-dead OpenAI key
# no longer strands semantic search, and dims can never mix. No key /
# API down → warn only; the agent degrades to lexical-only search.
log "embed:agent-corpus (incremental, openai-pinned)…"
EMBED_BACKEND=openai npm run embed:agent-corpus \
  || log "warn: embed:agent-corpus non-zero — semantic corpus stale; agent falls back to lexical"
# The verifier corpus rides the same daily slot (same latch/marker/pacing
# machinery): best-effort — the verifier's hybrid shortlist degrades to
# lexical when stale, never crashes.
log "embed:verifier-corpus (incremental, openai-pinned)…"
EMBED_BACKEND=openai npm run embed:verifier-corpus \
  || log "warn: embed:verifier-corpus non-zero — verifier shortlist falls back to lexical"

# ---- promote (libel-safe gates; no-op under LOREG freeze) -------------
# The CURATOR stage must never silently go metered (project policy: never
# openai/anthropic for auto-curate). Strip the metered keys + disable the
# gemini CLI for THIS call so the fallback chain is agy → claude-code ($0)
# only (ollama is no longer auto-chained anywhere — user directive 2026-07-07).
# If agy is throttled and no $0 backend answers, findings are deferred to the
# next run — a skipped promotion beats a metered one. (Claim extraction above
# keeps its openai fallback: that's the batch stage, where metered is allowed.)
if [ "$TEXT_BACKEND" != ok ]; then
  log "auto-curación EN ESPERA (sin backend de texto) — los hallazgos esperan a una pasada sana"
else
  log "auto-curating findings (max 5 · agy→claude-code only, metered fallback off)…"
  env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY GEMINI_BIN=/nonexistent-disabled \
    npm run auto-curate -- --max 5 \
    || log "warn: auto-curate non-zero (agy throttled + no \$0 fallback) — findings deferred"
fi

# ---- provenance of every published verbatim ---------------------------
# A newly promoted finding quotes the transcript that is current TODAY, and a
# session re-transcribed above turns yesterday's quotes into quotes of a text
# that no longer exists. Both change what /hallazgos must mark, so the derived
# snapshot is regenerated here, in the same run, before the commit — otherwise
# the page would carry a marker (or no marker) about a state of the world that
# ended thirty seconds ago. It reads four snapshots and writes a fifth; it never
# touches pleno-findings.json.
#
# It runs AFTER the verify step above on purpose: the second axis of that
# snapshot is what the editorial gate would do with each quote's claim, read
# from base ⊕ overlay. Re-judging a claim moves its mark, so deriving before the
# verifier would publish yesterday's answer about today's accusations.
npm run compute:finding-quote-provenance \
  || log "warn: compute:finding-quote-provenance non-zero — /hallazgos puede quedar con marcas viejas"

# ---- published attributions vs the speaker maps (DRY, never applies) --
# Compares every published `speakerGroup` against the map for its session and
# reports the split: agrees / contradicted / additive / unknown.
#
# DRY, and only dry. `--apply` retracts, and retraction is the one direction
# automation is allowed to move an attribution — but it is not run here, because
# the sweep has barely started and the interesting sessions have no map yet.
# Measured 2026-08-15: 134 published quotes across 11 sessions, and all 11
# report `no-map`. Nothing to decide, and the CLI says so in those words rather
# than printing an all-clear.
#
# It is wired now, at zero cost, for two reasons: a `contradicted` row is worth
# hearing about the night it appears rather than in three weeks, and this was
# otherwise another thing that had been built, tested and invoked by nobody —
# which is the failure this repo keeps re-finding.
#
# Outside the TEXT_BACKEND guard: the dry pass reads snapshots and calls no
# model. Only `--apply` shells out to `correct-pleno-finding`.
#
# Writes `editorial/attribution-queue.json` — gitignored, and NEVER under
# `public/`: Vercel serves that whole directory, and this queue pairs transcript
# passages with attributions about named councillors.
npm run reconcile:attribution --silent \
  || log "warn: reconcile:attribution non-zero — la cola de atribución no se ha regenerado"

# ---- IFCN weekly-cadence check (informational, never fatal) -----------
# The IFCN signatory track requires ≥1 published finding per ISO week.
npm run ifcn:cadence --silent -- --strict \
  || log "warn: IFCN cadence gap — no finding published this ISO week yet; promote one manually"

# ---- commit + push the regenerated data -------------------------------
# ONE pathspec stages, gates and commits. Everything the pipeline touches under
# public/data, minus the two files owned by the OTHER crons (quejas per-minute ·
# promises daily) — carried by ':(exclude)' rather than the old `git add` +
# `git reset` pair, so those two are never even staged and a run of this cron
# can no longer unstage work an operator had staged in them.
#
# The old guard was `git diff --cached --quiet` over the WHOLE index, and the
# old `git commit` had no pathspec at all: with anything else staged the guard
# said "there is work to do" and the commit swept it in (that is how f182c61
# published a subagent's in-flight test files).
#
# `pleno-speaker-map` is in here because the maps live at the repo ROOT — never
# under `public/`, since Vercel serves that whole directory and these rows name
# living people — and so fell outside a `public/data` pathspec entirely. Every
# map in git was committed by hand; no cron had ever committed one. With a
# ~24-night sweep ahead that is two failures: a night whose only work is a map
# sees no change under public/data and exits by "nothing changed", leaving the
# map loose in the working tree for the next run's `pull --rebase --autostash`
# to shuffle; and a healthy night commits the re-extracted corpus carrying
# attribution that map established, without the map. Irreproducible either way.
if ! cron_git_stage_and_check public/data pleno-speaker-map \
       ':(exclude)public/data/quejas.json' \
       ':(exclude)public/data/promises.json'; then
  log "nothing changed — done (no commit)"; exit 0
fi

NEW_FINDINGS=$(git diff HEAD -- public/data/pleno-findings.json | grep -cE '^\+ +"id": "f-' || true)
cron_git_commit_pathspec "$(cat <<EOF
data: /hallazgos pipeline · ${NEW} pleno(s) transcribed · ${NEW_FINDINGS} new finding(s)

Automated by scripts/hallazgos-pipeline.sh (weekly cron).
transcribe(${WHISPER_ENGINE}) → extract(${LLM_BACKEND}/${CLAUDE_CODE_MODEL:-$AGY_MODEL}) → verify(overlay-safe) → auto-curate.
All findings tagged \`curatorName: "auto-curation-v1"\`.
EOF
)"

# push with one pull-rebase retry (races the per-minute quejas cron)
if ! git push origin main; then
  log "push rejected — pull-rebase + retry"
  cron_git_pull_rebase "pull-rebase de reintento tras push rechazado"
  git push origin main
fi

# ── the last line anybody reads ──────────────────────────────────────────────
#
# On 2026-08-11 this said `done · 0 transcribed · 0 new finding(s) pushed`, and
# every word of it was true. Underneath: the speaker map covered 7 of 17 chunks
# before Gemini's daily quota ran out, the circuit breaker short-circuited 144
# of 363 extraction windows, and 14 calls were refused outright by a backend.
# Three truthful lines that together read as a clean night.
#
# So the summary now asks the run's own manifest. `check:runs` already knows —
# it distinguishes "never attempted" from "attempted and failed", which is the
# whole point of rule 2 in docs/DATA_INTEGRITY.md — and it was reporting all of
# this the moment the run ended. Nothing was reading it.
#
# --soft so the verdict is FETCHED, never fatal: this runs after the push, and
# a degraded run whose data landed correctly must not exit non-zero and get
# retried. The word in the log is the deliverable.
RUN_VERDICT=""
if RUN_REPORT=$(npm run --silent check:runs -- --since 6 --soft 2>&1); then
  RUN_ERRORS=$(printf '%s\n' "$RUN_REPORT" | grep -c 'ERROR \[' || true)
  RUN_WARNS=$(printf '%s\n' "$RUN_REPORT" | grep -c 'WARN \[' || true)
  if [ "${RUN_ERRORS:-0}" -gt 0 ] || [ "${RUN_WARNS:-0}" -gt 0 ]; then
    RUN_VERDICT=" · DEGRADADO: ${RUN_ERRORS} error(es), ${RUN_WARNS} aviso(s) en el manifiesto"
  fi
fi
[ "${PARTIAL_MAPS:-0}" -gt 0 ] && RUN_VERDICT="${RUN_VERDICT} · ${PARTIAL_MAPS} mapa(s) parcial(es)"
# Una pasada que corrió media tubería no puede firmar la línea de una completa.
[ "$TEXT_BACKEND" != ok ] &&
  RUN_VERDICT="${RUN_VERDICT} · DEGRADADA: sin backend de texto (extracción y auto-curación en espera)"

log "done · ${NEW} transcribed · ${NEW_FINDINGS} new finding(s) pushed${RUN_VERDICT}"
if [ -n "$RUN_VERDICT" ]; then
  log "   la pasada NO fue limpia — \`npm run check:runs\` lo detalla:"
  printf '%s\n' "$RUN_REPORT" | grep -E '^\s+(ERROR|WARN) \[' | sed 's/^/   /'
fi
