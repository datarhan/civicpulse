# CLAUDE.md

Guidance for Claude Code working in this repo. This file holds the **rules**.
Reference material lives in `docs/` — read the one you need rather than carrying
all of it — and the incident behind a rule is told in the header of the file
that enforces it: read that header before changing the mechanism.

| Doc                                                              | When                                              |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| [`docs/DATA_INTEGRITY.md`](docs/DATA_INTEGRITY.md)               | **before writing or changing any adapter**        |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)                   | per-domain source, parser and surfaces            |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md)                       | nightly job, workflows, local jobs, health checks |
| [`docs/LLM_BACKENDS.md`](docs/LLM_BACKENDS.md)                   | model/embedding backends, cost, claim pipeline    |
| [`docs/TRANSCRIPTION.md`](docs/TRANSCRIPTION.md)                 | Whisper, diarization, voice ID                    |
| [`docs/JOURNALIST_AGENT.md`](docs/JOURNALIST_AGENT.md)           | the `/laboratorio/agentes` subsystem              |
| [`docs/QUEJAS_DESIGN.md`](docs/QUEJAS_DESIGN.md)                 | rationale for the Telegram-first quejas OS        |
| [`docs/DESCRIPCION.md`](docs/DESCRIPCION.md)                     | **before writing public copy about the project**  |
| [`docs/REVIEW_2026-09.md`](docs/REVIEW_2026-09.md)               | priorities to May 2027, what not to build next    |
| [`bot/README.md`](bot/README.md), [`bot/LOCAL.md`](bot/LOCAL.md) | the Telegram bot                                  |

## What this is

A civic monitor for **Riba-roja de Túria** (Comunitat Valenciana · INE 46214 ·
Wikidata Q23701 · OSM relation 342356). It publishes what the town council does
— budget, contracts, council votes, promises, citizen complaints — with a
citation for every claim.

It is a watchdog, not a product: no ads, no SaaS tier, no growth loop. That is
why the honesty rules below are load-bearing rather than decorative.

Bilingual UI (`src/i18n.jsx`): Castilian default, Valencià via the tweaks panel.
Only **chrome** strings are translated. Data content — headlines, acta titles,
official names, promise quotes, legal citations — stays in its source language
so quotes remain verbatim.

## Commands

```bash
npm run dev          # Vite dev server, http://localhost:5173
npm run build        # production build → dist/
npm test             # Vitest, once
npm run test:watch
npm run test:e2e     # Playwright: per-route + chrome + mobile + axe
npm run typecheck    # tsc --noEmit, must stay clean
npm run lint         # ESLint owns correctness
npm run format       # Prettier owns formatting (pre-commit runs format:check)
npm run scrape:all   # the nightly, locally: every autonomous adapter + its gates
```

`npm run` lists all of them, including the curator CLIs. Do not re-catalogue
them here — the hand-kept list drifted from reality every time it was tried.

