# Operations — what runs when, and what is allowed to fail

## Nightly refresh (GitHub Actions)

`.github/workflows/nightly-scrape.yml` runs `npm run scrape:all` at **04:30 UTC**
(06:30 Madrid summer, 05:30 winter). The job:

1. installs deps and walks the adapters in sequence,
2. runs vitest against the fresh snapshots (`continue-on-error`, so a flaky test
   cannot skip the data commit),
3. `git add public/data && git commit && git push` **even when a scraper failed**
   (`if: !cancelled()`), so the adapters that did refresh always land,
4. a trailing **health gate** reds the run only on a critical scraper failure or
   a test failure — the commit has already happened either way,
5. `deploy-vercel.yml` fires on completion via `workflow_run` and redeploys
   **only if the run concluded `success`**, so a red night commits its partial
   data and defers the deploy to the next green one.

### Commit-then-gate — do not collapse this back

The May 2026 fix made `scrape-all.sh` exit non-zero on any failure. That
loudly surfaced breakage, but because the commit step was gated on the scrape
step succeeding, a single flaky adapter froze the commit of ~18 healthy ones and
the live site went stale for 25 days before anyone noticed. The commit must not
depend on the gate.

### Why the `workflow_run` trigger exists — do not remove it

The nightly pushes with `secrets.GITHUB_TOKEN`, and GitHub deliberately does not
trigger downstream workflows for pushes authored by that token (anti-loop
protection). Without the `workflow_run` hook the `chore(data): nightly real-data
refresh` commits land on `main` and never deploy — the site silently freezes on
the last human push. This happened between 2026-05-03 and 2026-05-12; fixed by
`8917053`.

### Best-effort adapters

`scrape-all.sh` splits its adapter list in two. A **best-effort** failure still
runs, logs, and appears in the summary, but does not count toward the exit code.
As of 2026-08-03 that is **19 of the 34** entries — read the `BEST_EFFORT` array
in `scripts/scrape-all.sh`, which carries a per-adapter rationale, rather than
trusting a list copied into a doc. It has grown steadily and this one was wrong
by 9.5× when audited.

Two classes dominate:

- **Blocked from GitHub runners.** SEPE, `ribarroja.es` and `regmeet.com`
  blackhole runner IPs. These work first time from a residential IP, so they
  belong in `scripts/scrape-ci-blocked.sh` (local cron, below) rather than in
  the gate.
- **Needs an LLM backend.** CI has no keys by design and ollama is out of every
  fallback chain, so `extract:all-pleno-votes` can only ever be red on a runner.
  The real extraction runs curator-side in `hallazgos-pipeline.sh`.

Demoting an adapter hides the next failure behind it — `scrape:paro`'s demotion
immediately surfaced `extract:all-pleno-votes`. Expect to repeat the exercise,
and prefer fixing the source over growing the array.

Because best-effort failures go green, freshness needs its own check:
`check:cadence` catches snapshots that have quietly stopped refreshing, and
`check:runs` catches a run that reported success having done no work. Both are
report-only inside `scrape:all`.

`workflow_dispatch` takes an `adapters` input for on-demand re-runs; add new
adapter names to the `case` switch.

## The other GitHub workflows

