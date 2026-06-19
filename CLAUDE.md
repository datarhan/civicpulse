# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install dependencies
npm run dev            # Vite dev server on http://localhost:5173
npm run build          # production build to dist/
npm run preview        # serve the production build locally
npm test               # Vitest suite (runs all adapter tests once)
npm run test:watch     # Vitest in watch mode
npm run test:e2e       # Playwright e2e (per-route specs + chrome + mobile + axe a11y)
npm run test:e2e:ui    # Playwright in headed UI mode

# Real-data ingestion (re-run after any upstream change; all idempotent).
# GitHub Actions runs scrape:all nightly at 04:30 UTC (see §Nightly refresh).
npm run scrape:officials            # 21 councillors + photos from ribarroja.es
npm run scrape:transparency         # Portal de Transparencia doc index (RPT + CV PDFs)
npm run scrape:ispa                  # ISPA (Hacienda) cargo salaries · multi-year · /cargos
npm run scrape:budget               # CONPREL municipal budget XLS (MinHac)
npm run scrape:tenders              # Gobierto tender/contract feed (mirrors PLACSP)
npm run scrape:tenders-ted          # EU TED v3 — contracts above EU threshold (Riba-roja buyer)
npm run scrape:boe                  # BOE last 30 days · filters titulos mentioning Riba-roja
npm run scrape:bop                  # BOP València last 30 days · Riba-roja edictos (PDF walk)
npm run scrape:padron               # INE Tempus3 30-year population series
npm run scrape:participa            # Votiveu (WordPress) citizen-participation blog
npm run scrape:press                # Google News + infoturia + Ayuntamiento RSS
npm run scrape:events               # Ayuntamiento events/agenda RSS feed
npm run scrape:geo                  # OSM Overpass boundary + 21 neighborhoods
npm run scrape:metro-network        # OSM Metrovalencia L1–L10 full network + stations
npm run scrape:fgv-gtfs             # FGV GTFS static schedule (4 local L9/L2 stops)
npm run scrape:bdns                 # MinHac BDNS subsidies
npm run scrape:paro                 # SEPE monthly unemployment XLS
npm run scrape:plenos               # Council-session index on ribarroja.es/plenos
npm run scrape:pleno-agendas        # Agenda items per pleno (orden del día)
npm run scrape:wikidata             # Wikidata Q23701 facts + cross-references
npm run scrape:spain-ticker         # Spain-wide live feeds (REE PVPC, Minetur carburantes, ECB Euribor+MRO, INE IPC, AEMET avisos, DGT DATEX-II)
npm run scrape:promise-suggestions  # Inference engine (never mutates promises)
npm run scrape:all                  # walks every autonomous scraper (~3 min)

# Promise-tracker administration (schema-validated, PR-safe edits)
npm run freeze:status               # inspect LOREG electoral-freeze state
npm run freeze:set -- YYYY-MM-DD    # freeze /promesas until the given date
npm run freeze:clear                # lift the freeze (explicit action)
npm run reply -- <promise-id> <PARTY> "<verbatim quote>" [url publisher] [date]
                                    # apply an approved right-of-reply

# Queja legal router (pure fn · no network)
npm run route-queja -- "<title>" "<detail>" [category]
                                    # prints category → concejalía → plazos → escalado
npm run route-queja -- --file queja.json --raw    # JSON output for piping

# Queja right-of-reply (schema-validated, PR-safe edits to quejas-responses.json)
npm run queja-reply -- <Q-ID> "<role>" "<firmante>" "<verbatim text>" [source-url]

# Pleno vote transcription (schema-validated, PR-safe edits to pleno-votes.json)
npm run pleno-vote -- <pleno-id> <item#> <outcome> "<title>" <source-url> \
                     "PSOE:a_favor:11,PP:en_contra:7,VOX:abstencion:2,Compromís:a_favor:1"
npm run pleno-vote -- --file /path/to/vote.json         # JSON variant; file may include
                                                         # optional dueBy + dueBySource (≥20
                                                         # chars verbatim from the acta)
# One-shot promote: pick an LLM-extracted suggestion, fill title from agendas,
# inherit dueBy + dueBySource, validate, and call pleno-vote.
npm run promote-vote -- <pleno-id> <item#> [source-url] [--edit]

# Press-lab v2 administration (curator-only · IFCN signatory baseline)
# Each CLI re-validates the whole snapshot before writing — invariants like
# ≥10-char title / ≥40-char summary / ≥20-char reason can never silently slip.
npm run correct-press-finding -- <id> --field <title|summary|severity> \
                     --new "<text>" --reason "<≥20 chars>" --editor "<name>"
                                    # Appends a public correction row to a
                                    # press finding + applies the change.
npm run correct-pleno-finding -- <id> --field <title|summary|severity> \
                     --new "<text>" --reason "<≥20 chars>" --editor "<name>"
                                    # Same contract for pleno findings.
npm run audit-press-links           # Daily link-rot audit + Wayback availability
                                    # lookup. Walks every articleUrl in press-claims-
                                    # suggestions.json, HEAD-checks each, attaches
                                    # archive.org snapshot URL when found. Writes
                                    # public/data/press-link-rot.json. Chained
                                    # nightly after auto-curate-press.
npm run audit-press-links -- --archive
                                    # Forces a Wayback Save Page Now on every URL
                                    # (~6 req/min anonymously). Use sparingly.
npm run lookup-catastro -- --address "CL MAYOR 14"
npm run lookup-catastro -- --refcat 4720001YJ2742S0001JF
                                    # Curator-only Catastro (OVC) parcel lookup.
                                    # Pure stdout — never writes to public/data/.

# Cross-source department accountability scalar (runs inside scrape:all)
npm run compute:dept-stats          # writes plazosVencidosCount into plenos-agendas.json.stats

# Claim extraction pipeline (LLM-extracted verbatim claims → deterministic
# verifier → human-curated editorial findings). Requires transcripts on disk
# (public/data/pleno-transcripts/*.txt) produced by the transcribe:batch
# workflow, plus an LLM backend. Auto-selected in this order when
# LLM_BACKEND is unset: OPENAI_API_KEY → openai (metered, recommended for
# batch), ANTHROPIC_API_KEY → anthropic (metered), else ollama (local).
# LLM_BACKEND=claude-code is opt-in only — it burns the Anthropic Max
# subscription quota shared with interactive Claude Code sessions, and one
# full-pleno extract (~200 calls) can exhaust a 5-hour window.
# See src/scraper/pleno-claim.ts + claim-verifier.ts + pleno-finding.ts for
# the schema contracts. Surfaces on /plenos and /departamentos/:slug.
npm run extract:pleno-claims -- <plenoId|--all> [--min-confidence 0.5] [--concurrency 3]
# Default concurrency=3 runs 3 LLM calls in parallel per batch. Env:
# LLM_CONCURRENCY=N. Writes a per-pleno checkpoint to
# pleno-claims-suggestions.json so a rate-limit crash mid-batch preserves
# completed plenos (SIGINT flushes too).

