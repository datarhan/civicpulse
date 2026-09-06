---
name: investigar-cargo
description: Úsalo cuando haya que investigar a un cargo electo o público de Riba-roja con todas las fuentes lícitas —no sólo lo que él publica— o cotejar una biografía ya publicada en /laboratorio/agentes afirmación por afirmación. Se dispara con «investiga a <concejal>», «comprueba su biografía», «datos reales sobre <cargo>», «dossier de <cargo>», y antes de re-ejecutar el agente periodista sobre alguien que ya tiene informe.
---

# Investigar a un cargo

## Resumen

Una biografía hecha sólo con lo que el cargo publica sobre sí mismo reproduce sus
omisiones: el CV del portavoz de la oposición no decía que dirigió la Policía Local
del pueblo ni que el alcalde al que fiscaliza lo destituyó. Esta habilidad busca en
lo que el cargo no controla, coteja lo publicado y entrega una propuesta. Tres
principios: **una coincidencia de nombre no es una identidad; una búsqueda sin
resultado es un dato; el dossier nunca se publica** — publica `correct-journalist-report`
o el agente (`biografia-concejal`), después.

## Cuándo usarlo / cuándo no

- Sí: dossier nuevo de un cargo; cotejo de una biografía publicada; material para una
  v2; un alta en la corporación sin ficha en el portal.
- No: redactar la biografía (eso es `biografia-concejal`), revisar un borrador antes de
  publicar (`revisar-borrador`), o cualquier cosa sobre una persona que no ejerce un
  cargo público.

## Patrón central

documento → nexo con el cargo → cotejo → propuesta. Cada hecho lleva su documento
(URL o ruta, fecha, extracto literal ≤500) y su nexo con el cargo; cada afirmación ya
publicada recibe uno de seis desenlaces; la propuesta son órdenes listas y un
`fuentes.json` para el agente, no prosa.

## Referencia rápida

| Necesito                                          | Orden                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| veda LOREG                                        | `npm run freeze:status`                                                                                                                                                         |
| todos los lectores del repo de una vez, con parte | `npm run journalist:sondeo -- --nombre "<nombre>" --slug <slug> --out editorial/investigaciones/<slug>/sondeo.json`                                                             |
| cargos societarios                                | `npm run scrape:borme -- --desde 2009-01-02 --hasta <hoy> --provincia VALENCIA --persona "APELLIDO1 APELLIDO2"` (barrido UNA vez por campaña; luego grep sobre `.cache/borme/`) |
| BOP por ventana                                   | `npm run buscar-bop-historico -- --desde --hasta --busca "<apellidos>"`                                                                                                         |
| un documento con UA correcto                      | `npm run fetch-url-evidence -- <url>`                                                                                                                                           |
| qué ya sabe el repo                               | `.research-cache/`, `editorial/journalist-drafts/<id>.draft.json`, `public/data/journalist-reports/<id>.json`                                                                   |
| copia en Wayback (sesión central)                 | `npm run journalist:archive-sources -- <assignmentId>`                                                                                                                          |
| cerrar un mandato / corregir una frase            | `npm run correct-journalist-report -- <reportId> --field … --new … --reason "…"`                                                                                                |
| v2 con lo hallado                                 | `npm run journalist:run -- <id> --seed editorial/investigaciones/<slug>/fuentes.json`                                                                                           |

Catálogo de fuentes y vías: `references/fuentes.md`. Límites: `references/limites.md`.

## Procedimiento

0. **Ficha e identidad.** Slug exacto de `officials.json` (nunca adivinado). Lee la
   biografía publicada y su borrador. Anota los homónimos que aparezcan y el segundo
   identificador que los descarta (municipio + cargo + fecha, partido, edad, foto).
1. **Lectores del repo.** `journalist:sondeo` con `--out`; BORME sobre la caché
   (`--persona`); declaración de bienes y actas (`biografia-concejal` §4). Lo que un
   lector no alcanza se anota como `blocked(<motivo>)`, no como vacío — y las cuatro
   fuentes de boletín del sondeo (`boe`, `dogv`, `dialnet`, `hemeroteca-*`) se anotan
   SIEMPRE así: sus lectores devuelven vacío también cuando fallan (`fuentes.md`).
