# CivicPulse — next-horizon improvements roadmap

## Context

The app has everything an MVP dashboard needs: 16 real-data adapters, 272 vitest + 21 Playwright tests, WCAG AA, bilingual UI, the full LLM advisory layer (Phase 0–3 shipped this session), and a working Whisper transcription pipeline. But it has **zero real citizen complaints flowing**, the Telegram bot is in dev mode (BOT_TOKEN set, CHANNEL_ID + ADMIN_USER_IDS missing), only 1 pleno has been transcribed, and the LLM engines have produced 0 public outputs (correctly — the single transcript was noisy and the safety gate fired).

At this stage, *features are not the bottleneck*. Citizen utility is. The roadmap below is the shortest path from "beautiful dashboard of public data" to "working accountability tool that actual Riba-roja vecinos use." Three themes, then deferred work. Every item has clear acceptance criteria.

---

## Status (2026-04 update)

The roadmap below was authored when the dashboard was a green-field MVP. Since then most P1–P2 items shipped (sometimes through different files than originally planned) and a substantial new subsystem — voice-id — was added that didn't exist at write time. Current state by theme:

**P1 — SIGNAL · mostly shipped**
- 1.1 LOPD/GDPR hardening — ✅ shipped. `bot/src/commands/olvidar.ts`, `deleted_at` column, AvisoLegal RGPD card. Extended in 2026-04 with a git-history rewrite clause (Art. 17) covering the inmutable-cadena-de-custodia case. Bot still local-launchd; Fly.io deferred to public-launch phase.
- 1.2 Batch transcription — ✅ shipped. `scripts/transcribe-pleno-batch.sh` walks pleno-videos.json with `--refine` / `--refine-apply` flags + WHISPER_DENOISE / WHISPER_DIARIZE / WHISPER_IDENTIFY env-gated stages.
- 1.3 Transcripts as promise corpus — partial. The LLM extractor (`extract:pleno-claims`) consumes transcripts directly to produce `pleno-claims-suggestions.json` + verifier output rather than feeding promise-llm-inference. The end-to-end editorial flow (claim → verifier verdict → curator finding → /hallazgos) replaces the original "transcripts feed promise evidence" plan.

**P2 — DISTRIBUTE · partial**
- 2.1 `/cambios` page — ✅ shipped (route mounted in `src/App.jsx`).
- 2.2–2.4 — not shipped; deprioritised in favour of curator-side editorial tooling.

**P3 — HARDEN · ESLint/Prettier shipped, observability + JS type-check deferred.**

**New since this roadmap was written (2026-04)**
- **Voice-ID pipeline.** Per-councillor ECAPA-TDNN voiceprints + pyannote diarization + identification matcher + curator review surface. Crosses the libel boundary cleanly: bloc attribution remains primary, individual `speakerSlug` is editorial signal, individualSpeaker on `/hallazgos` requires explicit curator promotion via `promote-claim --individual-speaker`. Endpoints + dashboard at `/curator → Voice ID enrollment` / `→ Voice ID assignments`. Audio playback per cluster, encrypted backup script, 8s ffmpeg-streamed snippets. Bootstrap helper, batch enrollment, A/B measurement runner. Documented in CLAUDE.md §Voice-ID.
- **Claim-extraction subsystem.** `src/scraper/pleno-claim.ts` + `claim-verifier.ts` + `pleno-finding.ts`. Auto-curate weekly via launchd. LOREG freeze + V1-status gates enforced in CLI.
- **Pleno-claims chunking.** Monolith hit 7 MB; split into per-pleno chunks at `public/data/pleno-claims/<plenoId>.json` + 8 KB manifest. SPA hook fetches in parallel; CLIs keep using monolith.
- **Privacy cleanup.** Public GitHub links removed from every public-facing surface (right-of-reply CTAs route to `/aviso-legal` instead). Repo stays private until public-launch phase.

**Net assessment.** The core editorial loop (transcript → extraction → verification → curated finding → right-of-reply) is shipped end-to-end and exercised on real plenos. The two remaining gates before public-launch are (a) Fly.io migration of the bot (deferred deliberately) and (b) cross-bloc voiceprint enrollment (needs human-supplied URLs).

