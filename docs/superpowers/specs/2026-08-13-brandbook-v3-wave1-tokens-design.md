# Brandbook v3 · Wave 1 — the token layer

**Fecha:** 2026-08-13
**Fuente:** proyecto Claude Design «Brandbook design review kickoff»
(`06b5239e-168e-4110-b793-c3748039f9ad`), fichero `CivicPulse - Brandbook.dc.html`,
21 diapositivas.
**Alcance:** correcciones 1, 2 y 7 del brandbook — color de marca, escala de
tinta y modo oscuro. Las otras seis van en las olas 2 y 3.

> Los recuentos de este documento (usos por token, ficheros, tamaños de texto)
> son **mediciones fechadas el 2026-08-13**, no afirmaciones vivas: son la
> prueba sobre la que se decidió el diseño. Si se leen más tarde, vuelvan a
> medirse — el guard de §3 es lo que sí se mantiene cierto solo.

---

## 1. Por qué

El brandbook v3 declara nueve correcciones. Las nueve se comprobaron contra el
repositorio antes de escribir este documento; ninguna es decorativa y tres son
peores de lo que la presentación afirma.

| # | Afirmación del brandbook | Medición en el repo | Veredicto |
| - | ------------------------ | ------------------- | --------- |
| 1 | El azul de marca es el del PP | `--civic: #2463eb` · `PARTY_COLORS.PP: '#2463EB'` | **Idénticos** |
| 2 | «La escala de tinta no escala» | `.73 / .64 / .62 / .60` — cuatro tokens en 13 centésimas | Confirmado |
| 3 | 19 tamaños de texto | **28 distintos**, 1.427 usos, 520 medios puntos, suelo de 8 px | Peor |
| 4 | 8 radios a mano | **14 distintos**, 306 usos (90× `6`, 16× `999`) | Peor |
| 5 | La evidencia no tiene jerarquía | Confirmado en `/hallazgos` | Confirmado |
| 6 | La tarjeta OG no está gobernada | `og.svg` imprime `CIVICPULSE-VIRID.VERCEL.APP`; `index.html` publica `og:url = civicpulse.es` | **Se contradicen** |
| 7 | El modo oscuro no estaba escrito | `html.dark` ya coincide hex a hex con §02c | Confirmado (es documentación) |
| 8 | Cursiva sintética sobre la cita | Outfit se carga `wght@400;500;600;700`, sin eje `ital`; 10+ usos de `fontStyle:'italic'` | Peor que «5 sitios» |
| 9 | Falta el componente de propuesta automática | `Promesas.jsx:259` lo pinta a mano | Confirmado |

**Un punto en el que el brandbook se equivoca sobre este repo.** §03 dice «se
retiran Fraunces e Inter: se cargan hoy y no se usan en producción». Inter es
correcto — cero usos. **Fraunces se usa en 7 sitios** (`/reportajes`, la pieza
DANA, `LiveTicker` en modo prensa, `direction-d/tokens`). Retirarla no es
limpieza, es rediseñar la voz editorial larga. Queda como decisión abierta de la
ola 3, no como instrucción heredada.

### La corrección 1 no es una preferencia

`/promesas` atribuye promesas a formaciones políticas. La pastilla del PP se
pinta con `PARTY_COLORS.PP`; la marca del sitio se pinta con `--civic`; los dos
son `#2463EB`. Un medio que atribuye afirmaciones a partidos no puede compartir
identidad cromática con uno de ellos.

El caso más agudo está en la propia página: `src/pages/Promesas.jsx:259`
—el bloque `showSuggestion`, la propuesta *automática* sobre una promesa— usa
`rgba(36,99,235,.05)` de fondo, `rgba(36,99,235,.35)` de borde discontinuo y
`color: var(--civic)`. Una inferencia de máquina sobre una promesa se dibuja
en el hexadecimal exacto del Partido Popular.

---

## 2. Qué cambia

### 2.1 Paleta

