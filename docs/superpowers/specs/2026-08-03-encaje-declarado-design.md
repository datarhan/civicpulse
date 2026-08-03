# Encaje declarado — qué formación y experiencia trae quien dirige cada área

_Diseño · 2026-08-03_

## El problema

`/cargos` dice quién gobierna Riba-roja y qué áreas lleva cada quien. No dice qué
trae ninguno de ellos al puesto. Las biografías ya lo publican —formación y
trayectoria, con cita— pero el dato vive dentro de 21 páginas de informe que
nadie cruza.

## Lo que se descartó, y por qué

La petición original era un **perfil ideal por cargo** al estilo de recursos
humanos, más un **porcentaje de correlación** en cada tarjeta. Dos razones lo
descartan:

1. **Un concejal no es una contratación.** La ley española no exige titulación ni
   experiencia para el cargo; lo eligen los votantes. Un «63 % de encaje con el
   perfil ideal de Hacienda» califica a un cargo electo contra una rúbrica que
   inventó un modelo de lenguaje y que ninguna norma contiene. Es una opinión
   vestida de métrica, dirigida a una persona viva con nombre y apellidos, en un
   sitio cuyo contrato entero es que toda afirmación lleva cita.

2. **El estilo de la casa prohíbe el compuesto.** `press-analytics.ts` calcula un
   índice de confianza y deliberadamente nunca lo pinta; `AreaActivity` en
   `CargoDetalle.jsx` se niega a poner contenido de bloque bajo la fotografía de
   una persona. El patrón es: publica los componentes, niégate a la suma.

## Lo que se construye

Por cargo y por área, un conjunto pequeño de **hechos citados de tres valores**.
Sin número, sin ranking, sin suma.

El material es periodístico y cruza líneas dentro del propio partido de gobierno:
Pozuelo lleva Urbanismo como Arquitecto Técnico; Lara lleva Educación siendo
profesora de secundaria en activo; Ramos lleva Agricultura y Emergencia climática
tras una carrera en banca; Raga lleva Innovación y Planificación estratégica con
EGB y una prueba de acceso para mayores de 25 en su propio CV declarado.

### La unidad de juicio

Una fila por **(officialSlug × cadena literal de portfolio)** — 40 pares entre los
11 cargos con delegación. Cadena literal, no slug canónico, porque es lo que dice
el decreto de delegación de alcaldía, y porque `canonicalizeDepartment` tiene
colisiones conocidas (`Movilidad y Deportes` → `deportes`, `Juventud y Servicios
Jurídicos` → `servicios-generales`, `Áreas Industriales y Cementerio` → `null`).
Se enlaza a `/departamentos/:slug` sólo donde el slug resuelve; la fila existe
igual.

### El enum

```ts
export const FIT_VALUES = ['relacionada', 'sin-relacion-declarada', 'no-consta'] as const
```

| valor | significa |
| --- | --- |
| `relacionada` | la formación/trayectoria declarada guarda relación, con cita |
| `sin-relacion-declarada` | consta formación, y ninguna guarda relación con esta área |
| `no-consta` | no hay nada en las fuentes publicadas que juzgar |

`no consta` y `no relacionada` son hechos distintos. Colapsarlos es el modo de
fallo 3 de `DATA_INTEGRITY` («un centinela nunca es un valor»): Pla declara un
Grado Superior de Peluquería —eso consta, y no se relaciona con Fiestas— mientras
que Navarro no declara nada. Techo de respaldo, por la regla 1: `no-consta /
total < 0.1` sobre las filas publicadas.

### El gate

`decideAutomation` (`src/scraper/automation-policy.ts:192`) devuelve Tier C ante
`namesIndividual: true` **antes** de leer medición alguna. Ninguna precisión
desbloquea esta clase. Es una cola de curador permanente: no hay
`record-measurement`, ni umbral de muestra, ni cota de Wilson en el alcance.

### Tubería

```
scripts/suggest-area-fit.ts        LLM + CLI (único sitio donde se llama a un modelo)
  → src/scraper/area-fit.ts        puro: entrada, parseo, validación
  → editorial/area-fit-queue.json  GITIGNORADO — nunca bajo public/
  → /curator  →  scripts/promote-area-fit.ts
  → public/data/area-fit.json      curado, protegido por hook
  → src/hooks/useAreaFit.js        vía useSnapshot
```

`editorial/`, no `public/`: un juicio automático sobre si un concejal con nombre
está cualificado es exactamente la clase que dejó 24 borradores accesibles por
URL. `cargoPublicoPrevio` no necesita modelo — sale de `career-political`. Backend
`claude-code` explícito ($0, plan Max), nunca medido. Una fila cuyos `sourceIds`
no existan en el informe citado se rechaza, no se repara.

### Superficies

1. **Tarjeta de `/cargos`** — bloque «Encaje declarado» que **nombra las áreas** en
   vez de contarlas, para que no pueda formarse un cociente. Los 10 sin delegación
   reciben un estado explícito **«Sin delegación de área»**: sin él, `/cargos` se
   convierte en silencio en «el PSOE tiene credenciales, el resto está en blanco»,
   un artefacto con forma de partido de quién gobierna, no de quién está formado.
2. **`/cargos/:slug`** — matriz completa por área, con la nota del curador y cada
   pieza de evidencia enlazando a su fuente.
3. **«Qué exige la ley»** — `public/data/requisitos-cargo.json`, curado, una fila
   por rol con cita verbatim y URL del BOE: concejal y alcalde (mayoría de edad y
   censo, **ninguna titulación**) frente a secretario, interventor y tesorero
   (habilitación nacional: titulación universitaria y oposición). Este bloque es
   lo que hace publicable la fila del alcalde: sin él, «no declara formación
   relacionada» se lee como una descalificación; con él, se lee como el hecho que
   es, junto a la ley que no pide nada.
4. **Agregado en `/departamentos`** — una línea sin nombres, patrón de
   `press-analytics`, anclada en `check:drift`.
5. **Los enlaces al hueco** apuntan a la sección `gaps-detected` del informe, y
   sólo se pintan cuando `useBioReportRoutes()` resuelve el slug —
   `/laboratorio/agentes/:id` está tras `PERIODISTAS_ENABLED` y no existe en
   producción sin el flag.

### Guardas

`curated-paths.mjs` + `docs/DATA_SOURCES.md` (un test afirma que concuerdan) ·
`check:relations` (slug resuelve, portfolio ∈ `portfolios[]`, reportId resuelve,
sourceIds existen) · `check:citations` sobre las URL del BOE · `check:drift` sobre
la frase agregada · congelación LOREG oculta el bloque entero y detiene el
sugeridor · `/metodologia` y `/aviso-legal` se enmiendan en el mismo PR con un
«qué NO significa» explícito.

### Fuera de alcance

Ningún porcentaje de encaje, ningún texto de perfil ideal, ninguna ordenación por
esto, ningún agregado por persona, ninguna publicación automática a ninguna
precisión medida.
