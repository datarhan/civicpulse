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

## Entorno — del expediente a la persona

`npm run journalist:entorno -- --slug <slug> [--llaves editorial/investigaciones/<slug>/llaves.json]`
recorre en un solo paso lo que la regla de las dos llaves permite recorrer, y en
ese orden:

| Paso                       | Fuente                                                             | Qué da                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contrapartes            | `tenders.json` (adjudicatarios), `bdns.json`, `bop.json` (edictos) | quién ha cobrado o recibido algo del Ayuntamiento; el snapshot de la BDNS trae convocatorias, no beneficiarios (esos, sólo en la web) |
| 2. Cargos societarios      | caché anual del BORME (`.cache/borme/`, barrido central 2009→hoy)  | administradores, apoderados, consejeros, liquidadores de cada sociedad contraparte; nunca socios (el BORME no los publica)            |
| 3. Cruce                   | el cargo, `--llaves` (familiares documentados), sus dos apellidos  | tres niveles: **propio** (el cargo en una contraparte), **llave documentada**, **pista de apellidos** (obliga a buscar el documento)  |
| 4. Abstenciones con motivo | transcripciones de pleno (`pleno-transcripts/`)                    | candidatas a llave oficial («interés directo», «parentesco»): se confirman en el ACTA, la transcripción es automática                 |

Lo que sólo se cuenta y no se nombra: personas con un apellido, y personas con
los dos apellidos en sociedades que NO son contrapartes (el fichero da el número y
nada más). `--llaves` es un JSON escrito a mano —nombre, parentesco, documento con
título y fecha—: sin documento el CLI no lo carga. La salida va a
`editorial/investigaciones/<slug>/entorno.json` y el CLI se niega a escribir bajo
`public/`. Un fichero de la caché ausente es `failed`, no «sin sociedades».

Lo que este recorrido NO cubre, y el dossier lo dice: contratos menores (el portal
municipal los publica aparte; no están en `tenders.json`), beneficiarios de
subvenciones (BDNS en la web, por beneficiario), licencias y PAIs antiguos (BOP
histórico y actas de la Junta de Gobierno; `buscar-bop-historico --texto`), y toda
propiedad que no aparezca en un acto público.

## Nivel 2 — prensa (confianza media)

| Medio                                                                                                | Vía                                                                                                                                                                  | Nota                                                                                              |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Valencia Plaza, El Periódico de Aquí, Hortanoticias, TuComarca, InfoTúria, eldiario.es, À Punt, COPE | WebSearch con `allowed_domains`, WebFetch; `press.json` y sondeo (`prensa`)                                                                                          | alcanzables                                                                                       |
| Levante-EMV, Las Provincias, Europa Press, Cadena SER                                                | **sólo Chrome** — bloquean al rastreador de Anthropic; Las Provincias republica teletipos de Europa Press (16-09-2015: la destitución de cuatro mandos, sin nombres) | captura el extracto literal, la fecha y la URL; va como `capturedVia: "chrome"` en `fuentes.json` |
| Hemeroteca (La Vanguardia)                                                                           | sondeo (`hemeroteca-<año>`)                                                                                                                                          | años electorales por defecto (2019, 2023)                                                         |

Un resultado de buscador sobre un documento-lista NO es una coincidencia hasta que
el nombre se ve en el texto: el 06-09-2026 BOE-A-2025-20600 salió para cuatro de
estos apellidos y no contenía ninguno.

**Un «vacío» del sondeo en `boe`, `dogv`, `dialnet` y `hemeroteca-*` vale desde el
07-09-2026; un «fallo» no.** Antes los lectores de `gazette.ts` devolvían `[]` también
ante un fallo de red o un estado no-200, y el sondeo del alcalde —que consta en el
DOGV— salió «vacío» en las cuatro sin que ningún lector llegara al servidor. Ahora el
sondeo usa los lectores `leer*`, que lanzan: `fallo` trae el motivo (`HTTP 503`, `302 →
…`, `ECONNRESET`). El buscador del DOGV sigue contestando un 302 sin cuerpo: cuenta
como `fallo`, y la vía es Chrome. Un `fallo` se anota en el manifiesto como
`blocked(<motivo>)`, nunca como `empty`.

**BOP de València — cómo se busca de verdad (medido 06/07-09-2026).**

- `downloads?boletinFecha=DD/MM/YYYY` devuelve el boletín ENTERO para los años de
  la plataforma antigua (2011, 2015, 2019: 300 páginas) y sólo el SUMARIO para los
  recientes (26/02/2024: 380 líneas). `downloads?anuncioNumReg=2024/NNNNN` da un
  anuncio suelto cuando se conoce su registro.