```css
:root {
  --civic:      #0E5B62;   /* era #2463eb — el hex del PP.  7,80:1 sobre paper (era 5,17) */
  --civic-soft: #E6F2F2;   /* era #eef4ff */
  --civic-ink:  #0A4449;   /* era #1e4fbb — 9,48:1 sobre el wash */
  --civic-on:   #ffffff;   /* NUEVO: tinta legible sobre una superficie --civic SÓLIDA */

  --ink:   #0b0f19;              /* 19,15:1  título, dato principal   */
  --ink70: rgba(11,15,25,.78);   /*  9,74:1  secundario, cuerpo largo */
  --ink50: rgba(11,15,25,.62);   /*  5,41:1  meta, eyebrow, etiqueta  */
  --ink20: rgba(11,15,25,.12);   /* bordes — no es texto, sin cambio  */
  --ink10: rgba(11,15,25,.06);   /* wash   — no es texto, sin cambio  */
  /* se eliminan: --ink80 .82, --ink60 .64, --ink40 .60 */
}

html.dark {
  --civic:      #4FB3BD;   /* era #5b8def.  7,16:1 sobre paper */
  --civic-soft: #10333A;
  --civic-ink:  #8ED8E0;   /* 8,38:1 sobre el wash */
  --civic-on:   #0b0f19;   /* 7,77:1 */

  --ink70: rgba(241,245,249,.78);  /* 10,09:1 sobre paper */
  --ink50: rgba(241,245,249,.62);  /*  6,80:1 sobre paper */
}
```

Todas las cifras de contraste de este documento están calculadas por composición
alfa sobre el fondo real (`--paper`, `--surf`, `--soft`) con la fórmula WCAG 2.1
de luminancia relativa, no estimadas. Las tres del brandbook §02b —19,2 / 9,8 /
5,4— se reprodujeron exactamente.

### 2.2 `--civic-on` corrige un fallo AA que ya estaba en producción

En oscuro, `--civic: #5b8def` con `color: #fff` da **3,23:1** y suspende AA. Ese
par pinta `.cp-skip-link` (WCAG 2.4.1, el salto al contenido) y `::selection`.

axe nunca lo vio: el enlace de salto vive en `left:-9999px` hasta recibir foco, y
`::selection` no es un nodo que axe evalúe. Es la misma forma que el propio
`tests/e2e/a11y.spec.ts` documenta en su cabecera —verde por no ejecutarse—
aplicada a un elemento distinto.

Una superficie de marca sólida necesita tinta distinta en cada tema; fijar `#fff`
a mano es lo que produjo el 3,23:1. La mayoría de los `background: var(--civic)`
son barras y medidores sin texto encima, así que `--civic-on` tiene pocos
consumidores — pero hace la regla enunciable y comprobable.

### 2.3 Fusión de la escala de tinta: por valor, no por rol

| Token de hoy | α | Destino | α | Δ | Usos |
| ------------ | - | ------- | - | - | ---- |
| `--ink80` | .82 | `--ink70` | .78 | .04 | 65 |
| `--ink70` | .73 | `--ink70` | .78 | .05 | 141 |
| `--ink60` | .64 | `--ink50` | .62 | .02 | 323 |
| `--ink40` | .60 | `--ink50` | .62 | .02 | 28 |

Ningún sitio se mueve más de 5 centésimas, así que **nada se reestiliza
visiblemente**: el diff retira sinónimos sin cambiar lo que ve un lector.

Y dice la verdad. Esos 323 usos de `--ink60` ya se renderizaban como tono meta,
porque .64 y .62 son indistinguibles — ese *es* el defecto. Reasignar por rol
(mandar el cuerpo secundario a .78) construiría una jerarquía que hoy no existe,
oscurecería una parte grande de 71 ficheros y exigiría criterio por componente.
Queda como pasada propia posterior a la ola 2, cuando las primitivas anclen qué
significa «secundario».

