# Modo campaña: muchas personas, una sola vez cada cosa cara

## Qué se hace UNA vez, en la sesión central

- **BORME**: un barrido de la provincia de València desde 2009 hasta hoy
  (`npm run scrape:borme -- --desde 2009-01-02 --hasta <hoy> --provincia VALENCIA`)
  deja las secciones en `.cache/borme/`; después, `--persona` por cada apellido
  doble sobre la caché. Horas la primera vez, segundos después. Nunca un barrido
  por persona.
- **infoelectoral**: los ficheros de candidatos de las municipales 2007, 2011,
  2015, 2019 y 2023 (Chrome, formulario de descargas), filtrados a INE 46 214, en
  `editorial/investigaciones/_comun/infoelectoral/`.
- **BOP de candidaturas**: los boletines enteros de las fechas de proclamación
  (28/04/2015, 30/04/2019; las de 2007, 2011 y 2023 se localizan una vez).
- **Prensa que bloquea al rastreador** (Levante-EMV, Las Provincias, Europa Press,
  Cadena SER): una pasada en Chrome por persona, a ritmo humano, guardando título,
  fecha, URL y extracto literal en `_comun/prensa-chrome/<slug>.md`.
- **LinkedIn y webs de partido**: Chrome, lectura manual, a `_comun/`.
- **Wayback**: `journalist:archive-sources` sólo desde aquí.

## Qué hace cada dossier (subagentes, hasta 3 a la vez, uno por persona)

Con la habilidad cargada y las capturas de `_comun/` a mano: sondeo, actas y
declaración, cotejo, hallazgos, lagunas, propuesta, manifest. Presupuesto por
subagente: ribarroja.es ≤ 1 petición / 2 s, bop.dival.es ≤ 1 / 3 s, consultas de
disponibilidad de Wayback ≤ 1 / s, **sin** Save Page Now, **sin** Chrome, nada bajo
`public/`, nunca `promote-report` ni `correct-journalist-report`.

## Orden y oleadas

1. Piloto: una persona de principio a fin (dossier → corrección → v2 → archivo)
   antes de abrir la segunda. El piloto es la prueba de la habilidad.
2. Después, por bloques: el grupo del piloto, el gobierno, los portavoces
   unipersonales. Los que dejaron el cargo llevan dossier corto y corrección de
   tiempo verbal; los que entraron sin ficha en el portal, dossier y primera
   asignación.

## Publicar, por persona y en serie

1. Correcciones (`contradice`, `desactualizado`, `sin-fuente`, `se-parece` ajustable)
   con `correct-journalist-report`; las que tocan `warnings[i]` de un cargo con
   aviso en `area-fit.json` exigen retirar el aviso antes y firmarlo después.
2. v2 si hay material sustancial (≥3 hechos publicables nuevos de fuentes
   independientes, o un `contradice` que cambia la historia): `journalist:assign`
   (brief neutro y público) → `journalist:run --seed` (uno cada vez, 15–40 min)
   → `check:citations -- --draft` → revisión forense (`revisar-borrador` y
   `biografia-concejal` fases 3–4) → `promote-report` (alta sensibilidad: las
   frases exactas ante una persona antes de `--ack-legal-review`) →
   `journalist:archive` de la v1 → `journalist:export-soul` →
   `journalist:archive-sources`.
3. Puertas: `npx vitest run`, `typecheck`, `lint`, `check:json`, `check:citations`,
   `check:relations -- --soft`, `check:runs -- --soft`.
4. Commit sólo de las rutas propias, ≤5 biografías por tanda; verificación en vivo
   del JSON publicado (`/data/journalist-reports/<id>.json`), del join de `/cargos`
   y del índice de `/laboratorio/agentes`.

## El parte

Cada oleada termina imprimiendo los cuatro recuentos por separado (intentado /
hecho / nunca intentado / saltado con motivo) desde los `manifest.json`, y el
informe final es una tabla por persona: cotejo por desenlace, hallazgos nuevos,
acción tomada, qué se saltó y por qué. Un parte que no distingue «no encontré» de
«no busqué» no es un parte.
