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
| `deploy-vercel.yml`               | push, plus `workflow_run` after **every** workflow that pushes to `main` (see below)                                                                                                                                          |
| `batch-reminder.yml`              | Mondays 08:00 UTC — nudges the queja batch registrar                                                                                                                                                                          |
| `pull-quejas.yml`                 | daily 04:00 UTC (before the scrape) — pulls the bot's `/export/quejas.json` from Fly.io into `public/data/`. Live since 2026-08-02; gated on `vars.BOT_EXPORT_URL`, so unsetting that variable silently stops queja refreshes |
| `ingest-finding-responses.yml`    | issue labelled `derecho-replica`                                                                                                                                                                                              |
| `ingest-journalist-responses.yml` | issue labelled `derecho-replica` **and** `periodista`                                                                                                                                                                         |
| `ingest-pleno-votes.yml`          | issue from the `pleno-vote.yml` form                                                                                                                                                                                          |
| `ingest-queja-responses.yml`      | issue from the `queja-response.yml` form                                                                                                                                                                                      |
| `ingest-eficiencia-responses.yml` | issue labelled `derecho-replica` **and** `eficiencia`                                                                                                                                                                         |

Each ingest workflow parses the structured form, calls the matching curator CLI,
commits, and closes the issue with a permalink. Git history is the sole audit
trail.

Two of them share the `derecho-replica` label, so the discriminator is the
second one: `ingest-finding-responses.yml` now **excludes** `eficiencia` and
`ingest-eficiencia-responses.yml` requires it. Without that, both fire on the
same issue and the pleno ingester comments «no se pudieron extraer los campos
obligatorios» on a perfectly valid reply — indistinguishable, to whoever wrote
it, from a rejection.

### Every pusher must appear in `deploy-vercel.yml`

The `workflow_run` list held **one** workflow of six until 2026-08-12. The other
five — the four right-of-reply ingesters and `pull-quejas.yml` — committed to
`main` and deployed nothing, because GitHub does not chain workflows after a
`GITHUB_TOKEN` push. The visible consequence: a group exercised its legal right
to reply, the bot commented «✅ Réplica publicada · visible en …», and it was
not visible until the nightly happened to push again. `tests/deploy-triggers.test.js`
re-derives the list from the workflow directory and reds on a missing pusher.

## Local crons (the curator's laptop)

Anything needing an LLM backend or a residential IP runs here, not in CI.

| When               | Script                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 06:45 daily        | `scrape-ci-blocked.sh` — the 7 adapters runners cannot reach (`paro`, `pleno-agendas`, `asociaciones`, `obras`, `procesos-selectivos`, `sindicatura`, `consell-cv`) |
| 07:30 daily        | `review-sweep.sh` — reads all 27 public routes as a visitor (report-only, commits nothing)                                                                           |
| 09:00 daily        | `auto-curate-promises-daily.sh` — `/promesas` status-change miner                                                                                                   |
| 09:30 daily        | `hallazgos-pipeline.sh` — transcribe → extract → verify → auto-curate → push                                                                                        |
| 10:15 daily        | `press-lab-pipeline.sh` — `/laboratorio` press fact-check pass                                                                                                      |
| 11:00 every 2 days | `monitor-health-cron.sh`                                                                                                                                            |

`scrape-ci-blocked.sh`, `auto-curate-promises-daily.sh`, `hallazgos-pipeline.sh`,
`press-lab-pipeline.sh` and the currently disabled `auto-curate-weekly.sh` all
commit and push, and all share `scripts/lib/cron-git.sh`. `review-sweep.sh`
shares the branch guard and nothing else: it is report-only and writes no
commit, because a reader-review finding is a lead for a person, not data. It **refuses to run
off `main`** — before the pull and before any model call — because on a feature
branch they would rebase _that_ branch onto `origin/main`, commit there, and
then push an untouched local `main`, so the run's work would never reach the
site. A skipped run exits 0; it is not a failure. `CRON_GIT_ALLOW_BRANCH=1`
overrides it for a deliberate off-main run — and brings the old hazard back with
it: if a `git pull --rebase` fires under you mid-work, `git rebase --abort` is
the safe exit. The same helper limits each commit to the paths its own cron
owns, so whatever else is staged stays staged.

That check is not a one-off at the top. It **records the HEAD it approved** —
the ref, plus a count of branch switches read from HEAD's reflog, because a
branch can be left and re-entered and the name alone would match again — and
**re-checks it before every later git write**: the opening pull, the `git add`,
the commit and the retry pull. A run whose branch moves under it (an agent
branching off mid-run is how commit 30277ab landed on a feature branch) stops
there. It commits nothing, discards nothing, prints the `git status` of the
snapshots it produced so you know they are still in the working tree, and exits
**non-zero** — unlike the opening guard, because a run that did the work and
cannot publish it _is_ a failure. Under `CRON_GIT_ALLOW_BRANCH=1` or the
`PRESS_LAB_NO_REMOTE` rehearsal the branch it pins is the one you actually
started on, not `main`.