`--ink50` se queda en .62 y no baja: a .52 daría 3,84:1 y suspendería AA. Esto
coincide con el techo ya medido en este repo (banda segura .60–.82; los valores
intermedios .54/.46 rompieron 18 rutas) y con lo que el propio brandbook §02b
admite. La aspiración de .45/.30 no se persigue.

Ambos temas pasan a usar los mismos dos alfas. Oscuro queda algo más alto en
ratio (10,09 / 6,80) porque tinta clara sobre fondo oscuro separa más deprisa;
las dos pasan con margen.

### 2.4 Modo oscuro: se escribe, no se cambia

`html.dark` ya define los 24 tokens que §02c especifica, y coinciden hex a hex
(`--paper #12182a`, `--surf #0b0f19`, `--ok-soft #0f2a1c` / `--ok-ink #8bebb0`,
`--warn-soft #2a1e0f` / `--warn-ink #f5c17c`, `--crit-soft #2a1212` /
`--crit-ink #f5a0a0`, `--intel-soft #1f1830` / `--intel-ink #c8aef5`). La
corrección 7 es documental salvo por `--civic`, `--civic-on` y los dos tiers de
tinta.

Los siete colores de partido **no se reinterpretan por tema**: son marcas ajenas
y se mantienen idénticos en claro y en oscuro. La aserción 1 del guard lo cubre
por construcción, porque importa el enum en vez de copiarlo.

### 2.5 Petróleo y la prueba de no-partidismo

`#0E5B62` está en tono 185°. Ninguna formación con representación en Riba-roja
usa un teal: PSOE 352°, PP 221°, VOX 100°, Compromís 33°, Ciudadanos 28°,
EU-Podem 351°. El sentinela `Otro` es pizarra 215° y no es un partido.

---

## 3. El guard — `tests/brand-tokens.test.js`

Vitest, dentro de `npm test`. **Analiza `src/index.css` e importa
`PARTY_COLORS`.** No reproduce ningún valor.

| # | Aserción | Motivo |
| - | -------- | ------ |
| 1 | Ningún valor de `PARTY_COLORS` aparece fuera de `party-colors.js` | La colisión. Al importar el enum, añadir un partido extiende el guard solo |
| 2 | El conjunto diferido es **exactamente** esos 6 sitios, cada uno con fichero, motivo y ola | Regla #2 de `DATA_INTEGRITY`: lo omitido se declara, nunca se pliega sobre «limpio». Falla si aparece un séptimo *o* si uno se arregla sin darlo de baja |
| 3 | Cada tema declara exactamente 3 tiers de tinta de texto | El bug de los sinónimos, enunciado como forma |
| 4 | Tiers adyacentes difieren ≥ .10 de alfa | `.62` frente a `.64` no podría satisfacerlo jamás |
| 5 | Cada tier y cada par civic calcula ≥ 4,5:1 sobre `--paper`/`--surf`/`--soft`, en los dos temas | El contraste se computa desde lo analizado, no se afirma desde una tabla |
| 6 | El análisis encontró ≥ 8 tokens y ≥ 20 sitios hex candidatos | **Prueba de trabajo.** Sin esto, una regex que no casa con nada imprime su propio visto bueno |

La aserción 6 es la que este repo ha pagado más caro: es la forma
`r?.findings ?? []`. Un guard contra la staleness que se queda mudo por un typo
es el chiste que este repositorio ya ha contado dos veces.

### Conjunto diferido (6 sitios · codifican datos, no marca)

| Fichero:línea | Uso | Ola |
| ------------- | --- | --- |
| `src/hooks/useBudget.js:29` | `EXPENSE_COLORS[0]` — capítulo 1 Personal | 3 (§07) |
| `src/hooks/useBudget.js:42` | `PROGRAM_COLORS[1]` — servicios públicos básicos | 3 (§07) |
| `src/components/Presupuesto/SpendingTypeBreakdown.jsx:21` | serie `construction` | 3 (§07) |
| `src/components/Presupuesto/GastoMap.jsx:96` | pin DANA vs. normal | 3 (§07) |
| `src/components/LiveCity/layers/MoneyLayer.jsx:43` | pin DANA vs. normal | 3 (§07) |
| `src/components/empleo/EmpleoMap.jsx:58` | polígono de empleo | 3 (§07) |