# Transcription engine (only affects bash scripts/transcribe-pleno.sh and
# npm run transcribe:batch; see script header for the full help):
#   WHISPER_ENGINE=mlx    · lightning-whisper-mlx on Apple Neural Engine.
#                           ~5-10× realtime, $0, local. Better WER on technical
#                           terms than OpenAI whisper-1 in our benchmark
#                           (correctly transcribes "UNE 93200:2008" where
#                           OpenAI mangles it to "norma 1 en 93.200"). Default
#                           choice for nightly batches.
#   WHISPER_ENGINE=openai · OpenAI API, ~$0.006/min (~$0.72 per 2h pleno),
#                           done in 30-60s. Requires OPENAI_API_KEY in .env
#                           or shell env. Audio re-encoded to 16kbps opus so a
#                           3h pleno fits under the 25 MB upload cap.
#   WHISPER_ENGINE=local  · faster-whisper CPU int8, $0, ~0.3× realtime
#                           (default — fallback when MLX isn't bootstrapped).
#   WHISPER_MODEL env chooses the Whisper weights (large-v3 default,
#   medium/small for speed at the cost of WER).
#
# Optional pre-Whisper noise reduction (opt-in):
#   WHISPER_DENOISE=1     · re-encodes the downloaded audio through
#                           ffmpeg's afftdn (FFT noise reduction, built-in)
#                           BEFORE Whisper sees it. nr=12 dB reduction with
#                           adaptive noise-floor tracking. Default OFF —
#                           aggressive denoise can clip consonants on
#                           already-clean recordings; A/B word-count first.
#                           Useful for marathon sessions, distant mics,
#                           post-DANA echoey recovery rooms.
#
# Optional speaker diarization (post-Whisper, opt-in):
#   WHISPER_DIARIZE=1     · runs pyannote.audio's speaker-diarization-3.1
#                           after Whisper and rewrites every transcript
#                           line with a (SPEAKER_NN) tag. Cuts the
#                           extractor's null-speakerGroup rate from
#                           ~65% to <30% on real plenos. ~0.5× realtime
#                           on CPU. Bootstrap (one-time — or just run
#                           `bash scripts/bootstrap-voice-id.sh` which
#                           automates 3+4 and smoke-tests the pipeline):
#                             1. Accept user agreements at
#                                  huggingface.co/pyannote/speaker-diarization-3.1
#                                  huggingface.co/pyannote/segmentation-3.0
#                                  huggingface.co/pyannote/speaker-diarization-community-1
#                                    (pyannote 4.x transparently routes 3.1
#                                    model loads through community-1; the
#                                    bootstrap script detects this gate)
#                             2. Set HUGGINGFACE_TOKEN in .env
#                             3. python3.10 -m venv ~/.local/civicpulse-pyannote/venv
#                             4. ~/.local/civicpulse-pyannote/venv/bin/pip install 'pyannote.audio>=4.0,<5'
#                           Default OFF — plain Whisper output keeps
#                           the dependency surface minimal.
#
# Optional voice-id assignment (post-diarization, opt-in):
#   WHISPER_IDENTIFY=1    · matches each diarized SPEAKER_NN cluster to
#                           an enrolled councillor voiceprint. Requires
#                           WHISPER_DIARIZE=1 AND ≥1 enrolled voice in
#                           `.voiceprints/` (see `npm run enroll-voice`
#                           below). Slices the longest contiguous segments
#                           of each cluster, embeds them via the same
#                           speechbrain ECAPA-TDNN model used at
#                           enrollment, cosine-ranks against the enrolled
#                           set, and writes the assignment to
#                           `pleno-speakers/<plenoId>.json`.
#                           High-tier matches (cosine ≥ 0.6 AND margin
#                           over second-best ≥ 0.15) get the transcript
#                           rewritten from `(SPEAKER_NN)` to
#                           `(<councillor name>)`. Medium-tier becomes
#                           `(SPEAKER_NN ≈ <name>?)` for curator review.
#                           Below-threshold clusters keep `(SPEAKER_NN)`.
#                           Default OFF.
#
#   Standalone CLI (no env-gate, runs against an existing diarized transcript):
#     npm run identify-pleno-speakers -- <plenoId> [--apply]
#
#   Voiceprint enrollment (admin-only · curator dashboard at /curator):
#     npm run enroll-voice -- --slug <officials-slug> --url <public-audio-url>
#     npm run enroll-voice -- --slug robert-raga-gadea --audio path/to/sample.mp3
#     npm run delete-voiceprint -- --slug <officials-slug>
#   The voiceprints database is local-only (`.voiceprints/` is gitignored).
#   The 192-dim ECAPA-TDNN embedding is L2-normalised so cosine reduces
#   to a dot product downstream. Same speaker self-similarity in our
#   benchmark: ~0.85; cross-speaker noise floor: ~0.10.
#
#   Curator review surface (dashboard at /curator → "Voice ID assignments
#   per pleno"). Lists every `pleno-speakers/<plenoId>.json`. Per cluster:
#   shows the auto-match tier, top-3 candidates with cosine scores, and a
#   dropdown to override the assignment. Overrides land in
#   `pleno-speakers/<plenoId>.json` under a sibling `curatorOverride`
#   field — the auto-match is preserved untouched for audit. Effective
#   assignment for downstream consumers (LLM extractor, transcript
#   rewrite) follows: curatorOverride wins → else high-tier match → else
#   nothing. Medium and low tier auto-matches NEVER feed the LLM unless a
#   curator explicitly promotes them via override.
#
#     npm run override-speaker-assignment -- --pleno-id <id> \
#         --speaker SPEAKER_NN --slug <officials-slug> [--reason "…"]
#     npm run override-speaker-assignment -- --pleno-id <id> \
#         --speaker SPEAKER_NN --clear         # explicit unassigned
#     npm run override-speaker-assignment -- --pleno-id <id> \
#         --speaker SPEAKER_NN --remove-override
#
#   Audio playback per cluster: GET /api/curator/pleno-speakers/<id>/
#   audio/<SPEAKER_NN> ffmpeg-streams an 8-second mp3 from the mid-
#   point of the cluster's longest segment. Surfaced on every assignment
#   row in the dashboard so the curator can listen before overriding.
#
#   Bootstrap helper for the venvs + tooling:
#     bash scripts/bootstrap-voice-id.sh
#   Detects + best-effort installs ffmpeg / yt-dlp / python3.10 / the
#   pyannote venv / the speechbrain venv. Exits non-zero with a punch
#   list of remaining human actions (HF user agreements + token).
#
#   Batch enrollment (admin-only) accepts a JSON manifest of
#   {slug, url} rows and runs them serially:
#     npm run enroll-voices-batch -- --file enrollments.json
#   Skips already-enrolled rows unless --force; writes an audit log
#   to scripts/logs/enroll-voices-batch-<ts>.log.
#
#   Encrypted backup of `.voiceprints/` (gitignored, laptop-only):
#     bash scripts/backup-voiceprints.sh [output-dir]   # default ~/Documents/civicpulse-backups/
#     bash scripts/restore-voiceprints.sh <blob.tar.gz.enc>
#   tar + openssl AES-256-CBC + pbkdf2 (interactive passphrase prompt).
#   Tiny output (≤20 MB even with all audio) — drop the blob on
#   Dropbox / iCloud / a USB key. The .f32 vectors are the genuinely
#   irreplaceable part; audio caches can be re-fetched from sourceUrl
#   in index.json by re-running `enroll-voice --url`.
#
#   A/B measurement of voice-id's lift on attribution:
#     npm run voice-id-ab -- <plenoId>
#   Two extraction passes against the same identified transcript:
#   allowedSpeakers=[] (Pass A, pre-voice-id behaviour) vs
#   allowedSpeakers=enrolled (Pass B, current production). Reports
#   per-bloc + per-individual counts, prints a markdown summary, and
#   writes scripts/logs/voice-id-ab-<id>-<ts>.md. Cost: 2× a normal
#   extract — recommend running once after the first 4-bloc enrollment
#   set is complete.
#
#   Editorial guard: voice-id is editorial signal, not a libel green
#   light. The LLM extractor's `speakerGroup` enum stays bloc-level
#   (PSOE / PP / VOX / Compromís) regardless of voiceprint match. A
#   curator promotes individual attribution per finding, after spot-
#   checking the assignment in `pleno-speakers/<plenoId>.json` against
#   the audio. Promotion happens via:
#     npm run promote-claim -- <claimId> [...] --title "…" --summary "…" \
#         [--individual-speaker auto|<slug>|none]
#   Default 'auto' stamps the finding with `individualSpeaker` when
#   every cited claim shares the same speakerSlug. 'none' suppresses;
#   '<slug>' explicit. The slug must resolve to officials.json AND
#   match every quote's speakerGroup party (mismatches abort).
#   `/hallazgos` renders the individualSpeaker chip alongside the bloc
#   tag — that's the libel boundary crossing where the individual
#   becomes visible to the public. The high-tier voice-id threshold
#   (0.6 cosine + 0.15 margin) was set so wrong matches require both
#   an unusual voice profile AND a tight margin — a combination that
#   hasn't shown up in pilot data.
#
# Optional proper-noun second pass (post-Whisper, opt-in):
#   npm run refine-transcript -- <plenoId> [--apply]
#                         · Reads the Whisper transcript, builds a vocab
#                           from officials.json + geo.json + wikidata.json
#                           + top-50 contractors in tenders.json, and asks
#                           the LLM (Gemini Pro by default) to fix
#                           Whisper-mistranscribed proper nouns ONLY.
#                           Conservative replacement discipline — leaves
#                           uncertain tokens alone. Writes <id>.txt.refined
#                           alongside the original; --apply atomic-renames
#                           it. Audit log per replacement at
#                           scripts/logs/refine-transcript-<id>-<ts>.log.
#                           Cost: ~$0 on Gemini Pro plan, ~$0.30 metered.

npm run verify:pleno-claims               # pure local pass · tenders + BDNS + budget + promises
                                          # also refreshes public/data/pleno-claims/<id>.json chunks
                                          # + manifest at public/data/pleno-claims/index.json (the
                                          # SPA reads chunks; CLIs keep using the monolith)
npm run chunk-pleno-claims                # standalone: regenerate chunks from monolith (idempotent)
npm run extract-and-verify:pleno-claims -- <plenoId|--all>  # both in one go
# Semantic shortlist for the LLM second pass (default hybrid; override via env):
#   VERIFIER_SHORTLIST=hybrid   (default) union of lexical + semantic, deduped by ref
#   VERIFIER_SHORTLIST=lexical  word-overlap scoring · no API calls
#   VERIFIER_SHORTLIST=semantic cosine over the embedded corpus
# Embeddings backend (auto-detected from API keys / env, override via env):
#   EMBED_BACKEND=ollama  (default when no API key is set; recommended)
#                          Local nomic-embed-text via `ollama serve`, 768 dim,
#                          zero cost, zero quota, zero secrets. Bootstrap:
#                            ollama pull nomic-embed-text   # ~275 MB, one-time
#                          Custom model via OLLAMA_EMBED_MODEL; custom host via
#                          OLLAMA_HOST (default http://localhost:11434).
#                          Full corpus rebuild: ~10 s for ~1k rows on M1/M2.
#   EMBED_BACKEND=openai  (default when OPENAI_API_KEY set) text-embedding-3-small,
#                          1536 dim, paid tier, ~$0.002/full rebuild on ~2k rows
#   EMBED_BACKEND=gemini  (default when only GEMINI_API_KEY set) text-embedding-004,
#                          768 dim, free-tier REST API (NOT the gemini-CLI OAuth
#                          token — that one is chat-only). Key at
#                          https://aistudio.google.com/apikey
# Anthropic / Claude Code is NOT a valid embeddings backend — Anthropic does
# not publish an embeddings API. Use it for the chat second pass only
# (LLM_BACKEND=claude-code) and pair with one of the three embed backends here.
# Switch backends → MUST rebuild the cache (--rebuild) since 1536-dim,
# 768-dim, and other vector dimensions are not comparable. Hybrid mode falls
# back to lexical with a stderr warning when the chosen embed backend isn't
# usable (no key, daemon down, model not pulled) — never crashes the verifier.
# The LLM second pass also enforces structured cites (prompt v2): each
# evidence.snippet must begin with `<dataset>[<i>].<field>=<value> · …`
# and the cited value must appear literally in the candidate snippet, or
# the citation is rejected as a hallucination. Telemetry (out-of-range,
# missing-cite, cite-not-in-snippet) reports per run.
npm run embed:verifier-corpus             # build .embed-cache/verifier-corpus.jsonl
npm run embed:verifier-corpus -- --rebuild  # required after switching backends
npm run promote-claim -- <claimId> [claimId ...] \
                     --title "<≥10 chars>" --summary "<≥40 chars>" \
                     [--severity informational|notable|critical] \
                     [--related-promise <id>] [--edit] [--force]
