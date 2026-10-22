# Lectura vecinal — `/eficiencia` (v2: conclusions, names, results)

**Status:** rollout steps 1–2 built.

- «Cuesta · Consigue · Responde» covers all 15 services
  (`src/components/eficiencia/CuestaConsigueResponde.jsx`).
- The editor's-opinion block, file, validator, CLI and checks are in place
  (`src/scraper/opinion-editor.ts`, `npm run opinion`, `check:opiniones`).
- The editorial contract is updated.
- **No opinion is published yet.** It needs a named editor and, if it names
  anyone, the prior contact.
- A first police draft waits in `editorial/opiniones/` (not versioned).

v2 written after the maintainer asked for conclusions at the top, councillors'
names tied to the data, and a way to tell whether the administration does its
job. The maintainer proposed that the conclusions run as a signed **editor's
opinion**, and accepted every recommendation in §7.

**Figures:** the worked example uses the 2026-10-22 snapshots, to test the
design against real data. The page itself must derive every figure; none goes
into copy by hand.

Sibling of [`2026-10-21-lectura-vecinal-design.md`](2026-10-21-lectura-vecinal-design.md).
`/eficiencia` is legally material (CLAUDE.md).

## 1. The problem, restated

v1 made the page readable. It did not make it **conclusive**, and a resident
still leaves without the answer to «¿lo hacen bien?». The page already holds
the three things that question needs, but they are separated:

| Ingredient             | Where it lives today                                                                                                                                       | How a resident meets it                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **What it costs**      | `indicadores.json`: cost per service, its series in constant euros, and the peer median per year                                                           | as a percentile bar in a row of the book          |
| **What was obtained**  | `indicadores.json → resultados`: so far, known penal infractions per 1.000 inhabitants (Portal Estadístico de Criminalidad), placed beside the police card | only inside the service's ficha, after the method |
| **Who answers for it** | `competencias.json`: curated, frozen, sourced from the delegation decree                                                                                   | only in the ficha, in the same card as the caveat |

Nobody draws the line between them, and the page deliberately refuses to draw it
by machine. The proposal draws it **by a person, signed, as opinion**. Below
that opinion, the page shows the facts in a shape that makes the reader's own
judgment easy.

## 2. Worked example: policía local

This is the case the maintainer raised («they spend much more on police but
crime grows»). The design has to get this one right.

