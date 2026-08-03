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
CI sets `VITE_ENABLE_PERIODISTAS=true`; it is absent locally, so `/cargos`'s
Biografía spec always fails on a local full run. That is the flag, not a defect.

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

Public: `/` `/cargos` `/cargos/:slug` `/presupuesto` `/plenos` `/plenos/:id`
`/promesas` `/departamentos` `/departamentos/:slug` `/hallazgos`
`/declaraciones` `/reportajes` `/datos` `/empleo` `/empleo/:id`
`/empleo-publico` `/quejas` `/quejas/dashboard` `/quejas/:id` `/cambios`
`/laboratorio` `/laboratorio/agentes` `/laboratorio/agentes/:assignmentId`
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

Never write a row count, euro total or test count into a doc. Every one that was
here was wrong when audited on 2026-08-03, some by 4×. Snapshots carry a `stats`
block; the suites report their own totals.

## Legally material surfaces

Five surfaces make claims about named elected officials: `/promesas`,
`/hallazgos`, `/declaraciones`, `/departamentos`, `/laboratorio/agentes`. Treat
any change to them as legally material. The rules below are encoded in schema
validators and CLIs — if you find yourself working around one, stop.

The first two are also **enforced, not just documented**:
`.claude/hooks/guard-curated-writes.mjs` denies a direct write to a curated file
(naming the CLI that owns it) and asks before a new draft-shaped file appears
under `public/`. Both had already been broken in production, which is the bar
for moving a rule out of this file and into a hook.

**Curated files are never written by automation.** `promises.json`,
`pleno-votes.json`, `pleno-findings.json`, `journalist-reports.json`,
`quejas-responses.json`, `sindic.json`, `dedicaciones.json`, `plantilla.json`,
`place-overrides.json`, `entity-overrides.json`. Route algorithmic output
through the curator CLI so the validator and git history stay authoritative.
The full list and its CLIs: `docs/DATA_SOURCES.md`.

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