# Auto-curation — LLM writes title + summary for high-confidence
# informational findings, applies safety gates, and bulk-promotes.
# Severity is hard-coded to informational; contradicho-bearing bundles
# are routed to editorial/auto-curation-queue.md (curator-only) instead
# of /hallazgos. Skipped during LOREG electoral freeze.
npm run auto-curate                       # default: max 5 findings
npm run auto-curate -- --max 10 --dry-run # preview without persisting
# Weekly launchd agent (Mondays 09:00 Madrid · runs auto-curate, commits + pushes):
bash scripts/launchd-install-auto-curate.sh           # install + load
bash scripts/launchd-install-auto-curate.sh uninstall # remove
# Logs: scripts/logs/auto-curate.{out,err}.log
# Right-of-reply for a published finding. Also via the
# .github/ISSUE_TEMPLATE/finding-response.yml form (label `derecho-replica`
# triggers ingest-finding-responses.yml which calls this CLI and commits).
npm run finding-reply -- <findingId> <PARTY> "<verbatim ≥20 chars>" [source-url] [YYYY-MM-DD]

# LLM cost / cache-hit dashboard (reads .llm-cache/*.json telemetry)
npm run llm:cost                     # summary table
npm run llm:cost -- --json           # raw JSON
npm run llm:cost -- --since 7        # last 7 days only