**Git hooks** (`.husky/`; each gate's reason is in its comments): pre-commit
runs `lint`, `format:check`, `check:json`, `check:sparse` and the staged-only
scans `check:secrets`, `check:privado`, `check:editorial`. Pre-push builds and
runs `review:surfaces` on the routes the push can have broken; it never blocks,
so its last line is the whole report — read it. The hooks run only where
`core.hooksPath` points at them, which is the curator's machine: `husky` is not
a dependency, so a fresh clone or a cloud session runs none of them. There, run
`lint`, `format:check` and `typecheck` yourself; CI's `e2e.yml` runs the three
scans over the whole tree regardless.

The e2e suite covers per-route specs, `chrome.spec.ts` (Cmd+K, dark mode, i18n,
sidebar), a 375px mobile shell, and an axe-core WCAG 2.1 AA strict pass. The
launch flags in `src/flags.js` (`VITE_ENABLE_PERIODISTAS`,
`VITE_ENABLE_EFICIENCIA`) are always on in `npm run dev` but read at BUILD time
by a production build, which is what e2e serves. CI builds with both `true`;
locally they are absent, so the specs that follow a Biografía link (in
`cargos.spec.ts` and `chrome.spec.ts`) fail — that is the flag, not a defect —
and the `/eficiencia` and `/gestion` specs skip. `vite preview` is reused
between runs, so rebuild before expecting a gated spec to run.

**A launch flag belongs in both `deploy-vercel.yml` and `e2e.yml` or neither.**
In the first alone, a route ships to the public while its whole spec skips
itself in CI — green by not running. `tests/deploy-triggers.test.js` reds on it.

## Architecture

A **front-end-only SPA** (Vite + React 18 + React Router 6) reading static JSON
from `public/data/`. It has no backend of its own: Vercel serves the built
assets next to the JSON. Two things are not the SPA and are easy to mistake for
exceptions:

- **The Telegram bot (`bot/`) is deployed**, on Fly.io
  (`munigraph-ribarroja.fly.dev`, webhook mode, SQLite on a persistent volume).
  It captures citizen complaints, is not part of the SPA build, and the site
  renders fine without it. `pull-quejas.yml` pulls its `/export/quejas.json`
  into `public/data/` daily. See `bot/DEPLOY.md`.
- **`vite-curator-plugin.js`** mounts `/api/curator/*` for the local-only
  `/curator` dashboard. It, `vite-app-graph-plugin.js` and the dev-only
  `/despiece` route are kept out of the production build by independent guards
  in `vite.config.js` and `App.jsx`, so any one can fail without shipping them.

The shell:

- `src/App.jsx` is the root and the one place routes are declared — read it, not
  a list here (the one that was here had drifted). `/` renders `DirectionD`
  (section bar + full-bleed map + editorial column + KPI strip) with **no
  sidebar**; every other route renders inside `InnerShell`; the catch-all
  redirects to `/`. Legacy `/hud` `/briefing` `/d` `/variants` `/ciudad`
  `/overview` were removed. Do not reintroduce them.
- `src/nav.js` owns `NAV` + `NAV_SECONDARY` — the single nav source for both the
  labelled `Sidebar` and the landing's section bar (`BarraSecciones`: named
  groups with dropdowns, plus an index), so the two cannot drift. Adding a route
  means a glyph in `SectionGlyph.jsx`, a `group` and a one-line `descKey` in
  both locales — `tests/nav-grupos.test.js` reds on the last two.
- `tweaks` (dark mode, density) persists to `localStorage['cp:tweaks']` and
  applies `html.dark` + a root font size.
- Cmd/Ctrl+K opens `components/CmdK.jsx`, indexing `NAV`, officials (current and
  former), promises, quejas and pleno findings.

### Reportajes

Each pieza is an **explicit route**, not a `:slug` param, with its figures
frozen in `public/data/reportajes/<slug>.json`. `src/reportajes.js` lists the
slugs; the index, the landing teaser and «Más reportajes» show a pieza only when
`meta.estado === 'publicado'`, but its own URL renders before then under a
«Borrador editorial» banner — unlisted, not private.