Install helpers: `scripts/cron-install-hallazgos.sh`,
`scripts/cron-install-press-lab.sh`. Run them from Terminal.

### The speaker-map sweep: a job measured in weeks, not nights

`hallazgos-pipeline.sh` carries one step that is not a nightly refresh but a
**multi-week backlog burn**: `extract:speaker-map` works through the sessions
that have no `pleno-speaker-map/<id>.json`, ~18 chunks a night against the
Gemini free tier's 20 requests/day. `npm run speaker-map:backlog -- --why`
reports where it is. Three things follow from the shape, and each one has cost a
night or more:

- **A backend outage must not stop it.** This step runs on `GEMINI_API_KEY`,
  which is not the text backend the rest of the pipeline uses, and Gemini's
  daily quota does not accumulate. The preflight therefore marks the run
  DEGRADED and skips only the steps that need the text backend (extraction,
  auto-curation, the post-map re-extraction) rather than exiting. It used to
  `exit 0` on the whole run, and on 2026-08-15 a claude-code outage cost a full
  night of unrelated quota — the same shape as the nine-day keychain incident
  below, at one night a time.
- **The audio is cached in `.cache/speaker-map-audio/`** and dropped when a
  session's map closes. A long pleno needs several nights, and re-fetching a
  2-to-4-hour video for each of them is both waste and, most likely, what got
  the downloads refused on 2026-08-13.
- **A chunk that keeps failing is written off, not retried forever** — after
  `GIVE_UP_AFTER_ATTEMPTS` separate nights, stamped with the prompt version and
  coverage floor that gave up on it. Move either and every write-off reopens.
  The hole stays declared in the map's `failedChunks`; what stops is the asking.
  It is a **spend limit, not a verdict on the audio**: `15uvjew` chunk 8 failed
  at exactly 66% three times, looked deterministic, and passed clean on the
  fourth. Coverage failures here are flaky, so a retired chunk may well be
  readable — which is why the gap stays visible and the gate stamp lets a whole
  cohort of them back in.

Watch it through `check:runs`, which now has a rule that can fire on a run with
no attempts at all: a manifest carrying `owed > 0` and `attempted: 0` is an
error (`nothing-attempted`). Every other rule there is gated on `attempted > 0`,
so a pass that died during setup was unfalsifiable — `extract-speaker-map`
crashed on its download two nights running and `check:runs` printed a ✓ over
both. `owed` comes from `speakerMapBacklog()`, the same function the pipeline
picks its work from. It is optional by design: a pass that cannot cheaply count
its backlog omits it and is judged as before.

### Why the repo lives in `~/dev/`, not `~/Documents/`

macOS TCC protects `~/Documents`, `~/Desktop` and `~/Downloads`, and the two
schedulers fail there in opposite directions. Measured on 2026-08-11 with a
one-shot probe agent:

|                                    | cron                    | launchd user agent               |
| ---------------------------------- | ----------------------- | -------------------------------- |
| read the repo under `~/Documents/` | ✓ (FDA granted to cron) | ✗ denied — `pwd` came back empty |
| unlock the login keychain          | ✗ `Not logged in`       | ✓ `claude -p` exits 0            |

Neither could do both, and that cost nine days: from 2026-08-03 the
`claude` credential moved into the login keychain, cron stopped being able to
read it, and `hallazgos-pipeline` deferred every morning while
`press-lab-pipeline` no-opped its LLM steps. No transcription, no extraction,
no findings, and `monitor:health` printing `✓ sin avisos` throughout because it
measures source freshness and the deterministic scrapers kept running.

Moving the checkout out of `~/Documents/` removes the TCC half for every
scheduler at once, without granting Full Disk Access to `/bin/bash` — a
permission that would apply to every bash script on the machine, not just
these. Keep the repo outside the three protected directories.

The 2026-07 plan documents under `docs/superpowers/plans/` still say
`~/Documents/CivicPulse`; they are a record of what was true then and are left
alone deliberately.

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

## Health checks

All report-only inside `scrape:all`; run any of them directly.