# Telegram bot (sibling package under /bot — Sprints A→E)
cd bot && npm install && npm test   # 54 tests (db + batch + escalation + digest)
cd bot && npm run dev               # long-polling (set BOT_TOKEN in bot/.env)
cd bot && npm run export            # SQLite → ../public/data/quejas.json
# Admin-only bot commands (ADMIN_USER_IDS env):
#   /batch  /batch_register  /escalar  — weekly batch to sede + Síndic escalation
```

ESLint + Prettier are configured (`eslint.config.mjs` owns correctness,
Prettier owns formatting): `npm run lint`, `npm run lint:fix`, `npm run format`,
`npm run format:check`. A husky pre-commit hook runs `npm run lint` (fails on
errors, not warnings). Type-checking runs via `npm run typecheck`
(`tsc --noEmit`, configured by the root `tsconfig.json`, which now type-checks
the journalist subsystem too; only the test tree and the dead
`scripts/draft-finding-suggestions.ts` stay outside its `include`). The
unit/integration suite is Vitest +
happy-dom; fixtures live in `tests/fixtures/`. The end-to-end suite is
Playwright (`tests/e2e/*.spec.ts`) and covers **78 tests, zero failures**:

- per-route specs: landing, cargos (+ /:slug), presupuesto, plenos,
  promesas, departamentos (+ /:slug), hallazgos, declaraciones, datos,
  quejas (+ dashboard + /:id), cambios, metodologia, aviso-legal, and
  the catch-all redirect
- cross-cutting (`chrome.spec.ts`): Cmd+K spotlight, dark-mode toggle,
  i18n switch (es ↔ ca), and every sidebar nav link
- mobile shell at 375px across 17 routes + hamburger drawer
- axe-core WCAG 2.1 AA strict-pass across 17 routes
  (`a11y.spec.ts`'s `STRICT_ROUTES`). The file also exposes a
  `KNOWN_DEBT_ROUTES` scaffold for quarantining future regressions
  without losing visibility — currently empty.

CI runs E2E on every push/PR via `.github/workflows/e2e.yml`.

## Architecture

CivicPulse is a **front-end-only SPA** (Vite + React 18 + React Router 6)
backed by a sibling **Node.js Telegram bot** (`/bot/`) that runs on
macOS launchd as a local long-polling service. All primary data comes
from static JSON in `/public/data/*.json`, produced by 20 nightly
scrapers. The bot writes its own snapshot (`quejas.json`) to the same
tree via a daily launchd export agent.

**No external backend.** Vercel serves the static assets next to the
JSON. The bot process reads + writes SQLite locally; exports are
committed back to git (daily at 04:00 local, or on demand via
`bash bot/scripts/local-export.sh`).

`src/data/mockData.js` was retired and has since been **deleted** —
every production surface reads real JSON.

### Layout
- `src/App.jsx` — SPA root. `/` renders `DirectionD` as the landing
  page (full-bleed map + editorial column + KPI strip). Every other
  route renders inside `InnerShell` (Sidebar + Topbar).
- `tweaks` state (dark mode, density) persists to `localStorage` under
  `cp:tweaks` and applies `html.dark` class + `html` font-size.
- Breadcrumb derives from `useLocation()` matched against the `NAV`
  array in `components/Sidebar.jsx`.

### Routes
- `/` → `variants/DirectionD.jsx` — the MVP landing (no sidebar).
  Map (`components/LiveCity/StylizedMap.jsx`) + editorial column
  (Alcalde, CoalitionRing, PromesasBlockD, PressBlockD, LiveContracts,
  ParticipaBlockD, LeadStory from press) + KPI strip (padrón, budget,
  tenders, paro, último pleno).
- `/cargos` — officials grid + QuejaBadge per concejal
- `/presupuesto` — CONPREL + tenders + BDNS subsidies
- `/plenos` — 53 sessions + orden del día + Participa block
- `/promesas` — legal-chrome promise tracker + LOREG freeze
- `/departamentos` — per-concejalía accountability (pleno votes primary + promesas secondary + plazos vencidos soft flag)
- `/departamentos/:slug` — detail view (compromisos plenarios + promesas + puntos sin voto + quejas activas + claim ledger filtered by topic)
- `/cargos/:slug` — per-councillor detail (portfolio chips + party promises + agenda items in their portfolios + assigned quejas)
- `/hallazgos` — editorial findings dashboard · severity/speaker/pleno filters · per-finding permalinks · right-of-reply button on each card
- `/datos` — catálogo of every JSON snapshot w/ Wikidata + padrón charts
- `/quejas` — public feed + heatmap + Síndic/CTBG resolution cards
- `/quejas/dashboard` — analytics surface (KPIs, LPACAP lifecycle, per-concejalía SLA)
- `/quejas/:id` — detail view (timeline, legal clock, right-of-reply)
- `/laboratorio` — press fact-check observatory · LLM-extracted claims + verifier verdicts + Trust Project indicators + outlet scoreboard + coverage gaps + triangulation across outlets. Single audience (curators / journalists / civic-tech readers). Does NOT touch landing, live ticker, or `/cambios` — the lab is its own surface.
- `/metodologia` + `/aviso-legal` — editorial contract
- catch-all → redirect to `/`

Legacy routes `/hud`, `/briefing`, `/d`, `/variants`, `/ciudad`,
`/overview` have been removed. Don't reintroduce them.

### Design tokens
All tokens live in `src/index.css` as CSS variables, with a `html.dark` override block that remaps `--ink`, `--surf`, `--paper`, `--soft`, `--border*`, and the `--*-soft` tonal surfaces. Tone names (`civic`, `ok`, `warn`, `crit`, `intel`, `neutral`, `ghost`) flow through `Pill`, `Delta`, and page status logic — add new semantic colors here, not inline. The `.mono` class switches to DM Mono with `font-variant-numeric: tabular-nums` and is used for every numeric/KPI value.

Components use **inline styles driven by CSS variables**, not per-component `.css` files. This matches the prototype's structure and keeps theming (dark mode, density) working through a single token layer — don't refactor to styled-components or CSS modules without the user asking.

### Charts & maps
`src/components/Charts.jsx` holds SVG primitives (`Sparkline`, `DualLine`, `Donut`, `BudgetBars`, `Heatmap`).

Leaflet + react-leaflet map surfaces:
- `src/components/LiveCity/StylizedMap.jsx` — the `/` landing map. CartoDB Voyager tiles + real OSM geometry. Kept deliberately minimal: municipal boundary + OSM neighborhood dots + L9 metro geometry. No synthetic buildings, no fake scores.
- `src/components/QuejasHeatmap.jsx` — `/quejas` heatmap. One `Circle` per OSM neighborhood with ≥1 queja; radius ∝ √count, color encodes health signal (silencio-rate → red/amber/green/civic-blue). Hidden when there's nothing to show.

## Real data pipeline

**24 autonomous scrapers** feed Riba-roja de Túria (INE **46214** · Wikidata
**Q23701** · OSM relation **342356**) and refresh nightly via GitHub Actions
at 04:30 UTC — the set walked by `npm run scrape:all`. Alongside them, a
handful of curated files only move via the `npm run reply` / `npm run
sindic:add` / `npm run queja-reply` CLIs. Follow the RED→GREEN→wire TDD
cadence when adding the next adapter.

**Architecture**: `scripts/scrape-*.ts` fetch the raw payload → call a
pure TypeScript parser in `src/scraper/*.ts` → write a typed snapshot
to `public/data/*.json`. The SPA loads JSON at runtime via one hook per
domain (`src/hooks/useX.js`) — Vercel serves the static JSON next to
the app. Re-running any `npm run scrape:*` is idempotent;
`npm run scrape:all` walks the autonomous adapters in ~3 min.

```
# Autonomous scrapers (24):
scripts/scrape-officials.ts           →  src/scraper/corporacion.ts       →  public/data/officials.json
scripts/scrape-transparency.ts        →  src/scraper/transparency.ts      →  public/data/transparency-docs.json
scripts/scrape-ispa.ts                →  src/scraper/ispa.ts              →  public/data/ispa.json
scripts/scrape-budget.ts              →  src/scraper/budget.ts            →  public/data/budget.json
scripts/scrape-tenders.ts             →  src/scraper/tenders.ts           →  public/data/tenders.json
scripts/scrape-padron.ts              →  src/scraper/padron.ts            →  public/data/padron.json
scripts/scrape-participa.ts           →  src/scraper/participa.ts         →  public/data/participa.json
scripts/scrape-press.ts               →  src/scraper/press.ts             →  public/data/press.json
scripts/scrape-events.ts              →  src/scraper/events.ts            →  public/data/events.json
scripts/scrape-geo.ts                 →  src/scraper/geo.ts               →  public/data/geo.json
scripts/scrape-metro-network.ts       →  (inline parser)                  →  public/data/metro-network.json
scripts/scrape-fgv-gtfs.ts            →  (inline parser)                  →  public/data/metro-schedule.json
scripts/scrape-bdns.ts                →  src/scraper/bdns.ts              →  public/data/bdns.json
scripts/scrape-paro.ts                →  src/scraper/paro.ts              →  public/data/paro.json
scripts/scrape-plenos.ts              →  src/scraper/plenos.ts            →  public/data/plenos.json
scripts/scrape-pleno-agendas.ts       →  src/scraper/pleno-agenda.ts      →  public/data/plenos-agendas.json
scripts/scrape-wikidata.ts            →  src/scraper/wikidata.ts          →  public/data/wikidata.json
scripts/scrape-spain-ticker.ts        →  src/scraper/spain-ticker.ts      →  public/data/spain-ticker.json
scripts/scrape-ctbg.ts                →  src/scraper/ctbg.ts              →  public/data/ctbg.json
scripts/scrape-promise-suggestions.ts →  src/scraper/promise-inference.ts →  public/data/promise-suggestions.json
scripts/scrape-consell-cv.ts          →  src/scraper/consell-cv.ts        →  public/data/consell-cv.json
scripts/scrape-tenders-ted.ts         →  src/scraper/tenders-ted.ts       →  public/data/tenders-ted.json
scripts/scrape-boe.ts                 →  src/scraper/boe.ts               →  public/data/boe.json
scripts/scrape-bop.ts                 →  src/scraper/bop.ts               →  public/data/bop.json

# Curated (human-edited) — NEVER touched by automated scrapers:
public/data/promises.json            (schema: src/scraper/promises.ts)
public/data/quejas-responses.json    (schema: scripts/apply-queja-response.ts)
public/data/sindic.json              (schema: src/scraper/sindic.ts)
public/data/plantilla.json           (curated · cited · municipal-workforce headcount on /cargos)

# Bot-owned, exported daily by launchd agent:
public/data/quejas.json              (schema: bot/src/services/snapshot.ts)
```

### Sources of truth

| Domain | Scraper → JSON | Source | Wired surfaces |
|---|---|---|---|
| Mayor + 20 councillors + party + portfolios + photos + CV links | `corporacion.ts` → `officials.json` | Scraped HTML from `ribarroja.es/ayuntamiento/corporacion_municipal`; photos mirrored into `public/data/photos/<slug>.jpg` | `/cargos` "Corporación Municipal" section; Direction D editorial column (`AlcaldeBox` + `CoalitionRing`) |
| Municipal budget (9 income + 9 expense chapters + 6 program groups) | `budget.ts` → `budget.json` | MinHac **CONPREL** XLS, sheet "Comunitat Valenciana". Parser tries 2025→2024→2023 | `/presupuesto` (KPIs + 3 chapter charts); Direction D KPI strip |
| Contracts + tenders (730 + 449 at last snapshot, €16.5M awarded) | `tenders.ts` → `tenders.json` | **Gobierto** SQL-over-HTTP API at `ribalicita.ribarroja.es/api/v1/data/data.csv?sql=select * from {contratos,licitaciones}` — public mirror of PLACSP | `/presupuesto` (`Últimos contratos adjudicados`); Direction D editorial column (`LiveContracts`) |
| Subsidies (171 BDNS convocatorias, 153 granted by the Ayto) | `bdns.ts` → `bdns.json` | MinHac **BDNS** REST endpoint `/bdnstrans/api/convocatorias/busqueda?vpd=GE&descripcion=riba-roja`, paginated | `/presupuesto` (`Subvenciones · BDNS` card) |
| Population (1996–2025, Total / Hombres / Mujeres) | `padron.ts` → `padron.json` | **INE Tempus3** CSV table 2903 (Valencia province) | `/datos` full-width SVG chart; Direction D KPI strip (Población panel) |
| Registered unemployment (18 months 2024-09 → 2026-03) | `paro.ts` → `paro.json` | **SEPE** Muniacteco XLS feeds (3-sheet: AMBOS / HOMBRES / MUJERES); CLI walks back up to 24 months | Direction D KPI strip (Paro panel with MoM delta + 12-month sparkline) |
| Plenos (53 sessions 2023–2026) | `plenos.ts` → `plenos.json` | Scraped HTML from `ribarroja.es/plenos/<year>`, Spanish-date → ISO, kind classifier (ordinario / extraordinario / urgente / otro) | `/plenos` "Plenos recientes" card with linked titles + kind pills |
| Citizen participation (6 posts: 4 actividades + 2 encuestas) | `participa.ts` → `participa.json` | WordPress REST API at `participa.ribarroja.es/wp-json/wp/v2/posts` + `/categories` | `/plenos` "Participación ciudadana" grid; Direction D editorial column (`ParticipaBlockD`) |
| Press (multi-source · ~150 headlines from ~18 outlets + the Ayuntamiento) | `press.ts` → `press.json` | Three feeds merged with FNV fingerprint dedup: (1) Google News RSS `news.google.com/rss/search?q="Riba-roja de Túria"` covering national + regional Spanish outlets (Levante-EMV, Las Provincias, Valencia Plaza, elDiario.es, Cadena SER, Comunica GVA, …); (2) `infoturia.com/riba-roja-de-turia/feed/` — direct WordPress feed of the local comarcal paper *Periòdic del Camp de Túria*, catches stories the Google News indexer misses; (3) `ribarroja.es/es/noticias/rss.xml` — the **Ayuntamiento's OWN** Drupal news feed (primary source), stamped `official:true` + a `Sección` taxonomy by `parseOfficialNewsRss`, merged FIRST so its attribution wins on a fingerprint collision (needs a Mozilla-leading UA for the ribarroja.es WAF). Each feed has its own parser (`parseGoogleNewsRss` for the " - Pub" suffix quirk; `parseStandardRss` for plain WordPress RSS; `parseOfficialNewsRss` for the official Drupal feed + section lift); one feed failing does not block the others. | `/laboratorio` + Direction D editorial column (`PressBlockD`, with an "Oficial" badge on town-hall rows) |
| Geo (municipal boundary 484 pts + 21 neighborhoods) | `geo.ts` → `geo.json` | **OSM Overpass API** — relation 342356 stitched from outer ways + `place=neighbourhood/suburb/quarter/hamlet/village` inside the muni area | Direction D StylizedMap: dashed boundary polyline + OSM neighborhood dots/labels |
| Full Metrovalencia network (10 lines L1–L10, ~1k tracks, 215 stations) | `scrape-metro-network.ts` → `metro-network.json` | **OSM Overpass API** — every `route=subway\|tram\|light_rail` relation tagged `network=Metrovalencia`/`operator=FGV`; platform polygons filtered out. Brand colours sourced from metrovalencia.es icon SVGs | Direction D StylizedMap `FullNetwork` layer: thin coloured polylines + small station dots across the whole region, plus a line-legend pill row |
| Metrovalencia GTFS static schedule (L9 + L2 at 4 local stations) | `scrape-fgv-gtfs.ts` → `metro-schedule.json` | **MobilityDatabase mdb-1054** mirror of FGV's Google-Transit feed (FGV's own URL is inside-CDN only). Parses `calendar_dates.txt` + `stop_times.txt` + `trips.txt`; services classified by dominant day-of-week | Direction D topbar L9 chip (real next departure) + StylizedMap `GtfsSchedulePopup` (both directions per line on click) |
| Municipal facts (area 57.5 km², 125 m alt., coords, INE/OSM/GeoNames/Commons cross-refs + images) | `wikidata.ts` → `wikidata.json` | Wikidata `Special:EntityData/Q23701.json` | `/datos` `WikidataCard` above the population chart |
| Spain-wide live ticker (Luz PVPC · Gasolina 95 · Diésel · Euribor 12m · BCE MRO · IPC interanual · AEMET avisos · DGT tráfico) | `spain-ticker.ts` → `spain-ticker.json` | **REE apidatos** (`apidatos.ree.es/precios-mercados-tiempo-real`) · **Minetur Carburantes** REST (municipio `7177`) · **ECB SDMX** (`FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA` + `FM/D.U2.EUR.4F.KR.MRR_FR.LEV`) · **INE Tempus3** (serie `IPC251856`) · **AEMET** avisos HTML (`p=46`) · **DGT DATEX II v3.6** XML filtered to Valencia-area roads `A-3 / A-7 / CV-35 / V-30 / V-31 / V-11` | Direction D `LiveTicker` — Bloomberg-style auto-scrolling marquee overlaying the top-center of the map. Press headlines interleaved every 3 chips. Each chip opens a details popover with source + citation. |
| Pleno agendas (246 items, 27 departments, 30 sessions) | `pleno-agenda.ts` → `plenos-agendas.json` | Scrapes each individual session's convocatoria HTML on `ribarroja.es`, extracts the ORDEN DEL DÍA, splits into {resolutiva / informativa / ruegos}, resolves department + expediente tuples | `/plenos` — `TopDepartmentsCard` + inline "Ver orden del día" expander per session |
| Promises (16 curated) — PSOE / PP / VOX / Compromís | **human-curated** · `promises.ts` validates the schema | Hand-seeded from press citations (`press.json`) + real pleno votes + budget/tender snapshots. Every record has verbatim quote + source URL + publisher + ISO date | `/promesas`, `/` landing editorial column (`PromesasBlockD`), `/metodologia`, `/aviso-legal` |
| Promise suggestions (inference layer) | `promise-inference.ts` → `promise-suggestions.json` | Scans `press.json` + `plenos-agendas.json` for keyword matches; light Spanish stemmer; conservative enum (never `inviable`, never publishes `cumplida`/`no-ejecutada` automatically) | `/promesas` — "propuesta automática · pendiente de revisión humana" block under each card |
| Third-party fact-checks (Newtral, Maldita, EFE Verifica, AFP Factual, …) | `factcheck.ts` → `factcheck.json` | Two sources merged via `mergeFactCheckRows`: (1) Google Fact Check Tools API `factchecktools.googleapis.com/v1alpha1/claims:search` queried with `"Riba-roja de Túria"` (`languageCode=es`) — requires `GOOGLE_FACT_CHECK_API_KEY` (free tier; skipped gracefully when absent); (2) Maldita.es + Newtral RSS feeds (`parseFactcheckRss`) filtered to items mentioning Riba-roja, category-mapped onto our `ClaimVerdict` enum. The press verifier cross-references every press claim against the merged index and emits `kind:'factcheck'` evidence rows when a published fact-check matches by token overlap; sin-datos verdicts are upgraded to the fact-checker consensus. | `/laboratorio` — "Verificaciones externas" widget in the dashboard rail · per-claim corroboration row when an external fact-check matches |
| EU TED tenders (Tenders Electronic Daily, 54+ notices for Riba-roja) | `tenders-ted.ts` → `tenders-ted.json` | TED v3 API at `api.ted.europa.eu/v3/notices/search`. Free, no auth. Expert-query syntax: `buyer-name~"Riba-roja"`. Catches contracts above the EU threshold (~€143k for supplies/services in 2026), NextGenerationEU + DANA recovery spending that PLACSP publishes late or routes via national funding lines. `asTenderRow()` projects each row onto the same `TenderRow` shape the verifier uses, so `[...local.contracts, ...ted.items]` merges cleanly in the amount-based cross-ref. | `/laboratorio` — surfaces as `kind:'tender'` evidence rows on press findings whose amount + buyer-name match a TED notice. Auto-upgrades sin-datos → verificado when matched. |
| BOE (Boletín Oficial del Estado) | `boe.ts` → `boe.json` | Walks the last 30 days of the open-data sumario JSON at `boe.es/datosabiertos/api/boe/sumario/{YYYYMMDD}`. Free, no auth. Filters each item's titulo to those mentioning Riba-roja / Ribarroja. Catches convenios, expropiaciones, subvenciones nominativas, sanciones — actos administrativos PLACSP misses. Defensive parser: `epigrafe` and `item` can each be single object OR array. | `/laboratorio` — press verifier's `applyBoeCrossRef` requires the press claim to contain an acto-administrativo trigger word (ordenanza / decreto / resolución / convenio / expropiación / sanción / plan general / subvención) AND token-overlap with a BOE titulo. Sin-datos → verificado on match. `kind:'boe'` evidence row. |
| Catastro (OVC cadastre) | **curator-only** · `catastro.ts` lookup helper, no snapshot file | Wraps `ovc.catastro.meh.es/.../Consulta_DNPLOC` (by address) and `Consulta_DNPRC` (by RefCat). Free, no auth. WCF stack is brittle (returns HTML help pages on malformed queries; municipio spellings vary "RIBA-ROJA DE TURIA" / "RIBARROJA"); the helper never auto-feeds the verifier — libel discipline keeps the human in the loop. | Curator CLI `npm run lookup-catastro` (stdout-only). Used when investigating a press claim that names a specific address or RefCat. |
| Press link rot + Wayback archival index | **derived** · `audit-press-links.ts` → `press-link-rot.json` | Daily job. HEAD-checks every unique `articleUrl` in `press-claims-suggestions.json`, calls Wayback's Availability API to find an existing snapshot, optionally Save Page Now for dead/forced URLs. Writes `{articleUrl, status: alive\|dead\|error, archivedUrl, archivedAt, checkedAt, …}`. Chained nightly after `auto-curate-press`. | `/laboratorio` — each press card shows "🔗 Wayback ↗" when a snapshot exists; "Ver original" link flips to red ⚠︎ when status='dead' so curators cite the snapshot instead. |
| Press finding corrections log | **human-curated** · `correct-press-finding.ts` CLI · embedded inside `press-findings.json` | Per-correction record `{field: title\|summary\|severity, original, corrected, reason ≥20 chars, editor, correctedAt ISO}` appended to `PressFinding.corrections[]`. CLI re-validates the whole snapshot before writing — invariants like ≥10-char title / ≥40-char summary stay intact. IFCN signatory pillar #5 (open corrections policy). | `/laboratorio` — collapsible "Bitácora de correcciones" expander on each finding card with strike-through diff. |
| Pleno finding corrections log | **human-curated** · `correct-pleno-finding.ts` CLI · embedded inside `pleno-findings.json` | Same shape as press corrections. Same IFCN-compliant trail for the editorial findings auto-curated from pleno transcripts. | `/hallazgos` — collapsible "Bitácora de correcciones" expander on each `FindingDetailCard`. |
| Editorial findings as ClaimReview JSON-LD | **published** · `src/components/ClaimReviewJsonLd.jsx` | Every press + pleno finding card embeds a `<script type="application/ld+json">` payload conforming to schema.org/ClaimReview. Two builders: `_buildPayload` (press — itemReviewed.appearance points at outlets) and `_buildPlenoPayload` (pleno — itemReviewed.appearance points at the council session). Severity maps to a 1-5 reviewRating. | `/laboratorio` + `/hallazgos`. Lets Google's Rich Results Test recognise us as a fact-check publisher — same standard the Fact Check Tools API indexes (we both consume + publish). |
| CTBG resoluciones (state-level, 10,551 rows, 12 yearly sheets) | `ctbg.ts` → `ctbg.json` | MinHac **CTBG** official XLSX; parser flattens sheets + filters by orthographic variants of Riba-roja/Ribarroja de Túria with Ebro-dam disambiguation | `/quejas` `CtbgCard` — honest "0 matches" surface when nothing hits |
| Síndic de Greuges CV resoluciones (curated) | **human-curated** · `sindic.ts` schema validator | Added via `npm run sindic:add` after the Síndic publishes a resolución naming Riba-roja; JS-POST portal makes automation brittle at this scale | `/quejas` `SindicCard` with expediente/fecha/materia/sentido/resumen + PDF link |
| Quejas ciudadanas (Telegram-captured, SQLite-backed) | **bot-owned** · `bot/src/services/snapshot.ts` | Exported by `npm run export` (host-side; runs against the same SQLite the bot writes to). The bot itself runs in a long-polling Docker container locally (`bot/docker-compose.yml`) or as a launchd user agent for setups outside `~/Documents/`; payload is Open311 GeoReport v2-flavoured; only non-PII fields are published | `/quejas` feed + heatmap · `/quejas/dashboard` analytics · `/quejas/:id` detail view · `/cargos` QuejaBadge |
| Queja responses (curated, right-of-reply) | **human-curated** · `apply-queja-response.ts` validator | Added via `npm run queja-reply` after receiving an official reply via the `.github/ISSUE_TEMPLATE/queja-response.yml` form | `/quejas/:id` verbatim response card under the timeline |
| Pleno votes (curated, transcribed from actas) | **human-curated** · `pleno-votes.ts` schema validator | Added via `npm run pleno-vote` or the `.github/ISSUE_TEMPLATE/pleno-vote.yml` form ingested by `ingest-pleno-votes.yml`. Each record cites the acta URL + retrieval date; misattribution is a libel risk, so the schema enforces verbatim ≥20 char title + per-bloc tuple with duplicate-bloc detection | `/plenos` — `PlenoVotesBlock` (empty-state honest when no votes registered) |

### Hooks

Every page loads its snapshot via a small hook that does `fetch()` +
`useState` (`loading / error / data`). No data-fetching libraries are
wired (yet) — React Query / SWR can be added when we hit a real refresh
loop.

- `useOfficials` + `partyColor()`
- `useIspa` + `ispaLatest` / `formatEuros` (ISPA cargo salaries · multi-year · `/cargos`)
- `useTransparencyDocs` + `groupTransparencyDocs`
- `useBudget` + `formatEuros()` + `EXPENSE_COLORS` / `PROGRAM_COLORS`
- `useTenders` + `STATUS_LABEL` / `STATUS_TONE` + `formatDate()`
- `usePadron`
- `useParo`
- `usePlenos` + `PLENO_TONE` / `PLENO_LABEL`
- `usePlenoAgendas` + `SECTION_LABEL` / `SECTION_TONE`
- `useParticipa` + `KIND_ICON` / `KIND_LABEL`
- `useEvents` + `upcomingEvents` / `formatEventWhen`
- `usePress` + `timeAgo()`
- `useGeo`
- `useMetroNetwork` + `indexLineColors`
- `useMetroSchedule` + `findNext(slug, now)`
- `useSpainTicker` + `formatEur` / `formatPct` / `signArrow` / `citizenTone`
- `useLiveWeather` + `describeWmo`
- `useAirQuality` + `describeAqi`
- `useNextMetro` + `computeStationSchedule` / `computeOtherStationSchedule` / `findMetroStation` + `L9_STATIONS` / `OTHER_METRO_STATIONS`
- `useTodayEvents` · `useTodayPleno`
- `useBdns`
- `useWikidata`
- `usePromises` + `usePromiseSuggestions` + `isPromiseFrozen()` + `PARTY_TONE` / `STATUS_LABEL` / `STATUS_TONE` / `TOPIC_LABEL`
- `useQuejas` + `useQuejaResponses` + `STATE_LABEL` / `STATE_TONE` / `CATEGORY_LABEL` / `prettyNeighborhood` / `timeAgo`
- `usePlenoVotes` + `OUTCOME_LABEL` / `OUTCOME_TONE` / `DIRECTION_LABEL` / `DIRECTION_TONE` + `tallyByBloc()`
- `useCtbg`
- `useBop` + `formatBopDate`
- `useSindic` + `SINDIC_MATERIA_LABEL` / `SINDIC_SENTIDO_LABEL` / `SINDIC_SENTIDO_TONE`

### Nightly refresh

`.github/workflows/nightly-scrape.yml` runs `npm run scrape:all` every
day at **04:30 UTC** (06:30 Europe/Madrid summer, 05:30 winter). The job:

1. Installs deps + runs the 20 autonomous adapters in sequence,
2. Runs the vitest suite against the fresh fixtures (`continue-on-error`
   so a flaky test can't skip the data commit),
3. `git add public/data && git commit && git push` **runs even when a
   scraper failed** (`if: !cancelled()`), so the adapters that DID
   refresh always land — one broken upstream no longer freezes the whole
   site. No-op when there's no diff.
4. A final **Health gate** reds the run only on a CRITICAL scraper
   failure or a test failure (the commit already happened, so fresh data
   is saved either way),
5. `.github/workflows/deploy-vercel.yml` fires on completion via a
   `workflow_run` trigger and redeploys to Vercel **iff the run
   concluded `success`** — so a red (critical-failure) night commits its
   partial data but defers the deploy to the next green night.

**Commit-then-gate / best-effort design (do not collapse back):** the
May 2026 fix made `scrape-all.sh` exit non-zero on any failure — which
loudly surfaced breakage but, because the commit step was gated on the
scrape step succeeding, let a single flaky scraper (Overpass 429, the
decommissioned `participa.ribarroja.es`) block the commit of the ~18
healthy adapters and freeze the live site for ~25 days (discovered
2026-06-18). The fix: (a) `scrape-all.sh` classes `scrape:metro-network`
+ `scrape:participa` as **best-effort** — they still run + log + show in
the summary, but don't count toward its exit code; (b) the workflow
captures the scrape exit in `steps.scrape.outputs.rc`, commits
unconditionally, then reds the run in a trailing Health gate. Net:
best-effort flaking → green → deploys; a critical source breaking → red
→ alarm + deploy-block, with the healthy data still committed for the
next green night.

**Why the workflow_run trigger exists (do not remove):** the nightly
scrape pushes using `secrets.GITHUB_TOKEN`. GitHub deliberately does
NOT trigger downstream workflows for pushes authored by that token
(anti-loop protection), so without the `workflow_run` hook the
`chore(data): nightly real-data refresh (…)` commits would land on
`main` but never cause a Vercel deploy. The site would silently freeze
on the last human push. Verified: this happened between 2026-05-03 and
2026-05-12, fixed by commit `8917053`.

`workflow_dispatch` accepts an `adapters` input so a single pipeline
can be re-run on demand. Add new adapter names to the `case` switch
when you add the next adapter.

A second workflow `.github/workflows/pull-quejas.yml` is feature-flagged
by `vars.BOT_EXPORT_URL` — it's a no-op until a remote bot deploy
(Fly.io etc.) is wired. The local Mac setup replaces it with a daily
launchd agent; see `bot/LOCAL.md`.

## Telegram bot (`/bot/`)

Sibling Node.js package that captures quejas via Telegram, runs the
batch registrar, and exposes the Síndic/CTBG escalation pipeline. See
[`bot/README.md`](bot/README.md) for the full command list,
[`bot/LOCAL.md`](bot/LOCAL.md) for the macOS launchd setup, and
[`bot/DEPLOY.md`](bot/DEPLOY.md) for Fly.io.

Key pieces worth knowing from this file:

- **Entry:** `bot/src/index.ts`. Runs in long-polling or webhook mode
  depending on `WEBHOOK_URL`. Resilient restart loop recovers from
  transient 409 conflicts. Mounts HTTP endpoints in webhook mode
  (`/health`, `/export/quejas.json`, `/batch/current.{md,html}`,
  `/sindic/<id>.{md,html}`) bearer-auth'd by `EXPORT_TOKEN`.
- **Queja router** (`src/scraper/queja-router.ts`, shared with the
  front-end CLI `npm run route-queja`): pure function that classifies a
  queja into one of 29 categorías, matches the concejalía responsible
  by portfolio, cites the relevant LPACAP / Ley 19/2013 articles, and
  composes the 6-step escalation ladder (sede → acuse 10d → silencio
  90/30d → recurso reposición → Síndic de Greuges CV → contencioso).
- **SQLite schema** (`bot/src/db/schema.sql`): quejas + apoyos + events
  with WAL + foreign keys. Auto-emits `capturada` and `apoyada_verificada`
  (at 10 apoyos) events.
- **Silencio cron** (`bot/src/services/cron.ts`): hourly worker that
  transitions registered quejas past their LPACAP plazo to
  `silencio_negativo` and broadcasts `[SILENCIO]` to the public channel.
  Paused during LOREG freeze windows.
- **Batch registrar** (`bot/src/services/batch.ts`): `/batch` preview
  + `/batch_register` admin command. Bundles the top 10 verified quejas
  into one solicitud genérica Markdown/HTML document the moderator
  signs at `sede.ribarroja.es` with Cl@ve. All 10 inherit the shared
  asiento nº + CSV.
- **Síndic template** (`bot/src/services/sindic.ts`): `/escalar Q-XXXX`
  generates a pre-filled Queja al Síndic with hechos + solicitud + base
  legal, served at `/sindic/<id>.{md,html}`.
- **LOREG freeze** (`bot/src/services/freeze.ts`): reads the same
  `promises.json frozenUntil` field as the front-end; gates broadcasts
  AND silencio auto-transitions.

Bot-side tests: **54** (26 db + 10 batch + 9 escalation + 9 digest).
Front-end vitest suite: **995 checks across 71 files** (parser schemas +
inference engines + queja-router + sindic schema + LLM client/schemas +
journalist subsystem + hooks). `tsc --noEmit` must stay clean on both
sides.

### TDD cadence

Every new adapter lands in three commits:

1. `test: add reproducer for <adapter> (RED)` — snapshot a real payload
   into `tests/fixtures/<source>_<date>.(html|csv|xls|json)`, pin the
   parser contract via vitest; should fail because the module doesn't
   exist yet.
2. `fix: implement <adapter> (GREEN)` — minimal parser to make all
   tests pass. Keep pure; `fetch` lives only in the CLI wrapper.
3. Wire-up: `feat(<domain>): wire real <domain>` — build the CLI
   script, produce the JSON, add the hook, wire the UI, commit the
   generated `public/data/*.json` alongside the code change.

Fixtures are committed to the repo (they're the RED contract). Current
coverage: **995 front-end + 54 bot vitest checks green** (the front-end
counts grow with every adapter; treat the number in this file as a
floor, not an exact pin). Shared parser primitives live in
`src/scraper/normalize.ts` (diacritics fold, `normalizeAlphanumeric`,
`RIBA_ROJA_ALIASES`) and `src/scraper/hash.ts` (`fnv32`, `sha256Short`
— node-only; these are the STABLE IDS press/plenos/boe/tenders-ted key
their rows by, so never fork a local copy).

### No more mocks

`src/data/mockData.js` is retired and deleted — every production
surface reads real JSON. Queja capture streams come from the Telegram
bot, not a simulator.

### Legal / ethical guardrails

All 20 automated sources are public-sector / ODbL / CC-BY open data
(Transparencia Act 19/2013, datos.gob.es CC-BY 4.0, PLACSP/BDNS open
reuse clauses, OSM ODbL, Wikidata CC0, CTBG open XLSX).

### Promise tracker (sensitive subsystem)

`/promesas` is the one place where the project makes potentially
defamatory claims about named elected officials. Treat every change to
this subsystem as legally material.

**Two-file architecture — do not merge them:**

- `public/data/promises.json` is **curated, human-edited only**. The
  schema validator in `src/scraper/promises.ts` enforces at runtime
  that every record has: verbatim quote (≥20 chars), source URL +
  publisher, ISO `madeAt`, unique id, allowed party/topic/kind/status
  enums. Any status beyond the V1 safe set (`documentada` +
  `en-verificacion`) requires ≥1 dated + URL-backed evidence entry
  with its own quote — enforced by test + at write time by the admin
  CLIs.
- `public/data/promise-suggestions.json` is **machine-written** by the
  inference engine. The engine's return type excludes `inviable` at
  the type level; it never proposes `cumplida` or `no-ejecutada`;
  every record has `requiresHumanApproval: true`. Suggestions render
  in the UI as "propuesta automática · pendiente de revisión" and
  *never* substitute for the published status.

**LOREG freeze mode** (`frozenUntil: string | null` in
`promises.json`): when set and in the future, `isFrozen(snap)` returns
true. The UI enters read-only mode (`FreezeBanner` + hides the
suggestion block), and `scrape-promise-suggestions.ts` emits an empty
suggestion set with a banner referencing LOREG art. 50. Toggle only
via `npm run freeze:set -- YYYY-MM-DD` / `freeze:clear` — these CLIs
mutate *only* `frozenUntil` + `generatedAt` and re-validate the whole
snapshot before writing.

**Right-of-reply flow** is end-to-end:

- `.github/ISSUE_TEMPLATE/promise-response.yml` structured form for
  affected parties,
- "Responder como partido →" deep-link on every promise card
  (pre-fills `promise-id` + `party` fields),
- `npm run reply -- <id> <PARTY> "quote" [url publisher] [date]`
  applies an approved reply into the `response` field only and
  re-validates.

**When a future session needs to extend this subsystem**, the three
non-obvious rules are:

1. The suggestion engine never writes to `promises.json`. If you need
   to change a status based on algorithmic output, route it through
   the curator CLIs so the schema validator and git history stay
   authoritative.
2. Don't loosen the V1 status gate (`V1_STATUSES` set in
   `promises.ts`) without an explicit editorial decision — the gate
   is what keeps `no-ejecutada` / `cumplida` / `inviable` from
   shipping without evidence, which is the libel-risk boundary.
3. `/metodologia` + `/aviso-legal` are not marketing copy; they are
   the published editorial contract. Update them via PR whenever the
   tracker's behavior changes, not whenever UX copy is reworded.

### Department accountability (`/departamentos`)

`/departamentos` cross-references three legally-material streams per
concejalía: pleno votes (auditable), electoral promises (softer), and
citizen quejas (routed).

**Canonical taxonomy.** `src/scraper/departments.ts` owns the 28-slug
canonical enum. `canonicalizeDepartment(raw)` folds the three upstream
namespaces (officials portfolios, agenda raw UPPERCASE depts, queja
snake_case categories) onto one slug. `resolveResponsibleOfficial`
returns the first-matching concejal or null — the UI must render a
"sin concejal asignado" state, never fabricate one.

**Libel boundary.** Two invariants protect the dashboard:

1. An agenda item is **only** a "commitment" when a matching pleno-vote
   exists (join on `plenoId + itemNumber`). Agenda items without a
   matching vote surface as "debatido, sin voto transcrito" — never
   counted as overdue.
2. A `dueBy` on a pleno-vote requires a verbatim `dueBySource` clause
   from the acta (≥20 chars, enforced by `pleno-votes.ts` validator).
   Machine-inferred deadlines would reintroduce the exact libel risk
   the curated-file contract blocks.

Overdue flags never flip status. `V1_STATUSES` gate in `promises.ts`
still controls publishable promise statuses. The `PlazoVencidoBadge`
component is hidden entirely when `isPromiseFrozen(snap)` is true —
the overdue narrative reuses the same LOREG electoral freeze as
`/promesas`, no second freeze.

**Aggregation lives client-side.** `src/hooks/useDepartmentStats.js`
reads the 5 snapshots and memoizes via `src/lib/department-stats.js`
(pure fn, unit-tested). For the landing-page LiveTicker chip, a
single `plazosVencidosCount` scalar is precomputed at build time by
`scripts/compute-dept-stats.ts` and written to
`plenos-agendas.json.stats` — the landing route reads one number,
not five JSONs.

**Sources and curation paths:**

- `pleno-votes.json` (curated) — `npm run pleno-vote` CLI / GH Issue
  `pleno-vote.yml` — now accepts `dueBy` + `dueBySource` optionally.
- `plenos-agendas.json` (scraped) — `npm run scrape:pleno-agendas`
  now attaches `departmentSlug` at parse time.
- `promises.json` (curated) — hand-edited PRs; optional `dueBy` +
  `departmentSlug` fields, neither required on existing records.

### Claim verification (`/plenos`, sensitive subsystem)

The claim-verification pipeline is the third legally-material surface
after `/promesas` and the plazos-vencidos flag. It takes spoken
declarations in the pleno video transcript and cross-references them
against the municipal open-data trail. Three schema files own the
contract:

- `src/scraper/pleno-claim.ts` — **machine-written** extraction schema
  (`ClaimType` ∈ promesa/afirmacion_numerica/cita_obra/cita_convenio/
  acusacion_publica + `accusationSubtype` ∈ factual/contra-datos/
  opinativa). Every record carries `requiresHumanApproval:true`.
  **Primary attribution is bloc-level** (`speakerGroup`) — that is the
  libel-safe field surfaced on `/declaraciones` and `/hallazgos`.
  An optional **secondary `speakerSlug`** is populated only when the
  transcript line carries a high-tier voice-id named tag (placed by
  `scripts/identify-pleno-speakers.ts --apply`) AND the slug exists in
  `officials.json` AND the official's party agrees with `speakerGroup`.
  Inconsistent slugs are stripped to null at write time. Even when set,
  `speakerSlug` is editorial signal only — no published surface names
  the individual until a curator promotes it via `promote-claim`.
- `src/scraper/claim-verifier.ts` — **pure, deterministic** verifier.
  No LLM, no network. Takes `{claim, tenders, bdns, budget, promises,
  priorClaims}` → `ClaimVerdict` ∈ verificado/parcial/contradicho/
  sin-datos/promesa-repetida + `evidence[]` citations. `opinativa`
  accusations are hard-skipped with sin-datos regardless of nearby
  evidence (policy, not heuristic).
- `src/scraper/pleno-finding.ts` — **human-curated** editorial surface
  (mirrors `promises.json`'s legal-contract role). A finding wraps ≥1
  claim with a curator's title (≥10 chars) + summary (≥40 chars) + the
  corroboration/contradiction refs. Severity `critical` requires ≥1
  evidence ref (no pure-assertion criticals). Right-of-reply built in.

Output files (do not mix their contracts):
- `public/data/pleno-claims-suggestions.json` — machine-written, every
  record flagged `requiresHumanApproval:true`. Regenerated by
  `npm run extract:pleno-claims`.
- `public/data/pleno-claims-verified.json` — machine-written,
  deterministic verdict + evidence zipped onto each claim. Regenerated
  by `npm run verify:pleno-claims`.
- `public/data/pleno-findings.json` — **curator-only**. Mutations via
  `npm run promote-claim -- <claimId> …`, `npm run finding-reply -- …`,
  or hand-edited PR. Each CLI re-validates the whole snapshot before
  writing.

Right-of-reply wiring (same contract as the promise right-of-reply):
- `.github/ISSUE_TEMPLATE/finding-response.yml` — structured GH Issue
  form. Accepts finding-id (pre-filled via the "Responder como grupo
  afectado" link on the finding card), party, verbatim quote ≥20 chars,
  optional source URL.
- `.github/workflows/ingest-finding-responses.yml` — fires on label
  `derecho-replica`. Extracts the fields, calls `npm run finding-reply`,
  commits the updated `pleno-findings.json`, closes the issue with a
  permalink. Public git history remains the sole audit trail.
- `scripts/apply-finding-response.ts` — validator-fronted CLI invoked
  by the workflow (and callable directly by curators). Bails if the
  verbatim clause is <20 chars or the finding id doesn't exist.

Libel rules applicable when editing this subsystem:

1. The LLM prompt in `src/llm/prompts.ts` (version bumped on every
   change) explicitly forbids naming individuals in the `speakerGroup`
   field — enum-gated to blocs or null.
2. The verifier's `opinativa` short-circuit is policy, not heuristic:
   do not loosen it to sneak opinion claims into `verificado`.
3. Finding severity `critical` without evidence is rejected by
   `validateFindingsSnapshot`. Keep that invariant.
4. `speakerSlug` (individual attribution from voice-id) MUST come from
   a transcript line that already carries a `(Full Name)` tag — never
   inferred from prose. The prompt forbids that explicitly; the
   write-time guard in `pleno-claim-llm.ts` strips slugs that aren't
   in the enrolled-speakers set or whose party disagrees with
   `speakerGroup`. `/metodologia` references both layers.
5. `/metodologia#verificacion-declaraciones` is the published
   editorial contract. Update it via PR whenever this pipeline's
   behavior changes.

### Journalist agent (`/laboratorio/agentes`, sensitive subsystem)

The journalist agent is the first iterative-LLM subsystem in the repo.
It accepts an investigative assignment (kickoff: a public-record
biography of alcalde Robert Raga, slug `robert-raga-gadea`) and emits a
machine-drafted report that a curator promotes before publication.

Files (mirror the promises → claims → findings 3-layer contract):

- `public/data/journalist-assignments.json` — curator-seeded via
  `npm run journalist:assign`. Status: `pending → running → drafted →
  promoted | failed`.
- `public/data/journalist-reports-suggestions.json` —
  **machine-written**, every record carries `requiresHumanApproval:true`.
  **Never rendered on a public page.** Visible only on the `/curator`
  preview surface.
- `public/data/journalist-reports.json` — **curator-promoted**, what
  the SPA renders. The validator strips `requiresHumanApproval` and
  refuses to accept it on this shape.

Architecture:

  Each of the three big modules below was decomposed (May 2026) into a directory
  behind a thin **barrel** of the same name — every `import … from
  '…/scraper/journalist*'` keeps resolving unchanged, and the barrels re-export
  only the original public surface.
- Schemas + validators: `src/scraper/journalist.ts` — barrel over
  `journalist/{types,core,sections,validators}.ts` (vanilla TS, mirrors
  `pleno-finding.ts` discipline — `must()` invariants, snapshot-wide
  re-validation on every write). `journalist/validators.ts` owns the single
  `isHighSensitivity()` libel predicate shared by the validator and
  `computeLegalSensitivity` (no drift).
- Tools: `src/scraper/journalist-tools.ts` — barrel over
  `journalist-tools/{internal,local,web,gazette,bio-extract,citations}.ts`
  (pure functions — `searchLocalSnapshots`, `fetchOfficialBySlug`,
  `fetchPressForSubject`, `fetchWikidata`, `fetchWikipedia`, `fetchUrl`,
  `webSearch` Exa, `audit` with Wayback). Network results cached at
  `.research-cache/<sha256>.json` (the `internal` module).
- 4-stage pipeline: `src/scraper/journalist-agent.ts` — the orchestrator
  (helpers + section builders extracted to `journalist-agent/{shared,builders}.ts`)
  — `runJournalistAgent`:
  1. **Plan** (LLM, `JOURNALIST_PLAN_VERSION`) — emits 4–8 research questions, each tagged with a tool.
  2. **Research** (deterministic Node) — dispatches each question through the tools; accumulates `SourceCitation[]` + parallel `evidence[]` rows.
  3. **Synth** (LLM, `JOURNALIST_SYNTH_VERSION`) — projects the evidence into a draft skeleton (portrait, narratives, timeline, relationships, sparkline, promise-board, quote-cards).
  4. **Verify** (LLM, `JOURNALIST_VERIFY_VERSION`) — re-reads the draft + sources, escalates `legalSensitivity`, appends warnings.
- LLM I/O via the existing `callLLM` infra (cache, telemetry, backend
  fallback chain). Token budget per assignment: `JOURNALIST_TOKEN_BUDGET`
  (default 200K).
- Right-of-reply: `.github/ISSUE_TEMPLATE/journalist-report-response.yml`
  + `.github/workflows/ingest-journalist-responses.yml` — fires when an
  issue gains BOTH labels `derecho-replica` AND `periodista`, parses the
  form, calls `npm run journalist-reply`, commits, closes the issue.

Curator CLIs (`scripts/`):

```bash
npm run journalist:assign -- --id a-robert-raga-bio --kind biography \
    --subject-slug robert-raga-gadea --subject-name "Robert Raga Gadea" \
    --subject-kind official --brief "<≥40 chars>"

EXA_API_KEY=… npm run journalist:run -- a-robert-raga-bio \
    [--token-budget N] [--dry-run] [--stop-after plan|research|synth|verify]

npm run promote-report -- a-robert-raga-bio \
    [--curator "<name>"] [--curator-notes "<text>"] \
    [--ack-legal-review]      # required when draft.legalSensitivity = 'high'
    [--edit]                  # write to /tmp instead of persisting

npm run correct-journalist-report -- <reportId> \
    --field <narrative.<heading>.bodyMarkdown | narrative.<heading>.heading | quote.<index>.attributedTo> \
    --new "<text>" --reason "<≥20 chars>" --editor "<name>"

npm run journalist-reply -- <reportId> <PSOE|PP|VOX|Compromís|Ciudadanos|Otro|person> \
    "<verbatim ≥20 chars>" [sourceUrl] [YYYY-MM-DD]
```

**Libel rules — non-negotiable, encoded in code:**

1. **`legalSensitivity:'high'` blocks `promote-report` without
   `--ack-legal-review`.** Auto-stamped by `computeLegalSensitivity()` +
   schema validator whenever a `SourceCitation.excerpt`/`title` or a
   `warnings[]` row matches `JUDICIAL_TOKENS` regex set (`PA \d+/\d+`,
   `Sentencia`, `recurso contencioso-administrativo`, `querella`,
   `demanda penal`, `imputad[oa]`, `investigad[oa]`).
2. **The published-report shape forbids `requiresHumanApproval`.** The
   curator promotion step strips it; the validator rejects on its
   presence — defence in depth.
3. **Every narrative + every relationship edge must cite ≥1 known
   `sourceId`.** Unsupported prose is dropped at section-build time;
   schema rejects orphan refs.
4. **The agent's prompts** in `src/llm/prompts.ts` explicitly forbid
   inventing facts about living persons, paraphrasing court rulings
   without a verbatim docket cite, or drawing causal lines between
   officials and contractors without evidence.
5. **LOREG freeze** (`isJournalistFrozen`) halts both `journalist:run`
   and `promote-report` — same gate as `auto-curate-findings.ts`.
6. **Corrections log is mandatory** (`corrections: []` on every
   published row); the CLI is the only path that mutates a published
   report.

**Web-search backend (Stage 2):** the agent's `web-search` tool prefers a
self-hosted **SearXNG** instance over the paid Exa REST API. Bootstrap
once with `npm run searxng:up` (requires Docker; compose file at
`scripts/searxng/docker-compose.yml`), then set
`SEARXNG_URL=http://localhost:8888` in `.env`. The dispatcher in
`src/scraper/journalist-tools.ts::webSearch()` picks SearXNG first, falls
back to Exa only when `SEARXNG_URL` is unset AND `EXA_API_KEY` is set,
and otherwise returns an empty result set with a helpful error so the
agent silently skips open-web queries and relies on local snapshots +
Wikidata + Wikipedia.

**Phase A→D — soul.md dossier & editorial-longform UI (May 2026):**

- **New research tools** (`src/scraper/journalist-tools.ts`):
  `fetchPdfUrl` (pdf-parse v1), `fetchUrlHeadless` (Playwright SPA renderer
  with hostname allowlist), `fetchBoeForSubject`, `fetchDogvForSubject`,
  `fetchDialnet`, `fetchHemerotecaQuery`, `extractBioEntities` (Spanish
  regex for DOB/birthplace/degrees/career/judicial refs).
- **10 new ReportSection kinds** (`src/scraper/journalist.ts`):
  `identity`, `education`, `career-political`, `career-professional`,
  `legal-record`, `financial`, `online-presence`, `awards`, `publications`,
  `gaps-detected`. Schema validators enforce three new libel rules:
  legal-record auto-bumps `legalSensitivity:'high'`; family rows with
  names require all-`trust:'high'` citations; financial rows must cite
  hosts on `FINANCIAL_SOURCE_ALLOW` (transparentia.newtral.es, boe.es,
  dogv.gva.es).
- **New Stage 2c (bio-extract)** (`src/scraper/journalist-agent.ts`):
  LLM call between research and synth that distills fetched bodies +
  regex hints into a `JournalistBioResponse` the agent projects into
  the new section kinds. Falls back to regex-only when the LLM fails.
  Always emits `gaps-detected` for biography/profile assignments.
- **soul.md exporter** (`src/scraper/journalist-soul-export.ts` +
  `scripts/journalist-export-soul.ts`):
  deterministic `JournalistReport → markdown` with footnote-cited
  sources, written to `public/data/souls/<slug>.md`. CLI:
  `npm run journalist:export-soul -- <assignmentId>`.
- **UI redesign** (`src/pages/AgenteReporte.jsx` +
  `src/components/journalist/index.jsx` — a barrel over
  `journalist/{Citations,HeroBand,Navigation,Sections,SourceLedger}.jsx` +
  the `ReportSectionRenderer` dispatcher): editorial-longform 3-col grid
  (hero band + sticky TOC + main content + sticky facts sidebar +
  full-width sortable source ledger). Citation pills carry hover
  popovers. Relationship graph zoom-modal. Mobile collapses to one
  column. Typography tokens in `src/index.css`
  (`--type-display`, `--type-h2`, etc.).
- **Prompts** (`src/llm/prompts.ts`): synth v2; **plan v3** — the planner
  knows `pdf-fetch / headless-fetch / boe-search / dogv-search /
  dialnet-search / hemeroteca-search`, AND those six are now present in the
  `JournalistPlanQuestion.suggestedTool` Zod enum (`src/llm/schemas.ts`), so
  validated plan output can actually request them (until May 2026 they were
  advertised but the schema rejected them — they were unreachable). The plan
  prompt also states `officials/press/plenoclaims/promises` are pre-seeded
  and must not be requested; the research dispatch treats them as explicit
  no-ops and `warns` on any genuinely-unhandled tool kind instead of dropping
  it silently. A planner-requested URL that fetches nothing now appends a
  `warnings[]` row (it used to be dropped silently).
- **PDF auto-routing:** `fetchTopUrls` detects URLs whose pathname ends
  in `.pdf` (case-insensitive, query/fragment stripped) via the local
  `looksLikePdf()` helper and routes them through `fetchPdfUrl`
  (pdf-parse) instead of `fetchUrl` (HTML). Validated against the PSOE
  flyer: same URL now returns 871 chars of clean text, which the regex
  extractor parses into DOB `1966-04-09`, birthplace `RIBA-ROJA DE
  TÚRIA`, 4 degrees, 4 career spans. The bio-extract LLM stage receives
  the same body, so subsequent biography drafts populate
  identity/education/career-professional from PDFs the agent finds via
  the year-binned web sweep.

Update `/metodologia` whenever this pipeline's behavior changes —
that page is the published editorial contract.

Councillor photos are re-hosted from the Ayuntamiento's own publication.
Keep scrapers polite: every CLI sends a `User-Agent` identifying the
project; never run them in a tight loop; cache raw payloads locally
first when iterating. Any PII concerns (e.g. citizen complaints in
Sprint 5 onwards) should be aggregated to neighborhood level before
landing in `public/data/*`.

## Cmd+K / shortcuts

Cmd/Ctrl+K anywhere opens the spotlight in `components/CmdK.jsx`. It
indexes `NAV` + real `useOfficials()` + the three most recent
`usePromises()` items + action stubs. Navigation uses
`react-router`'s `useNavigate`.

## Product context

Spain-based civic monitor targeting Riba-roja de Túria (pop. ~24,600,
Comunitat Valenciana). Bilingual UI via `src/i18n.jsx` — Castilian Spanish
(default) and Valencià (standard AVL/GVA spelling). Only **chrome strings**
(nav, topbar, page headings, empty states, tweaks panel) are translated;
**data content** (press headlines, acta titles, official names, promise
quotes, legal citations) stays in the source language to preserve verbatim
accuracy. The toggle lives in the TweaksPanel, persists to
`localStorage['cp:lang']`, and updates `<html lang>` for a11y. Target personas: engaged citizen (default), journalist,
municipal official, activist. The MVP runs locally via launchd
(bot/LOCAL.md) with all data committed to git; `docs/QUEJAS_DESIGN.md`
is the full architectural rationale for the Telegram-first Quejas OS.