- What every pieza shares lives once: the layout route
  `pages/reportajes/Armazon.jsx` (reading bar, «Más reportajes» — outside the
  pieza's container, because the corrections log must stay its last block) and
  `components/reportajes/Pieza.jsx` (`SecHead`, the section index read from the
  DOM, the reveal-on-view hook).
- Figure motion animates marks, never text, and the resting state is the
  complete figure.
- Body text sits on a ~70-character reading measure (`.cp-pieza`); boxed
  elements and headline-size type keep the full column, and everything shares
  one left edge — never centre the measure. `.cp-pie`, `.cp-texto` and
  `.cp-ancho` mark the exceptions; `src/index.css` explains each beside
  `.cp-pieza`.
- A header card whose value the figure prints verbatim hides where the figure
  shows (`cifrasDelEmblema`, guarded by a test that reads the drawn SVG).
- In a figure, red (`fallo`) marks only what the piece documents as a failure;
  what it merely looks at is petrol (`foco`).

### Styling

Tokens are CSS variables in `src/index.css` with an `html.dark` override block.
Tone names (`TONE_NAMES` in `components/Primitives.jsx`) flow through `Pill`,
and `Delta` colours by sign; add semantic colours there, not inline. `.mono` is
DM Mono with tabular numerals, for every numeric value.

Components use **inline styles driven by those variables**, not CSS modules or
styled-components. Keep it that way unless asked — theming works through the
single token layer. The corollary: inline styles cannot hold media queries and
outrank classes, so anything responsive must live in a real stylesheet or a
`<style>` block, never in the JSX `style` prop.

The landing keeps its own fixed warm-paper palette in `direction-d/tokens.jsx`
and deliberately does not follow dark mode.

### Charts & maps

Figures are per-domain SVG components (`src/components/Charts.jsx` now holds
only `Sparkline`). The landing's Leaflet map, `LiveCity/StylizedMap.jsx`, is a
thin orchestrator over `network/`, `popups/`, `layers/`, `controls/`; each
toggleable layer is conditionally mounted so a hidden layer's rAF/WMS never
runs. `/quejas`, `/presupuesto` and `/empleo` carry their own Leaflet maps.

Map honesty rules, which are the point of every map:

- **No synthetic geometry and no invented scores.** Every pin traces to a
  contract whose title named that place.
- The place-resolver (`src/scraper/place-resolver.ts`) deliberately
  under-matches — an honest miss beats a wrong pin. Its gates are unit-tested in
  `tests/parse-place-resolver.test.ts`; read them before loosening anything.
- A layer that shows a fraction of its domain must **say so**. The spending
  layer paints a few percent of municipal contracting, because most municipal
  money is town-wide service contracts with no address — `MoneyCoverage.jsx`
  states the share from the snapshot's own `universe` block. That limit is a
  finding, not an embarrassment.
- Honest empty states: a barrio with zero complaints never paints.

## Data pipeline

```
scripts/scrape-<x>.ts   fetch + CLI (or a src/scraper/*-fetch.ts helper)
  → src/scraper/<x>.ts  pure parser, no network, tested against a fixture
  → public/data/<x>.json
  → src/hooks/use<X>.js  returns { loading, error, data }
```

Most pipeline scripts follow this exactly; `docs/DATA_SOURCES.md` lists the
exceptions and every domain's upstream source. `compute-*` scripts derive a
snapshot from other snapshots. Re-running any adapter is idempotent.

Hooks all ride one delivery layer — `useJsonFetch` → `useSnapshot` → the
module-level snapshot store (`src/lib/snapshot-store.js`), a session-lifetime
single-flight cache. Concurrent mounts share one fetch; navigation does not
refetch. Deliberate bypasses: `useLabHealth` (measures raw bytes), the
Open-Meteo hooks, and `PlenoDetalle`'s raw transcript `.txt`. No React Query —
the store is ~150 lines.

Prefer a precomputed scalar over shipping a corpus: `/departamentos` reads the
`totals.byTopicVerdict` cross-tab from the claims manifest rather than the
per-pleno chunk set.

### TDD cadence

Three commits per adapter:

1. `test: add reproducer for <adapter> (RED)` — commit a real payload to
   `tests/fixtures/<source>_<date>.<ext>` and pin the parser contract. It should
   fail; the module does not exist yet.
2. `fix: implement <adapter> (GREEN)` — the minimal pure parser.
3. `feat(<domain>): wire real <domain>` — CLI, hook, UI, and the generated
   `public/data/*.json` committed alongside the code.

Fixtures are the RED contract; commit them. Shared primitives live in
`src/scraper/normalize.ts` and `src/scraper/hash.ts` — `fnv32` / `sha256Short`
are the stable IDs rows key on, so never fork a local copy. Nor "correct" them:
`fnv32` multiplies without `Math.imul`, so it is not textbook FNV-1a, and making
it so would re-key every row ID.

### Data integrity

`docs/DATA_INTEGRITY.md` is the output of an audit that found ~30 real defects
across every pipeline here. Read it before writing an adapter. The four rules
that would have prevented the most damage (code comments cite them by number):

1. **Export the enum; never restate it in a test.** Six tests hand-copied a
   shape and stayed green while production matched nothing. The costliest: the
   allow-set said `finalized`, the source emits `formalized`, 298 contracts
   coerced to `unknown` — and because `unknown` was also in the copied list, the
   test could not fail. €53.5M vanished from the published site. Pair every enum
   assertion with a fallback ceiling (`unknown / total < 0.1`).
2. **A run must prove it did work.** Report attempted / done / never attempted /
   skipped-with-reason separately. Folding "never attempted" into "unchanged" is
   what let a pass report `re-judged 1017` having made zero LLM calls.
3. **A sentinel is never a value.** `Otro` meant both "a party" and "cannot
   tell"; with one councillor under it, publishing it named that councillor by
   elimination. Name the thing or return `null`.
4. **Nothing automatic rewrites published prose.** Automated verdicts may only
   go down (retract), never up. Corrections go through the corrections CLIs so
   they leave a record.

**Never write a row count, euro total or test count into a doc.** Every one that
was here was wrong when audited on 2026-08-03, some by 4×. Read totals from a
snapshot's `stats` block where it has one; the suites report their own. A dated
record (like `docs/REVIEW_2026-09.md`) may carry figures if it says so at the
top.

## Checking what a reader sees

"Green" and "right" are different claims; only one of them is about what a
reader sees.

- **Assert that a check evaluated something**, not just that it found nothing.
  Two suites here were green while measuring nothing: a mobile test whose pass
  condition was satisfied _by_ the clipping bug it should have caught, and an
  axe contrast gate reporting zero violations from a rule that never ran
  (Leaflet tiles defeat background resolution).
- **A front-end change is not done until it has been looked at in a browser.**
  Build it, serve it, open it, and measure what you changed against what it
  should line up with (`getBoundingClientRect()` on both edges); then check dark
  mode and 375px. The suites assert about data and text and cannot see a layout
  — `SerieServicio.jsx` tells of a band that shipped covering half the hole it
  marks with every suite green.
- **The reader-review asks whether a page _says_ something true**, which no data
  check can. `review:surfaces` runs in the pre-push hook and in a twice-weekly
  sweep of every public route (`scripts/review-sweep.sh`, launchd), because git
  hooks do not run in Actions, Actions has no $0 LLM backend, and the nightly
  commits data nobody pushes. `check:surfaces` reports unread pages and standing
  flags into the `monitor:health` digest; cadence and cost are in
  `docs/OPERATIONS.md`. The `revisar-superficies` skill is the same reading by
  hand.
- **Never call a budget credit «gastado».** Of the budget's five magnitudes —
  crédito inicial, modificaciones, crédito definitivo, the CONPREL return,
  obligaciones reconocidas — only the last is spending; prose that collapses
  them misstates spending by more than 2× with every number right.
  `src/scraper/magnitudes-fiscales.ts` flags an execution word beside a figure
  that is not execution, with no LLM call, inside `review:surfaces` and its
  dismissal channel — a second channel would be one more guard nobody reads. It
  ignores prose with no figure beside it on purpose: a deterministic check
  stretched into style is a false-positive machine.
- **The pre-push review's route selection** (`scripts/routes-for-changes.ts`
  over `scripts/lib/route-graph.ts`) has been wrong three ways already — a
  two-dot diff, a flat unordered route set, a graph blind to CSS and the shell.
  Read both headers and `.husky/pre-push` before touching it. Adding `.css` to
  the graph's file filter is inert; `tests/prepush-range.test.js` pins the
  three-dot range.