---

## P1 · SIGNAL — unblock real data flowing through the pipe

### 1.1 Bot activation with LOPD/GDPR hardening — **BLOCKING**
The bot captures PII (names, direcciones, matrículas in queja descriptions). Before any real `/queja` from a citizen, we need a data-retention policy, a deletion endpoint, and a privacy notice. Then wire `CHANNEL_ID` + `ADMIN_USER_IDS` and kick the launchd agent.

**Files:**
- `bot/src/commands/start.ts` — append privacy notice to welcome copy ("Al presentar una queja, aceptas la política de privacidad en civicpulse-virid.vercel.app/aviso-legal")
- `bot/src/commands/olvidar.ts` (new) — `/olvidar <ticket-id>` command that deletes the queja from SQLite + emits an `anonymised` event so the next export drops the record
- `bot/src/db/schema.sql` — add `deleted_at` TIMESTAMP column; snapshot writer (`bot/src/services/snapshot.ts`) skips deleted rows
- `src/pages/AvisoLegal.jsx` — new LOPD section: retention (5 years per Art. 55 LOPD-GDD for public-interest processing, but citizen-initiated deletion always honoured), base jurídica (Art. 6.1.e RGPD — misión en interés público), right-to-deletion procedure
- `bot/.env` — add real `CHANNEL_ID` + `ADMIN_USER_IDS` (operator step)
- `bot/LOCAL.md` (**missing file, referenced in CLAUDE.md:236**) — document launchd plist template + setup order

**Reuses:** existing `bot/src/services/snapshot.ts` snapshot pattern; existing `src/pages/AvisoLegal.jsx` structure.

**Verify:** `/queja` from a test user lands in `quejas.json` snapshot within 24h; `/olvidar <id>` removes it from the next export; launchctl print shows state=running without crash-loop in `bot/data/logs/`.

### 1.2 Batch transcription script
Currently transcription is one-video-at-a-time and manual. 22 pleno videos exist on YouTube beyond the one we've done. Transcribing them unlocks Phase 2 promise-corpus (1.3) and eventually the live-acta fact-checker (deferred).

**Files:**
- `scripts/transcribe-pleno-batch.sh` (new) — walks `public/data/pleno-videos.json` items; for each without a cached transcript under `public/data/pleno-transcripts/`, runs `transcribe-pleno.sh`. Accepts `--limit N` to cap per-run. Serializes runs so Whisper doesn't OOM.
- `package.json` — add `"transcribe:batch": "bash scripts/transcribe-pleno-batch.sh"`
- `.github/workflows/nightly-scrape.yml` — **do not** add to the cron; transcription is CPU-heavy (~1h per 1h of audio) and runs locally on your Mac only.

**Reuses:** existing `scripts/transcribe-pleno.sh` with its live-stream guard; existing `is_live` rejection logic.

**Verify:** `npm run transcribe:batch -- --limit 3` produces 3 new `.txt` files under `public/data/pleno-transcripts/` and skips any already present.

### 1.3 Transcripts as promise corpus
Every Whisper transcript becomes a new evidence source for Phase 2's `minePromiseEvidence`. Councillors making in-chamber commitments ("vamos a construir un refugio climático en 2026") become evidence candidates for `/promesas`. **Speakers are NOT attributed** — LLM emits timecode citations only. Attribution would be defamation-adjacent given Whisper's ~10% WER on proper nouns.

**Files:**
- `scripts/scrape-promise-suggestions.ts` — add a new corpus entry `{ corpus: 'pleno_transcript', documents: [...] }` built from `public/data/pleno-transcripts/*.txt`. Each document = one pleno; text = entire transcript; url = YouTube watch URL from `pleno-videos.json`; date = `plenoDate`.
- `src/llm/schemas.ts` — extend `PromiseEvidenceKind` enum to include `'pleno_transcript'`
- `src/llm/prompts.ts` — update `buildPromiseEvidenceSystemPrompt` footer: "When citing pleno_transcript, quote the verbatim timestamped segment (e.g. '[1253.4 → 1258.1] …') and NEVER name the speaker — the model should only say 'un edil', 'un representante'."
- `src/pages/Promesas.jsx` — LlmEvidence rendering already handles generic corpora; add a `transcript` icon/tone variant for clarity

