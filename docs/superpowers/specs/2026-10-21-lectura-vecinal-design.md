# Lectura vecinal — a plain-language first layer for the dense pages

**Status:** rollout step 1 built — `EnBreve` (`src/components/EnBreve.jsx`) on
`/presupuesto`, its figures derived by `src/scraper/en-breve-presupuesto.ts`, the
glossary in `src/glosario.js`. The barrio page, `/metodologia` and the Cmd+K
glossary index are not built yet. **Scope:** `/presupuesto` first, then
`/metodologia`, then whichever page the reader test names next.

## The problem

`/presupuesto` and `/metodologia` are written for the reader who already knows
the vocabulary: _obligaciones reconocidas netas_, _crédito definitivo_,
_reparos_, «el p90 de la entrega». For an auditor that is precision. For a
vecino of l'Oliveral or La Reva who came to ask «¿se ha contratado algo en mi
calle?» it is a wall, and the page never answers the question they came with.

The fix is not to make the page simpler. It is to put a **short answer layer
on top** that a resident can read in thirty seconds, with every answer pointing
down into the section that proves it — and to leave everything below untouched.

## What the resident actually asks

Designing from questions, not from datasets, is the whole method. For the
budget:

| Question a vecino asks                         | Answer is built from                                           | Existing section below |
| ---------------------------------------------- | -------------------------------------------------------------- | ---------------------- |
| ¿Cuánto dinero tiene el Ayuntamiento este año? | crédito definitivo, por habitante                              | `#cascada`             |
| ¿Cuánto lleva gastado?                         | obligaciones reconocidas — the only magnitude that is spending | `#cascada`             |
| ¿En qué se va?                                 | the three largest capítulos, in plain names                    | Capítulos              |
| ¿Debe dinero?                                  | deuda viva, por habitante                                      | `DeudaVivaSection`     |
| ¿Qué se ha contratado en mi barrio?            | `tender-geo.json` zones + its `universe` block                 | `GastoDashboard`       |

The last row is the one the issue names, and it is where honesty bites hardest:
the place-resolver situates only a small share of contracting, because most
municipal money is town-wide service contracts with no address. «Sector 14» is
not one of the resolver's zones at all. So the barrio answer must lead with the
limit, not bury it — «De cada 100 € contratados, sólo sabemos dónde se gastan
N» — and a barrio with no situated contract says so instead of painting zero.
That limit is a finding (CLAUDE.md, map honesty rules), and for a resident it is
also the most useful sentence on the page: it tells them where to ask instead.

## The pattern: `EnBreve`

One shared component, `src/components/EnBreve.jsx`, rendered right under a
page's `h1`:

```
┌─────────────────────────────────────────────────────────────┐
│ EN BREVE · ejercicio 2025                                   │
│                                                             │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ ¿Cuánto tiene│ │ ¿Cuánto lleva│ │ ¿En qué?     │  …       │
│ │  [figure]    │ │  [jar fill]  │ │ [3 bars]     │          │
│ │ one sentence │ │ one sentence │ │ one sentence │          │
│ │ ⚠ its caveat │ │ ⚠ its caveat │ │              │          │
│ │ Ver detalle ↓│ │ Ver detalle ↓│ │ Ver detalle ↓│          │
│ └──────────────┘ └──────────────┘ └──────────────┘          │
│                                  Saltar a todos los datos ↓ │
└─────────────────────────────────────────────────────────────┘
   … the existing page, unchanged …
```

Each item is `{ pregunta, respuesta, figura, salvedad?, ancla }`:

- **`respuesta` is derived, never hand-written.** A template from `i18n.jsx`
  filled from the snapshot, through the _same_ functions the detail uses
  (`cascadaGastos`, `capituloDominante`, `contrastarPresupuesto`,
  `titularDeuda`). Then summary and detail cannot disagree, and the sentence
  cannot go stale when the data moves — the `PanelMunicipal` precedent. The
  current `Cabecera` lede already does this; `EnBreve` is that lede split into
  questions, in a resident's register, with a picture each.
- **`salvedad` lives in the same card as the claim.** Simplifying must not drop
  the caveat that makes a figure true: the two-sources discrepancy, the
  coverage share of the barrio map. Same rule as the tier caveat on
  `/eficiencia`: the caveat renders where the figure renders.
- **`ancla` scrolls to the proving section**, so the expert path is one click
  from every answer and the resident never has to scroll past what they came
  for.
- **No missing-data zero.** An absent figure renders its absence sentence
  (the `soloAprobado` / `sinCuadre` states already exist), never «0 €».

On mobile (375px) the cards stack; layout goes in a stylesheet, not the `style`
prop, because it is responsive.

## Figures and motion

House rules already cover this, and `useRevelado` / `Revela` in
`components/reportajes/Pieza.jsx` already implement them: **marks animate, text
never does; the resting state is the complete figure**, which is what reduced
motion, no IntersectionObserver and print all get. No number counts up.