## Legally material surfaces

These make claims about named elected officials: `/promesas`, `/hallazgos`,
`/declaraciones`, `/departamentos`, `/laboratorio/agentes`, and the signed
area-fit block on `/cargos/:slug`. Treat any change to them as legally material.
The rules below are encoded in schema validators and CLIs — if you find yourself
working around one, stop.

**`/eficiencia` and its sibling `/gestion` are legally material too.** They are
one feature behind one flag, split by SOURCE — `/eficiencia` is the _coste
efectivo_ return; `/gestion` is PMP, CONPREL, the contractor profile and the
execution statement — sharing `eficiencia-findings.json`. Every municipal
indicator declares its own `panel`, so the split cannot drift into a hand-kept
list. A finding describes a service's unit cost or a municipal process, never a
person: `eficiencia-finding.ts` rejects `pleno-finding.ts`'s person fields
(`CAMPOS_PROHIBIDOS`) in case a row is ever copied across, and its right of
reply is institutional (`RESPONDENTES`). A unit cost hung on a named councillor
is a materially different claim, and not one the ministry's return supports.

**Competence, not blame.** Since 2026-08-23 the pages also name, from
`competencias.json`, who holds each delegated competence — republishing the
council's own transparency portal, so a reader knows whom to ask. That is not
the finding's claim, and the split is load-bearing (`competencias.ts`' header
has the reasoning):