**Reuses:** existing `src/llm/retriever.ts` BM25 shortlist; existing `src/scraper/promise-llm-inference.ts` URL allowlist guard (extend the allowlist to include transcript URLs).

**Verify:** after 5+ transcripts exist, run `npm run scrape:promise-suggestions -- --llm` — at least one promise should gain an `pleno_transcript` evidence entry. The citation must contain a `[HH.H → HH.H]` pattern and no proper noun attribution.

---

## P2 · DISTRIBUTE — reach the actual audience

### 2.1 `/cambios` delta-digest page
Screenshot-shareable weekly summary of what changed — new acuerdos, new quejas (approved only), new tenders, new pleno sessions. This is the WhatsApp-native unit of distribution in small-town Spain. One page, one URL, linkable.

**Files:**
- `src/pages/Cambios.jsx` (new) — renders a card-per-category list of changes in the past 7 days. Each card has a canonical URL (`/quejas/:id`, `/plenos/:id`, etc.) + a WhatsApp share button (`wa.me/?text=...&url=...`).
- `scripts/compute-cambios.ts` (new) — produces `public/data/cambios.json` by diffing current `public/data/*.json` against last week's snapshot (git-blame–style). Runs nightly via `nightly-scrape.yml`.
- `src/hooks/useCambios.js` (new) — standard fetch hook
- `src/App.jsx` — add `/cambios` route + `NAV` entry

**Reuses:** existing fetch-hook pattern (`src/hooks/useQuejas.js` etc.); existing `Card` component; existing `i18n.jsx` for ES/CA toggle.

**Verify:** `npm run build` ships `/cambios`; curl home + `/cambios` both return 200; the page shows at least 3 distinct change-types (quejas, plenos, tenders).

### 2.2 Telegram weekly digest subscription
`/subscribe barrio La Reva` or `/subscribe concejalia Urbanismo` — bot persists the preference, cron emits a weekly DM every Monday morning with matching deltas from `/cambios`. **Skip RSS and email entirely** — Riba-roja distribution happens on WhatsApp + Telegram, not Outlook.

**Files:**
- `bot/src/commands/subscribe.ts` (new) — parses the filter (`barrio|concejalia|categoria` + value), stores in new `subscriptions` table
- `bot/src/db/schema.sql` — add `subscriptions(user_id, filter_kind, filter_value, created_at)` table
- `bot/src/services/digest.ts` (new) — Monday 09:00 cron: for each subscription, query `cambios.json` server-side, emit formatted DM
- `bot/src/services/cron.ts` — wire the digest cron alongside the existing silencio cron
- `bot/src/commands/start.ts` — mention `/subscribe` in the welcome message

**Reuses:** existing grammy Bot + cron pattern (`bot/src/services/cron.ts`); existing admin-user check pattern (`bot/src/commands/batch.ts`).

**Verify:** admin user subscribes, waits for Monday (or manually calls the digest function), receives a Telegram DM with ≥1 matching delta.

### 2.3 WhatsApp share deeplinks
Zero-friction share on every queja/pleno/tender card. One-line CTA. Transforms cards into one-tap-shareable units.

**Files:**
- `src/components/Primitives.jsx` — add a `ShareWA` component wrapping the `wa.me/?text=...` pattern with URL-encode
- `src/pages/Quejas.jsx` / `QuejaDetail.jsx` / `Plenos.jsx` / `Presupuesto.jsx` — add `<ShareWA>` button to each feed card

**Reuses:** existing `Primitives.jsx` Pill/Card patterns.

**Verify:** click on a queja card's WhatsApp button → opens `wa.me/?text=...` with pre-filled summary + canonical URL.

### 2.4 Onboarding funnel
Zero users = zero value. A week of distribution work beats a month of feature work at this stage.

