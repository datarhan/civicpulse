# CLAUDE.md

Guidance for Claude Code working in this repo. Reference material lives in
`docs/` — read the one you need rather than carrying all of it:

| Doc                                                              | When                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| [`docs/DATA_INTEGRITY.md`](docs/DATA_INTEGRITY.md)               | **before writing or changing any adapter**     |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md)                   | per-domain source, parser and surfaces         |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md)                       | nightly job, workflows, crons, health checks   |
| [`docs/LLM_BACKENDS.md`](docs/LLM_BACKENDS.md)                   | model/embedding backends, cost, claim pipeline |
| [`docs/TRANSCRIPTION.md`](docs/TRANSCRIPTION.md)                 | Whisper, diarization, voice ID                 |
| [`docs/JOURNALIST_AGENT.md`](docs/JOURNALIST_AGENT.md)           | the `/laboratorio/agentes` subsystem           |
| [`docs/QUEJAS_DESIGN.md`](docs/QUEJAS_DESIGN.md)                 | rationale for the Telegram-first quejas OS     |
| [`bot/README.md`](bot/README.md), [`bot/LOCAL.md`](bot/LOCAL.md) | the Telegram bot                               |

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
npm run lint         # ESLint owns correctness, Prettier owns formatting
npm run scrape:all   # every autonomous adapter, ~3 min, idempotent
```

`npm run` lists all of them, including the curator CLIs. Do not re-catalogue
them here — the hand-kept list drifted from reality every time it was tried.

The e2e suite covers per-route specs, `chrome.spec.ts` (Cmd+K, dark mode,
i18n, sidebar), a 375px mobile shell, and an axe-core WCAG 2.1 AA strict pass.
CI sets `VITE_ENABLE_PERIODISTAS=true` and `VITE_ENABLE_EFICIENCIA=true`; both
are absent locally, so `/cargos`'s Biografía spec always fails on a local full
run. That is the flag, not a defect. `/eficiencia` is gated the same way but its
spec **skips** rather than fails when the flag is off — one always-red spec is
already one too many. The flag is read at BUILD time, and `vite preview` is
reused between runs, so rebuild before expecting the spec to run.

**A launch flag belongs in both workflows or neither.** `e2e.yml` sets them for
parity with `deploy-vercel.yml`, and the pair was hand-kept: turn one on alone
and the route ships to the public while its whole spec skips itself in CI —
green by not running, which is the defect this repo keeps paying for.
`tests/deploy-triggers.test.js` compares the two and reds on a flag that
deploys without being exercised.

## Architecture

A **front-end-only SPA** (Vite + React 18 + React Router 6) reading static JSON
from `public/data/`, plus a sibling Node.js Telegram bot (`bot/`) that captures
citizen complaints into SQLite.

The SPA has no backend of its own — Vercel serves the static assets next to the
JSON. Two things are not the SPA and are easy to mistake for exceptions:

- **The bot is deployed**, on Fly.io (`munigraph-ribarroja.fly.dev`, webhook
  mode, SQLite on a persistent volume). It is not part of the SPA build and the
  site renders fine without it. `pull-quejas.yml` pulls its
  `/export/quejas.json` into `public/data/` daily. See `bot/DEPLOY.md`.
- **`vite-curator-plugin.js`** mounts `/api/curator/*` for the local curator
  dashboard and is excluded from the production build in two independent places
  (`vite.config.js` externals + a React-layer route guard).

- `src/App.jsx` is the root. `/` renders `DirectionD` (full-bleed map + editorial
  column + KPI strip) with **no sidebar**; every other route renders inside
  `InnerShell`.
- `src/nav.js` owns `NAV` + `NAV_SECONDARY` — the single nav source for both the
  labelled `Sidebar` and the icon-only landing `LeftRail`, so the two cannot
  drift. Adding a route means adding a glyph in `SectionGlyph.jsx`.
- `tweaks` (dark mode, density) persists to `localStorage['cp:tweaks']` and
  applies `html.dark` + a root font size.
- Cmd/Ctrl+K opens `components/CmdK.jsx`, indexing `NAV` + officials + recent
  promises.

### Routes

Public: `/` `/cargos` `/cargos/:slug` `/presupuesto` `/eficiencia` `/gestion` `/plenos`
`/plenos/:id`
`/promesas` `/departamentos` `/departamentos/:slug` `/hallazgos`
`/declaraciones` `/reportajes` `/datos` `/empleo` `/empleo/:id`
`/empleo-publico` `/quejas` `/quejas/dashboard` `/quejas/:id` `/cambios`
`/laboratorio` `/laboratorio/agentes` `/laboratorio/agentes/:assignmentId`
`/laboratorio/frontera` `/laboratorio/coste-esperado`
`/nosotros` `/about` `/blog/:slug` `/lab-health` `/metodologia` `/aviso-legal`,
catch-all → `/`.

Reportajes are **explicit routes**, not a `:slug` param — each pieza is its own
component with figures frozen in `public/data/reportajes/<slug>.json`. The
shared registry `src/reportajes.js` renders one only when
`meta.estado === 'publicado'`.

`/curator` is the local-only admin dashboard (see the plugin note above).

Legacy `/hud` `/briefing` `/d` `/variants` `/ciudad` `/overview` were removed.
Do not reintroduce them.

### Styling

Tokens are CSS variables in `src/index.css` with an `html.dark` override block.
Tone names (`civic`, `ok`, `warn`, `crit`, `intel`, `neutral`, `ghost`) flow
through `Pill` and `Delta`; add semantic colours there, not inline. `.mono` is
DM Mono with tabular numerals, for every numeric value.

Components use **inline styles driven by those variables**, not CSS modules or
styled-components. Keep it that way unless asked — theming works through the
single token layer. The corollary: inline styles cannot hold media queries and
outrank classes, so anything responsive must live in a real stylesheet or a
`<style>` block, never in the JSX `style` prop.

The landing keeps its own fixed warm-paper palette in `direction-d/tokens.jsx`
and deliberately does not follow dark mode.

### Charts & maps

`src/components/Charts.jsx` holds the SVG primitives. Leaflet surfaces:
`LiveCity/StylizedMap.jsx` (landing — a thin orchestrator over `network/`,
`popups/`, `layers/`, `controls/`; each layer conditionally mounted so a hidden
layer's rAF/WMS never runs) and `QuejasHeatmap.jsx` (`/quejas`).

Map honesty rules, which are the point of the map:

- **No synthetic geometry and no invented scores.** Every pin traces to a
  contract whose title named that place.
- The place-resolver (`src/scraper/place-resolver.ts`) deliberately
  under-matches — an honest miss beats a wrong pin. Its four gates are
  unit-tested in `tests/parse-place-resolver.test.ts`; read them before
  loosening anything.
- A layer that shows a fraction of its domain must **say so**. The spending
  layer paints a few percent of municipal contracting, because most municipal
  money is town-wide service contracts with no address — `MoneyCoverage.jsx`
  states the share from the snapshot's own `universe` block. That limit is a
  finding, not an embarrassment.
- Honest empty states: a barrio with zero complaints never paints.

## Data pipeline

```
scripts/scrape-<x>.ts   fetch + CLI (the only place `fetch` lives)
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
refetch. Deliberate bypasses: `useLabHealth` (measures raw bytes) and the
Open-Meteo hooks. No React Query — the store is ~150 lines.

Prefer a precomputed scalar over shipping a corpus: `/departamentos` reads a
~12 KB cross-tab from the claims manifest rather than the 6 MB chunk set.

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
are the stable IDs rows key on, so never fork a local copy.

### Data integrity

`docs/DATA_INTEGRITY.md` is the output of an audit that found ~30 real defects
across every pipeline here. Read it before writing an adapter. The four rules
that would have prevented the most damage:

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
   tell"; with one councillor under it, publishing it named him by elimination.
   Name the thing or return `null`.
4. **Nothing automatic rewrites published prose.** Automated verdicts may only
   go down (retract), never up. Corrections go through the corrections CLIs so
   they leave a record.

The same trap applies to front-end gates. Two suites here were green while
measuring nothing: a mobile responsive test whose pass condition was satisfied
_by_ the clipping bug it should have caught, and an axe contrast gate reporting
zero violations from a rule that never ran (Leaflet tiles defeat background
resolution). **Assert that the check evaluated something**, not just that it
found nothing.

**A front-end change is not done until it has been looked at in a browser.**
Build it, serve it, open it, and measure the thing you changed against the thing
it is supposed to line up with — then check it in dark mode and at 375px. The
suites cannot see a layout. The band that marks the missing 2020 entrega on
`/eficiencia` shipped covering exactly half the hole it marks — 90px floating
inside a 181px gap, blank on both sides — with the whole unit suite, the axe
pass and the mobile spec green, because every one of them asserts about data and
text. A `getBoundingClientRect()` on both edges is what caught it, one commit
too late, and the user saw it before the tests ever could. "Green" and "right"
are different claims; only one of them is about what a reader sees.

The same split governs the reader-review. `review:surfaces` asks whether a page
_says_ something true, which no data check can — the four defects fixed on
2026-08-12 all had their figure right and their sentence wrong. It runs in two
places, and the division matters: the **pre-push hook** reads the routes that
push can have broken, derived from the import graph, every time; the **nightly
sweep** (`scripts/review-sweep.sh`, local cron — git hooks do not run in
Actions, and Actions has no $0 LLM backend) reads every public route, because
the nightly commits data and nobody pushes those pages. `check:surfaces` reports
into the existing `monitor:health` digest when a page goes unread or a flag is
left standing.

**One class of defect does not need a model, and this site produced it seven
times in one day**: calling a budget credit «gastado». The municipality has five
magnitudes the prose collapses into one word — crédito inicial 37,60 M€, plus
24,52 M€ of modifications, definitive credit 62,12 M€, 41,58 M€ reported to
CONPREL, and obligaciones reconocidas 18,91 M€, which is the only one actually
spent. A reader who sums the budget chapters and reads «se gasta» is wrong by
2,2×, and no data guard can see it: the numbers are right and the word is wrong.
`src/scraper/magnitudes-fiscales.ts` derives the magnitudes from the snapshots
and flags an execution word qualifying a figure that is not execution, with no
LLM call and no chance of hallucinating. It runs inside `review:surfaces` on the
text already rendered there, and its findings ride the same cache, digest and
dismissal channel — a second channel would be one more guard nobody reads. It
deliberately does not judge prose without a figure beside it: a deterministic
check stretched into style is a false-positive machine, and a false positive here
spends the attention the real ones need.

«The routes that push can have broken» was a promise the hook did not keep until
2026-08-23. It derived them with a **two-dot** `git diff origin/main..HEAD`,
which compares the two TIPS: with the branch even slightly behind, everything
main had moved counted as changed here. Measured on one push — 45 files and 10
routes where three dots give 23 and 2. And `--rotate` made it worse than noise:
it orders by staleness, so the phantom routes sorted AHEAD of the two the push
had actually rewritten, which had just been read. The better a page was kept,
the less likely the review reached it. Three dots now, plus a refresh of
`origin/main` first — with a stale ref the merge-base is computed against an old
main and the phantoms come back. `tests/prepush-range.test.js` pins both, and
strips comments before matching, because the comment explaining this quotes the
wrong form.

Removing the phantoms was only half of it, and the other half took until
2026-08-26. The inversion was never caused by the phantoms — it is caused by
the ORDER, and it happens just as well with routes that are all legitimate: on
the Revisión Eficiencia push, nineteen real routes, and the two the change was
entirely about came last because they had been read that morning and the other
seventeen had not. Two things were wrong underneath. **Centrality was computed
and thrown away** — `routes-for-changes` collected into a `Set`, so a
translations file touched in passing and the twenty-four files of the actual
redesign produced flat, indistinguishable lists. And **two whole classes of
change reached no route at all**: `src/index.css` and everything `App.jsx`
imports statically — the shell — because the graph only seeded from the page
modules behind `import()`, and the effect-import `import './index.css'` has no
`from` for the edge regex to catch. So the hook now asks for the routes ordered
(direct first — the page's own module changed — then by inverse fan-out) and
passes `--rotate-desde <n directas>`, which keeps that head in the caller's
order and rotates only the tail. Rotation was always right for what does not
fit; it was never right for the head. The budget is unchanged and stays low on
purpose: the fast gate reads ONE route, and the defect was always **which**.

Do not "fix" the CSS blind spot by adding `.css` to the graph's file filter. It
is inert — `alcanzaEstatico` adds whatever it resolves, listed or not, and
`index.css` reaches its thirty routes with the filter in or out, measured both
ways. The load-bearing change is the effect-import edge.

Never write a row count, euro total or test count into a doc. Every one that was
here was wrong when audited on 2026-08-03, some by 4×. Snapshots carry a `stats`
block; the suites report their own totals.

## Legally material surfaces

Five surfaces make claims about named elected officials: `/promesas`,
`/hallazgos`, `/declaraciones`, `/departamentos`, `/laboratorio/agentes`. Treat
any change to them as legally material. The rules below are encoded in schema
validators and CLIs — if you find yourself working around one, stop.

`/eficiencia` and its sibling `/gestion` are the sixth legally material surface.
They used to be the only ones that named **nobody**; since 2026-08-23 they name
the holder of the delegated competence beside each ficha, and the line moved
rather than disappeared — see **competence, not blame** below. They are one
feature split by SOURCE —
`/eficiencia` is everything from the _coste efectivo_ return, `/gestion` is the
PMP series, CONPREL, the contractor profile and the execution statement — behind
one flag, sharing `eficiencia-findings.json`; each ficha renders on the page
where its indicator lives, and every municipal indicator declares its own
`panel` so the split cannot drift into a hand-kept list. Their findings describe
a service's unit cost or a municipal process, so
`eficiencia-finding.ts` has no field for a person and actively rejects
`pleno-finding.ts`'s (`individualSpeaker`, `speakerGroup`, `quotes`, `severity`)
in case a row is ever copied across. A finding's right of reply is
institutional — ayuntamiento / intervención / concesionario / ministerio. Keep
it that way: a unit cost hung on a named councillor is a materially different
claim from one hung on a service, and only the second is what the ministry's
return supports.

**Competence, not blame.** What the pages now name, in `competencias.json`, is
who holds the delegated competence — republishing what the council itself puts
on its transparency portal, so a reader knows who to ask. That is not the same
claim as the finding, and the split is load-bearing: the signed ficha still
cannot name a person, and the tier caveat renders in the same card as the name,
so «81.964,66 €/efectivo» never appears beside a councillor without its «es un
precio y no un rendimiento». The schema has **no field where a judgement fits**,
and its validator rejects `pleno-finding.ts`'s fields and any valoración-shaped
key. Three more rules, each with a scar behind it: the map is **curated and
frozen** because `officials.json` is scraped nightly and a cron must never
change which living person sits beside a published figure (`check:competencias`
reds instead, four outcomes); each row declares `literal` or `editorial` and an
editorial one needs its `razon`, because a jump we made is not a jump the
council made; and a service no portfolio names gets `sinAsignar` with a motive,
never a guess — naming by elimination is the `Otro` sentinel again. Named people
get a personal right of reply, and the LOREG freeze hides the whole layer.
Naming is **not** regrouping: service cards
group under functional `AREAS` declared per-service in the registry (never
concejalías — grouping by cargo would make the page a scoreboard of people,
which is a stronger claim than «this is who answers»);
`eficiencia-preguntas.json` is hand-curated (reportaje class, PR-reviewed; its
validator rejects person-shaped fields and any «pregunta» that is not
interrogative); and the reportaje's infographic is served frozen from
`public/infografias/`, figure-synced to the reportaje JSON by
`tests/infografia-sync.test.js`.

`/laboratorio/frontera` is a different animal and the boundary matters.
Everything else here transcribes or divides numbers somebody else published; a
DEA score is **our model's verdict**, and its modelling choices move it — four
defensible baskets send Riba-roja's score across half the scale. Three rules,
all enforced by `check:dea` and its e2e spec:

1. **No other municipality is ever named.** `/eficiencia` does name its peers,
   because there the figure is the ministry's own division and hiding the
   comparison set would break the show-your-work contract. Here, naming would
   sign a claim about twenty councils that have no right of reply on this site.
   The full method ships instead, so anyone can rebuild the table we refuse to
   publish.
2. **Specifications that fail are published as failed.** A page showing only the
   basket that worked is showing the result instead of the method.
3. **It never generates a finding.** `eficiencia-finding.ts` freezes a
   measurement from the published panel; a DEA score is not one, and routing it
   into the signed-findings pipeline would launder a model output into the
   legally material surfaces.

`/laboratorio/coste-esperado` (the OLS expected-cost experiment) inherits the
same three rules unchanged — its sample is published anonymous and
population-sorted, failed specifications ship as failed, and its residuals
never become findings — enforced by `check:coste-esperado`, which is
`check:dea`'s sibling and reproduces the whole analysis from the published
sample alone.

The first two families are also **enforced, not just documented**:
`.claude/hooks/guard-curated-writes.mjs` denies a direct write to a curated file
(naming the CLI that owns it) and asks before a new draft-shaped file appears
under `public/`. Both had already been broken in production, which is the bar
for moving a rule out of this file and into a hook.

**If a `git add` starts refusing files, the working tree is probably podado.**
This project never uses `sparse-checkout`, so any pattern here comes from
outside — and `git sparse-checkout set` marks everything beyond the cone
`skip-worktree` and DELETES it from disk while `git status` reports nothing
missing, because to git nothing is. It happened four times between the 18th and
the 23rd of August 2026 and took `docs/` with it once. `check:sparse` runs in the
pre-commit and in the nightly, refuses to work on a pruned tree, and says how
many files are hidden; `npm run check:sparse -- --fix-all` repairs every
worktree, main checkout included. **Disable before deleting the pattern**: with
the flag still on and no patterns, cone mode means «nothing matches», and a
reapply left a test tree holding a single file. The trigger was a plugin's
`git-subdir` source landing its sparse-checkout on whatever repo the session's
cwd was in — so the suspect, if this returns, is always a plugin with that kind
of source.

Two more things about worktrees, both measured the hard way. `core.hooksPath` is
an absolute path into the main checkout, so **a push from any worktree runs the
main checkout's hooks** — no `.husky/` change can be tested by pushing from a
worktree, only by invoking it directly. And a config flag on a worktree lives in
its own `config.worktree`: a leftover pattern file with the flag still `true` is
not inert, it is primed.

**This working tree is never quiet, so a tree-moving git command is a write to
something else's file.** Five launchd agents run against this checkout on their
own schedule, write `public/data/`, and end with their own `git commit` + `git
push origin main`. On 2026-09-05 a `git stash push` on one speaker map — meant
as a harmless A/B of a curated change — sat for twelve minutes while the
`hallazgos` agent started the extractor for that same session. The extractor
resumes from the file on disk, so it read the stashed-away version and restarted
from 299 segments instead of 655. The worse loss was the measurement itself: the
"before" and "after" halves fell on opposite sides of a live rewrite, so the
numbers described the cron's progress rather than the change under test.
**To compare two versions, copy them aside (`git show HEAD:<path>` and `cp`) —
never move the tree.** `.claude/hooks/live-tree-paths.mjs` asks before a
tree-moving command (and before a `git push`, which races the agents' own) and
is silent when nothing is running, so it costs nothing on a quiet machine. It
derives the running set from the process table rather than a roster, because a
hand-kept list inside a control against stale state goes stale itself.

A second hook clears the same bar for a different failure: **prose goes stale
when the data moves**. Three sentences on `/eficiencia`, `/metodologia` and the
municipal panel each kept asserting something that had stopped being true one
commit earlier — a caveat excusing a figure with the wrong reason, "there is no
time series" after ten entregas shipped, "only PMP has a comparison" as a second
one gained peers. No test caught any of them: the data was right and the guards
check data. `.claude/hooks/remind-stale-copy.mjs` names the routes whose prose
describes a snapshot at the moment that snapshot is rewritten. It reminds, never
blocks — a reminder that can fail an edit is one people switch off. The better
fix, where it applies, is to derive the sentence from the data instead of
restating it, as `PanelMunicipal` now does with the list of compared indicators.

Its snapshot→routes map is **derived, not hand-kept** (`npm run build:prose-map`
walks hook literals, the import graph and `App.jsx`'s routes). The first version
was a hand-written table of nine entries; the code had sixty-four. A hand-kept
table inside a control against staleness goes stale itself, which is the joke
this repo has already told twice. A test regenerates it with `--check` and fails
on drift, and the module exports `MAPA_CARGADO` so a map that fails to load is
distinguishable from a map with nothing to say.

**Curated files are never written by automation.** `promises.json`,
`pleno-votes.json`, `pleno-findings.json`, `journalist-reports.json`,
`quejas-responses.json`, `sindic.json`, `dedicaciones.json`, `plantilla.json`,
`place-overrides.json`, `entity-overrides.json`, `eficiencia-findings.json`,
`eficiencia-preguntas.json`, `pleno-claim-reclassifications.json`,
`pleno-claim-reanchors.json`,
`competencias.json`, `sociedades.json`, `solicitudes-acceso.json`,
`officials-corrections.json`.
Route algorithmic output through the curator CLI so the validator and git
history stay authoritative. The full list and its CLIs: `docs/DATA_SOURCES.md`.

**A verbatim stays put; a number does not.** That is the one way the efficiency
findings differ in kind from every other claim here. A quote from a March pleno
will read the same in ten years, so `check:citations` only has to confirm it is
still where it says. «62,68 días» can go false with nobody touching the page,
because the ministry revises an entrega. So each ficha freezes its measurement —
value, period, source cell — and `check:eficiencia-findings` re-reads the live
panel with **four** outcomes, not two: `coincide`; `movido` (the panel advanced a
period — a notice, since the ficha says which period it speaks of);
`contradice` (the same period now says something else); `sin-indicador`. The last
two exit 1. Fold "I could not find it" into "matches" and the gate prints its own
all-clear, which is the `r?.findings ?? []` defect again. Apply the same shape to
any future claim type whose subject is a figure rather than a sentence.

**Anything under `public/` is published.** Vercel serves the whole directory, so
a file there is fetchable by URL whether or not a page links to it. "Not
rendered" is not "not published" — that assumption left 24 unreviewed drafts
about named councillors web-fetchable for weeks. Unreviewed machine prose about
a living person goes in `editorial/` (gitignored).

**Attribution is bloc-level until a curator promotes it.** The extractor's
`speakerGroup` enum is PSOE / PP / VOX / Compromís or null, regardless of what
voice ID matched. Only a curator crosses to naming an individual, per finding.

Beyond those three:

- **Suggestions never substitute for a published status.** Machine-written rows
  carry `requiresHumanApproval: true`, and the published schema rejects that
  field — two independent layers.
- **Evidence gates the strong verdicts.** `promises.ts`'s `V1_STATUSES` keeps
  `cumplida` / `no-ejecutada` / `inviable` from shipping without a dated,
  URL-backed citation. A `critical` finding requires ≥1 evidence ref. A `dueBy`
  on a pleno vote requires a verbatim `dueBySource` clause from the acta.
  Machine-inferred deadlines reintroduce exactly the risk these block.
- **A citation has to resolve before it publishes.** `check:citations` blocks a
  promotion whose claims cite a missing source, whose quote is not verbatim in
  the excerpt it cites, or whose URL is dead. It classifies URLs
  `alive`/`dead`/`unverifiable` and only `dead` blocks — a check wrong four
  times in forty-eight is one everybody skips. What it cannot judge — does the
  excerpt _support_ the sentence or merely relate to it — is the
  `revisar-borrador` skill.
- **An agenda item is a commitment only when a matching vote exists** (join on
  `plenoId + itemNumber`). Otherwise it renders as "debatido, sin voto
  transcrito" and is never counted overdue. Overdue flags never flip a status.
- **Opinion is not verifiable.** The verifier's `opinativa` short-circuit to
  `sin-datos` is policy, not a heuristic. Do not loosen it.
- **LOREG electoral freeze.** `frozenUntil` in `promises.json` puts `/promesas`
  into read-only mode and halts the suggestion engine, the auto-curators, the
  journalist agent and the bot's broadcasts. Toggle only via
  `npm run freeze:set -- YYYY-MM-DD` / `freeze:clear`.
- **Right of reply is end-to-end** for promises, findings, quejas and journalist
  reports: a GitHub Issue form → an ingest workflow → a validator-fronted CLI →
  a commit. Keep new claim types wired the same way.

`/metodologia` and `/aviso-legal` are the **published editorial contract**, not
marketing copy. When any of this behaviour changes, update them in the same PR.

## Ethics of collection

Every automated source is public-sector or open-licensed (Ley 19/2013,
datos.gob.es CC-BY, PLACSP/BDNS reuse clauses, OSM ODbL, Wikidata CC0).
Councillor photos are re-hosted from the council's own publication.

Keep scrapers polite: identify the project in a `User-Agent`, never loop
tightly, cache raw payloads locally while iterating. Aggregate anything
personal — citizen complaints especially — to neighbourhood level before it
lands in `public/data/`.

Queja photos are never published raw. `cd bot && npm run process-photos` boxes faces,
plates and ID text with a vision model, hard-mosaics them, strips EXIF/GPS, and
**fails closed** — if the vision call cannot run, the photo is held, never
published. `/olvidar` prunes the image; that is the right-to-be-forgotten
enforcement point.