- The signed ficha still cannot name a person, and the tier caveat («es un
  precio y no un rendimiento») renders in the same card as the name.
- The schema has **no field where a judgement fits**; its validator rejects
  `pleno-finding.ts`'s fields and any valoración-shaped key.
- The map is **curated and frozen**: a nightly scrape of `officials.json` must
  never change which living person sits beside a published figure —
  `check:competencias` reds instead.
- An `editorial` row (a jump we made, not the council) needs its `razon`; a
  service no portfolio names gets `sinAsignar` with a motive, never a guess —
  naming by elimination is the `Otro` sentinel again.
- Named people get a personal right of reply, and the LOREG freeze hides the
  whole layer.
- Naming is **not** regrouping: cards group under functional `AREAS`
  (`indicador-registry.ts`), never by concejalía — grouping by cargo would make
  the page a scoreboard of people.

`eficiencia-preguntas.json` is hand-curated (its validator rejects person-shaped
fields and any «pregunta» that is not interrogative). The reportaje's
infographic is served frozen from `public/infografias/`, figure-synced to the
reportaje JSON by `tests/infografia-sync.test.js`.

**`/laboratorio/frontera` publishes our model's verdict**, not a number somebody
else published: a DEA score moves with its modelling choices, so the choices are
part of what is published. Three rules — `check:dea` and its e2e spec enforce
the first two; the third is policy:

1. **No other municipality is ever named.** `/eficiencia` names its peers
   because there the figure is the ministry's own division; here, naming would
   sign a claim about councils with no right of reply on this site. The full
   method ships instead, so anyone can rebuild the table we refuse to publish.
2. **Specifications that fail are published as failed.** Showing only the basket
   that worked shows the result instead of the method.
3. **It never generates a finding.** That would launder a model output into the
   legally material surfaces.

`/laboratorio/coste-esperado` (the OLS expected-cost experiment) inherits all
three — its sample is published anonymous and population-sorted, failed
specifications ship as failed, its residuals never become findings.
`check:coste-esperado` re-fits it from the published sample alone.

### What may publish

**Curated files are never written by automation.** Route algorithmic output
through the curator CLI that owns the file, so the validator and git history
stay authoritative. The list, with each file's CLI, is `CURATED` in
`.claude/hooks/curated-paths.mjs` — the one the guard hook enforces. Do not copy
it here; the copy that was here had drifted from it.

**What runs without a human is decided by `decideAutomation`**
(`src/scraper/automation-policy.ts`), not by each script. Weakening actions —
retract, downgrade, unpublish — run unattended (tier A). Additive publication
that names nobody runs unattended only once its class has a measured precision
over the bar for its severity (tier B). Naming an individual, or anything
outward-facing, always takes a human (tier C), and an unmeasured class falls to
C: nothing is unlocked by assertion. New automation goes through it; the press
and promise auto-curators predate it and do not call it yet
(`docs/REVIEW_2026-09.md` §25).

**A suggestion never substitutes for a published status.** Machine rows awaiting
a human carry `requiresHumanApproval: true`, and the curated schemas reject that
field or drop it on re-validation. It is not a publication marker by itself: the
pleno-claim chunks the pages render keep it as extraction metadata, and their
editorial gate is `claim-public-gate.ts`.

**Attribution is bloc-level until a curator promotes it — and a one-seat bloc is
not bloc-level.** The extractor's `speakerGroup` is one of `SPEAKER_GROUPS`
(`src/scraper/pleno-votes.ts`) or `null`, whatever voice ID matched; only a
curator crosses to naming an individual, per finding. But a bloc holding a
single seat names its councillor by elimination, and in this corporation that is
most of the opposition. `singleSeatBlocs()` (`src/scraper/corporation-seats.ts`)
derives them from the seats — never hard-code the list — and tagging one means
`namesIndividual: true`, which is tier C.