| Fact (source)                                                         | 2021     | 2024     | Change                                |
| --------------------------------------------------------------------- | -------- | -------- | ------------------------------------- |
| Declared cost, nominal (MinHac coste efectivo)                        | 2,47 M€  | 4,26 M€  | +72 %, of which +54 % in 2022 alone   |
| Cost per officer, constant 2024 € (ours, from the ministry's figures) | 54.808 € | 81.965 € | **+49,5 %**                           |
| Same, median of the 48 comparable towns                               | 62.646 € | 65.496 € | **+4,5 %**                            |
| Officers declared (the divisor)                                       | 52       | 52       | frozen since 2019, 5 filings in a row |
| Known penal infractions ‰ inhabitants (Interior)                      | 54,5     | 58,6     | +7 % (63,6 in 2025: +17 % on 2021)    |
| Same, position in its group (45 towns > 20.000 inhabitants)           | —        | —        | p87 in 2025; group median 46,3 ‰      |

What it supports, plainly:

- Riba-roja pays far more per declared officer than it did, and far more than
  similar towns, whose cost barely moved.
- Known crime per inhabitant is high for its group and higher than in 2021.

What it does **not** support, and the opinion block must say so:

- **More officers or higher pay?** Unknown. The council has declared 52 officers
  every year since 2019. A cost rise over a frozen headcount reads as «more
  per officer» even if the force grew.
- **Did the spending work?** The infraction count includes Guardia Civil and
  Policía Nacional, counts _known_ facts (more patrols can raise it), and 2020
  is a pandemic floor. It is not a product of the local police.
- **Who decided?** Most of the rise is in 2022. The current delegations date
  from the 2023–2027 mandate, so attributing the 2022 jump to the current
  holder of the delegation would be false. Attribution has to follow tenure.

This example sets the rules for the whole design. The facts are strong enough
for a pointed opinion. They are not strong enough for the opinion to say the
service is badly run, or to say who is to blame.

## 3. The design: three layers, kept apart on purpose

```
┌──────────────────────────────────────────────────────────────────┐
│ LA OPINIÓN DEL EDITOR · firmada · 14-11-2026                     │  ← layer 1
│ «La policía local cuesta hoy un 50 % más por agente que en 2021  │    human, signed,
│  y sus vecinos parecidos apenas han subido. No sabemos si son    │    opinion
│  más agentes o mejores sueldos: el Ayuntamiento declara 52 desde │
│  2019. Debería decirlo…»                                         │
│ Hechos en que se basa ↓ · Lo que no sabemos ↓ · Respuesta ↓      │
├──────────────────────────────────────────────────────────────────┤
│ CUESTA · CONSIGUE · RESPONDE   (one row per service)             │  ← layer 2
│  [cost slope vs group] [result slope vs group] [who · asked ·    │    derived facts,
│                                                 answered?]       │    no valence
├──────────────────────────────────────────────────────────────────┤
│ En breve (v1) · el libro · método · hallazgos firmados           │  ← layer 3
└──────────────────────────────────────────────────────────────────┘    unchanged
```

### Layer 1 — «La opinión del editor»: conclusions at the top

The maintainer's proposal, made safe by construction. **It is the only place on
the page where a judgment and a name can meet.**

- **Written and signed by a person.** It has a named editor and a date. It is
  never generated: no model writes it, and no script edits it. «Nothing
  automatic rewrites published prose» (data-integrity rule 4) applies in full.
- **Labelled as opinion**, in its own visual frame, like a newspaper editorial
  next to the news. It is not a data card and carries no data-card styling. The
  label sits at its top, not in a footnote.
- **A factual basis is mandatory and linked.** Every sentence that states a
  fact cites an indicator, result or signed finding by id. Spanish case law
  protects opinion more broadly than information, but an opinion still needs a
  sufficient factual basis. A value judgment that implies a false fact is
  judged as information.
- **«Lo que no sabemos» is mandatory.** For police: headcount, causality, and
  tenure (§2).
- **Tenure-aware naming.** A name may appear only for the period in which that
  person held the competence (§4), and only as the holder of the competence,
  never as the cause of an outcome.
- **«Sin sorpresas».** Before publication the named holder gets the text, a
  deadline, and the right to have a reply printed **beside** the opinion. This is
  the pre-publication contact in `docs/REVIEW_2026-09.md` Phase 2. Silence is
  recorded as silence, with its dates.
- **Corrections leave a record**, through the corrections CLI, never a silent
  edit.
- **LOREG.** Recommendation: no new editorial that names a candidate after the
  elections are called, and published ones freeze. `frozenUntil` already
  freezes every automated path; this extends the same discipline to the one
  human path that names candidates. The maintainer decides; see §7.

Mechanics, so the safeguards stay encoded and not just written down:

- A new curated file, `public/data/opiniones-editor.json`, entered in `CURATED`
  (`.claude/hooks/curated-paths.mjs`) with its own CLI (`npm run opinion`). The
  guard hook then denies any automated write.
- Its validator requires `firma`, `fecha`, `hechos[]` (ids that must resolve),
  `noSabemos[]` (non-empty), and `contactoPrevio { fecha, canal, plazo, respuesta | null }`
  whenever a name appears. It rejects `requiresHumanApproval` (machine
  provenance), an empty `hechos`, and a name outside the person's tenure.
- `check:opiniones` re-reads every cited fact with the four outcomes of
  `check:eficiencia-findings` (`coincide` · `movido` · `contradice` ·
  `sin-indicador`). An opinion whose basis now says something else shows a
  notice on the page until the editor revisits it.
- Draft opinions that name a person live in `editorial/` (gitignored) until
  signed, as all unreviewed prose about a living person must
  (`check:editorial`).

### Layer 2 — «Cuesta · Consigue · Responde», one row per service

Facts only, derived, with no valence words. This is the creative core: the
resident sees the three ingredients side by side, on the same years, against
the same comparison group, and can judge without being told.

- **Cuesta:** an _indexed slope chart_ (2021 = 100). Riba-roja's real cost
  against the peer median. Police: 100 → 150 against 100 → 105. Motion: both
  lines draw (`cp-traza`), and the end labels are static text.
- **Consigue:** the same chart for the service's result, where one exists:
  infractions ‰ for police, recycling rate for waste, and so on, each from an
  independent public source. Where none exists, the cell says «el Ministerio no
  pide ningún resultado de este servicio», not a blank.
- **Responde:**
  - who held the delegated competence, per period (the tenure ribbon, §4);
  - the registered question for this service and its **clock**: «preguntado el
    12-09 · plazo legal 1 mes · 40 días sin respuesta»;
  - the governing party's promise for the area from `/promesas`, or «no
    consta ninguna promesa sobre esto».
- **Mandate shading** behind both slopes (2019–2023, 2023–2027), so a jump is
  read against who was in office.
- **Words of direction, never of value.** «sube», «baja», «más que el grupo»,
  «menos que el grupo». Never «mejor», «peor», «mal gestionado». The
  thresholds for «más que el grupo» are the band rules the book already uses.

What makes this layer more than the ficha's «al lado, nunca dividido»:

- the same index base for cost and result;
- the peer trend as the counterfactual («¿subió en todas partes?»), which is
  what a resident cannot get anywhere else;
- the response clock, which turns «a quién pregunto» into «¿contestan?».
  Answering is conduct, attributable to the holder without any causal claim.

### Layer 3 — unchanged

v1's «En breve», the book, the method tail and the signed findings stay as
designed.

## 4. Names, tied to the data honestly

| Kind of fact                                     | May carry a name?                                                                                                               | Example                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **A decision** (vote, decree, award)             | Yes. It is an act, sourced to the acta or the BOP, at bloc level unless a curator promotes it (single-seat blocs = individual). | «El presupuesto de 2022 lo aprobaron con sus votos …»                         |
| **Conduct** (answered? filed? met the deadline?) | Yes, as holder of the competence, with dates.                                                                                   | «Pregunta a la delegación de Seguridad y emergencias: 40 días sin respuesta.» |
| **An outcome** (crime, recycling, cost per unit) | **No**, not by itself. Only inside the signed opinion, as context, never as cause.                                              | —                                                                             |

The **tenure ribbon** under each series names who held the delegated
competence in each period, from the delegation decrees. Today
`competencias.json` holds only the 2023–2027 mandate. The 2019–2023 decree has to
be curated first; until then the ribbon says «2019–2023: sin decreto
incorporado» and names no one for those years.

## 5. Data work this needs

| Gap                                                                                 | Source                                                              | Why                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Peer **trend** of infractions (only the latest percentile is stored)                | the same Interior CSVs `scrape-criminalidad` already reads          | the counterfactual: did crime rise in similar towns too?           |
| **Real headcount** of the Policía Local                                             | the budget's _anexo de personal_ / RPT, published with each budget  | unfreezes the police divisor independently of the council's filing |
| **Budget approval votes** (`pleno-votes.json` has 16 items, no budget approval)     | the actas of the budget plenos                                      | the «decision» row of §4                                           |
| **2019–2023 delegation decree**                                                     | BOP València                                                        | tenure ribbon before 2023                                          |
| More **results**: recycling rate, water quality (SINAC), and others                 | Generalitat / Consorci; Ministerio de Sanidad                       | «Consigue» for more than one service                               |
| **Question clock**: questions sent as formal access requests (Ley 19/2013, 1 month) | `docs/superpowers/specs/2026-08-27-solicitudes-de-acceso-design.md` | turns «preguntas registradas» into a measurable answer rate        |

### Outcome sources for the other 13 services — leads, NOT verified

A research pass on 2026-10-22 could not reach any of these hosts from its
sandbox (proxy refused every fetch). Everything below is from search results
only, and each source must be opened and checked for a Riba-roja row, its
licence and its years before an adapter is written.

| Lead                                                                                                                           | Services                                                                                          | Status                | Note                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **EIEL** (Encuesta de Infraestructura y Equipamientos Locales; Ministerio de Política Territorial, collected by the Diputació) | pavement, lighting, water, sewer, school buildings, sports facilities, parks, cemetery saturation | partial               | Municipalities < 50.000, so Riba-roja and all its peers are in. Downloadable phases to 2020, data per núcleo. Licence to confirm (possibly CC BY-NC-SA). It is the surveyors' assessment of each facility's state: coarse, lagging, and moved by provincial and regional investment, not only by municipal upkeep. |
| **SINAC** (Ministerio de Sanidad)                                                                                              | drinking water                                                                                    | partial               | Share of compliant analyses per supply zone. No bulk download found, so it would need scraping. A supply zone is not the municipality.                                                                                                                                                                             |
| **DGT accident microdata**                                                                                                     | pavement (context only)                                                                           | partial               | One row per accident, with an INE municipality code, 2022–2024. Accidents depend on traffic and on roads the council does not run.                                                                                                                                                                                 |
| **EEA UWWTD Waterbase** (CC BY)                                                                                                | sewerage                                                                                          | partial               | Agglomeration compliance with art. 3 (collection). Needs checking that it maps onto Riba-roja.                                                                                                                                                                                                                     |
| **The coste efectivo «viajeros» box**                                                                                          | urban transport                                                                                   | already in the return | Riba-roja declares 0 passengers; 22 peers report a figure.                                                                                                                                                                                                                                                         |

No outcome source was found for urbanism, sports promotion, street cleaning or
the library. For the library, a formal access request for visits and members is
the realistic route.

## 6. What changes in the editorial contract

An editor's opinion changes a published promise, and the same PR must say so:

- **`docs/DESCRIPCION.md`** «Lo que esta herramienta no te va a dar: una nota».
  The data still gives none. The editor may give an opinion, signed and
  separate.
- **`/metodologia`**: a new section on «La opinión del editor» (who writes it,
  what it must cite, pre-publication contact, reply, corrections, LOREG).
  Update the «¿Ponéis nota al Ayuntamiento?» card of «En breve», which today
  answers «No …».
- **`/aviso-legal`**: opinion versus information, and the right of reply to an
  opinion.

## 7. Decisions for the maintainer

1. **Who signs.** A named person (recommended: accountability needs a name on
   both sides), or «la redacción de CivicPulse»?
2. **Pre-publication contact.** How many days the holder gets to reply before an
   opinion naming them goes up. Recommended: 7.
3. **LOREG.** Freeze editorials that name candidates from the call of elections
   (recommended), or keep publishing signed opinion through the campaign?
4. **Per-resident euros** (from v1): still open.
5. **First opinion.** Police is the strongest case. Recommended: publish it only
   after the headcount gap is closed or explicitly asked in the opinion itself.

## 8. Rollout

1. Layer 2 for police and waste (the two services with results). Tenure ribbon
   for 2023–2027 only, so far.
2. The opinion block with its file, validator, CLI, guard entry and checks, and
   the editorial-contract changes, in the same PR.
3. The data work in §5, one adapter at a time (TDD cadence).
4. The first signed opinion, after §7 is decided and the pre-publication
   contact has run.