2. **Lo que el cargo no controla.** Boletines (BOP, BOE, DOGV), candidaturas de todas
   las convocatorias desde 2007, prensa alcanzable por WebSearch/WebFetch y prensa
   sólo-Chrome (lista en `fuentes.md`), consorcios y Diputació, webs de partido,
   cuentas públicas del propio cargo. **Lee el documento, nunca el resumen del
   buscador**: el 06-09-2026 un resumen atribuyó a un artículo un cargo en la Diputació
   que el artículo no contenía.
3. **Cotejo** de cada afirmación publicada con uno de seis desenlaces
   (`references/cotejo.md`) → `cotejo.json`.
4. **Hallazgos por eje** (`references/dossier.md` §2), cada uno con documento, nexo,
   sensibilidad y «publicable sí/no y por qué». Familia y patrimonio: dos llaves
   (documento explícito + nexo con el cargo) o no entran en ninguna tabla. Una
   alegación de prensa se recoge como «según <medio>, <fecha>» y sube la sensibilidad
   a alta. Una inferencia nuestra (p. ej. por qué dejó el servicio activo antes de
   las elecciones) se marca «interpretación de este medio», con la norma citada.
5. **Lagunas**: cada búsqueda sin resultado con fuente, consulta literal y fecha.
6. **Propuesta**: correcciones como órdenes listas (`--reason` ≥20 caracteres, y es
   público); v2 sólo con ≥3 hechos publicables nuevos de fuentes independientes o un
   `contradice` que cambia la historia — brief NEUTRO (es público) + `fuentes.json`
   (semillas con `capturedVia`, extracto literal para las de Chrome; `trust` no se
   escribe). Lo débil va a «vigilancia», nunca a la página.
7. **Parte**: `manifest.json` con intentado / hecho / nunca intentado / saltado con
   motivo por fuente y los recuentos del cotejo. Modo lote: `references/campana.md`.

## Errores frecuentes

| Excusa                                      | Realidad                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| «El nombre coincide, será él»               | Sin segundo identificador es un homónimo. RAGA no es FRAGA; Salomé Pradas no es María José Pradas.        |
| «El buscador ya lo resume»                  | El resumen inventó un cargo el mismo día que se escribió esto. Se cita lo leído.                          |
| «No hay nada; no lo anoto»                  | Una búsqueda sin resultado es un dato: fuente, consulta, fecha.                                           |
| «Sólo lo cita un medio, pero es grave»      | Va como «según <medio>, <fecha>», sensibilidad alta, derecho de réplica. Nunca en presente ni como hecho. |
| «El BORME no cabe en el presupuesto»        | Se barre una vez por campaña y se consulta la caché.                                                      |
| «Lo pongo en public/ para verlo en la web»  | Todo bajo public/ se publica. El dossier vive en editorial/.                                              |
| «La nota de curaduría explica lo que quité» | La nota se pinta en la página. Describe el criterio, no el material.                                      |
| «Es un familiar, sale en el BORME»          | Dos apellidos no son un parentesco. Dos llaves o nada.                                                    |
| «Una candidatura es un cargo»               | Candidato ≠ cargo; personal eventual ≠ cargo; asesoría en otro órgano ≠ el cargo que la página describe.  |

## Lo que cazó el día que se escribió

Sobre el portavoz del PP, con la biografía publicada delante: jefatura de la Policía
Local 2011–2015 y destitución en 2015 (El Plural, fuente única) que el CV omite; una
investigación de Antifraude anunciada en campaña, sin resolución localizada; su
asesoría en la Diputació corroborada por prensa; la crisis del partido local de 2025;
y que la biografía seguía nombrando como portavoz suplente a una concejala que había
renunciado. Nada de lo publicado era falso; fallaba la selección de fuentes.