| Command                           | Catches                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `check:relations`                 | cross-snapshot FK breakage (findings→claims, votes→plenos, …)        |
| `check:cadence`                   | snapshots past their expected refresh interval                       |
| `check:runs`                      | a run that reported success without doing work — or without trying   |
| `check:citations`                 | a published claim whose citation no longer holds                     |
| `check:guards`                    | a guard in this table that nothing invokes                           |
| `check:drift`, `check:vocabulary` | upstream shape / vocabulary changes                                  |
| `check:corpus`, `check:retrieval` | embedding corpus integrity, self-retrieval probe                     |
| `check:transcripts`               | degenerate transcripts in the published corpus                       |
| `check:json`                      | unparseable snapshot or merge-conflict marker (also in pre-commit)   |
| `check:automation`                | which action classes are gated, and on what measurement              |
| `check:summary-gate`              | a published summary reproducing a quote the editorial gate withholds |
| `check:data-graph`                | the hand-written dependency graph drifting from what scripts do      |
| `check:queues`                    | a curator worklist describing findings that no longer exist          |
| `check:surfaces`                  | public pages nobody has read lately, or a reader-review flag left standing |
| `check:indicadores`               | a `/eficiencia` figure that no longer resolves to its source cell    |
| `check:eficiencia-findings`       | a signed ficha asserting a figure its source has since revised       |
| `check:dea`                       | a frontier score that no longer reproduces, or names a third party   |

`check:guards` is the one that keeps this table honest, and on 2026-08-12 it
found three of these — `summary-gate`, `data-graph`, `queues` — defined,
tested, and invoked by **nothing**: not a workflow, not a pipeline, not a hook.
That is its own documented failure mode 1. All 21 are wired now; three still
have no fault injection, and it says so rather than counting them as proven.

Baselines (`.vocabulary-census.json`, `.transcript-check-baseline.json`) are
**committed on purpose**. Gitignored, CI would write a fresh one each night and
report "no change" forever.

`check:citations` is split across two runners, and the split is the point. The
free structural half (does every claim cite a source that exists, is every quote
verbatim in its excerpt) runs in `scrape:all` with `--offline`. The URL probe
runs in `scrape-ci-blocked.sh`, because it needs a residential IP for the same
reason the seven adapters there do — a runner would mark most of the corpus
`unverifiable`, find nothing, and report a clean bill of health. The blocking
copy runs at promote time, against the draft.

It probes the evidence refs on published `pleno-findings.json` rows as well as
journalist-report sources — mostly PLACSP tender permalinks, which nothing
followed until 2026-08-09. That is a different question from
`check:relations`' `findings-crosschecked-tenders`, which joins the same refs
against `tenders.json`: the join catches a fabricated expediente, the probe
catches a link that has rotted, and neither substitutes for the other. Note
what `alive` can and cannot mean on PLACSP — it answers 200 for a deeplink id
it does not recognise, so a live status proves the permalink resolves, not that
the tender is behind it. Findings ride with the published corpus only, never
with `--draft`: another curator's link rot must not block a promotion.

### Proving the guards still guard

```bash
npm run check:guards            # wiring: is each guard above invoked anywhere?
npm run check:guards -- --inject   # break what each one watches, confirm it fires
```

`--inject` mutates real snapshots, restores them from git, and **verifies the
restoration** (exit 2 if it cannot). It refuses to touch a file with uncommitted
changes. It also names every guard it has no injection for, rather than letting
a partial pass read as full coverage — as of 2026-08-03 that is 11 of 15.

## Git hooks

- **pre-commit** — `lint`, `format:check`, `check:json`. Fails on errors only.
- **pre-push** — when the push touches `public/data/`, a page component or
  `i18n.jsx`, builds and reads the affected pages as a visitor would. **Never
  blocks**: a probabilistic check that can block a push teaches everyone to type
  `--no-verify`, and then it protects nothing.

  "Never blocks" is structural, not a promise — the promise was false for eight
  commits. Husky runs the hook as `sh -e`, and under `-e` a command that fails
  inside the EXIT trap aborts the shell with its status; the trap's `kill` of an
  already-dead preview did exactly that, so the hook printed «el push continúa»
  and exited 1. It now sets `set +e`, ends its trap on `:`, and `exit 0`s on
  every path. All three are needed: a trailing `exit 0` alone still exits 1,
  because the trap runs after it.

  It is also **bounded and partial by design**: `--budget-seconds 60`, which
  measured 87s end to end where the unbounded pass measured 568s and git killed
  it at ten minutes. The budget never buys silence — routes the clock did not
  reach are named, half-read pages report PARCIAL and are not cached, and the
  full pass is always available with `npm run review:surfaces`. The hook takes
  its own free port from 4189 up, so a `npm run preview` on 4173 neither kills
  it nor gets silently reviewed in its place.

  Because it can no longer block, its **last line is the whole report** — nobody
  reads an exit code that cannot stop anything. So the hook checks that the
  review actually emitted its `[review]` coverage summary, and prints **«NO SE
  REVISÓ NADA»** when it did not. Fault injection found it printing «parcial por
  diseño» over a Playwright crash that had reviewed zero pages.
