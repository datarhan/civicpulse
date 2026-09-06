# Catálogo de fuentes para investigar a un cargo local

Matriz medida el 06-09-2026 desde este repositorio. Cada fila dice qué da la
fuente, por qué vía se llega, qué límite tiene hoy y cómo se cita. Cuando una vía
cambie (un portal que vuelve a responder, un medio que deja de bloquear), corrige
la fila y la fecha: una matriz de acceso rancia manda al lector a puertas cerradas.

Leyenda de vías:

- **sondeo** — `npm run journalist:sondeo -- --nombre "…" [--slug …] [--anios …] [--out …]`
  (una sola llamada cubre BOE, DOGV, Dialnet, hemeroteca, prensa local, plenos,
  snapshots, ficha y barrido nominal de contratación; deja manifiesto).
- **WebFetch / WebSearch** — las herramientas del agente; WebSearch acepta
  `allowed_domains`.
- **Chrome** — el navegador del usuario (herramientas `mcp__claude-in-chrome__*`):
  lo que bloquea al rastreador o exige JavaScript. Sólo en la sesión central, nunca
  en un subagente.
- **doc-fetch** — `npm run fetch-url-evidence -- <url>` (UA Mozilla, guarda SSRF).
- **local** — ficheros bajo `public/data/`, `.cache/`, `.research-cache/`.

## Nivel 1 — documentos oficiales (confianza alta)

| Fuente                                                 | Qué da                                                                                                                                           | Vía                                                                                                                                                                                                        | Límite hoy                                                                                                                                                                  | Cómo se cita                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Actas de pleno (ribarroja.es, PDF)                     | toma de posesión, adscripción a grupo, dedicaciones, comisiones, renuncias, intervenciones                                                       | doc-fetch o Chrome sobre `files/migrate/…` y `contenidos.downloadatt.action?id=…`; transcripciones en `public/data/pleno-transcripts/`                                                                     | el HTML de ribarroja.es responde «Acceso denegado» desde 2026-09-02; los PDF sí abren                                                                                       | `official-doc`, extracto literal ≤500                          |
| Declaración de bienes y actividades (Decreto 191/2010) | patrimonio, pasivo, actividades, empleador                                                                                                       | PDF consolidado 2023-2027 (URL en biografia-concejal §B) y BOP n.º 180 de 15-09-2023, anuncio 2023/12011                                                                                                   | sólo la de toma de posesión; las anuales no se publican                                                                                                                     | `official-doc`, `selfDeclared: true`                           |
| BOP València                                           | candidaturas (28/04/2015 n.º 79, 30/04/2019 n.º 82; 2007, 2011 y 2023 por localizar), declaraciones, nombramientos, edictos que nombran personas | `https://bop.dival.es/bop/downloads?boletinFecha=DD/MM/YYYY` (boletín entero); `npx tsx scripts/buscar-bop-historico.ts --desde --hasta --busca` (sin alias npm); búsqueda por palabra sólo en Chrome (JS) | la búsqueda es una app Java con sesión                                                                                                                                      | `official-doc`                                                 |
| BORME                                                  | cargos societarios (administrador, apoderado, consejero)                                                                                         | `npm run scrape:borme -- --desde 2009-01-02 --hasta <hoy> --provincia VALENCIA --persona "APELLIDO1 APELLIDO2"` → `.cache/borme/`                                                                          | no hay búsqueda libre: se barre por día; sólo el registro de la provincia; ~350 ms por sección, horas para el histórico — hazlo UNA vez para las 22 personas y grep después | `official-doc` al anuncio (`boe.es/diario_borme/txt.php?id=…`) |
| BOE                                                    | nombramientos de funcionarios, oposiciones, subvenciones, sentencias publicadas                                                                  | sondeo (`boe`); `https://www.boe.es/diario_boe/txt.php?id=BOE-A-…`                                                                                                                                         | un PDF > 10 MB no cabe en WebFetch: usa la versión txt.php                                                                                                                  | `boe`                                                          |
| DOGV                                                   | nombramientos de la Generalitat, oposiciones, cargos en consorcios                                                                               | sondeo (`dogv`); la interfaz web es un iframe (Chrome si hace falta)                                                                                                                                       | —                                                                                                                                                                           | `official-doc`                                                 |
| infoelectoral (Ministerio del Interior)                | candidaturas municipales 2007–2023 con puesto en lista                                                                                           | Chrome: Área de descargas → Municipales → convocatoria → zip → fichero de candidatos; filtra INE 46 214                                                                                                    | el xlsx de datos abiertos es sólo de resultados; la descarga es un formulario JS                                                                                            | `official-doc`                                                 |
| Retribuciones (ISPA, Hacienda)                         | sueldo anual del cargo con dedicación                                                                                                            | local `public/data/ispa.json`, `dedicaciones.json`                                                                                                                                                         | los sin dedicación cobran asistencias sin total publicado                                                                                                                   | `local-snapshot`                                               |
| Contratación (Gobierto/PLACSP)                         | adjudicatarios que coinciden con los apellidos                                                                                                   | sondeo (`contratacion`, palabra entera, dos apellidos)                                                                                                                                                     | un apellido suelto no identifica a nadie; la coincidencia es una PISTA, no una relación                                                                                     | `local-snapshot` con el barrido como extracto                  |
| BDNS                                                   | subvenciones a personas o empresas                                                                                                               | `public/data/bdns.json` sólo por descripción «riba-roja»; búsqueda por beneficiario en `infosubvenciones.es` (Chrome)                                                                                      | el adaptador no consulta por beneficiario                                                                                                                                   | `official-doc`                                                 |
| Consorcios, mancomunitat, Diputació                    | presidencias, vocalías, asesorías                                                                                                                | DOGV/BOP + webs institucionales (WebFetch)                                                                                                                                                                 | —                                                                                                                                                                           | `official-doc` o `web` según la fuente                         |