`public/og.svg` (2 usos) va en la ola 2, que reescribe la tarjeta entera.

---

## 4. El barrido — 24 usos en 16 ficheros

Tres pasadas, un commit cada una:

1. **Tokens compartidos** — `src/index.css`, `index.html` (`theme-color`
   `#2463EB` → `#0E5B62`, que es el color del cromo del navegador en móvil).
2. **Paleta del aterrizaje** — `direction-d/tokens.jsx`, `SectionHeader.jsx`,
   `Masthead.jsx`, `FeedBlocks.jsx`. Conserva su papel cálido y su regla de no
   seguir el modo oscuro; sólo cambia el azul, y su par de tinta `.68/.65` se
   alinea con `.78/.62`.
3. **Superficies de mapa** — `LiveCity/*` (8 ficheros; el noveno,
   `layers/MoneyLayer.jsx`, está en el conjunto diferido), `QuejasHeatmap.jsx`,
   `Promesas.jsx`.

Donde el sitio ya vive en un componente que lee variables CSS, pasa a
`var(--civic)` en vez de a un literal nuevo. El aterrizaje es la excepción
deliberada: posee una paleta aparte por diseño.

`Promesas.jsx:259` recibe sólo el retono. Su caja discontinua de propuesta
automática también quiere `--intel`, cuerpo de 11 px y radio 12 — eso es el
`MachineProposal` de la ola 2 y no se cuela aquí.

---

## 5. Verificación

Tres puertas, en orden:

1. `npm test` — el guard nuevo, en rojo antes del retono y en verde después, más
   la suite existente. `npm run typecheck` y `npm run lint` limpios.
2. `npm run test:e2e` — axe estricto sobre las rutas de `STRICT_ROUTES`, más el
   spec de contraste que afirma sobre el **recuento** de nodos en `/`, `/cargos`
   y `/presupuesto`. Ese spec es el que cubre el aterrizaje: oculta la capa
   Leaflet y exige > 20 nodos evaluados, así que un retono del aterrizaje que
   rompa contraste sí se ve.
3. **Pasada en navegador.** 266 sitios cambian de tono y ninguna suite ve una
   maqueta. `/`, `/promesas`, `/presupuesto`, `/quejas` y `/empleo`, en claro,
   en oscuro y a 375 px. Se comprueba además, con foco puesto, el enlace de
   salto en oscuro — el fallo 3,23:1 que este trabajo arregla y que axe no mira.

## 6. Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| 266 sitios cambian de tono a la vez | Los guards cubren contraste; la maqueta la cubre la pasada en navegador, que es parte del trabajo y no un seguimiento |
| El aterrizaje tiene paleta propia y no sigue el tema | Se retona sólo el azul; papel cálido y regla de no-oscuro intactas |
| `--civic-soft` / `--civic-ink` se usan en 17 sitios con supuestos de tono azul | Los pares nuevos se midieron contra su propio wash (9,48:1 claro, 8,38:1 oscuro) |
| Un séptimo hex de partido aparece más tarde | Aserción 2: el conjunto diferido es exacto en ambos sentidos |
| El guard se queda mudo por un typo | Aserción 6, prueba de trabajo |

## 7. Fuera de alcance

Olas 2 y 3, ya delimitadas: primitiva `Quote` sin oblicua sintética,
`EvidenceCard` de tres bandas, `MachineProposal`, reescritura de `og.svg`
(ola 2); 28 tamaños de texto → 8 pasos, 14 radios → 3, decisión sobre Fraunces,
retono de las 6 series de datos (ola 3). El brandbook §«Fuera de alcance»
declara además cinco superficies que la v3 no gobierna en absoluto —el mapa, la
densidad, los formularios, los estados de interacción y la impresión—; siguen
sin gobernar después de esta ola.
