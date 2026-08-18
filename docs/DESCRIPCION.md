# CivicPulse — descripción canónica del proyecto

_Fuente única de cómo se describe el proyecto. Cualquier superficie de la lista
de §Superficies derivadas se reescribe **desde aquí** cuando esto cambia —
primero se edita este fichero, luego se propaga. Decidido por el operador el
2026-08-17: la identidad es la **herramienta ciudadana de control municipal, a
escala de España**; el periodismo local va segundo — sustancial, nunca una nota
al pie._

## Identidad y orden

**Qué es:** una herramienta ciudadana para controlar tu ayuntamiento, pensada
para cualquier municipio de España. **Qué no es (en primer término):** un medio
local. El periodismo viene después de la medición y se apoya en ella.

Orden fijo de toda descripción, larga o corta:

1. **medir** — qué hace el ayuntamiento y cuánto cuesta
2. **comparar** — caro o barato frente a municipios de su tamaño (eficiencia)
3. **seguir** — promesas, plenos, contratos, quejas
4. **investigar** — periodismo a fondo sobre esa base de datos
5. **escalar** — Riba-roja de Túria es _el primer municipio_, la prueba de
   profundidad; el sujeto del proyecto es España (~8.100 municipios por código
   INE)
6. **cierre** — decidir con hechos, no con discursos electorales (mayo 2027)

## Textos canónicos

### One-liner ES

> CivicPulse mide lo que hace tu ayuntamiento y cuánto cuesta — con una fuente
> para cada cifra.

### One-liner EN

> CivicPulse measures what your town hall does and what it costs — with a
> citation for every figure.

### Lema secundario (campaña)

> Decide con hechos, no con discursos electorales.

### Bloque corto ES (~160 palabras)

> CivicPulse es una herramienta ciudadana para controlar tu ayuntamiento,
> pensada para cualquier municipio de España. Mide lo que hace y cuánto cuesta:
> qué paga el pueblo por cada servicio y si es caro o barato frente a
> municipios de su tamaño, con los datos del propio ministerio; qué se prometió
> en campaña y qué se cumplió, con la cita literal; qué se vota en cada pleno;
> a qué empresas va cada contrato; y las quejas vecinales con su reloj legal.
> Sobre esos datos hace periodismo local: investigaciones a fondo de lo que
> importa. Funciona ya, de principio a fin, en su primer municipio — Riba-roja
> de Túria —, donde ha seguido el dinero de la reconstrucción tras la DANA
> contrato a contrato y ha reconstruido la adjudicación del contrato de las
> basuras. Las fuentes nacionales cubren los ~8.100 municipios españoles; el
> objetivo es toda España, empezando por la provincia de València antes de las
> municipales de mayo de 2027. Todo abierto — código, datos y método — con
> derecho de réplica. Para que antes de volver a votar puedas decidir con
> hechos, no con discursos electorales.

### Bloque largo ES (~250 palabras)

> CivicPulse es una herramienta ciudadana para controlar tu ayuntamiento,
> pensada para cualquier municipio de España.
>
> **Mide.** Qué paga el pueblo por cada servicio — la recogida de residuos, la
> pavimentación de sus calles — y si es caro o barato frente a municipios de su
> tamaño, usando los datos que el propio Ministerio de Hacienda publica; en
> cuántos días paga el ayuntamiento a sus proveedores; y cuánto del presupuesto
> aprobado se ejecuta de verdad.
>
> **Sigue.** Las promesas electorales, con la cita literal y su fuente, y qué se
> cumplió; lo que se vota en cada pleno, transcrito; a qué empresas va cada
> contrato público — situado en el mapa cuando el propio contrato nombra el
> lugar —; y las quejas vecinales, con el reloj legal que obliga al
> ayuntamiento a responder.
>
> **Investiga.** Sobre esos datos hace periodismo local. En su primer municipio
> — Riba-roja de Túria — lleva cuatro investigaciones publicadas: ha seguido el
> dinero de la reconstrucción tras la DANA contrato a contrato y ha
> reconstruido la adjudicación del contrato de las basuras, entre otras. Cada
> afirmación publicada lleva su cita, y quien es nombrado tiene derecho de
> réplica.
>
> **Escala.** Las fuentes nacionales cubren los ~8.100 municipios españoles por
> código INE: replicar la capa de datos es ingeniería, no investigación. El
> objetivo es toda España — la comarca del Camp de Túria primero, la provincia
> de València antes de las municipales de mayo de 2027.
>
> Todo abierto: código (AGPL), datos y metodología. Sin publicidad, sin capital
> riesgo y sin dinero de ningún organismo vigilado. Para que antes de volver a
> votar puedas decidir con hechos, no con discursos electorales.

### Short block EN (~115 words)

> CivicPulse is a citizen tool for holding your town hall to account, built for
> any Spanish municipality. It measures what the council does and what it
> costs — the price of each service against similar-sized towns, using the
> ministry's own data; how long the council takes to pay its suppliers; how
> much of the approved budget is actually executed — and follows electoral
> promises with verbatim quotes, council votes, public contracts, and citizen
> complaints with statutory clocks. On that base it does local journalism: deep
> investigations, fully cited, with a built-in right of reply. It already runs
> end to end in its first municipality, Riba-roja de Túria. National open
> sources cover all ~8,100 Spanish municipalities; the goal is all of Spain
> before the May 2027 local elections — so voters can decide from facts, not
> campaign speeches.

