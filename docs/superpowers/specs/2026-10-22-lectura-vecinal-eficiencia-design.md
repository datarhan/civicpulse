# Lectura vecinal — `/eficiencia`

**Status:** proposal, unbuilt. A sibling of
[`2026-10-21-lectura-vecinal-design.md`](2026-10-21-lectura-vecinal-design.md),
whose «En breve» pattern (`src/components/EnBreve.jsx`) this reuses.
**Figures:** the examples are as the page read on the 2026-10-22 build, to show
the copy. None of them may be written into the page by hand: each one is derived
from the snapshot, as the rest of the page already does.

`/eficiencia` is **legally material** (CLAUDE.md, «Legally material
surfaces»). Every proposal below is checked against those rules in
[Guardrails](#guardrails), and two of them need a maintainer decision
([Decisions](#decisions-for-the-maintainer)).

## The problem

The page's H1 asks the resident's question: **«¿Cuánto cuesta y qué se
obtiene?»** What follows it answers a statistician's question.

- **The short answer is method, not an answer.** «La respuesta corta tiene dos
  partes y manda la segunda: de los 14 servicios comparables, 6 no se
  distinguen de la mediana … 13 de las 15 divisiones se hacen entre una
  cantidad que nadie vuelve a medir, así que sus series no se pueden leer como
  gestión.» Every claim in it is true. But a resident has to know what a
  median, a division and a «serie» are before any of it lands. And it never
  says how much anything costs.
- **The «Estado de la rendición» card speaks in auditor's terms.** «cantidades
  sin remedir desde 2018-2019 · 13 de 15», «entregas publicadas que no pueden
  ser un coste · 5».
- **Each row of the book carries six encodings:** total cost, unit cost, the
  divisor with its frozen flag, «×1,25» against the median, a percentile bar
  with a plausible band («p85 · banda 75-94 · por encima»), and a deflated
  sparkline. A two-line legend in micro type explains the bar. The filter chips
  are «Posición que se distingue · 8», «Sin cociente · 0».
- **The strongest finding is buried.** The council has declared the same
  physical quantities for years: the same 11.059,41 tonnes of waste, the same
  700.000 m² of street cleaning, the same 4.514 street lights. That is the
  most concrete and most shareable fact on the page. It sits in the third
  section, behind «Denominadores que el ayuntamiento no vuelve a medir», and in
  the signed finding at the very bottom.
- **Length:** about 3.300 words; ~5.600 px on desktop, ~12.700 px at 375 px.
  The method tail («Cómo se lee», «Qué cubre esta página») is longer than the
  book.
- **Language:** `RespuestaCorta`, `EstadoRendicion` and `LoQuePermite` hold
  their copy as literal Castilian in JSX, so the top of the page never
  translates (`docs/REVIEW_2026-09.md` §16).

What the page already does well, and must keep:

- It refuses a grade (`docs/DESCRIPCION.md`).
- It does not colour position («un coste unitario alto es un precio, no un
  suspenso»).
- It says what the numbers cannot conclude («Lo que no»).
- It addresses its questions to institutions, never to people.

The redesign changes the reading order and the register. It does not change any
of those decisions.

## What a resident actually asks

| Question                                  | Answer, in plain words (2026-10-22 build)                                                                                                                                                                                                   | Built from                                               | Proves it             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| ¿Cuánto cuestan los servicios?            | «Los 15 servicios que mide el Ministerio costaron 19,5 M€ en 2024.» The largest: policía local, colegios, urbanismo. Caveat in the card: it is the cost the council _declares_, not all municipal spending and not «lo gastado».            | `costeDeclarado` per indicator; `anioBase`               | `#sec-servicios`      |
| ¿Es caro comparado con pueblos parecidos? | «En 8 de 14 servicios Riba-roja se sale del grupo de municipios parecidos: en 6 cuesta menos por unidad, en 2 más. En los otros 6 no se distingue.» Caveat: a unit cost is a price, not a grade, and the «unit» is the next card's problem. | `particionPosiciones` (already used by `RespuestaCorta`) | `#sec-servicios`      |
| ¿Lo hacen bien?                           | «Esta página no lo puede decir: el Ministerio no pide ningún dato de calidad. Y además, 13 de las 15 cantidades que el Ayuntamiento declara llevan años sin cambiar, como las mismas 11.059,41 toneladas de basura desde 2019.»             | `recuentos().congelados`, `declaracion.denominador`      | `#sec-declaracion`    |
| ¿Cumple con rendir cuentas?               | «Presentó 10 de las 11 entregas obligatorias. La de 2020, no.»                                                                                                                                                                              | `cobertura.entregasNoPresentadas`                        | `#sec-entregas`       |
| ¿A quién se lo pregunto?                  | «Dejamos 7 preguntas registradas, cada una dirigida a una institución, y su respuesta se publicará entera.»                                                                                                                                 | `eficiencia-preguntas.json`                              | the preguntas section |

Two things in this table do the most work.

**The third card is the page's real finding, said concretely.** «Las mismas
toneladas desde 2019» is something anyone can judge. «Denominadores
congelados» is not.

**The second card turns the percentile bar into words**, one to one with the
three states the bar already has:

| The bar today                    | Plain words                                        |
| -------------------------------- | -------------------------------------------------- |
| «por encima»                     | «cuesta más por unidad que la mayoría del grupo»   |
| «por debajo»                     | «cuesta menos por unidad que la mayoría del grupo» |
| «cruza la mediana»               | «no se distingue del grupo»                        |
| «no llegan a quince comparables» | «no hay bastantes municipios para comparar»        |

The plain words never add a fourth state or a degree («mucho más caro»), and
they always sit in the same card as the caveat that unlocks them.

## The proposal

### 1. «En breve» above the current short answer

Five question cards using `EnBreve`, in the order of the table. Each card has
one figure, one sentence, its caveat and a «Ver el detalle ↓».

- **¿Cuánto cuestan?** Horizontal bars for the five largest services by
  declared cost, with plain names («Policía local», «Colegios»). The official
  name goes in the `title` and in the book below. A sixth bar, «Resto», is in
  grey.
- **¿Es caro comparado?** Three groups of service chips: _cuesta menos por
  unidad_ · _no se distingue_ · _cuesta más por unidad_. Chip colour is the
  same neutral petrol for all three: position is not coloured, as on the page
  today.
- **¿Lo hacen bien?** The **frozen-number strip**: one service's declared
  quantity, year by year, in a row of year chips. The chips appear in order
  and the number does not move. That is the motion: marks enter, and the text
  (the frozen value) never changes, because not changing is the point. Below
  it: «13 de 15 cantidades, iguales año tras año».
- **¿Cumple?** The existing 11 boxes of `EntregasBarras`, small, with 2020
  hollow.
- **¿A quién pregunto?** The count of registered questions, and their
  addressees as institutions (Alcaldía, the council, Consorci València
  Interior).

The current `RespuestaCorta` stays, moved under «En breve» and renamed for what
it is: «La lectura técnica». `EstadoRendicion` stays as the expert's sidebar.
Nothing below is removed.

### 2. The book, readable without the legend

The book is where a resident looks for _their_ service (the bins, the police,
the library). Each row keeps every expert encoding, but leads with a plain
line:

```
Recogida de residuos                               740.272 €
Cuesta menos por unidad que la mayoría de pueblos parecidos.
⚠ La cantidad que divide (toneladas) no se remide desde 2019.
──────────────────────────────────────────────────────────────
66,94 €/t · ÷ 11.059,41 t · ×0,52 · p13 · banda 3-27 · ▁▂▁▁▁
```

- The plain line is derived from the same `posicion` field as the bar, through
  the table above.
- The frozen-divisor warning is already on the row («cantidad sin remedir
  desde 2019»). It moves next to the plain line, because it is what qualifies
  it.
- Filter chips take plain names:
  - «Se sale del grupo · 8»
  - «Como el grupo · 6»
  - «Sin bastantes comparables · 1»
- At 375 px the expert line folds into the row's link to its ficha, which
  already carries all of it.

### 3. Glossary

Add to `src/glosario.js` the terms the page and its fichas use. The «En breve»
cards and the book's headers mark them with `[[clave|…]]`, and Cmd+K finds
them.

| Term                 | Plain definition (draft)                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Coste efectivo       | Lo que el Ayuntamiento declara al Ministerio que le costó prestar un servicio en un año. No es todo el gasto municipal.            |
| Coste unitario       | El coste del servicio dividido entre la cantidad que presta: euros por tonelada, por metro, por usuario.                           |
| Mediana              | El municipio del medio: la mitad de los parecidos cuesta más y la otra mitad menos.                                                |
| Banda plausible      | El margen dentro del cual podría estar la posición de Riba-roja con estos datos. Si incluye la mediana, no se distingue del grupo. |
| Cantidad sin remedir | Una cantidad que el Ayuntamiento declara igual, decimal a decimal, año tras año.                                                   |
| Entrega              | El envío anual obligatorio de estos datos al Ministerio (art. 116 ter LRBRL).                                                      |

### 4. The method tail stays, shorter to reach

«Método, cobertura y lo firmado» stays entire and in place. **«Hallazgos
firmados» is never folded:** it is legally material, carries the right of
reply, and is the page's signed claim. Only «Cómo se lee un coste unitario» and
«Qué cubre esta página» could become `<details>` closed by default at ≤ 768 px.
That is the single change that cuts the mobile page by about a third. It is
optional, and a reader who opens them gets the full text.

### 5. Valencià

The new layer is catalogue strings, so it translates from day one. Moving
`RespuestaCorta`, `EstadoRendicion` and `LoQuePermite` into the catalogue is a
separate, mechanical follow-up.

## Guardrails

These are the `/eficiencia` rules from CLAUDE.md, and how the proposal stays
inside each one:

- **A finding describes a service or a process, never a person.** No card
  names anyone. «¿A quién pregunto?» names _institutions_, exactly as the
  preguntas section does. Delegated-competence names stay where they are today:
  only in the ficha, in the same card as the caveat that disarms them.
- **Group by functional area, never by concejalía.** The «¿Cuánto cuestan?»
  bars are services, not portfolios. A future «agrupar» stays on `AREAS`.
- **No grade, no scoreboard.** No total score and no green/red. «Cuesta
  menos» is not «lo hace mejor», and the card says so. The «¿Lo hacen bien?»
  card's answer is literally «no se puede decir», with the reason.
- **Peers are named only because the division is the ministry's.** «Pueblos
  parecidos» is the ministry's band (Comunitat Valenciana, 15.000–40.000
  inhabitants). It is described, never ranked, and no other municipality is
  named in the summary.
- **A number is not a verbatim.** Every figure in «En breve» is derived at
  render time from `indicadores` / `cobertura`. None is frozen in copy, so
  `check:eficiencia-findings`' four outcomes keep governing only the signed
  fichas, as today.
- **LOREG freeze.** «En breve» names no candidate and moves no claim, so the
  freeze does not need to hide it. Any competence line added later would fall
  under it, like the existing layer.
- **`/metodologia` and `/aviso-legal`** are not changed by a reading layer.
  If decision 2 below adds a per-resident figure, `/metodologia#eficiencia`
  must say how it is computed, in the same PR.

## Decisions for the maintainer

1. **Plain-language position wording.** Is «cuesta más / menos por unidad que
   la mayoría de pueblos parecidos» acceptable on a legally material surface,
   always paired with «un precio no es una nota» and the frozen-divisor
   warning? The alternative is to keep only the bar and «se sale / no se
   sale del grupo», which is safer but less clear.
2. **Euros per resident.** Residents understand «173 € por vecino al año para
   la policía local» far better than «81.965 €/efectivo». But it is a division
   _we_ would make (ministry cost ÷ INE padrón of the same year), not one the
   ministry publishes. Options:
   - publish it, labelled «cálculo nuestro» with its padrón year, and
     documented in `/metodologia`;
   - or leave it out.

   It must never be compared across municipalities, which would turn it into
   the ranking the page refuses.

## Rollout

1. «En breve» cards 1, 3, 4 and 5, which need no decision. Glossary terms.
2. Card 2 and the book's plain line, after decision 1.
3. The per-resident figure, only if decision 2 says yes.
4. `/gestion`, the sibling page (PMP, CONPREL, contractors, execution), with
   the same pattern.
5. The reader test from the parent spec, with the task «¿cuánto cuesta la
   recogida de basura y está bien?», which this page currently cannot answer
   in plain words.
