# CivicPulse — QA Defect & Issue List

**Date:** 29 June 2026 · **Second pass:** 30 June 2026 (full repo + GitHub Actions access) · **Build reviewed:** local `main` (commit `ba78051`) + live `civicpulse-virid.vercel.app`
**Priority key:** P0 = launch-blocking · P1 = fix before/at launch · P2 = fix soon after · P3 = backlog · ENV = sandbox-only, not a real defect

> **30 Jun second-pass note:** With full git history + GitHub Actions access (unavailable to the original sandbox review), two P1 findings were re-diagnosed: **P1-2** (deploy) and **P1-3** (pipeline) were both *snapshot artifacts of a stale local checkout reviewed on a red-pipeline night*, not defects. P1-3 did surface one real, now-fixed code bug (a flaky `scrape:paro` timeout). The P0/P2/P3 fixes were independently re-verified. See each entry for detail.

---

## P0 — Launch-blocking

### P0-1 — Public AI biography of the named sitting mayor `[FIXED]`
- **Where:** `/laboratorio/agentes` (Periodistas IA), `public/data/journalist-reports.json`
- **What:** A published, publicly-reachable AI-generated biography of mayor Robert Raga Gadea, whose assignment brief references "expedientes judiciales abiertos." The report's own `warnings[]` flag wrong-identity source contamination (toy-doll Wikipedia page, footballer Robert Sánchez) that "must be purged to prevent accidental citation."
- **Why P0:** Auto-generated biographical/judicial claims about a living, named public official are the highest libel exposure on the site, and the feature is outside the launch core.
- **Fix applied:** Added `VITE_ENABLE_PERIODISTAS` flag (`src/App.jsx`, `src/components/Sidebar.jsx`). Default off in production → routes absent, nav item hidden, chunks tree-shaken, direct URLs redirect home. Still on in dev for curators. Documented in `.env.example`. Verified: prod build contains no `Agentes`/`AgenteReporte` chunks; typecheck/lint/tests green.
- **Verify before launch:** Confirm the production deploy does **not** set `VITE_ENABLE_PERIODISTAS=true`.

---

## P1 — Fix before or at launch

### P1-1 — Quejas flagship has zero data
- **Where:** `/quejas`, `public/data/quejas.json` (`total: 0, items: []`)
- **What:** The launch flagship "Quejas" renders only an (well-designed, honest) empty state. No citizen complaints have been captured.
- **Impact:** Launching "quejas" as a feature implies content; there is none.
- **Recommendation:** Not a code fix — a launch-framing + ops decision. Launch as an open channel ("be the first"), and confirm the Telegram bot `@munigraph_bot` is running and reachable on launch day. Optionally seed 2–3 real, consented example quejas so the feed isn't bare.

### P1-2 — Production deploy `[VERIFIED — chain healthy; ships on push]`
- **Where:** `vercel.json` (`git.deploymentEnabled: false`); `.github/workflows/deploy-vercel.yml`.
- **What (corrected, 30 Jun second pass):** Not a code defect. `deploymentEnabled: false` is **intentional** — production deploys are driven by `deploy-vercel.yml`, which fires on both a push to `main` and the nightly's `workflow_run` (gated on a *green* run, so a red night doesn't ship). Verified against the live Actions history: the deploy workflow ran **success on 2026-06-30 08:14Z**, and correctly **skipped** on the red nights (06-29, 06-26). The "stale" the review saw was a snapshot artifact — the review ran on 06-29, a red-pipeline night whose deploy was (correctly) skipped (live site still on 06-28 data), and the P0 Periodistas fix was still uncommitted at review time.
- **Status:** Resolves on commit + push of this branch — the push to `main` triggers `deploy-vercel.yml`, carrying the P0 gate live. Do **not** flip `deploymentEnabled` to `true` (it would double-deploy against the workflow chain).

### P1-3 — Nightly data pipeline `[CORRECTED — not stalled; flaky-scraper red FIXED]`
- **Where:** `.github/workflows/nightly-scrape.yml`; `scripts/scrape-paro.ts`.
- **What (corrected, 30 Jun second pass):** The pipeline is **not** stalled. The live Actions history shows it runs every day and commits every day — origin/`main` carries `chore(data): nightly real-data refresh` commits through **2026-06-30**. The review's "stopped committing after 06-24" was a stale *local checkout* (6 commits behind origin), not a pipeline freeze. The commit-then-gate design is working as intended: even the red nights still commit their partial refresh (06-29 committed `94fc56f` despite failing the health gate).
- **Real kernel:** ~1 night in 3 reds (06-23 / 06-26 / 06-29). Root cause from the run logs: `scrape:paro` times out on the TLS handshake to `sepe.es:443` — undici's default **10s `ConnectTimeoutError`**, which fires *before* the scraper's 120s per-download budget. The first month whose handshake timed out threw straight up through `main()` → `exit(1)`, reding the whole run and skipping that night's deploy.
- **Fix applied:** `scripts/scrape-paro.ts` now retries transient network errors per month (3 attempts · 2s/4s backoff) and treats a single failed month as non-fatal — the months that resolved still make a valid snapshot. The existing "0/24 months → exit 1, keep yesterday's snapshot" guard stays the real failure backstop, so a genuine SEPE outage still reds the run (never a silent freeze — the anti-pattern documented in `CLAUDE.md`). Verified: a live run scraped 19 months and wrote a valid snapshot; typecheck + lint + full vitest suite (1163 passing) green.

---

## P2 — Fix soon after launch