- Chrome no carga `bop.dival.es` (página de error); el buscador es un formulario JSF
  que funciona por `curl`: `GET /bop/xhtml/portal.xhtml` con tarro de cookies, leer
  `javax.faces.ViewState`, y `POST` al mismo `portal.xhtml` con `Faces-Request:
partial/ajax`, `javax.faces.source=buscarBtn`, `javax.faces.partial.execute=@all`,
  `javax.faces.partial.render=messages boletines3 edictos`, `<form>=<form>`,
  `filtroCalendarioIni_input`/`filtroCalendarioFin_input` (DD/MM/YYYY), `buscador=<texto>`,
  `<sección>:field_input=8` (Municipis; vacío = todas) y, para texto completo,
  `<textoCompleto>_input=on`. **Los ids `j_idtNNN` cambian entre cargas de página** (el
  06-09 eran `j_idt131` / `j_idt175` / `j_idt200`; el 07-09 la primera carga dio `j_idt144`
  / `j_idt188` / `j_idt213` y la segunda otra vez 131/175/200): léelos en la carga cuyo
  `ViewState` y cookies vas a usar — el formulario está en el `onclick` del botón
  (`grep -o 'onclick="PrimeFaces.ab({s:&quot;buscarBtn[^"]*"'` → `f:"j_idtNNN"`) y los
  otros dos son la `SelectOneMenu` con `:field_input` y la casilla `_input` del mismo
  formulario. Con ids de otra carga el servidor NO busca y devuelve el boletín del día
  como si fuera el resultado (el 07-09-2026: 33 anuncios, todos de ese día): comprueba que
  las fechas de las filas varíen antes de creerte un «Mostrant del 1 al 25 de N». La
  respuesta es XML con la lista (`Núm. registre … Butlletí … Pàgina …`, 25 por página);
  para las páginas siguientes, `javax.faces.source=list`, `javax.faces.partial.event=page`,
  `list_pagination=true`, `list_first=25|50…`, `list_rows=25` y el formulario del datagrid;
  una búsqueda nueva tras paginar lleva `list_first=0` o vuelve vacía. El motor casa
  PALABRAS SUELTAS: «Gimeno Calvo» a texto completo dio 1.727 edictos de la Seguridad
  Social; un apellido raro sí sirve («Pamblanco» 2023–2026 → 58, de los que 10 del
  Ayuntamiento y 1 de la Junta Electoral de Zona de Llíria, que es la de Riba-roja); por
  título y sección también («Riba-roja policía» 2010–2016 → 8 edictos). Un anuncio suelto
  se descarga con `downloads?anuncioNumReg=AAAA/NNNNN` y se lee con `pdftotext -layout`.
- Los PDF de la plataforma antigua llevan a veces una fuente sin ToUnicode: los
  nombres salen con los glifos desplazados 29 posiciones («Don» → «'RQ», «GIMENO
  CALVO» → «\*,0(12&$/92») y un grep normal los pierde. `npx tsx
scripts/buscar-bop-historico.ts --desde … --hasta … --busca "APELLIDOS" --texto`
  busca en el texto entero tolerando el desplazamiento (`src/scraper/bop-glifos.ts`);
  sin `--texto` el script sale ROJO cuando leyó boletines y no supo extraer ningún
  anuncio, que es lo que pasa con esos sumarios. Un «no figura» sobre un boletín de
  ~2011 sin esa búsqueda no vale.

**Agencia Valenciana Antifraude (AVAF).** Publica TODAS sus resoluciones finales de
investigación por año (`antifraucv.es/resoluciones-de-investigacion-2022/`, `…-2023/`,
`…-2024/`, `…-2025/`; una página por año, sin paginación) y las memorias anuales
(PDF; §4.4.n con expediente, entidad y resultado). Lo que no publica son los archivos
sin resolución: que un municipio no aparezca no dice si hubo actuaciones previas. Los
PDF de resolución van censurados pero nombran a la entidad investigada.

**Diputació de València — personal eventual.** Además del PDF anual de RRHH (gasto
por persona y ejercicio), el portal publica un `.xlsx` del personal eventual en
activo con **decreto de nombramiento y anuncio en el BOP** por fila
(`dival.es/sites/default/files/portal-de-transparencia/2024 07 22 personal eventual PT
publicar.xlsx`, hoja «GRUPO POLITICO EVENTUALES»): es el documento que fija la fecha de
un nombramiento que el CV sólo autodeclara. Se lee con `xlsx` (dependencia del repo).

Las fuentes locales del sondeo (oficial, snapshots, prensa, plenos, contratación) leen
ficheros del repositorio y siempre han sido fiables.

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