| Workflow                          | Trigger                                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e.yml`                         | push / PR — Playwright, sets `VITE_ENABLE_PERIODISTAS=true` (absent locally, so `/cargos`'s Biografía spec always reds on a local run)                                                                                        |
| `deploy-vercel.yml`               | `workflow_run` after a green nightly, plus push                                                                                                                                                                               |
| `batch-reminder.yml`              | Mondays 08:00 UTC — nudges the queja batch registrar                                                                                                                                                                          |
| `pull-quejas.yml`                 | daily 04:00 UTC (before the scrape) — pulls the bot's `/export/quejas.json` from Fly.io into `public/data/`. Live since 2026-08-02; gated on `vars.BOT_EXPORT_URL`, so unsetting that variable silently stops queja refreshes |
| `ingest-finding-responses.yml`    | issue labelled `derecho-replica`                                                                                                                                                                                              |
| `ingest-journalist-responses.yml` | issue labelled `derecho-replica` **and** `periodista`                                                                                                                                                                         |
| `ingest-pleno-votes.yml`          | issue from the `pleno-vote.yml` form                                                                                                                                                                                          |
| `ingest-queja-responses.yml`      | issue from the `queja-response.yml` form                                                                                                                                                                                      |

Each ingest workflow parses the structured form, calls the matching curator CLI,
commits, and closes the issue with a permalink. Git history is the sole audit
trail.

## Local crons (the curator's laptop)

Anything needing an LLM backend or a residential IP runs here, not in CI.

| When               | Script                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 06:45 daily        | `scrape-ci-blocked.sh` — the 7 adapters runners cannot reach (`paro`, `pleno-agendas`, `asociaciones`, `obras`, `procesos-selectivos`, `sindicatura`, `consell-cv`) |
| 09:00 daily        | `auto-curate-promises-daily.sh` — `/promesas` status-change miner                                                                                                   |
| 09:30 daily        | `hallazgos-pipeline.sh` — transcribe → extract → verify → auto-curate → push                                                                                        |
| 10:15 daily        | `press-lab-pipeline.sh` — `/laboratorio` press fact-check pass                                                                                                      |
| 11:00 every 2 days | `monitor-health-cron.sh`                                                                                                                                            |

Install helpers: `scripts/cron-install-hallazgos.sh`,
`scripts/cron-install-press-lab.sh`. Run them from Terminal — launchd agents
under `~/Documents/` die with exit 78 on macOS TCC, which is why these are cron
rather than launchd.

`launchctl list` may still show `com.civicpulse.munigraph.{bot,export}` in that
failed state. They are leftovers from before the bot moved to Fly.io and the
export became a GitHub Action; nothing depends on them.

## The bot

Deployed on **Fly.io** — app `munigraph-ribarroja`, region `cdg`, webhook mode
(`WEBHOOK_URL` set), SQLite on a persistent volume. It ran locally under launchd
and then Docker Compose during development; neither is the runtime now, and
`bot/docker-compose.yml` is for local work only.

Deploys must run from the repo root, because the Dockerfile reads
`queja-router` and `officials.json` from the monorepo:

```bash
flyctl deploy --config bot/fly.toml --dockerfile bot/Dockerfile --remote-only .
```

Full setup, secrets and volume creation: the header of `bot/fly.toml` and
`bot/DEPLOY.md`.

> **A local cron commits to whatever branch is checked out.** If you are mid-work
> on a branch when one fires, `git pull --rebase` can strand you;
> `git rebase --abort` is the safe exit.

## Health checks

All report-only inside `scrape:all`; run any of them directly.

| Command                           | Catches                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `check:relations`                 | cross-snapshot FK breakage (findings→claims, votes→plenos, …)      |
| `check:cadence`                   | snapshots past their expected refresh interval                     |
| `check:runs`                      | a run that reported success without doing work                     |
| `check:drift`, `check:vocabulary` | upstream shape / vocabulary changes                                |
| `check:corpus`, `check:retrieval` | embedding corpus integrity, self-retrieval probe                   |
| `check:transcripts`               | degenerate transcripts in the published corpus                     |
| `check:json`                      | unparseable snapshot or merge-conflict marker (also in pre-commit) |
| `check:automation`                | which action classes are gated, and on what measurement            |

Baselines (`.vocabulary-census.json`, `.transcript-check-baseline.json`) are
**committed on purpose**. Gitignored, CI would write a fresh one each night and
report "no change" forever.

## Git hooks

- **pre-commit** — `lint`, `format:check`, `check:json`. Fails on errors only.
- **pre-push** — when the push touches `public/data/`, a page component or
  `i18n.jsx`, builds and reads the affected pages as a visitor would. **Never
  blocks**: a probabilistic check that can block a push teaches everyone to type
  `--no-verify`, and then it protects nothing.
