# El dossier y sus tres ficheros

Todo vive en `editorial/investigaciones/<slug>/` (directorio ignorado por git;
nada de esto es público, y nada de esto se publica directamente: la publicación
pasa por `correct-journalist-report` o por `biografia-concejal`).

```
editorial/investigaciones/<slug>/
  dossier.md      lo que se encontró, con documento y nexo
  cotejo.json     una fila por afirmación publicada (references/cotejo.md)
  fuentes.json    las semillas para `journalist:run --seed` (formato abajo)
  manifest.json   qué se intentó, qué se hizo, qué se saltó y por qué
  capturas/       PDF, HTML o texto de lo que no se puede volver a descargar
```

## dossier.md

```markdown
# <Nombre completo> · <slug> · <assignmentId cotejado> (promovido <fecha>)

Estado: en curso | cotejado | propuesta lista · Investigador: <quién> · Fecha: <YYYY-MM-DD>

## 0. Ficha

slug, partido, cargo actual, áreas delegadas (officials.json), dedicación (dedicaciones.json),
competencias (competencias.json), homónimos detectados y cómo se descartaron (segundo identificador).

## 1. Fuentes consultadas

| Fuente | Vía | Resultado (hallado / vacío / bloqueado / no-intentado) | Consulta exacta | Fecha | Captura |

## 2. Hallazgos por eje

Cada hallazgo: hecho → documento (URL o ruta local, fecha, extracto ≤500 literal, copia Wayback) →
nexo con el cargo → sensibilidad (baja / media / alta) → publicable (sí / no y por qué).
2.1 Identidad y formación (lo autodeclarado, marcado como tal)
2.2 Trayectoria política (candidaturas 2007–2023 con puesto en lista, cargos, grupo, comisiones)
2.3 Actividad profesional y sociedades (declaración, BORME, colegios profesionales, BDNS)
2.4 Patrimonio y retribuciones por mandato
2.5 Contratación y conflictos (barrido nominal; contratos de sus áreas)
2.6 Cargos en entidades públicas (consorcios, mancomunitat, Diputació, partido)
2.7 Presencia pública, prensa y redes (con fecha; sólo en su papel público)
2.8 Vínculos familiares (SÓLO con documento explícito Y nexo con el cargo — references/limites.md)
2.9 Procedimientos que nombran al cargo (sólo documentos firmes; tokens judiciales ⇒ sensibilidad alta)

## 3. Cotejo

Resumen por desenlace (los recuentos salen de cotejo.json, no se escriben a mano) y las filas
`contradice` / `desactualizado` / `sin-fuente` con su documento.

## 4. Lagunas

Cada búsqueda sin resultado: fuente, consulta literal, fecha. Una búsqueda sin resultado es un dato.

## 5. Propuesta

5.1 Correcciones — como órdenes listas para ejecutar (una por frase, con --reason ≥20 chars).
5.2 Material para v2 — el brief NEUTRO (≥40 chars, sin alegaciones: es público) y fuentes.json.
5.3 Vigilancia — señales débiles que NO se publican (van a curatorNotes como VIGILANCIA, nunca a la página).

## 6. Riesgos

Tokens judiciales, homonimia residual, alegaciones de prensa, familia, menores.

## 7. Parte de ejecución

= manifest.json, en prosa breve.
```

## fuentes.json (semillas)

Lo lee `journalist:run --seed`. Una lista; cada fila:

```json
{
  "url": "https://valenciaplaza.com/el-policia-alberto-gimeno-sera-el-candidato-del-pp-a-la-alcaldia-de-riba-roja",
  "title": "El policía Alberto Gimeno será el candidato del PP a la alcaldía de Riba-roja",
  "publisher": "Valencia Plaza",
  "publishedAt": "2023-01-19",
  "capturedVia": "fetch",
  "excerpt": "…extracto literal ≤500…",
  "retrievedAt": "2026-09-06T10:00:00.000Z",
  "note": "sólo para la curaduría; nunca se copia a la cita"
}
```

- `capturedVia`: `fetch` (HTML alcanzable), `pdf`, `chrome` (bloqueado al rastreador:
  el extracto y `retrievedAt` son obligatorios).
- `trust` NO se acepta: sale de la tabla de dominios.
- Un extracto para una fuente `fetch`/`pdf` sólo se cita si es literal en el cuerpo
  descargado; si no, se cita el cuerpo y el run avisa.

## manifest.json

```json
{
  "slug": "laura-guzman-bruno",
  "assignmentId": "a-laura-guzman-bio",
  "startedAt": "2026-09-06T09:00:00.000Z",
  "finishedAt": "2026-09-06T11:20:00.000Z",
  "dossier": "done",
  "fuentes": {
    "actas": "found",
    "declaracion": "found",
    "bop": "empty",
    "borme": "found",
    "boe": "empty",
    "dogv": "empty",
    "infoelectoral": "found",
    "prensa-alcanzable": "empty",
    "prensa-chrome": "blocked(levante: muro de pago)",
    "linkedin": "never-attempted",
    "contratacion": "empty",
    "bdns": "never-attempted"
  },
  "cotejo": {
    "sostiene": 12,
    "se-parece": 1,
    "contradice": 0,
    "desactualizado": 0,
    "sin-fuente": 1,
    "no-comprobable": 1
  },
  "hallazgos": { "publicables": 3, "noPublicables": 1 },
  "propuesta": { "correcciones": 2, "v2": false },
  "v2": {
    "assigned": false,
    "run": false,
    "promoted": false,
    "v1Archived": false,
    "soul": false,
    "wayback": false
  },
  "verifiedLive": null
}
```

Valores de `dossier`: `attempted` (empezado, sin terminar), `done`, `skipped(<motivo>)`.
Valores por fuente: `found`, `empty`, `blocked(<motivo>)`, `never-attempted`. «Vacío»
y «nunca intentado» son cosas distintas y se escriben distinto.

Agregado de campaña (`editorial/investigaciones/_campana/manifest.json`), con jq:

```bash
jq -s '{
  personas: length,
  dossier: (map(.dossier) | group_by(.) | map({key: .[0], value: length}) | from_entries),
  cotejo: (map(.cotejo // {})
           | reduce .[] as $c ({}; reduce ($c | to_entries[]) as $e (.; .[$e.key] = ((.[$e.key] // 0) + $e.value)))),
  fuentes: (map(.fuentes // {} | to_entries[] | .value | sub("\\(.*$"; ""))
            | group_by(.) | map({key: .[0], value: length}) | from_entries),
  v2Promovidas: (map(select(.v2.promoted)) | length)
}' editorial/investigaciones/*/manifest.json
```
