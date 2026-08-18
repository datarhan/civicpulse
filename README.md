# CivicPulse

**A citizen tool that measures what your town hall does and what it costs — with a citation for every figure.**

CivicPulse is built for any Spanish municipality and runs live, end to end, in its first one — [Riba-roja de Túria](https://en.wikipedia.org/wiki/Riba-roja_de_T%C3%BAria) (Comunitat Valenciana, ~24,600 residents): the cost of each municipal service priced against similar-sized towns on the ministry's own data, supplier-payment periods, budget execution, council-session transcripts turned into verifiable claims, an electoral-promise tracker, a citizen-complaint pipeline with legal deadlines, and municipal spending mapped where the contract itself names the place. On that base it publishes deep investigative journalism — four investigations so far. All of it from public open data, with a stated methodology and a built-in right of reply.

**Live:** **[civicpulse.es](https://civicpulse.es)** · **Who's behind it:** [civicpulse.es/nosotros](https://civicpulse.es/nosotros) · [English](https://civicpulse.es/about) · **Methodology:** [civicpulse.es/metodologia](https://civicpulse.es/metodologia)

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

---

## Why this exists

Spaniards vote for their ayuntamientos again in **May 2027**. Before that, every voter should be able to decide from facts, not campaign speeches — to see what their town hall actually did and what it cost. The public data to build that view already exists — effective service costs and municipal budgets (MinHac), public contracts (PLACSP), subsidies (BDNS), census (INE), unemployment (SEPE), the official gazettes (BOE/BOP/TED) — indexed by INE municipality code, for every town.

Nobody turns it into something a neighbour can use: around **6,800 of Spain's ~8,100 municipalities have no dedicated press coverage**, and the national outlets and fact-checkers (Civio, Maldita, Newtral) cover national discourse, not per-town accountability.

CivicPulse is the proof it can be done, built in two halves:

- **Riba-roja = depth.** The first municipality, covered completely, with real data and libel discipline. This repository.
- **Spain = breadth.** The national data layer already covers every municipality; scaling it is engineering, not research.

## What it does

The single-page app at [civicpulse.es](https://civicpulse.es) surfaces:

| Surface                | Route            | What it shows                                                                                                                                                        |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live city**          | `/`              | Map of municipal spending, transit, civic services, and flood risk + an editorial column + a KPI strip (padrón, budget, contracts, paro)                             |
| **Service costs**      | `/eficiencia`    | What each municipal service costs per unit vs. similar-sized municipalities — the ministry's own effective-cost data — with signed measurement fichas                |
| **Management**         | `/gestion`       | How the council runs: supplier-payment period (PMP), budget execution, the contractor profile                                                                        |
| **Findings**           | `/hallazgos`     | Editorial findings extracted from pleno transcripts, deterministically verified against the open-data trail, curator-gated, each with a permalink and right-of-reply |
| **Promise tracker**    | `/promesas`      | Party electoral promises with verbatim source quotes, evidence, and status — under an electoral-silence freeze during campaigns                                      |
| **Investigations**     | `/reportajes`    | Deep investigative pieces with frozen, citation-gated figures — the DANA reconstruction money, the waste-collection contract                                         |
| **Budget & contracts** | `/presupuesto`   | Approved vs. executed budget, awarded contracts, subsidies, works in progress                                                                                        |
| **Council sessions**   | `/plenos`        | 50+ sessions, agendas, transcribed votes                                                                                                                             |
| **Departments**        | `/departamentos` | Per-portfolio accountability: votes + promises + routed complaints                                                                                                   |
| **Citizen complaints** | `/quejas`        | A Telegram-captured complaint feed with LPACAP legal clocks, escalation to the Síndic de Greuges, and a resolution dashboard                                         |
| **Lab**                | `/laboratorio`   | A fact-check observatory over local press coverage + method-published efficiency experiments (DEA frontier, expected-cost OLS) that never produce findings           |
| **Data catalogue**     | `/datos`         | Every underlying JSON snapshot, with its source and licence                                                                                                          |

The UI is bilingual (Castilian Spanish + Valencià). Only interface chrome is translated — **data content stays verbatim in its source language** to preserve quote accuracy.

## How it's built

CivicPulse is a **front-end-only SPA with no application backend.** Everything the site shows is static JSON produced by a fleet of nightly scrapers and served next to the app.

```
28 scrapers  ─────────►  public/data/*.json  ─────────►  React SPA (Vite)
(GitHub Actions,          (committed to git,             (one hook per
 04:30 UTC nightly)        served by Vercel)              data domain)

Telegram bot (sibling  ──►  SQLite  ──►  daily export  ──►  public/data/quejas.json
Node package, /bot)         (local)      (non-PII only)
```

- **Scraper shape (TDD):** `scripts/scrape-X.ts` fetches the raw payload → a pure, unit-tested parser in `src/scraper/X.ts` → a typed snapshot in `public/data/X.json`. Every parser is pinned against a committed real-payload fixture. Re-running any scraper is idempotent.
- **Front end:** Vite + React 18 + React Router 6, Leaflet maps, SVG charts. Design tokens are CSS variables (light/dark); components use token-driven inline styles.
- **Bot:** a Node.js Telegram bot captures citizen complaints into SQLite and exports an aggregated, non-identifying snapshot. It runs as a local long-polling service.

**Tech stack:** TypeScript · React 18 · Vite 6 · React Router 6 · Leaflet · Vitest (unit/integration) · Playwright + axe-core (e2e + WCAG 2.1 AA a11y) · ESLint + Prettier.

## Editorial & libel discipline

CivicPulse makes claims about named elected officials, so the parts that do are engineered as legal architecture, not features. If you read one section of this repo, read these:

- **Two-file separation.** Machine inference never writes to a published surface. The promise tracker (`public/data/promises.json`), the findings (`pleno-findings.json`), and the journalist reports each have a **human-curated published file** and a separate **machine-written suggestions file**. Suggestions render as "propuesta automática · pendiente de revisión" and never substitute for a curated status. Schema validators enforce this at write time.
- **Bloc-level attribution by default.** Extracted claims are attributed to a party group, not an individual, unless a curator explicitly promotes individual attribution after verification.
- **Deterministic verification.** The claim verifier is a pure function — no LLM, no network — that cross-references declarations against contracts, subsidies, budget, and prior claims. Opinion claims are hard-skipped, never marked "verified".
- **Right of reply everywhere.** Every finding, promise, and report carries a structured right-of-reply path (GitHub issue templates → validated CLI → committed reply). The public git history is the audit trail.
- **Electoral-silence (LOREG) freeze.** During campaign windows the promise tracker and complaint auto-transitions go read-only.

The published editorial contract lives at [`/metodologia`](https://civicpulse.es/metodologia) and [`/aviso-legal`](https://civicpulse.es/aviso-legal). Changes to any sensitive subsystem update those pages in the same change.

## Data sources

All sources are public-sector or open-data (Ley 19/2013 de Transparencia, datos.gob.es CC-BY 4.0, PLACSP/BDNS open-reuse, OpenStreetMap ODbL, Wikidata CC0). A non-exhaustive list:

- **Municipal:** the town's own transparency portal (corporación, RPT, budget execution, works, hiring, associations register), council-session pages, participation blog.
- **National:** MinHac CONPREL (budgets) · PLACSP / Gobierto (contracts) · BDNS (subsidies) · INE (census) · SEPE (unemployment) · BOE + BOP València + EU TED (gazettes) · CTBG + Sindicatura de Comptes (audit/transparency oversight).
- **Geospatial:** OpenStreetMap (boundary, neighborhoods, streets, civic POIs, Metrovalencia network) · Wikidata · PATRICOVA flood-risk WMS.

The full catalogue, per snapshot, is at [`/datos`](https://civicpulse.es/datos).

## Run it locally

Requires Node.js 20+ and npm (CI builds and tests on Node 20).

```bash
npm install       # install dependencies
npm run dev       # Vite dev server → http://localhost:5173
npm run build     # production build → dist/
npm test          # Vitest unit/integration suite
npm run test:e2e  # Playwright e2e (per-route + mobile + axe a11y)
npm run lint      # ESLint
```

The app reads the JSON snapshots already committed under `public/data/`, so it runs fully offline with real data — no scrapers or API keys needed for development.

**Refreshing data** (optional; each scraper is idempotent and identifies itself with a polite User-Agent):

```bash
npm run scrape:all   # walk the autonomous scrapers (~3 min)
npm run scrape:budget
npm run scrape:tenders
# …see package.json for the full per-source list
```

The **Telegram bot** is a separate package:

```bash
cd bot && npm install && npm test   # see bot/README.md
```

Some optional pipelines (transcription, LLM claim extraction, geocoding) need API keys or local models; they are curator-run and documented in [`CLAUDE.md`](CLAUDE.md). None are required to build or run the site.

## Repository layout

```
src/            React SPA — pages, components, hooks, design tokens
src/scraper/    pure, unit-tested parsers (the RED→GREEN contract)
scripts/        scraper CLIs + curator administration tools
public/data/    committed JSON snapshots (the site's entire data layer)
tests/          Vitest fixtures + Playwright e2e specs
bot/            sibling Telegram complaint bot (Node + SQLite)
docs/           methodology, roadmap, funding, design specs
```

## Contributing & right of reply

- **Affected by a finding or promise?** Use the right-of-reply issue templates (linked from every finding, promise, and report card) to submit a verbatim response. It's applied through a validated CLI and committed to the public record.
- **Spotted a data error?** Open an issue — corrections are logged openly (an IFCN-style open-corrections policy).
- **Code contributions** follow the project's TDD cadence (see [`CLAUDE.md`](CLAUDE.md)): a failing test against a real fixture, a minimal parser, then wire-up.

## Funding & independence

CivicPulse is an independent, public-interest watchdog. It takes **no advertising**, no VC, and **no money from any government body it holds to account** (the Ayuntamiento de Riba-roja above all). Every funding source is disclosed publicly at [`/nosotros`](https://civicpulse.es/nosotros). Operator: Sergei Lutchenko — fully named, with a byline and published methodology behind every claim.

## License

[**AGPL-3.0-only**](LICENSE). The network-copyleft clause is deliberate: a hosted fork of this accountability stack must publish its source. Underlying open data retains its own upstream licences (see each source above).