**Files:**
- `src/variants/DirectionD.jsx` landing — add a 30-second Loom embed + "Denuncia un bache en 10 segundos" CTA → t.me/munigraph_bot
- `public/poster.pdf` (new) — A4 poster with QR to the bot + Spanish call-to-action (design in docs/POSTER_BRIEF.md)
- `docs/OUTREACH.md` (new) — kit doc for 5 target associations: AAVV (asociación de vecinos), AMPA (padres y madres del cole), comerciantes, coro municipal, club de fútbol. Each entry: contact, pitch, expected first-week activation number.

**Reuses:** existing landing (`DirectionD.jsx`) and its editorial structure.

**Verify:** operator (you) presents to 1 association and gets ≥5 citizens using `/queja` within 2 weeks.

---

## P3 · HARDEN — quality + legal gates

### 3.1 Lightweight observability (skip pino)
Bot crashes are currently silent. `console.log` with a serialised context object is 20 lines of code; pino is overkill for a single-process Node app.

**Files:**
- `bot/src/util/log.ts` (new) — 30-line helper: `log(level, event, context)` → `console.log(JSON.stringify({ ts, level, event, ...context }))`; add an `/health` HTTP endpoint (returns `{status:'ok', uptime, db:'ok'}`)
- `bot/src/index.ts` — replace all `console.log('[...]')` calls with `log('info', ...)`; mount /health on Fastify/Express; wrap the grammy error handler in `log('error', ...)`
- **Operator step:** register the `/health` URL with uptime-kuma (`https://uptime.kuma.pet`) or uptimerobot.com free tier so silent crashes page you

**Reuses:** none — this is new infra. Keep it minimal.

**Verify:** `curl localhost:3000/health` returns 200; killing the bot process triggers an uptime-kuma notification within 5 minutes.

### 3.2 JS type-check lane (no TS migration)
Adding `tsc --noEmit` to a JSX codebase without a TS migration is a multi-week rabbit hole. Skip it. Instead: `jsconfig.json` with `"checkJs": true` + `// @ts-check` comment on critical files. Same benefit, zero migration.

**Files:**
- `jsconfig.json` (new) — `{ "compilerOptions": { "checkJs": true, "noImplicitAny": false, "strict": false, "allowJs": true, "jsx": "react-jsx", "module": "esnext", "target": "es2022" }, "include": ["src/**/*"] }`
- `src/hooks/*.js` (all) — add `// @ts-check` to the top of each
- `.vscode/settings.json` — `{ "js/ts.implicitProjectConfig.checkJs": true }`
- **Do NOT** add `tsc` to CI unless someone's willing to shepherd a full migration; fix only what the editor flags red.

**Verify:** open `src/hooks/useOfficials.js` in VS Code — inline type errors appear; editing code with a type mismatch gets underlined.

### 3.3 ESLint + Prettier + husky pre-commit
Lowest-effort, highest-leverage quality gate. Stops future regressions cheaply.

**Files:**
- `eslint.config.js` (new, flat config) — starter rules: `@eslint/js` + `eslint-plugin-react-hooks` + `eslint-plugin-react` recommended; one override to allow `_` prefix for intentionally-unused args
- `.prettierrc.json` (new) — `{ "semi": false, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }` (matches existing style)
- `package.json` — scripts: `"lint": "eslint src scripts bot/src"`, `"format": "prettier -w src scripts bot/src"`; devDeps: eslint, prettier, husky
- `.husky/pre-commit` — `npm run lint -- --quiet && npm test -- --run`
- `.github/workflows/e2e.yml` — add `- run: npm run lint` before the test step

**Reuses:** existing `npm test` script.

**Verify:** `npm run lint` exits 0 on the current codebase; breaking a rule (`let x = 1` in a React component) fails pre-commit.

### 3.4 Docs cleanup
Two doc files contradict the shipped stack. The referenced-but-missing `bot/LOCAL.md` is operator-blocking.

**Files:**
- `docs/ARCHIVE/first_description.md` (move from root) — archive the pre-shipped Python/Postgres mindmap
- `bot/LOCAL.md` (new) — launchd plist template (`com.civicpulse.munigraph.bot` + `.export`), macOS permission dialog order, log-tailing commands, kickstart/stop/reload commands, where BOT_TOKEN + CHANNEL_ID + ADMIN_USER_IDS go
- `docs/REAL_DATA_MVP_PLAN.md` — bump the status line from "shipped + expanded" to "closed · superseded by this roadmap"
- `docs/ROADMAP.md` (new) — public-facing short version of this plan with only P1–P3 headings, linking back to commit history