## Nivel 2 — prensa (confianza media)

| Medio                                                                                                | Vía                                                                         | Nota                                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Valencia Plaza, El Periódico de Aquí, Hortanoticias, TuComarca, InfoTúria, eldiario.es, À Punt, COPE | WebSearch con `allowed_domains`, WebFetch; `press.json` y sondeo (`prensa`) | alcanzables                                                                                       |
| Levante-EMV, Las Provincias, Europa Press, Cadena SER                                                | **sólo Chrome** — bloquean al rastreador de Anthropic                       | captura el extracto literal, la fecha y la URL; va como `capturedVia: "chrome"` en `fuentes.json` |
| Hemeroteca (La Vanguardia)                                                                           | sondeo (`hemeroteca-<año>`)                                                 | años electorales por defecto (2019, 2023)                                                         |

Un resultado de buscador sobre un documento-lista NO es una coincidencia hasta que
el nombre se ve en el texto: el 06-09-2026 BOE-A-2025-20600 salió para cuatro de
estos apellidos y no contenía ninguno.

**Un «vacío» del sondeo en `boe`, `dogv`, `dialnet` y `hemeroteca-*` no prueba
nada.** Medido el 06-09-2026: el sondeo del alcalde —que consta en el DOGV— devolvió
vacío en las cuatro; los lectores de `gazette.ts` devuelven `[]` también ante un fallo
de red o un estado no-200 (`catch { return [] }`), y el buscador del DOGV contesta hoy
un 302 sin cuerpo. Hasta que esos lectores devuelvan su estado, la evidencia de
boletines se busca por las vías directas de esta tabla (BOE `txt.php`, DOGV en Chrome,
BOP por fecha) y el manifiesto anota `blocked(lector sin estado)` para esas cuatro, no
`empty`. Las fuentes locales del sondeo (oficial, snapshots, prensa, plenos,
contratación) sí son fiables: leen ficheros del repositorio.

## Nivel 3 — autopublicado (confianza baja, `selfDeclared: true`)

| Fuente                                                                            | Vía                                                                                   | Regla                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CV del portal de transparencia                                                    | `.research-cache/`, los extractos de los borradores en `editorial/journalist-drafts/` | el HTML está denegado y Wayback no tiene copia; lo que no esté capturado no se puede recomprobar |
| LinkedIn (perfil público)                                                         | Chrome, lectura manual                                                                | se cita como autodeclarado; nunca se rastrea                                                     |
| Webs de partido, de empresa, cuentas públicas del cargo (`officials-social.json`) | WebFetch / Chrome                                                                     | sólo contenido en su papel público o sobre su actividad profesional; con fecha y copia           |

## Nivel 4 — agregadores (pista, nunca fuente)

Wikidata/Wikipedia, eInforma/Axesor/Empresia (resúmenes gratuitos de BORME),
cachés de buscador. Sirven para saber dónde mirar; se cita el documento al que
llevan, no el agregador.

## Archivo

Cada URL nueva que se cite se guarda con `npm run journalist:archive-sources`
(consulta primero si ya hay copia; Save Page Now sólo si no; 10 s entre guardados).
Wayback anónimo admite unas seis peticiones por minuto: el archivo se hace desde
la sesión central, nunca dentro del bucle de un subagente.

## Lo que un subagente NO puede hacer (medido en la prueba del 06-09-2026)

- **Leer el cuerpo de un PDF de ribarroja.es.** `fetch-url-evidence` devuelve el
  título y un fragmento acotado; WebFetch recibe ECONNRESET del WAF. El cuerpo entero
  se lee en la sesión central (Chrome) o lo lee el agente en la v2 (`pdf-fetch`). El
  dossier anota `blocked(cuerpo no legible desde subagente)` y deja la URL.
- **Consultar la caché del BORME.** `.cache/` no viaja entre worktrees: el barrido y la
  caché viven en el checkout principal, y los dossiers se ejecutan allí.
- **Usar Chrome.** Prensa bloqueada al rastreador, infoelectoral, LinkedIn y el buscador
  del BOP van a `blocked(sólo Chrome)` y a la pasada central.
- **Leer los PDF anuales de la Diputació de un tirón.** La página «Asesores» del portal
  de transparencia (`dival.es/es/portal-de-transparencia/content/asesores-0`) enlaza un
  PDF por ejercicio con nombre, puesto y gasto del personal eventual: es documento
  oficial y fue el que corrigió el rótulo autodeclarado de un cargo. Un PDF por
  llamada; el resto queda como laguna con la URL.
