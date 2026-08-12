# Medición de eficiencia — cuánto cuesta cada servicio y qué se obtiene

_Diseño · 2026-08-12_

## El problema

El sitio publica lo que el ayuntamiento **gasta** —presupuesto, ejecución,
contratos, obras— y lo que **dice** —promesas, votos, declaraciones. No publica
nada que relacione una cosa con la otra. Un vecino puede ver que la recogida de
residuos costó una cifra y no tiene forma de saber si eso es mucho, poco o
normal, ni si ha empeorado.

La literatura de gestión pública (Hatry, *Performance Measurement*; Pidd,
*Measuring the Performance of Public Services*) sostiene que el número por sí
solo no informa: informa **el ratio contra una unidad física** y **la
comparación**, contra uno mismo en el tiempo o contra pares. Sin denominador y
sin referencia, un euro publicado es decoración.

## La fuente que lo hace posible

España obliga a cada entidad local a calcular y remitir el **coste efectivo de
los servicios** (art. 116 ter LRSAL, criterios en la [Orden
HAP/2075/2014](https://www.boe.es/buscar/doc.php?id=BOE-A-2014-11492)), y
Hacienda lo publica. Dos tablas por entrega:

- **CE2** — coste por servicio (programa) desglosado por capítulo económico, más
  `CodGestion`: directa, concesión, mancomunada, convenio, mixta, o «no se
  presta».
- **CE3** — **unidades físicas por servicio**: toneladas de residuos, puntos de
  luz, metros lineales de red, m² con servicio de limpieza, licencias
  concedidas, efectivos adscritos.

CE3 es el denominador que al proyecto le faltaba, y es de declaración
obligatoria, no de cortesía.

Accesos:

| Vía | URL | Cubre |
| --- | --- | --- |
| Volcado nacional | `https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx` | 2021, todos los entes, una sola petición |
| Consulta | `https://serviciostelematicosext.hacienda.gob.es/sgcief/Cesel/Consulta/Consulta.aspx` | entregas **2014–2024**, cascada provincia → tipo de ente → ente, ASP.NET con `__VIEWSTATE` |
| Mapa | `.../Cesel/Consulta/mapa/ConsultaMapa.aspx` | sin verificar; posible payload provincial en una petición |
| Nota metodológica | `/cdi/presupuestos/informacioneell/costes_efectivos-nota_metodológica_20181201.pdf` | definición de cada magnitud |

Reutilización amparada por la Ley 37/2007 / RD 1495/2011; el conjunto está
catalogado en datos.gob.es. Encaja en «Ética de la recogida» sin excepción.

## Evidencia (medida 2026-08-12)

Las cifras de esta sección son **una medición fechada**, no una constante del
proyecto: quedan aquí porque justifican decisiones de diseño y porque cada
trampa de más abajo se descubrió en datos reales. No se repiten en el resto del
documento ni deben copiarse a ninguna superficie — el snapshot lleva su bloque
`stats`, y la regla de la casa es que ninguna cifra viva en un `.md`.

Riba-roja de Túria, ente `17-46-214-AA-000`, entrega 2021:

- `a1621` recogida de residuos — €801.040 contra 11.059,41 t declaradas ⇒
  **€72,43/t**, gestión directa.
- `a163` limpieza viaria — €674.767 contra 700.000 m².
- `a171/170P` parques y jardines — €718.016 contra 740.046 m².
- `a4411/440P` transporte urbano — €485.976 con `Nº total de viajeros al año = 0`.
- `a160` y `a161` (alcantarillado, agua potable) — **coste €0**, `CodGestion` =
  concesión a riesgo y ventura, con red declarada.

De snapshots ya versionados: licitador único en el 47,5 % de los contratos con
adjudicación (`awarded` ∪ `formalized`), 35 % adjudicado sin publicidad abierta,
modificaciones presupuestarias del 65,2 % sobre el crédito inicial, ejecución del
30,4 %, y capítulo 6 con crédito inicial cero, €22,06M incorporados por
modificación y un 4,7 % ejecutado.

## Lo que se descartó, y por qué

**Un índice compuesto de eficiencia.** Un 0–100 en cabecera es legible y es
indefendible: la ponderación pasa a ser la noticia, e invita a la tabla
comparativa de ayuntamientos vecinos que después habría que sostener. Es
exactamente lo que se rechazó en `encaje declarado` («publica los componentes,
niégate a la suma»). Se publica un **panel de indicadores**, cada uno con su
percentil, su serie, su fuente y sus salvedades. Sin puntuación global y sin
puntuación por dimensión.

**DEA ahora.** El análisis envolvente de datos es la técnica canónica para
eficiencia relativa multi-input/multi-output, y con CESEL es viable. Se aplaza:
requiere solver LP, selección de variables defendible y bootstrap para intervalos
honestos, y con ~50 pares produce artefactos de frontera que parecen hallazgos y
no lo son. Nada del diseño lo bloquea; entra en `/laboratorio` cuando el panel
CESEL esté cargado y se sepa cómo de sucios están los pares. Fase 4.

**«Citizen Trust Score».** La cuarta dimensión propuesta —satisfacción
ciudadana— no tiene fuente defendible aquí. No hay encuesta municipal
representativa; el ayuntamiento publicó un *Barómetro de Servicios Públicos
1T-2026* pero `participa.ribarroja.es` está retirado (ya registrado en
`participa.json.upstream`), y el corpus de quejas es autoseleccionado: un
porcentaje de satisfacción derivado de él sería justo el tipo de número que las
reglas del proyecto existen para impedir. Su lugar lo ocupa la dimensión que sí
se puede medir y que ya está scrapeada: **fricción institucional**
(X-ineficiencia de Leibenstein) — falta de competencia, rigidez procedimental,
control interno débil.

**Comparar entre modos de gestión.** Ver trampa 1.

## Las cinco trampas de la fuente

Cada una apareció en filas reales de Riba-roja y cada una mapea a una regla ya
escrita en `docs/DATA_INTEGRITY.md`. Son la columna vertebral del diseño, no una
lista de comprobación.

| # | Trampa | Regla |
| --- | --- | --- |
| 1 | **La concesión declara €0.** Agua y alcantarillado cuestan cero al ayuntamiento porque el concesionario los soporta y los recupera vía tarifa. El denominador sí está. Dividir produce «Riba-roja suministra agua gratis, el más eficiente de la comarca». El dinero existe: es el contrato de concesión que ya está en `tenders.json`. | Un centinela nunca es un valor |
| 2 | **El cero significa «no lo declaré».** Transporte urbano tiene coste y `viajeros = 0`. Coste por viajero sería infinito. | Un centinela nunca es un valor |
| 3 | **Un servicio tiene varias filas.** `a1721/170P` aparece dos veces con costes distintos y atributos contradictorios (`plantilla` = 0 y = 16; superficie del núcleo urbano = 1,43 km² y = 12,89). El primero que encuentre un `find()` gana. | Exporta el enum |
| 4 | **No todo atributo de CE3 es una cantidad.** `a1621` trae contenedores, toneladas, km de recorrido y `Periodicidad (1-DI, 2-AL, 3-SE…) = 5`, que es un **código**. Elegir denominador automáticamente puede dividir el coste anual entre 5. | Una pasada debe demostrar que trabajó |
| 5 | **El tonelaje es demanda, no logro.** `Producción anual residuos urbanos` mide cuánta basura genera el municipio. Más no es peor gestión, y no dice nada del reciclaje. | Entradas ≠ productos ≠ resultados |

Consecuencias forzadas:

- **Celdas de tres estados, nunca colapsadas**: cada `(servicio, año, magnitud)`
  resuelve a `declarado` / `no-declarado` / `no-se-presta` (este último leído de
  `CodGestion`). Ninguna tarjeta pinta un número derivado de una celda que no sea
  `declarado`.
- **Comparación sólo dentro del mismo modo de gestión.** Los pares se filtran por
  modo antes de calcular ningún percentil. Una tarjeta en concesión muestra el
  modo y enlaza el contrato; no muestra coste.
- **El denominador se cura, no se descubre.** Un registro versionado mapea
  servicio → atributo elegido → unidad → etiqueta → salvedades.
- **Cada indicador lleva su escalón** `input` / `carga` / `output` / `outcome`, y
  la tarjeta dice dónde se corta la cadena.

## El modelo del indicador

Un indicador es un registro con procedencia, no un número. Es lo que permite
citar la aritmética igual que el resto del sitio cita documentos.

```ts
export type Tier        = 'input' | 'carga' | 'output' | 'outcome'
export type Dimension   = 'operativa' | 'respuesta' | 'fiscal' | 'friccion'
export type EstadoCelda = 'declarado' | 'no-declarado' | 'no-se-presta'
export type ModoGestion =
  | 'directa' | 'concesion' | 'mancomunada' | 'convenio' | 'mixta' | 'otra'

export interface Magnitud {
  valor: number | null
  estado: EstadoCelda
  /** 'cesel:2021:CE3:a1621:Producción anual residuos urbanos: toneladas' */
  fuente: string
}

export interface Indicador {
  id: string
  dimension: Dimension
  tier: Tier
  servicio: string | null          // null = indicador municipal, sin servicio
  etiqueta: string
  numerador: Magnitud
  denominador: Magnitud
  valor: number | null             // null salvo que ambas celdas sean 'declarado'
  unidad: string
  modoGestion: ModoGestion
  comparable: boolean
  pares: null | {
    conjunto: string
    n: number
    modoGestion: ModoGestion
    percentil: number
    p25: number; mediana: number; p75: number
    miembros: { ine: string; nombre: string; poblacion: number; valor: number }[]
  }
  serie: { anio: number; valor: number | null; estado: EstadoCelda }[]
  caveats: string[]
  citas: { url: string; entrega: number; recuperadoEl: string }[]
}
```

### Invariantes

Cada una es una prueba, no un comentario.

1. `valor !== null` ⟹ `numerador.estado === 'declarado' && denominador.estado === 'declarado'`. Mata las trampas 1 y 2.
2. `pares !== null` ⟹ `pares.modoGestion === modoGestion` **y** `pares.n >= 15`. Nunca comparación entre modos; nunca percentil de un conjunto delgado.
3. `comparable === false` ⟹ ningún componente pinta percentil.
4. Todo `Magnitud.fuente` resuelve a una celda real del snapshot, comprobado por `check:indicadores`. Es `check:citations` aplicado a la aritmética.
5. Una entrada de `serie` que no sea `declarado` lleva `valor: null` y **la línea del sparkline se corta**. Interpolar un hueco es inventar dato.

### El registro de servicios

`src/scraper/indicador-registry.ts`, **exportado** y consumido por sus pruebas
—nunca restatuido en un test, que es el modo de fallo 1 de `DATA_INTEGRITY`.
Alrededor de 25 entradas; la elección manual del denominador es obligatoria por
la trampa 4.

```ts
export const SERVICIOS = {
  a1621: {
    label: 'Recogida de residuos',
    denominador: 'Producción anual residuos urbanos: toneladas',
    unidad: 't',
    tier: 'carga',
    caveats: ['La tonelada mide cuánta basura genera el municipio, no el resultado del servicio.'],
  },
  a161: {
    label: 'Abastecimiento domiciliario de agua potable',
    denominador: 'Longitud de la red: metros lineales',
    unidad: 'm',
    tier: 'output',
    caveats: ['En Riba-roja el servicio es concesión: el coste no lo soporta el ayuntamiento.'],
  },
  // …
} as const
```

Techo de respaldo por la regla 1: `modoGestion === 'otra' / total < 0.1` sobre
las filas publicadas.

## Tubería

```
scripts/scrape-coste-efectivo.ts → src/scraper/coste-efectivo.ts → public/data/coste-efectivo.json
scripts/scrape-pmp.ts            → src/scraper/pmp.ts            → public/data/pmp.json
scripts/compute-indicadores.ts   → src/scraper/indicadores.ts    → public/data/indicadores.json
                                                                 → src/hooks/useIndicadores.js
```

**`coste-efectivo.ts`** normaliza las dos formas de entrada —hoja del volcado
nacional y tabla HTML de la consulta— a una única `CesteRow`. Puro, sin red. Los
`fetch` viven sólo en el script, como en el resto del repo.

**El problema de los 45 MB.** El volcado nacional no se commitea ni se sirve. La
reducción ocurre en ingesta, siguiendo el precedente de `/departamentos` (una
tabla cruzada pequeña en vez del corpus):

- `coste-efectivo.json` guarda **sólo las filas de Riba-roja**, todas las
  entregas.
- El universo de pares colapsa a una **tabla de distribución**: por
  `(servicio, año, modoGestión, unidad)` → `{ n, p10, p25, mediana, p75, p90 }`,
  más el listado de miembros con su valor.
- Los volcados crudos se cachean en un directorio gitignorado mientras se itera.

**Los pares se nombran.** Los valores son dato público oficial y ocultar contra
qué municipios se compara rompería el contrato de mostrar el trabajo. La tarjeta
pinta banda intercuartílica y marcador propio; el desglose «ver los municipios
comparados» lista nombre, población, modo de gestión y valor. Nunca ordenado como
ranking, que es la tabla de clasificación por otro nombre.

**El conjunto de pares se commitea**, no se recalcula: un conjunto que cambia en
silencio mueve todos los indicadores sin diff que revisar.

```ts
{ id: 'cv-15k-40k',
  criterios: { ccaa: 17, popMin: 15000, popMax: 40000, tipoEnte: 'AA' },
  resolvedAt: '…',
  miembros: [{ ine, nombre, poblacion }, …] }
```

Dependencia pequeña que esto crea: CESEL no trae población, así que dimensionar
el grupo necesita padrón INE de todos los municipios de la Comunitat. El
adaptador de padrón ya descarga la tabla INE 2903 y descarta todo lo que no sea
Riba-roja; retener las filas de la Comunitat es el camino barato.

**`indicadores.ts`** es puro y es donde viven las reglas de honestidad: tres
estados, filtrado por modo de gestión, registro de denominadores, etiquetado de
escalón. Consume `coste-efectivo`, la tabla de pares, `budget-execution`,
`tenders`, `sindicatura`, `pmp` y `padron`. Sin red, enteramente testeable contra
fixtures.

**La dimensión de fricción no necesita adaptadores nuevos**: licitador único,
cuota sin publicidad abierta y plazo de adjudicación salen de `tenders.json`;
modificaciones y ejecución de `budget-execution.json`; banderas de control
interno de `sindicatura.json`; plantilla por 1.000 hab de `plantilla.json` +
`padron.json`, mostrando su `asOf` porque el dato está viejo. El único adaptador
nuevo de esa mitad es **PMP**.

**Entrega al cliente**: `useIndicadores` sobre `useSnapshot`, como todo lo demás.
`indicadores.json` debe quedar holgadamente por debajo del tamaño en que un
snapshot pasa a necesitar troceo.

Ambos adaptadores emiten manifiesto de pasada para `check:runs` —intentado /
hecho / nunca intentado / omitido con motivo, separados.

### La cala previa

La serie propia 2014–2024 son once peticiones. La serie **de pares** serían del
orden de cincuenta municipios por diez entregas a través de una sesión con
`__VIEWSTATE`, que es otro orden de cortesía. `ConsultaMapa.aspx` podría devolver
la provincia entera en una petición; no está verificado.

Regla de decisión, sea cual sea el resultado: **la fase 1 publica comparación de
pares sólo de 2021** (gratis, del volcado) **más la serie propia completa**. Si
el mapa sirve payload provincial, las series de pares se rellenan barato en fase
2; si no, quedan como hueco documentado y no como quinientas peticiones contra un
ministerio.

## Superficies

Ruta `/eficiencia`, dentro de `InnerShell`. Entrada en `src/nav.js` y glifo en
`SectionGlyph.jsx`, para que `Sidebar` y `LeftRail` no puedan divergir.

1. **Cabecera** — la pregunta, no una nota: «¿Cuánto cuesta cada servicio y qué
   se obtiene a cambio?», con una línea sobre qué es y qué no es la página.
2. **Franja de cobertura**, obligatoria, sobre el precedente de
   `MoneyCoverage.jsx` y leída del bloque `universe` del propio snapshot: cuántos
   servicios tienen coste y unidad declarados, cuántos están en concesión y
   cuántos sin unidad. Una capa que muestra una fracción de su dominio lo dice.
3. **Tarjetas por servicio**, ordenadas por euro: insignia de modo de gestión ·
   coste efectivo · unidad física con su escalón · **coste unitario** grande y
   `.mono` · sparkline 2014–2024 con la línea cortada en los huecos · banda
   intercuartílica con marcador propio *sólo si* `comparable` · salvedades ·
   enlace a la entrega · desplegable con los municipios comparados.
4. **Panel de indicadores municipales** — los que no pertenecen a ningún
   servicio: PMP contra el límite legal, ejecución, modificaciones, licitador
   único, cuota sin publicidad, concentración de proveedores, art. 218.
5. **Panel de bloqueados** — cada servicio cuyo coste unitario no se puede
   calcular, y por qué. Visible, no escondido: que el ayuntamiento no declare
   viajeros de autobús es un hallazgo sobre su propia rendición de cuentas.
6. Enlace a la sección nueva de `/metodologia`.

Estilo: variables CSS e inline styles como el resto, `.mono` en toda cifra, tonos
vía `Pill` / `Delta`. Lo responsive va en hoja real o bloque `<style>`, nunca en
el `style` del JSX. Dos primitivas nuevas en `Charts.jsx`: sparkline con huecos y
banda intercuartílica.

Accesibilidad: el marcador de la banda no puede codificar posición sólo por
color; su valor va en el DOM como texto, o la pasada axe estricta lo caza.

i18n: las etiquetas de servicio vienen del ministerio en castellano y por la
regla de la casa son **dato**, no cromo — no se traducen. Sólo se traduce el
cromo de la tarjeta.

## Hallazgos y guardas

`compute-indicadores` emite **candidatos de desviación**; un paso de curación
aparte redacta. Un candidato sólo existe si `comparable === true`, ambas celdas
son `declarado`, y la desviación supera un umbral versionado (fuera de p10/p90, o
movimiento interanual por encima de un límite versionado). Que el denominador sea
cantidad y no código lo garantiza el registro.

De ahí en adelante reutiliza la maquinaria existente:

- El borrador lleva `requiresHumanApproval: true` y el esquema publicado rechaza
  ese campo — dos capas independientes.
- Los borradores viven en `editorial/` (gitignorado), nunca bajo `public/`.
  «No renderizado» no es «no publicado».
- La promoción pasa por CLI con validador delante, de modo que
  `guard-curated-writes.mjs` y el historial de git siguen siendo la autoridad.
- La congelación LOREG lo detiene como a todo lo demás.
- Derecho de réplica cableado igual que promesas, hallazgos y quejas: formulario
  de issue → workflow de ingesta → CLI → commit.

Por la escalera de automatización medida, esto es **Tier C** —gasto municipal
bajo un alcalde con nombre— así que promueve una persona, siempre. Sólo puede
bajar de tier cuando la escalera registre precisión medida para este tipo de
candidato; los umbrales viven en la escalera, no en este documento, para que no
se dupliquen ni deriven. Lo no medido queda cerrado por defecto.

Disciplina del texto: el borrador dice el ratio, la distribución, el modo de
gestión y la n. **No dice «ineficiente».** El juicio es del curador.

## Pruebas

- Fixtures RED: un recorte real del volcado 2021 y una respuesta guardada de la
  consulta. Dos formas de entrada, un contrato.
- Enums exportados de `coste-efectivo.ts` y `indicador-registry.ts` e
  **importados** por las pruebas, jamás reescritos, más el techo de respaldo.
- **Guardas anti-huecas**, por las dos suites que estaban verdes sin medir nada:
  toda aserción de «no hay desviaciones» va emparejada con
  `expect(candidatosEvaluados).toBeGreaterThan(0)`, y toda aserción sobre pares
  con `expect(pares.n).toBeGreaterThanOrEqual(15)`.
- **La prueba más importante de la suite**: el reproductor de concesión. Un
  fixture donde el municipio declara €0 bajo concesión debe dar
  `comparable: false` y cero candidatos — nunca «el más barato del grupo».
- Reproductor de la trampa 3: filas duplicadas de un mismo servicio no pueden
  resolverse por «gana el primero».
- Reproductor de la trampa 4: un atributo de tipo código nunca puede quedar
  elegido como denominador.
- `check:indicadores` recorre todo `Magnitud.fuente` y comprueba que resuelve.
- Spec e2e de la ruta y pasada axe estricta.

## Fases

Tres commits por adaptador, cadencia RED → GREEN → cableado.

| Fase | Contenido |
| --- | --- |
| **1** | Adaptador CESEL · panel de pares 2021 · serie propia 2014–2024 · `/eficiencia` con tarjetas, cobertura y bloqueados. Sin hallazgos. |
| **2** | Panel de fricción (cero adaptadores nuevos) · adaptador PMP · comparación por habitante vía CONPREL, que ya es nacional. |
| **3** | Candidatos → cola del curator → CLI de promoción → `/hallazgos`, con `/metodologia` y `/aviso-legal` en el mismo PR. |
| **4** *(opcional)* | DEA en `/laboratorio`, con divulgación completa de especificación. |

## Fuera de alcance

- **Encuesta propia de satisfacción ciudadana.** Marco muestral, ponderación,
  sesgo de no respuesta y RGPD la convierten en otro proyecto. Si el ayuntamiento
  vuelve a publicar su barómetro, se ingesta como fuente.
- **Resultados (`outcome`) más allá de los ya scrapeados.** Paro está; reciclaje,
  criminalidad y calidad del aire no. El escalón `outcome` existe en el modelo
  desde el principio para que la ausencia sea visible en vez de disimulada.
- **Deuda viva y otros agregados MINHAC.** Adaptadores baratos, pero no
  necesarios para que el panel signifique algo.
- **Indicadores por concejalía.** Colgar coste por unidad de un cargo con nombre
  es materialmente distinto de colgarlo de un servicio; si se hace, se hace con
  el mismo cuidado que `/departamentos`, y no en esta entrega.
