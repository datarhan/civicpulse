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
  belong in `scripts/scrape-ci-blocked.sh` (local launchd agent, below) rather
  than in the gate.
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

### A pipeline publishes what its own commit made stale

`refresh` rebuilds derived snapshots, and `tests/refresco-antes-de-comitear.test.ts`
already required every pipeline that writes a derived node's **output** to run it.
The other half — a pipeline that writes an **input** — left the rederivation to the
nightly, and that opened a window where `main` failed its own
`tests/data-graph-frescura.test.ts`. Measured on 2026-09-16 by checking out each
commit's `public/data` and running that gate against it: eighty minutes red across
three pipelines, and the only casualty was an unrelated pull request whose CI
happened to build inside the window. Data-only commits do not run the suite on
`main`, so the red always surfaces somewhere other than its cause.

So `npm run refresh -- --rebuilt-paths` writes to stdout **only** the paths that
pass rebuilt — the human report goes to stderr — and every committing pipeline adds
them to its pathspec. The pathspec stays as narrow as it was: it gains exactly the
derived outputs that this commit's input change invalidated, never another cron's
work. `tests/frescura-de-las-tuberias.test.ts` derives the pipeline list from the
graph and from the literal paths each script names, so a new pipeline is covered
without anyone editing a list.

One gap is left open on purpose, because it is a different defect with its own
reproducer: when a push is rejected, these pipelines `pull --rebase` and push again
**without** re-running `refresh`, so they can inherit staleness from whichever cron
landed first. That is what happened to `94359907` on 2026-09-16.

## The other GitHub workflows