Candidate figures, each one mark-only:

- **Jar / bar fill** — ejecutado over definitivo, with a thin tick for «how much
  of the year has passed» so a reader can tell 30 % in March from 30 % in
  November without a sentence about it.
- **The cascade as steps** — inicial → + modificaciones → definitivo →
  ejecutado, bars growing left to right. It explains the three-magnitude
  distinction the page keeps insisting on, without the words.
- **100-square unit chart for the barrio map** — 100 squares, N filled petrol:
  «de cada 100 € sabemos dónde van N». A share people read at a glance.
- **Three plain bars for «¿En qué?»** with icon + plain name
  («Personal», «Obras e inversiones», «Servicios y suministros»), official
  capítulo name in the tooltip.
- **`/metodologia`: a five-step flow** — fuente oficial → copia con fecha →
  comprobación → publicación con cita → rectificación — each step linking to
  its section. That page is the editorial contract, so the flow summarises it;
  it does not restate or soften it.

Colour follows the figure rule: petrol (`foco`) for what we look at; red only
for a documented failure. Nothing green/amber/red as a judgement.

## Plain words, fixed once: `Termino` and a glossary

A dotted-underline inline term with a popover definition, from one curated
`src/glosario.js` (both locales), reused everywhere and indexed by Cmd+K:

| Term                      | Plain definition (draft)                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Obligaciones reconocidas  | Facturas y gastos que el Ayuntamiento ya ha dado por buenos y debe pagar. Es lo gastado. No es lo pagado. |
| Crédito definitivo        | Lo que el Ayuntamiento puede gastar este año tras los cambios del pleno. Es un límite, no un gasto.       |
| Modificaciones de crédito | Cambios del presupuesto a lo largo del año, casi siempre para añadir dinero.                              |
| Reparo                    | Objeción formal de Intervención —el funcionario que vigila las cuentas— a un gasto.                       |
| Deuda viva                | Lo que el Ayuntamiento debe a los bancos al cerrar el año.                                                |
| Percentil 90              | De cada 10 ayuntamientos de la lista, 9 tienen menos.                                                     |

The glossary is the single place where a plain synonym is mapped to a
magnitude, so it is also where the «gastado» rule is enforced in plain
language: «gastado» belongs only to obligaciones reconocidas. Its entries feed
`magnitudes-fiscales.ts`' vocabulary so the plain synonyms («lleva gastado»,
«tiene para gastar») are checked by the same deterministic pass inside
`review:surfaces` — no second channel.

## Guardrails — what this must not become

1. **No grade.** `docs/DESCRIPCION.md` refuses a nota on purpose. A summary
   layer is exactly where a traffic light or «bien / mal» sneaks in. It answers
   «cuánto» and «dónde», never «¿lo hacen bien?».
2. **No comparison we do not own.** A peer comparison appears only where the
   ministry publishes the division (deuda viva's entrega is one); no other
   municipality is ever named by us.
3. **No LLM-written summary.** Generated prose about published figures is
   unreviewed prose (data-integrity rule 4) and would drift from the detail.
   Templates + snapshot only.
4. **No «modo fácil» toggle.** A mode splits the audience, doubles the surface
   the reader-review must read, and hides the caveats from whoever picks the
   easy mode. One page, layered.
5. **Legally material pages last.** `/eficiencia`, `/gestion`, `/promesas`,
   `/hallazgos` can follow only after the pattern has run on non-legal pages,
   and their summaries inherit every rule of those surfaces (no person in a
   ficha, competence not blame, LOREG freeze hides the layer).

## Tests and checks

- A unit test that each `EnBreve` value equals the value the detail section
  computes — calling the same function, not restating the number.
- An enum-style ceiling: no item renders a fallback / absence sentence in the
  current snapshot without the test saying so (assert the check evaluated
  something).
- e2e: the block renders with all anchors resolving to an element on the page;
  axe at desktop and 375px.
- `review:surfaces` reads the page as before; `EnBreve` items carry
  `data-en-breve` so the report can quote them.
- A browser look at light, dark and 375px before it is called done.

## Rollout

1. **`/presupuesto`**: `EnBreve` with the four budget questions, the glossary
   and `Termino` for its terms. Both locales — this also closes part of the
   Valencian gap in `REVIEW_2026-09.md` §16.
2. **«¿Qué se ha contratado en mi barrio?»** — the barrio picker over
   `tender-geo.json` zones, leading with coverage; the same entry can sit in the
   landing's editorial column, where most residents arrive.
3. **`/metodologia`**: the five-step flow and «lo que nunca hacemos» as a short
   list on top.
4. **A reader test before step 4**: five vecinos, one task each («¿cuánto lleva
   gastado el Ayuntamiento?», «¿hay algo contratado en tu barrio?»), watched.
   The analytics are path-only and cannot say whether a block was understood;
   five people can. Their stumbles pick the next page.