**Verify:** `bot/LOCAL.md` exists; running its commands from scratch on a fresh Mac boots the bot in ≤10 minutes.

---

## Deferred — not in this plan

- **Bot to Fly.io.** Production-grade deployment of the Telegram bot is parked until public-launch readiness. `bot/DEPLOY.md` carries the playbook; meanwhile the laptop launchd setup (`bot/LOCAL.md`) covers all dev + curator-controlled use.
- **Cross-bloc voiceprint enrollment.** Three PSOE councillors enrolled (alcalde + 2 concejales). Cross-party validation (≥1 PP, VOX, Compromís) needs human-supplied audio URLs. `npm run enroll-voices-batch -- --file enrollments.json` is wired and waiting.
- **Lazy-loaded pleno-claims chunks.** Today's hook fetches all chunks in parallel via the manifest. A future iteration could load only the most-recent N plenos by default and lazy-load older ones as the user paginates `/declaraciones` past loaded plenos. Manifest already carries the metadata to drive this without a schema change.
- **Live acta fact-checker** (transcript vs agenda diff). Needs ≥10 clean transcripts so the failure mode is "nothing surfaces" not "we accused the alcalde of skipping an agenda item." Revisit after 1.2 lands volume.
- **Cross-pleno semantic search + vector DB** (LanceDB or Postgres+pgvector). At ribarroja scale (≤50 sessions × ~1k segments ≈ 50k chunks, single-user queries, static data), BM25 + LLM reranker is 90% as good with zero ops. Revisit when corpus >500k chunks OR we onboard a second municipality.
- **Official acta PDF parser**. Actas lag sessions 2-6 weeks. Low urgency — we already have the Whisper transcript ahead of the official acta.
- **Candidate-promise tracking pre-election**. Useful but out-of-cycle until the next municipal elections (2027).

---

## Critical files index

- LLM infra to reuse: `src/llm/{client,schemas,prompts,retriever}.ts`, `src/llm/queja-to-cpv.ts`
- Existing inference engines: `src/scraper/{promise-inference,promise-llm-inference,pleno-vote-inference,pleno-vote-llm,tender-queja-correlator}.ts`
- Suggestion file pattern (template): `public/data/{promise-suggestions,pleno-votes-suggestions,tender-queja-correlations}.json`
- Bot infra: `bot/src/index.ts`, `bot/src/commands/*.ts`, `bot/src/services/{cron,snapshot,batch,escalation}.ts`
- UI shell: `src/App.jsx`, `src/components/{Sidebar,Topbar,TweaksPanel,Primitives}.jsx`
- Editorial doc: `src/pages/AvisoLegal.jsx`

## Verification summary (end-to-end smoke)

```bash
# P1
launchctl print gui/$(id -u)/com.civicpulse.munigraph.bot | grep -q 'broadcasting to @'
npm run transcribe:batch -- --limit 2
ls public/data/pleno-transcripts/ | wc -l           # ≥ 3
npm run scrape:promise-suggestions -- --llm
jq '.llmEvidence[] | select(.corpus == "pleno_transcript")' public/data/promise-suggestions.json | head

# P2
curl -s localhost:5173/data/cambios.json | jq '.items | length'  # > 0
curl -s civicpulse-virid.vercel.app/cambios                       # 200
# Telegram: /subscribe concejalia Urbanismo → 'Suscripción registrada'

# P3
curl -s localhost:3000/health                                     # 200
npm run lint -- --quiet
jq '.compilerOptions.checkJs' jsconfig.json                       # true
cat bot/LOCAL.md | head -5                                        # exists
```

## Sequencing recommendation

Ship P1 first in order (1.1 → 1.2 → 1.3). 1.1 unblocks everything else (GDPR must land before public citizen data). P2 can start in parallel with 1.3 since P2 reads the same snapshots. P3 is cross-cutting — ship 3.1 + 3.3 alongside P1 so observability arrives with the first real traffic; defer 3.2 + 3.4 until P1 ships.