**Anything under `public/` is published — and so is anything committed.** Vite
copies `public/` into `dist/` and the deploy uploads `dist/` prebuilt, so a file
there is fetchable by URL whether or not a page links to it ("not rendered" is
not "not published"), and `.vercelignore` holds nothing back. The one way to
keep a file under `public/` off the site is `publication-denylist.js`, applied
to `dist/` by `vite.config.js`: it strips the files it names plus any JSON
carrying `requiresHumanApproval: true` rows that no browser module requests, and
`tests/publication-denylist.test.ts` checks the built artifact. That keeps a
file off the site, not out of the repository, which has been public since
2026-09-08. Unreviewed machine prose about a living person goes in `editorial/`
(gitignored; `check:editorial` refuses it staged, because `.gitignore` does not
untrack what is already tracked).

**A verbatim stays put; a number does not.** A quote from a March pleno will
read the same in ten years, so `check:citations` only has to confirm it is still
where it says. «62,68 días» can go false with nobody touching the page, because
the ministry revises an entrega. So each efficiency ficha freezes its
measurement — value, period, source cell — and `check:eficiencia-findings`
re-reads the live panel with **four** outcomes: `coincide`; `movido` (the panel
advanced a period — a notice); `contradice` (the same period now says something
else); `sin-indicador`. The last two exit 1. Fold "I could not find it" into
"matches" and the gate prints its own all-clear — the `r?.findings ?? []` defect
again. Apply the same shape to any future claim type whose subject is a figure
rather than a sentence.

Beyond those:

- **Evidence gates the strong verdicts.** A promise status outside
  `promises.ts`'s `V1_STATUSES` (`documentada`, `en-verificacion` — the two that
  assert nothing yet) needs ≥1 evidence entry. A `critical` finding needs ≥1
  _contradiction_ ref: a cross-checked document is not a refutation. A `dueBy`
  on a pleno vote needs a `dueBySource` clause copied verbatim from the acta —
  the validator checks only its length, so the verbatim part is on you.
  Machine-inferred deadlines reintroduce exactly the risk these block.
- **A citation has to resolve before it publishes.** `check:citations` blocks a
  journalist-report promotion (`promote-report`) whose claims cite a missing
  source, whose quote is not verbatim in the excerpt it cites, or whose URL is
  dead; elsewhere it only reports. It classifies URLs
  `alive`/`dead`/`unverifiable` and only `dead` blocks — a check wrong four
  times in forty-eight is one everybody skips. What it cannot judge — does the
  excerpt _support_ the sentence or merely relate to it — is the
  `revisar-borrador` skill.
- **An agenda item is a commitment only when a matching vote exists** (join on
  `plenoId + itemNumber`). Otherwise it renders as "debatido, sin voto
  transcrito" and is never counted overdue. Overdue flags never flip a status.
- **Opinion is not verifiable.** The verifier's `opinativa` short-circuit to
  `sin-datos` is policy, not a heuristic. Do not loosen it.
- **LOREG electoral freeze.** `frozenUntil` in `promises.json` is the one
  switch: it puts `/promesas` into read-only mode and halts every automated path
  that could move a claim about a candidate — suggestion engines, auto-curators,
  promotions, the journalist agent, relation engines, overdue flags, the
  competencia and area-fit layers, the bot's broadcasts. Grep `frozenUntil` for
  the full set; `bot-deploy.yml` redeploys the bot when it changes. Toggle only
  via `npm run freeze:set -- YYYY-MM-DD` / `freeze:clear`.
- **Right of reply is end-to-end, and a maintainer publishes it.** Replies
  arrive by GitHub Issue form or by email (`/aviso-legal#rectificacion`); filing
  only routes one. An `ingest-*` workflow publishes it when someone with write
  permission adds `publicar` — a label no template applies — re-checking that
  permission, then running the validator-fronted CLI and committing. Promise and
  competencia replies have no workflow: a maintainer runs `npm run reply` /
  `competencia-reply`. `tests/ingesta-aprobacion.test.js` pins the gate. Keep
  new claim types wired the same way.

`/metodologia` and `/aviso-legal` are the **published editorial contract**, not
marketing copy. When any of this behaviour changes, update them in the same PR.

## Working in this checkout