### P2-1 — Departamentos shows "Aprobados 0" on every department `[FIXED]`
- **Where:** `/departamentos`
- **What:** The "compromisos plenarios (aprobados)" column reads 0 for all 16+ departments because the libel-safe join only counts an agenda item as a commitment when a matching transcribed pleno-vote exists (18 votes total, few matched).
- **Impact:** Correct by design, but a visitor may read it as "broken / nothing approved."
- **Fix applied:** Added a "sin voto transcrito" / "sense vot transcrit" sub-label under the Aprobados stat whenever a department has zero transcribed votes (`src/pages/Departamentos.jsx` + bilingual i18n keys), so 0 reads as "no data yet," not "nothing approved." Page subtitle already explains the votes-are-primary model.

### P2-2 — Press lab is empty of output
- **Where:** `/laboratorio`
- **What:** 67 articles audited, but 0 verified, 0 contradicted, 0 findings, 0% reliability across all outlets.
- **Impact:** A prominent surface with nothing to show; weak first impression.
- **Recommendation:** Either de-emphasize in nav for launch, or run the claim-extraction/verification pipeline so at least a few findings populate it. (You chose to keep it live — fine, just know it's thin.)

### P2-3 — Data freshness staleness should be visible
- **What:** Several pages show "hace 1 d / hace 2 d" stamps; if the pipeline stalls, these silently grow.
- **Recommendation:** Consider a build-time staleness banner if any core snapshot exceeds N days, so the team notices before users do.

---

## P3 — Backlog / low

### P3-1 — Live-ticker marquee left-edge overlap `[FIXED]`
- **Where:** Landing (`/`) `LiveTicker` — top-center marquee over the map.
- **What:** Scrolling chips translated left into the semi-transparent "DIRECTO" pill's box and rendered over its label, because only the outer rounded container clipped — the marquee track had no clip boundary at the pill's right edge.
- **Fix applied:** Wrapped the scrolling `.cp-ticker-track` in its own `overflow:hidden` flex container (`src/components/LiveTicker.jsx`), so the marquee is clipped to the area right of the DIRECTO pill. Animation unchanged.

### P3-2 — Department-head party attribution `[NOT A BUG — VERIFIED]`
- **Where:** `/departamentos`, `officials.json`
- **Finding:** Verified the corporation breakdown: PSOE 11, PP 7, VOX 1, Compromís 1, Otro 1 (= 21 seats). PSOE is the governing party and holds all executive portfolios; PP/VOX are opposition and correctly do not head departments. The data is accurate — no fix needed.

---

## ENV — Sandbox-only, NOT product defects

These failed only in the Linux review sandbox and pass on the user's macOS machine / CI. Listed for transparency.

- **ENV-1** — 17 vitest failures in `tests/press-fetcher.test.ts`: all `EPERM: operation not permitted, unlink` on a temp cache dir in the mounted folder (sandbox can't delete files in the macOS mount). Pure filesystem-permission artifact.
- **ENV-2** — `npm test` / `vite build` initially failed with "Cannot find module @rollup/rollup-linux-arm64-gnu" / esbuild: the user's `node_modules` holds macOS-arm64 native binaries; the Linux sandbox needs linux-arm64. Resolved by additively installing the matching binaries (harmless extra dirs on macOS).
- **ENV-3** — Headless Chromium couldn't launch in-sandbox (missing `libXdamage.so.1`; no root, Ubuntu mirror blocked). The live visual walkthrough was done against the deployed site in a real browser instead.
- **ENV-4** — `EAI_AGAIN api.exa.ai` in journalist tests: sandbox network egress; tests handle it gracefully.

---

## Summary counts

| Priority | Count | Open |
|---|---|---|
| P0 | 1 | 0 (fixed) |
| P1 | 3 | 1 (P1-2 verified healthy; P1-3 fixed; P1-1 ops/framing) |
| P2 | 3 | 2 (P2-1 fixed; P2-2/P2-3 open) |
| P3 | 2 | 0 (P3-1 fixed; P3-2 not a bug) |
| ENV | 4 | n/a |

**Code health: clean.** Every code-level defect has been fixed (P0-1, P2-1, P3-1, and now **P1-3**); P3-2 was verified as correct data, and **P1-2** was verified as a healthy-by-design deploy chain (not a defect). The P0/P2/P3 fixes were independently re-verified in the 30 Jun second pass (diffs read; `Stat` confirmed to render the new sub-label; ticker clip confirmed). The one genuinely open item is operational, not code:

- **P1-1 Quejas empty** — launch-framing + bot ops decision (optionally seed 2–3 consented examples). The only true remaining condition.
- ~~**P1-2 Stale deploy**~~ — **verified not a defect.** Deploy chain (`deploy-vercel.yml`) is wired and fired success on 06-30; ships on the push of this branch. `deploymentEnabled:false` is intentional.
- ~~**P1-3 Nightly pipeline**~~ — **fixed.** Pipeline was never stalled (stale local checkout); the real ~1-in-3-night red was a `scrape:paro` SEPE connect-timeout, now retried + made non-fatal in `scripts/scrape-paro.ts`.
- **P2-2 Press lab thin** — run the claim pipeline to populate, or de-emphasize (curator/metered-LLM op, not a code defect; kept live per your decision).
- **P2-3 Staleness banner** — optional enhancement (deferred; the nightly summary already surfaces per-file `generatedAt`, and the deploy chain only ships green nights).

All fixes verified: `tsc --noEmit`, ESLint, and the full vitest suite (**1163 passing, 1 skipped**) all green; `scrape:paro` validated with a live 19-month run.