## Registro de afirmaciones

Cada frase de los bloques, y qué la sostiene. Si una fila deja de ser cierta,
la frase sale de los textos **antes** de que la copia se envíe a nadie.

| La frase                                                                                      | Qué la sostiene                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «qué paga el pueblo por cada servicio y si es caro o barato frente a municipios de su tamaño» | `/eficiencia` — coste efectivo (MinHac). La comparación es la división del propio ministerio; los pares se nombran allí porque la cifra es suya, no nuestra. |
| «con los datos del propio ministerio»                                                         | Entregas de coste efectivo + CONPREL (MinHac).                                                                                                               |
| «la recogida de residuos, la pavimentación de sus calles»                                     | Servicios reales del panel (`coste-efectivo.json`; reportaje «La mitad de abajo de la división»).                                                            |
| «en cuántos días paga a sus proveedores»                                                      | `/gestion` — serie PMP; ficha de hallazgo firmada.                                                                                                           |
| «cuánto del presupuesto aprobado se ejecuta»                                                  | `/gestion` — ejecución presupuestaria (liquidaciones).                                                                                                       |
| «qué se prometió y qué se cumplió, con la cita literal»                                       | `/promesas` — los estados fuertes no publican sin cita fechada con URL (`V1_STATUSES`).                                                                      |
| «qué se vota en cada pleno»                                                                   | `/plenos` + `/hallazgos` — votos curados, hallazgos verificados.                                                                                             |
| «a qué empresas va cada contrato»                                                             | `/presupuesto` + mapa de la portada.                                                                                                                         |
| «situado en el mapa cuando el propio contrato nombra el lugar»                                | `place-resolver` (cuatro puertas, infra-empareja a propósito); `MoneyCoverage` declara la fracción cubierta.                                                 |
| «las quejas vecinales con su reloj legal»                                                     | `/quejas` — plazos LPACAP + escalado al Síndic.                                                                                                              |
| «cuatro investigaciones publicadas»                                                           | `/reportajes` — reconstrucción DANA, basuras, coste efectivo, inteligencia turística (todas `estado: publicado`).                                            |
| «ha seguido el dinero de la reconstrucción tras la DANA contrato a contrato»                  | `/reportajes/reconstruccion-dana` (publicado; réplica solicitada, sin respuesta en plazo).                                                                   |
| «ha reconstruido la adjudicación del contrato de las basuras»                                 | Reportaje basuras (publicado 16-08-2026; **réplica formal pendiente** — mantener el verbo descriptivo, no «destapar»).                                       |
| «todo abierto — código, datos y método»                                                       | AGPL-3.0 + `/datos` + `/metodologia`.                                                                                                                        |
| «derecho de réplica»                                                                          | Flujo extremo a extremo: issue → CLI con validador → commit.                                                                                                 |
| «los ~8.100 municipios por código INE»                                                        | CONPREL, PLACSP, BDNS, INE, SEPE y boletines indexan por municipio a escala estatal.                                                                         |

## Reglas de registro

- **Nunca «auditoría» / «auditor» en copia pública.** Es un término regulado y
  la Sindicatura de Comptes es el órgano real — nuestro argumento es
  precisamente que el tramo municipal queda sin fiscalizar. Verbos permitidos:
  _mide, compara, sigue, vigila_.
- **Nunca «puntuamos / clasificamos / rankeamos municipios».** La frontera DEA
  publica el método, jamás una clasificación, y nunca nombra a otro municipio.
  Los únicos pares con nombre son los del coste efectivo, porque esa división
  la publica el ministerio.
- **Nunca «cada euro situado» / «calle a calle» sin el matiz.** Un contrato
  solo se sitúa cuando su título nombra el lugar, y la capa declara qué
  fracción del gasto cubre.
- **El periodismo va siempre después de la medición** («sobre esos datos…») —
  segundo en jerarquía, sustancial, nunca una nota al pie.
- **Riba-roja es «el primer municipio»**, nunca el sujeto del proyecto.
- **Cifras en copia de campaña:** verificar contra la web en el momento de
  enviar; no congelar totales en documentos (regla del repo).
- **Elecciones:** mayo de 2027 es el horizonte («decidir con hechos»); en
  ventana LOREG la copia de campaña se congela con todo lo demás
  (`freeze:set`).

## Superficies derivadas

| Superficie                            | Qué toma de aquí                                                            |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `docs/funding/goteo-campaign-2026.md` | §0 título + subtítulo + categorías · §1 historia · §6 vídeo · §7 resumen EN |
| `docs/funding/nlnet-proposal-2026.md` | nombre del proyecto · abstract · sección _Compare_                          |
| `docs/press-kit-2026.md`              | titular + «Qué es» (ES y EN)                                                |
| `README.md`                           | tagline · «Why this exists» · tabla de superficies                          |
| `src/pages/Nosotros.jsx`              | tarjeta «Qué es CivicPulse»                                                 |
| `src/pages/About.jsx`                 | primera tarjeta (identidad) + «The proof»                                   |