**Claude Code hooks enforce what this file used to only ask**
(`.claude/settings.json`); a rule moves into a hook once it has been broken in
production, and each module's header tells how. Every write and Bash command
passes through `.claude/hooks/guard-curated-writes.mjs`, which chains
`curated-paths.mjs` (**denies** a Write or Edit to a curated file and names the
CLI that owns it; asks before a draft-shaped file appears under `public/`),
`irreplaceable-paths.mjs` (asks before deleting gitignored state that has no
other copy — voiceprints, run manifests, the LLM and review caches),
`live-tree-paths.mjs` (below), `measure-media.mjs` (asks before a transcription
or voice-ID run, showing the media's measured duration) and `curl-hosts.mjs`
(never asks; **denies** a `curl` that could exfiltrate or hide its destination,
and logs reads from unknown hosts). Do not work around a deny. After a Write or
Edit, `remind-stale-copy.mjs` computes the routes whose prose describes the
snapshot just rewritten — though, as wired today, the model never sees its
output (below).

**The curator's working tree is never quiet, so there a tree-moving git command
is a write to something else's file.** The local launchd agents
(`docs/OPERATIONS.md` §Local scheduled jobs) run against that checkout on their
own schedule; most write `public/data/` and end with their own `git commit` +
`git push origin main`, and the extractors resume from the files on disk. **To
compare two versions, copy them aside (`git show HEAD:<path>` and `cp`) — never
stash, checkout or reset to do it**, here or anywhere. `live-tree-paths.mjs`
derives the running set from the process table rather than a roster; its header
tells the 2026-09-05 incident.

**If a `git add` starts refusing files, the tree has probably been pruned.**
This project never uses `sparse-checkout`, so a pattern comes from outside —
last time, a plugin whose `git-subdir` source landed its sparse-checkout on the
session's cwd. Pruned files vanish from disk as `skip-worktree` while
`git status` reports nothing missing. `check:sparse` refuses a commit from a
pruned tree and reds the nightly; `npm run check:sparse -- --fix-all` repairs
every worktree, main checkout included. **Disable before deleting the pattern**:
with the flag still on and no patterns, cone mode means «nothing matches».
History: `scripts/check-sparse.ts`.

**Worktrees.** On the curator's machine `core.hooksPath` is an absolute path
into the main checkout, so a push from any worktree runs the main checkout's
hooks — a `.husky/` change can only be tested by invoking it directly. A
worktree's config flags live in its own `config.worktree`: a leftover pattern
file with the flag still `true` is not inert, it is primed.

**Prose goes stale when the data moves**, and no data guard notices: the data is
right and the sentence is wrong. The better fix is to derive the sentence from
the data, as `PanelMunicipal` does with its list of compared indicators.
Otherwise, after a snapshot changes, look it up under `snapshots` in
`.claude/hooks/prosa-map.json` and re-read the routes it lists. The map is
**derived, not hand-kept** (`npm run build:prose-map`), and
`tests/stale-copy-paths.test.js` regenerates it with `--check` and fails on
drift. `remind-stale-copy.mjs` is meant to do that lookup for you, but do not
count on it: it fires only on a Write or Edit, not when a script regenerates a
snapshot (the usual path), and it prints to stderr with exit 0, which Claude
Code keeps out of the model's context.

## Ethics of collection

Every automated source is public-sector or open-licensed (Ley 19/2013,
datos.gob.es CC-BY, PLACSP/BDNS reuse clauses, OSM ODbL, Wikidata CC0).
Councillor photos are re-hosted from the council's own publication.

Keep scrapers polite: identify the project in a `User-Agent`, never loop
tightly, cache raw payloads locally while iterating. Aggregate anything personal
— citizen complaints especially — to neighbourhood level before it lands in
`public/data/`.

Queja photos are never published raw. The bot's hourly pass on Fly
(`bot/src/services/fotos-cron.ts`; by hand, `cd bot && npm run process-photos`)
boxes faces, plates and ID text with a vision model, hard-mosaics them, strips
EXIF/GPS, and **fails closed** — if the vision call cannot run, the photo is
held, never published. It writes to the bot's volume, and `pull-quejas.yml`
fetches what the export links. `/olvidar` deletes the bot's copy at once, and
`pull-quejas.yml` prunes the published file — within minutes while the bot's
`GITHUB_DISPATCH_TOKEN` is valid, at the daily run once it expires. That is the
right-to-be-forgotten enforcement point.