| Workflow                          | Trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e.yml`                         | push / PR — the unit suite (`npm test`, after installing Chromium: one of its tests launches a real browser), then Playwright. Sets `VITE_ENABLE_PERIODISTAS=true` (absent locally, so `/cargos`'s Biografía spec always reds on a local run)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `deploy-vercel.yml`               | push, plus `workflow_run` after **every** workflow that pushes to `main` (see below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `batch-reminder.yml`              | Mondays 08:00 UTC — nudges the queja batch registrar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pull-quejas.yml`                 | daily 04:00 UTC (before the scrape), and dispatched by the bot on every confirmed `/olvidar` when `GITHUB_DISPATCH_TOKEN` is set on Fly; two runs never overlap (`concurrency`) — pulls the bot's `/export/quejas.json` from Fly.io into `public/data/`, then `scripts/fotos-quejas.mjs` prunes the photos of quejas no longer in it and fetches the anonymized photos it links from `/export/quejas-photos/`. Live since 2026-08-02. Needs `vars.BOT_EXPORT_URL`: without it the run fails (`exit 1`) and its step summary says how to set it. The bot anonymizes the photos hourly on its volume (`QUEJAS_PHOTOS_DIR`); without `GEMINI_API_KEY` on Fly it holds every one                                                                                                                                                                                                                                                  |
| `ingest-finding-responses.yml`    | label `publicar` (applied by a maintainer) on an issue labelled `derecho-replica` **and** `hallazgo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ingest-journalist-responses.yml` | label `publicar` (applied by a maintainer) on an issue labelled `derecho-replica` **and** `periodista`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ingest-pleno-votes.yml`          | label `publicar` (applied by a maintainer) on an issue from the `pleno-vote.yml` form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ingest-queja-responses.yml`      | label `publicar` (applied by a maintainer) on an issue from the `queja-response.yml` form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ingest-eficiencia-responses.yml` | label `publicar` (applied by a maintainer) on an issue labelled `derecho-replica` **and** `eficiencia`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `bot.yml`                         | PR touching `bot/**` or a file the bot reads outside it, and called by `bot-deploy.yml` (`workflow_call`) on every deploy — typechecks the bot and runs its own suite, both with `working-directory: bot`. Its tests ran in no workflow until 2026-09-09 and its types in none until 2026-09-14: the root `npm test` only globs `tests/**` and `src/**`, and the root `tsc` does not cover `bot/`. The bot's tests read a fixture for the LOREG freeze (`PROMISES_JSON`), never the live `promises.json`: otherwise a `freeze:set` would turn them red and block the very deploy that carries the freeze                                                                                                                                                                                                                                                                                                                      |
| `bot-deploy.yml`                  | push to `main` touching `bot/**` or a file the bot image reads outside it — the LOREG `frozenUntil` lives in `promises.json`; `tests/bot-despliegue.test.js` derives the list from `bot/src` — first runs `bot.yml` and **deploys only if it is green** (until 2026-09-27 the two ran in parallel, so a red bot reached Fly anyway), then `flyctl deploy --remote-only --env GIT_SHA=…`, then polls `/health` (the URL comes from `WEBHOOK_URL` in `bot/fly.toml`) for up to three minutes and goes red unless it reports **that** commit as `version` with `webhookAuthenticated: true`. Refuses to run from any ref but `main`, and deploys queue rather than cancel each other. Committing is not deploying: on 2026-09-09 the calendar gained a prize closing in 36 days while Fly still served a build from hours earlier, with every check green. Fails loudly if `FLY_API_TOKEN` is missing rather than skipping green |
| `cesel-entrega.yml`               | Mondays 06:00 UTC in **November, December and January only** — the one window in which a new coste-efectivo entrega can appear (see below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ops-alarm.yml`                   | daily 13:23 UTC — the rules of `monitor:health`, run from a GitHub runner instead of the laptop: stale snapshots (`check:cadence`), the laptop's daily heartbeat commit, the nightly's red streak or silence, the site and the bot's `/health`. It sends nothing: it goes red, and a red run already reaches a person through the Fly bot's hourly poller and GitHub's email. See «The watcher outside the laptop» below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Each ingest workflow parses the structured form, calls the matching curator CLI,
commits, and closes the issue with a permalink. Git history is the sole audit
trail.

**Nothing publishes on submission.** The form's own labels only route the issue;
publishing takes the label `publicar`, which no template applies, and the
workflow checks that whoever applied it has write access before it touches
anything. Until 2026-09-25 the template's label was enough to commit to `main`
and deploy, and `edited` re-ran the ingest on every edit, so anyone with a
GitHub account could publish a text under a group's name. Before applying
`publicar`, confirm the reply comes from who it claims (the group's or
institution's email). `tests/ingesta-aprobacion.test.js` holds the rule.

Several templates share the `derecho-replica` label, so each ingest routes on
the label that only its own template applies (`hallazgo`, `periodista`,
`eficiencia`). Routing by exclusion (`ingest-finding-responses.yml` used to
skip only `eficiencia`) made the pleno ingester fire on promise, competencia and
journalist replies and comment «no se pudieron extraer los campos obligatorios»
on a valid reply — indistinguishable, to whoever wrote it, from a rejection.

### The November window — `cesel-entrega.yml`

The coste efectivo is the slowest datum on the site, and its calendar is fixed
by Orden HAP/2075/2014: an exercise is filed **before 1 November of the
following year** and the ministry publishes after that. So the page legitimately
titles in 2024 throughout 2026 — and the day that stops being true is invisible
unless something looks.

When it lands was **measured**, not assumed, by parsing the ministry's own
`ddlEntrega` out of the Internet Archive:

| snapshot     | newest entrega  |
| ------------ | --------------- |
| `2024-11-25` | 2022            |
| `2024-11-30` | 2023 ← appeared |
| `2025-10-28` | 2023            |
| `2025-12-10` | 2024 ← appeared |

Late November, three to four weeks _after_ the filing deadline. A single annual
shot on 10 November would have found nothing both years and then waited twelve
months; hence Mondays across November–January.

Two properties worth keeping:

- **The expensive step is gated behind a cheap one.** Each run first calls
  `check:cesel-entregas` — one small HTML GET. The ~45 MB national workbook is
  only downloaded when a new entrega genuinely exists. That is also why
  `scrape:coste-efectivo` is deliberately absent from the nightly.
- **It opens a PR; it never commits to `main`.** A new entrega moves every unit
  cost, every percentile and both lab experiments at once, and can flip a signed
  `/eficiencia` ficha to `contradice`. The guards run and their verdict goes in
  the PR body — including when they are red, because a red guard is precisely
  what a human needs to see. Deciding between refreshing the measurement and
  retracting the ficha stays human, as the nightly already declares.

Year-round cover comes from the same check running in `scrape:all`, which
notices an off-season publication but does not fetch it.

### Every pusher must appear in `deploy-vercel.yml`

The `workflow_run` list held **one** workflow of six until 2026-08-12. The other
five — the four right-of-reply ingesters and `pull-quejas.yml` — committed to
`main` and deployed nothing, because GitHub does not chain workflows after a
`GITHUB_TOKEN` push. The visible consequence: a group exercised its legal right
to reply, the bot commented «✅ Réplica publicada · visible en …», and it was
not visible until the nightly happened to push again. `tests/deploy-triggers.test.js`
re-derives the list from the workflow directory and reds on a missing pusher.

It distinguishes pushing `main` from pushing a PR branch: `git push` and
`git push origin HEAD` publish and must trigger a deploy, while
`git push origin "$RAMA"` (what `cesel-entrega.yml` does) publishes nothing —
the merge does, and that already arrives through `push: branches: [main]`. The
distinction is made **in the test**, never dodged in the workflow: a workflow
worded to avoid the phrase `git push` would sail past the control while still
pushing to `main`, which is the failure the control exists to catch. The
classifier is unit-tested on both shapes so that loosening it cannot quietly
turn it into a function that returns `false` for everything.

### The watcher outside the laptop — `ops-alarm.yml`

`monitor:health` runs from the laptop's cron, so when the Mac is off, asleep or
logged out, the watcher goes down with what it watches and nothing turns red:
the 49-day and 9-day silent outages below had exactly that shape. `ops-alarm.yml`
runs the same rules (`src/scraper/health-monitor.ts`, gathered by
`src/scraper/ops-alarm.ts`) from a GitHub runner once a day, looking only at
what needs no laptop: snapshot freshness, the laptop's daily heartbeat commit
(`scrape-ci-blocked.sh`, found by its subject), the nightly's red streak and
whether GitHub launched it at all, the public site and the bot's `/health`
(degraded counts). Whatever it cannot check — no `gh`, no bot URL — is an alert,
not a zero. It goes red rather than messaging anyone, because a red run already
reaches a person twice: the Fly bot's hourly poller DMs «🔴 Workflow FALLIDO»,
and GitHub emails the failure.

## Local scheduled jobs (the curator's laptop)

Anything needing an LLM backend or a residential IP runs here, not in CI.

| When            | How     | Script                                                                                                                                                                                  |
| --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 06:45 daily     | launchd | `scrape-ci-blocked.sh` — the adapters runners cannot reach (`paro`, `pleno-agendas`, `asociaciones`, `obras`, `procesos-selectivos`, `sindicatura`, `consell-cv`, `sindic-expedientes`) |
| 07:30 Mon + Thu | launchd | `review-sweep.sh` — reads every public route, plus one data-picked instance of each `:param` route, as a visitor (report-only, commits nothing)                                         |
| 08:30 Mon       | launchd | `auto-curate-promises-daily.sh` — `/promesas` status-change miner                                                                                                                       |
| 09:30 Mon + Thu | launchd | `hallazgos-pipeline.sh` — transcribe → extract → verify → auto-curate → push                                                                                                            |
| 10:15 Mon       | launchd | `press-lab-pipeline.sh` — `/laboratorio` press fact-check pass                                                                                                                          |
| 11:00 daily     | cron    | `monitor-health-cron.sh`                                                                                                                                                                |

### Cadence: why the LLM agents are not daily

Until 2026-09-23 the four agents that call the model ran every morning. They
use `claude-code` on the Max plan, which costs no cash but draws on the same
quota as interactive sessions, and their own logs showed most of those runs
producing nothing: the promise auto-curator's digests had auto-published and
queued nothing for two months, the press pass kept extracting claims no source
could verify, `hallazgos` had pushed no new finding since late July because
plenos are roughly monthly, and the reader sweep — the largest consumer — was
re-reading pages whose data had not moved. So `review-sweep` and `hallazgos`
run Monday and Thursday, `press-lab` and `auto-curate-promises` on Mondays, and
`scrape-ci-blocked`, which makes no model call, stays daily. Per-run caps did
not go up to compensate: raising them would spend the saving back.

What moved with it, so the health digest does not cry wolf on a normal gap:
`check:cron` reads `Weekday` and array-form `StartCalendarInterval`;
`check:runs` gives these passes 192h (the Thursday→Monday gap plus one missed
run); `DIAS_FRESCURA` and the transcription/extraction stall alerts are five
days; and the press-lab snapshots carry a nine-day budget (`local-llm` class in
`snapshot-cadence.ts`) so `/lab-health` does not paint them stale every Monday
morning. The cost is latency: a new pleno video, or a sentence a data change
has made false, can wait up to four days for its pass.

The detail routes (`/plenos/:id`, `/hallazgos/:id`, `/cargos/:slug` and the
rest) are read through one instance each, which `scripts/lib/fichas-representativas.ts`
picks from the snapshots on every run; none was read by any pass before
2026-09-29. The pick moves only when the data does, so the content-hash cache
still holds, but a moved pick is a new key: the next sweep reads that page
cold, and `check:surfaces` reports it unread until then. The pleno instance
opens its tabs (`[pestanas]`), so it costs several pages' worth of fragments;
what one would cost is measurable for free, before spending anything, by
pointing the reader at a dead backend: `env -u OPENAI_API_KEY -u
ANTHROPIC_API_KEY LLM_BACKEND=claude-code CLAUDE_CODE_BIN=/nonexistent npm run
review:surfaces -- --json <keys>` prints each key's characters and fragments.
Unsetting the keys is not optional: `buildBackendChain` falls through from
`claude-code` to any metered backend whose key is in the environment.

### launchd or cron: the rule, and the two times it was applied wrong

**A launchd user agent runs inside the Aqua session and can open the login
keychain. A cron job cannot** — `env -i … claude -p ok` exits 1 with
«Not logged in». So: **agent for anything that needs the credential, cron for
the purely deterministic.**

The trap is deciding which is which by reading what the script _calls_. Twice
that was wrong, and both were silent:

- `auto-curate-promises-daily.sh` calls the model outright and was in cron
  anyway. It failed every morning from 2026-07-08 for 49 days, and pinned
  `/departamentos` to a 6 July stamp.
- `scrape-ci-blocked.sh` really is deterministic — until its `git push`. The
  pre-push hook reads the touched routes **with the model**, so from cron it
  published every morning with «SIN REVISAR: ningún backend respondió» against
  all of them. The scraping never needed the credential; publishing it did.

So the rule has a second clause: **pushing drags in the hook, and the hook needs
the credential.** `monitor-health-cron.sh` is the one that genuinely stays in
cron — it neither calls the model nor pushes.

And a consequence, once the hook could finally run: **the review does not fit
inside a push.** Git opens the SSH connection and _then_ runs the hook, so a
multi-minute read leaves it idle until GitHub drops it. Measured twice on the
same commit — 474 s then 367 s, «Connection to github.com closed by remote
host», push failed both times. Caching does not save it: the cost is one route
whose model call hangs and is killed at the 180 s timeout, doubled by the
retry, on every push whether warm or cold.

So `scrape-ci-blocked.sh` runs the hook itself — `PREPUSH_RANGE=… sh
.husky/pre-push`, the escape hatch the hook documents for exactly this — and
then pushes with `--no-verify`. Same routes, same range, same report in the
same log; the connection is only open for the transfer, which takes about two
seconds. This is safe **because the hook is advisory**: every path in it exits
0 and its whole job is to print. Give it something that must genuinely block a
push and this `--no-verify` has to be revisited.

Install the agents with `scripts/launchd-install-llm-pipelines.sh` (its `probe`
subcommand checks keychain, PATH and TCC) and
`scripts/launchd-install-auto-curate-promises.sh`. A job must live in exactly
one scheduler: leaving the old `crontab` line behind runs it twice.

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

`scripts/cron-install-hallazgos.sh` and `scripts/cron-install-press-lab.sh`
are retired: they refuse to install (a crontab line would run the agent a
second time, and daily), and only `uninstall` still works, to remove an old
line.

### The speaker-map sweep: a job measured in weeks, not nights

`hallazgos-pipeline.sh` carries one step that is not a nightly refresh but a
**multi-week backlog burn**: `extract:speaker-map` works through the sessions
that have no `pleno-speaker-map/<id>.json`, ~18 chunks per run (Mon + Thu) against the
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

The webhook only accepts Telegram. At boot the bot registers it with a `secret_token`
derived from `BOT_TOKEN` (`bot/src/services/webhook-telegram.ts`) and requires that
header on every update: anything without it gets 401 before its body is read, and
anything that is not a POST to the webhook path gets 404. There is no extra secret to
set, and it rotates with the bot token. Until 2026-09-17 it had none, and anyone could
post an update claiming to be any account, the admin included. `/health` reports
`webhookAuthenticated`; if the bot stops answering right after a deploy, check that
field first — a registered secret that differs from the required one mutes the bot.

Outside a private chat it only answers the public commands (`COMANDOS_PUBLICOS`,
`bot/src/services/solo-en-privado.ts`): until 2026-09-17 every command replied wherever
it was typed, so an admin's `/curar` in a group showed the whole unreviewed draft to
everyone there, and a resident's `/mis` their complaints. Group joining is disabled in
BotFather as well; the guard keeps that true if the setting is ever switched back on.

grammY answers 500 to an update still running after ten seconds and lets it run on, so
Telegram resends it — and moves on to that chat's next updates — with the first one
still in progress. The conversations plugin cannot take two updates of one chat at
once: on 2026-09-28 a repeated last step of `/queja` created a second queja with its own
review cards and hung both deliveries, and every later update from that resident did
the same until a restart. The first middleware (`bot/src/services/una-vez-y-en-orden.ts`)
drops an `update_id` seen in the last day, runs one update per chat at a time, and logs
a failing update instead of rejecting it, because a rejection after the timeout crashed
the process. In `flyctl logs`, `telegram.repetido` is a resent update that was not
handled again and `telegram.update` one that failed; a run of either means the Telegram
API, or a queja's card lock, is slow. Both live in memory, which is one more reason the
bot stays on one machine.

Besides the webhook, the bot runs its own hourly ticks. One anonymizes the queja
photos on the volume (`QUEJAS_PHOTOS_DIR`) and needs `GEMINI_API_KEY` and
`GEMINI_NIVEL=pago` — the same statement that turns on the text review, because the
image may only go to Gemini on Google's paid terms (/aviso-legal says so): without
either it holds every photo, and its boot line says which one is missing. On a confirmed `/olvidar` the
bot dispatches `pull-quejas.yml` with `GITHUB_DISPATCH_TOKEN` (a fine-grained token
limited to this repository, «Actions: Read and write»); without it, the withdrawal
waits for the daily run.

Another tick, hourly, moves a registered queja to `silencio_negativo` once its plazo
has lapsed, counted in the sede's calendar of días inhábiles (`FESTIVOS_DE_LA_SEDE`
in `src/scraper/queja-router.ts`). That table is copied by hand, a whole year at a
time, and a year can only be completed once the DOGV publishes its local holidays,
in mid-November (18-11-2024 for 2025, 14-11-2025 for 2026). A plazo that ends in a
year the table lacks is not decided: the queja stays `registrada`, which the cron
said only in its log. Since 2026-09-30 `/health` goes degraded 30 days before the
nearest such nominal day (`AVISO_SIN_CALENDARIO_DIAS`), so `ops-alarm.yml` goes red
from 2 December at the earliest, with the source already out; the line says how
many quejas, which year, and where to add it. Merging the year redeploys the bot and
clears it. The access requests the reportajes publish count their plazos with three
calendars (`src/scraper/calendarios-inhabiles.ts`) that nothing alarms on: add the
year there too, as each source comes out — Madrid's local holidays come out in
December (BOCM, 12-12-2025 for 2026).

## Health checks

All report-only inside `scrape:all`; run any of them directly.

| Command                           | Catches                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `check:relations`                 | cross-snapshot FK breakage (findings→claims, votes→plenos, …)                |
| `check:cadence`                   | snapshots past their expected refresh interval                               |
| `check:runs`                      | a run that reported success without doing work — or without trying           |
| `check:citations`                 | a published claim whose citation no longer holds                             |
| `check:guards`                    | a guard in this table that nothing invokes                                   |
| `check:drift`, `check:vocabulary` | upstream shape / vocabulary changes                                          |
| `check:corpus`, `check:retrieval` | embedding corpus integrity, self-retrieval probe                             |
| `check:transcripts`               | degenerate transcripts in the published corpus                               |
| `check:json`                      | unparseable snapshot or merge-conflict marker (also in pre-commit)           |
| `check:automation`                | which action classes are gated, and on what measurement                      |
| `check:summary-gate`              | a summary reproducing any version of a quote the gate withholds (ids only)   |
| `check:data-graph`                | the hand-written dependency graph drifting from what scripts do              |
| `check:queues`                    | a curator worklist describing findings that no longer exist                  |
| `check:surfaces`                  | public pages nobody has read lately, or a reader-review flag left standing   |
| `check:indicadores`               | a `/eficiencia` figure that no longer resolves to its source cell            |
| `check:eficiencia-findings`       | a signed ficha asserting a figure its source has since revised               |
| `check:dea`                       | a frontier score that no longer reproduces, or names a third party           |
| `check:competencias`              | a nightly `officials.json` moving the name printed beside a published figure |
| `check:sparse`                    | a working tree pruned by a foreign `sparse-checkout` (also in pre-commit)    |
| `check:hooks`                     | a worktree where git silently skips the hooks (pre-commit, `monitor:health`) |

`check:guards` is the one that keeps this table honest, and on 2026-08-12 it
found three of these — `summary-gate`, `data-graph`, `queues` — defined,
tested, and invoked by **nothing**: not a workflow, not a pipeline, not a hook.
That is its own documented failure mode 1. Every guard is wired now; a few still
have no fault injection, and it says so rather than counting them as proven.

It happened again on 2026-08-23, with the most delicate one: `check:competencias`
— the only thing standing between a nightly scrape and a change to which living
person appears beside a published figure — shipped with the competencias layer
and was invoked by nothing for eleven days, so `check:guards` had been exiting 1
on main that whole time. Wiring is not a finishing touch; it is the difference
between a control and a decoration.

And wired is not read. `check:summary-gate` has run in the nightly since it was
wired, and from 2026-08-27 it blocked every night on a signed summary that
printed a withheld quote almost whole — as a `soft_failures` line in
`scrape-all.sh`, which no screen reads. A reader found it by hand a month later.
It runs in `monitor:health` now, printing ids and never the literal, since that
digest travels by Telegram.

**Three traps in `--inject` itself**, all found by using it. It refuses to inject
into a file with uncommitted changes and says so in a line that is easy to skim
past — with nightly churn in the tree it will skip a guard and still finish
cheerfully, which is «green by not running» one level up. A guard can be
wired, tested and still toothless: `check:drift` reported `✗` for a year because
the one figure its injection targets carried a `scope` note that exempted it from
the threshold. And a red exit proves nothing on its own: on 2026-10-04 the
`check:veredictos` injection corrupted `pleno-claims/index.json`, a file that
guard never opens (silent, and copied from `check:cobertura`'s), while between
#226 and #228 the same guard already exited 1 with nothing injected, so any
injection would have read FIRES. Since 2026-10-05 each injected guard runs once
on the untouched tree first; one that is already red is reported **SIN PRUEBA**
with its exit code (reported, not fatal: some guards are red by design), and an
injection may name the mark its guard prints for that fault (`espera`), so a red
run without it counts as unproven too. Read the per-guard line, not the exit
code.

Baselines (`.vocabulary-census.json`, `.transcript-check-baseline.json`) are
**committed on purpose**. Gitignored, CI would write a fresh one each night and
report "no change" forever.

`check:citations` is split across two runners, and the split is the point. The
free structural half (does every claim cite a source that exists, is every quote
verbatim in its excerpt) runs in `scrape:all` with `--offline`. The URL probe
runs in `scrape-ci-blocked.sh`, because it needs a residential IP for the same
reason the adapters there do — a runner would mark most of the corpus
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
a partial pass read as full coverage — as of 2026-08-03 that is 11 of 15. Before
a guard's first injection it runs that guard on the untouched tree: an injection
only proves something against a guard that was green without it. The overlay
injection of `check:veredictos` needs the gitignored base on disk; without it, it
reports «not exercised» rather than a silence it did not measure.

## Git hooks

- **pre-commit** — `lint`, `format:check`, `check:json`, `check:secrets --staged`,
  `check:privado --staged`, `check:editorial --staged`, `check:metadatos --staged`,
  `check:sparse`, `check:hooks --desde-gancho`. Fails on errors only; lint
  warnings stay warnings, and `check:hooks` never fails it.

  The four `--staged` gates each ask what the others cannot, and the split
  is the point. `check:secrets` recognises a credential **by its shape** — a
  Telegram token looks like a Telegram token. `check:privado` catches what has
  no shape: our own submitted-application reference, our own salary target, the
  amount **we** ask for. On 2026-09-09 an NLnet proposal code went into a file
  that both deploys and is publicly readable; `check:secrets` looked straight at
  it and correctly reported zero.

  Its discriminator is that **the subject is us**, and that matters more here
  than anywhere: this site publishes councillor salaries and municipal budgets —
  that is its job. So a hit needs the line to say the pay or the ask is ours
  **and** the file to name a funder. The first version checked only the line and
  produced 66 findings over the tree, nearly all false; each of the six false
  positives is now a test. Full-tree audit: `npm run check:privado`, which also
  runs inside `monitor:health` — a gate that only inspects what arrives today
  passes everything from yesterday, and yesterday was where the exposure was.

  `check:editorial` is about **third parties**, which `check:privado` leaves out
  by design: unreviewed prose about a living person. On 2026-09-10
  `git ls-files editorial/` returned 27 journalist-agent drafts about named
  councillors, all on `main`. `editorial/` had been in `.gitignore` since
  August, but `.gitignore` only stops new files from being added — it does not
  untrack what is already tracked — and the drafts had gone in with
  `git add -f` while the repository was still private. Full audit:
  `npm run check:editorial`.

  `check:metadatos` is the one that opens the file. The other three read text,
  and a name can live inside a file's binary structure: on 2026-09-28
  `conprel_CV_2024.xls`, a real Hacienda download committed in April, turned out
  to carry two ministry employees' names — one in `LastAuthor`, one in the BIFF
  `WRITEACCESS` record that SheetJS `Props` never shows — plus the tail of a
  third in that record's padding. It reads OLE property sets and `WRITEACCESS`,
  OOXML and ODF metadata parts, comment and tracked-change authors, every
  `/Author` revision and XMP packet in a PDF, and EXIF/XMP/IPTC in images;
  policy and reasons are in `src/scraper/metadatos/index.ts`. Document
  authorship always fails unless it is an institution or a program on
  `AUTORIA_INSTITUCIONAL`; a photographer's credit stays (it is rights
  information); serial numbers, original file names, disk paths and GPS fail in
  any image; a queja photo may carry nothing at all. It reads the **staged
  blob**, not the working copy, **masks** what it finds (the CI log of a public
  repository is public), and counts an unreadable file as a failure, never as
  clean. `npm run fixture:sin-autoria -- <file>` blanks the flagged fields in
  place without re-saving the file, so a fixture stays the real download byte
  for byte outside those fields. Full audit: `npm run check:metadatos`, which
  also runs in `monitor:health` because queja photos arrive through
  `pull-quejas.yml`, where no hook runs; `-- --historia` reads every version of
  every file in any ref. Removing a file from the tip does not remove it from
  history.

- **pre-push** — reads, as a visitor would, the pages this push can have
  broken. **Never blocks**: a probabilistic check that can block a push teaches
  everyone to type `--no-verify`, and then it protects nothing. It is also too
  slow to hold a push open — see the note under the local jobs above for why the
  CI-blocked cron invokes it directly instead.

  Which pages is computed, not listed. The hook diffs `origin/main...HEAD` —
  three dots, after refreshing `origin/main` with a 10 s cap, because two dots
  or a stale ref count everything `main` moved as changed here — and hands the
  files to `scripts/routes-for-changes.ts`, which walks the import graph
  (`scripts/lib/route-graph.ts`) and returns the routes ordered: those whose own
  page module changed first, the rest by inverse fan-out. A push that reaches
  no page (tooling, scrapers, tests) says so and stops, and so does a missing
  `claude` CLI: the review runs only on `claude-code`, the $0 backend.
  `PREPUSH_RANGE=HEAD~3..HEAD sh .husky/pre-push` runs the whole hook without
  pushing.

  "Never blocks" is structural, not a promise — the promise was false for eight
  commits. Husky runs the hook as `sh -e`, and under `-e` a command that fails
  inside the EXIT trap aborts the shell with its status; the trap's `kill` of an
  already-dead preview did exactly that, so the hook printed «el push continúa»
  and exited 1. It now sets `set +e`, ends its trap on `:`, and `exit 0`s on
  every path. All three are needed: a trailing `exit 0` alone still exits 1,
  because the trap runs after it.

  It is also **bounded and partial by design**: 150 s per route, capped at
  180 s, so in practice one route fits. The low cap is the decision, not an
  oversight — the hook gives the measurements behind both numbers. What does
  not fit is not lost: `--rotate-desde` keeps the direct routes at the head and
  rotates only the tail, stalest first, so what this push left out enters the
  next one, and the Monday and Thursday sweep reads every route. The budget
  never buys silence — routes the clock did not reach are named, half-read
  pages are not cached, and `npm run review:surfaces -- <route>` is the
  unhurried pass. The build uses the launch flags the deploy uses
  (`VITE_ENABLE_PERIODISTAS`, `VITE_ENABLE_EFICIENCIA`): without them
  `/eficiencia` redirects to `/`, and the review read the landing page believing
  it was the route it had asked for. The hook takes its own free port from 4189
  up, so a `npm run preview` on 4173 neither kills it nor gets silently reviewed
  in its place.

  Because it can no longer block, its **last line is the whole report** — nobody
  reads an exit code that cannot stop anything. So every path that read nothing
  says so: a failed build prints «LA BUILD FALLÓ — revisión OMITIDA (omitida ≠
  limpia)» with the routes left unread, and a review that never emitted its
  `[review]` coverage summary prints «la revisión NO llegó a emitir resumen —
  leídas 0 de N ruta(s)». Fault injection found the old hook printing «parcial
  por diseño» over a Playwright crash that had reviewed zero pages. A run that
  did read ends on «revisión completa» or «revisión INCOMPLETA», with how many
  routes it read in full and how many were skipped as unchanged. INCOMPLETA
  whenever the summary names any route left unread — cut off by the budget,
  unmounted, unreachable, or SIN REVISAR because the backend did not answer.
  Until 2026-09-27 only the first of those counted, and the agents' logs held 32
  «revisión completa» lines over reviews with routes SIN REVISAR, some with all
  eight of eight. And a push that touches the map's layers
  (`src/components/LiveCity/`) is told that their prose only exists with the
  layer switched on, so this pass has not read it; the sweep reads it as
  `/ [capas]`.

**Where they run.** Every worktree runs the main checkout's hooks, because
`core.hooksPath` in the shared `.git/config` is the absolute path of the main
checkout's `.husky/_`. husky writes it relative (`.husky/_`) every time it runs
— it is not a dependency and nothing here invokes it, so someone runs it by
hand — and git resolves a relative value against each worktree's own root,
where the gitignored `.husky/_` does not exist: there git runs no hook and says
nothing. On 2026-09-27 that was nine worktrees of twelve, found because a push
printed no `[pre-push]` line. The Claude desktop app hides it: it pins each
worktree it creates to the absolute path in that worktree's `config.worktree`,
so `git config core.hooksPath` read inside one of those looks right, while
worktrees made by `EnterWorktree` or `git worktree add` inherit the relative
value.

`check:hooks` asks git where each worktree looks for its hooks and checks the
whole chain — husky's stub, its `h` runner, the `.husky/` script — because two
links fail silently and one fails open: pointed at `.husky` itself (what the
desktop app does when `core.hooksPath` is unset), git runs the script without
husky's `sh -e`, and a failing step lets the commit through. `--fix` restores
the absolute path. The pre-commit runs it with `--desde-gancho`: repair, report,
never block, because the launchd agents commit through that same hook.
`monitor:health` runs it strictly, and that is its only red — a worktree without
hooks never runs the pre-commit that would notice. It is not in `scrape:all`:
the nightly runs in Actions, where there are no hooks by design, and it would
pass there without looking at anything. `prepare` re-applies it right after
husky, on the machines where husky exists.
