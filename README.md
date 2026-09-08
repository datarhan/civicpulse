# CivicPulse

**A citizen tool that shows who runs your town hall, what it does and what it costs — with a citation for every figure.**

Every Spanish municipality is legally obliged to run a _portal de transparencia_. Riba-roja de Túria has one, as the law requires: a document directory — staffing tables, budget PDFs, works fichas, councillor CVs — published because articles 5–8 of Ley 19/2013 say it must be. Every file in it is real. None of it is a series, a comparison, or a question you can ask.

**CivicPulse is that obligation rebuilt from the reader's side** — a live dashboard over one town hall, where the same public data becomes a figure you can follow across years, a price you can compare against towns your size, and a claim you can trace to its source. And it does the one thing a compliance portal has no reason to do: it publishes, deliberately and by name, **the places where the official data runs out**.

CivicPulse is built for any Spanish municipality and runs live, end to end, in its first one — [Riba-roja de Túria](https://en.wikipedia.org/wiki/Riba-roja_de_T%C3%BAria) (Comunitat Valenciana, ~24,600 residents): who holds each post, what education and experience they declared and whether it relates to the areas they run, what the post was set to pay, and what the law requires of it; the cost of each municipal service priced against similar-sized towns on the ministry's own data, supplier-payment periods, budget execution, council-session transcripts turned into verifiable claims, an electoral-promise tracker, a citizen-complaint pipeline with legal deadlines, and municipal spending mapped where the contract itself names the place. On that base it publishes deep investigative journalism, each piece's figures frozen at publication and traceable to their source. All of it from public open data, with a stated methodology and a built-in right of reply.

> It is not the council's portal and does not speak for the council. It reads the same public sources, independently, and says where they stop.

**Live:** **[civicpulse.es](https://civicpulse.es)** · **Who's behind it:** [civicpulse.es/nosotros](https://civicpulse.es/nosotros) · [English](https://civicpulse.es/about) · **Methodology:** [civicpulse.es/metodologia](https://civicpulse.es/metodologia)

[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

---

## Why this exists

Spaniards vote for their ayuntamientos again in **May 2027**. Before that, every voter should be able to decide from facts, not campaign speeches — to see what their town hall actually did and what it cost. The public data to build that view already exists — effective service costs and municipal budgets (MinHac), public contracts (PLACSP), subsidies (BDNS), census (INE), unemployment (SEPE), the official gazettes (BOE/BOP/TED) — indexed by INE municipality code, for every town.

**The scarce thing is not information — it is verification.** There have never been more channels, nor more machinery for deciding what you end up believing. Meanwhile the organisation that matters most to daily life is the one almost nobody checks: your ayuntamiento decides your street, your water bill, your licence, the school run, and which company gets paid to collect the bins. Nobody would put money into a company without seeing its accounts and knowing who runs it. You do not get to choose whether to fund this one.

Three things stop a resident from checking it.

**You cannot see who is running it, or against what standard.** A resident can rarely find out what the person holding a portfolio actually brings to it — and, more importantly, what the law asks of them. It asks strikingly little: under **LOREG art. 6.1** a councillor needs only to be of age, on the electoral roll, and not disqualified — **no qualification of any kind**. The officers who audit the money and certify the council's decisions are held to a different standard entirely: **RD 128/2018 (arts. 17–19)** requires a university degree and a national competitive examination. Both facts belong on the same page, and neither is usually anywhere a resident will look.

**Nobody assembles the rest.** **6,304 of Spain's 8,147 municipalities — 77.53% — are news deserts**, home to 11.6 million people, about a quarter of the country ([Negreira-Rey, Vázquez-Herrero & López-García, _Media and Communication_ 11(3), 2023](https://doi.org/10.17645/mac.v11i3.6727)). The national outlets and fact-checkers (Civio, Maldita, Newtral) cover national discourse, not per-town accountability.

**And publication is not legibility.** A town hall that publishes everything the law demands still leaves a resident unable to answer _is this expensive?_, _did that get done?_, _who do I ask?_ The transparency obligation was written to be checked for compliance, so it produces documents; the questions people actually have need series, denominators and comparisons. Closing that distance is engineering, and it has to be done once per country, not once per town.

> **What this project does not do:** attribute motive. It does not say who was appointed for the wrong reasons, who is in it for an easy salary, or what anyone is hiding. It publishes what can be checked — what each office-holder declared, what the law requires of them, what the post pays, what was promised and what the record shows — and leaves the conclusion to the reader, who draws it at the ballot box. That restraint is not timidity; it is the only version of this that holds up.

CivicPulse is the proof it can be done, built in two halves:

- **Riba-roja = depth.** The first municipality, covered completely, with real data and libel discipline. This repository.
- **Spain = breadth.** The national data layer already covers every municipality; scaling it is engineering, not research.

## What it does

The single-page app at [civicpulse.es](https://civicpulse.es) is a dashboard over one municipality — the money, the decisions, the promises and the people, each on its own surface and all reading from the same cited data layer:

| Surface                 | Route                         | What it shows                                                                                                                                                             |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live city**           | `/`                           | Map of municipal spending, transit, civic services, and flood risk + an editorial column + a KPI strip (padrón, budget, contracts, paro)                                  |
| **What's new**          | `/cambios`                    | A rolling feed of everything that moved in the last week, merged across every corpus — contracts, subsidies, complaints, sessions, participation, press                   |
| **Officials**           | `/cargos`                     | Councillors and senior officials: portfolio, declared dedication regime, social accounts, and agent-written biographies where a curator has signed one                    |
| **Service costs**       | `/eficiencia`                 | What each municipal service costs per unit vs. similar-sized municipalities — the ministry's own effective-cost data — with signed measurement fichas                     |
| **Management**          | `/gestion`                    | How the council runs: supplier-payment period (PMP), budget execution, the contractor profile                                                                             |
| **Findings**            | `/hallazgos`                  | Editorial findings extracted from pleno transcripts, deterministically verified against the open-data trail, curator-gated, each with a permalink and right-of-reply      |
| **Promise tracker**     | `/promesas`                   | Party electoral promises with verbatim source quotes, evidence, and status — under an electoral-silence freeze during campaigns                                           |
| **Investigations**      | `/reportajes`                 | Deep investigative pieces with frozen, citation-gated figures — the DANA reconstruction money, the waste-collection contract                                              |
| **Budget & contracts**  | `/presupuesto`                | Approved vs. executed budget, awarded contracts, subsidies, works in progress                                                                                             |
| **Council sessions**    | `/plenos`                     | Every indexed session: agenda, transcript, and the votes a curator has promoted                                                                                           |
| **Statements**          | `/declaraciones`              | Claims extracted from session transcripts, each with the verdict the deterministic verifier reached against the open-data record                                          |
| **Departments**         | `/departamentos`              | Per-portfolio accountability: votes + promises + routed complaints                                                                                                        |
| **Citizen complaints**  | `/quejas`                     | A Telegram-captured complaint feed with LPACAP legal clocks, escalation to the Síndic de Greuges, and a resolution dashboard                                              |
| **Jobs**                | `/empleo`                     | Vacancies published through the town's employment portal, with their status and deadline                                                                                  |
| **Public hiring**       | `/empleo-publico`             | Municipal selection processes and the staffing table (RPT)                                                                                                                |
| **Lab**                 | `/laboratorio`                | A fact-check observatory over local press coverage                                                                                                                        |
| **Efficiency frontier** | `/laboratorio/frontera`       | A DEA experiment. Our model's verdict, not a published figure: failed specifications ship as failed, no other municipality is ever named, and it never produces a finding |
| **Expected cost**       | `/laboratorio/coste-esperado` | The OLS sibling of the frontier, under the same three rules — anonymous published sample, failed specs shipped as failed, residuals never become findings                 |
| **Data catalogue**      | `/datos`                      | Every underlying JSON snapshot, with its source and licence                                                                                                               |
| **Data health**         | `/lab-health`                 | The freshness of every snapshot the site serves, including the ones that have gone stale — the site's own vital signs, in public                                          |

The UI is bilingual (Castilian Spanish + Valencià). Only interface chrome is translated — **data content stays verbatim in its source language** to preserve quote accuracy.

## The blind spots

A transparency portal that shows only what exists is a brochure. The gaps are where the accountability actually lives, so this site is built to render absence as carefully as it renders figures — and the machinery below is not error handling, it is editorial policy with tests attached.

**What the source does not contain.** Not every question the data seems to answer is one it can.

- **Most municipal money has no address.** The spending map paints only contracts whose own title names a place, so it shows a few percent of municipal contracting — and says so, computing the share from the snapshot's own universe block rather than a hard-coded line. Most of what a town spends is town-wide service contracts with nowhere to put a pin. The limit is the finding, not the embarrassment.
- **Concessioned services never enter the council's books.** When a concessionaire bills the resident directly, the municipal accounts show nothing. An empty cell there is not a missing figure, it is a different fact — so the ficha names the company, the award and the amount instead of leaving a blank that reads as ignorance.
- **Debate is not a decision.** An agenda item discussed with no transcribed vote renders as exactly that, is never counted as a commitment, and can never go overdue.
- **Nobody is named by elimination.** Where no delegated portfolio names a service, it is marked unassigned with a motive. Inferring the holder from who is left is a claim, and this site does not make claims it cannot cite.

**What the source does not publish — yet, or any more.** Official data has its own clock, and a site that hides it is quietly lying about how current it is.

- **Some figures are late by law.** The effective-cost return is filed more than a year after the year it describes (Orden HAP/2075/2014), so the most recent municipal cost data is always well behind the present. The page derives that lag from the rule and explains it, rather than looking abandoned.
- **A year the council did not file is not a year with no data.** "The return was filed but this service was not declared" and "no return was filed" are facts of very different sizes; they used to render as the same dash, and now they do not.
- **Public does not mean reachable.** Some legally-open sources refuse automated readers, restructure their URLs, or blackhole the IP ranges CI runs on. Those are recorded with a reason and a last-good date instead of being served as current.
- **Sources die.** A retired upstream keeps its last good value, labelled retired, with the reason and the successor — never silently frozen and presented as live.
- **An empty search result is not a fact about the world.** The regional ombudsman's case index is transcribed from the ombudsman's own search tool, and the snapshot carries that tool's limits with it: one of its two axes returns no case before 2023, so the absence of older rows there means the search stops, not that nothing happened. The limit ships beside the figures, in the same file.

**What we ourselves cannot stand behind.** The last blind spot is our own.

- **The site publishes its own staleness.** [`/lab-health`](https://civicpulse.es/lab-health) lists every snapshot with its age, and freshness is judged per class, because a nightly scraper and a hand-curated file go stale at completely different speeds. Curated files carry a stamp, so "nobody has reviewed this since" is visible rather than implied.
- **Failed models ship as failed.** The efficiency-frontier and expected-cost experiments publish the specifications that did not work alongside the ones that did. A page showing only the basket that worked is showing a result instead of a method — and neither experiment is ever allowed to generate a finding, because a model's verdict is ours, not the ministry's.
- **Some claims are not checkable, and are labelled so.** Opinion short-circuits to "no data" and is never marked verified; cited URLs are classified alive, dead or unverifiable, and only dead blocks publication. A verdict engine that resolves uncertainty in its own favour is worse than no verdict engine.
- **Nothing automatic upgrades a published claim.** Machine verdicts may only retract, never promote. Corrections go through curator CLIs so they leave a record in public git history.
- **And this site has had blind spots of its own.** The ombudsman index sat at zero rows for months behind a code comment asserting the source could not be automated. It could. A zero here has to mean zero, so "nobody looked" is now built to look different from "nothing found" — which is the same discipline this section demands of everyone else, pointed inward.

## How it's built

CivicPulse is a **front-end-only SPA with no application backend.** Everything the site shows is static JSON produced by a fleet of nightly scrapers and served next to the app.

```
scrapers  ────────────►  public/data/*.json  ─────────►  React SPA (Vite)
(GitHub Actions,          (committed to git,             (one hook per
 04:30 UTC nightly)        served by Vercel)              data domain)

Telegram bot  ──►  SQLite  ──►  /export  ──►  daily workflow  ──►  quejas.json
(Fly.io)           (volume)    (non-PII)     (pull-quejas.yml)
```

- **Scraper shape (TDD):** `scripts/scrape-X.ts` fetches the raw payload → a pure, unit-tested parser in `src/scraper/X.ts` → a typed snapshot in `public/data/X.json`. Every parser is pinned against a committed real-payload fixture. Re-running any scraper is idempotent.
- **Front end:** Vite + React 18 + React Router 6, Leaflet maps, SVG charts. Design tokens are CSS variables (light/dark); components use token-driven inline styles.
- **Bot:** a Node.js Telegram bot captures citizen complaints into SQLite and exports an aggregated, non-identifying snapshot. It is the one deployed piece — it runs on Fly.io in webhook mode with SQLite on a persistent volume, and a daily workflow pulls its export into `public/data/`. The site renders fine without it. Photos are never published raw: a vision pass boxes and hard-mosaics faces, plates and ID text, strips EXIF/GPS, and fails closed — if the vision call cannot run, the photo is held.

Because the whole data layer is committed JSON, the git history _is_ the change log: every figure the site has ever shown is recoverable, and every correction is a diff with an author and a date.

**Tech stack:** TypeScript · React 18 · Vite 6 · React Router 6 · Leaflet · Vitest (unit/integration) · Playwright + axe-core (e2e + WCAG 2.1 AA a11y) · ESLint + Prettier.

## Editorial & libel discipline

CivicPulse makes claims about named elected officials, so the parts that do are engineered as legal architecture, not features. If you read one section of this repo, read these:

- **Two-file separation.** Machine inference never writes to a published surface. The promise tracker (`public/data/promises.json`), the findings (`pleno-findings.json`), and the journalist reports each have a **human-curated published file** and a separate **machine-written suggestions file**. Suggestions render as "propuesta automática · pendiente de revisión" and never substitute for a curated status. Schema validators enforce this at write time.
- **Bloc-level attribution by default.** Extracted claims are attributed to a party group, not an individual, unless a curator explicitly promotes individual attribution after verification.
- **Deterministic verification.** The claim verifier is a pure function — no LLM, no network — that cross-references declarations against contracts, subsidies, budget, and prior claims. Opinion claims are hard-skipped, never marked "verified".
- **Competence, not blame.** Where a service page names the councillor who holds the delegated portfolio, it is republishing the council's own transparency portal so a reader knows who to ask — never asserting that a unit cost is that person's personal responsibility. The signed measurement fichas have no field a person's name could go in, and the schema rejects one.
- **Right of reply everywhere.** Every finding, promise, and report carries a structured right-of-reply path (GitHub issue templates → validated CLI → committed reply). The public git history is the audit trail.
- **Electoral-silence (LOREG) freeze.** During campaign windows the promise tracker and complaint auto-transitions go read-only.

The published editorial contract lives at [`/metodologia`](https://civicpulse.es/metodologia) and [`/aviso-legal`](https://civicpulse.es/aviso-legal). Changes to any sensitive subsystem update those pages in the same change.

## Data sources

All sources are public-sector or open-data (Ley 19/2013 de Transparencia, datos.gob.es CC-BY 4.0, PLACSP/BDNS open-reuse, OpenStreetMap ODbL, Wikidata CC0). A non-exhaustive list:

- **Municipal:** the town's own transparency portal (corporación, RPT, budget execution, works, hiring, associations register), council-session pages, participation blog.
- **National:** MinHac — CONPREL (budgets), effective service costs, supplier-payment periods (PMP) · PLACSP / Gobierto (contracts) · BDNS (subsidies) · INE (census) · SEPE (unemployment) · BOE + BOP València + EU TED (gazettes) · CTBG + Sindicatura de Comptes (audit/transparency oversight).
- **Geospatial:** OpenStreetMap (boundary, neighborhoods, streets, civic POIs, Metrovalencia network) · Wikidata · PATRICOVA flood-risk WMS.

Scrapers identify the project in their User-Agent, never loop tightly, and cache raw payloads locally while iterating. Anything personal — citizen complaints above all — is aggregated to neighbourhood level before it reaches `public/data/`.

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
- **Found a blind spot we don't declare?** That's the most useful issue you can file. A gap this site fails to mark is a worse defect than a figure it gets wrong, because the reader can't see it.
- **Code contributions** follow the project's TDD cadence (see [`CLAUDE.md`](CLAUDE.md)): a failing test against a real fixture, a minimal parser, then wire-up.

## Funding & independence

CivicPulse is an independent, public-interest watchdog. It takes **no advertising**, no VC, and **no money from any government body it holds to account** (the Ayuntamiento de Riba-roja above all). Every funding source is disclosed publicly at [`/nosotros`](https://civicpulse.es/nosotros). Operator: Sergei Lutchenko — fully named, with a byline and published methodology behind every claim.

## License

[**AGPL-3.0-only**](LICENSE). The network-copyleft clause is deliberate: a hosted fork of this accountability stack must publish its source. Underlying open data retains its own upstream licences (see each source above).
