#!/usr/bin/env tsx
/**
 * check:indicadores — ¿resuelve cada cifra publicada a la celda que dice citar?
 *
 * `check:citations` hace esto con las citas textuales; esto lo hace con la
 * aritmética. Un cociente es una afirmación tan publicable como una frase
 * entrecomillada, y sería la única del sitio sin forma de comprobarla.
 *
 * Cada `Magnitud.fuente` (`cesel:2021:CE2:a1621:Econ14`) se vuelve a buscar en
 * coste-efectivo.json y su valor se compara con el publicado. Además se
 * reafirman los invariantes del motor sobre el fichero YA ESCRITO, no sobre la
 * estructura en memoria que los produjo: un test comprueba la función, esto
 * comprueba lo que se sirve.
 *
 * IMPRESCINDIBLE: imprime cuántas comprobaciones hizo. Una guarda que no evaluó
 * nada y una guarda que no encontró nada dan el mismo «✓» — es el patrón que
 * dejó dos suites verdes midiendo el vacío (docs/DATA_INTEGRITY.md).
 *
 * Usage: npm run check:indicadores
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CesteRow } from '../src/scraper/coste-efectivo'
import { MIN_PARES, situacion, type Indicador } from '../src/scraper/indicadores'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import {
  construirIndicadoresMunicipales,
  type IndicadorMunicipal,
} from '../src/scraper/indicadores-friccion'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const problemas: string[] = []
let comprobaciones = 0

const fail = (msg: string) => problemas.push(msg)

/**
 * Los valores que la fuente ofrece para esa celda.
 *
 * Devuelve TODOS los candidatos, no el que el motor elegiría. Si esta guarda
 * reprodujese la política de resolución coincidiría con el motor por
 * construcción —no comprobaría nada— y además tendría que reescribirse cada vez
 * que la política cambia, que es justo cómo se rompió la primera vez. Lo que
 * comprueba es más débil y más útil: que la cifra publicada sea LITERALMENTE
 * una celda de la fuente y no un número que apareció por el camino.
 *
 * Formatos: `cesel:<anio>:CE2:<programa>:Econ14`
 *           `cesel:<anio>:CE3:<programa>:<atributo>`
 */
function candidatos(fuente: string, filas: CesteRow[]): number[] | undefined {
  const m = /^cesel:(\d{4}):(CE2|CE3):(.+)$/.exec(fuente)
  if (!m) return undefined
  const anio = Number(m[1])
  const [, , hoja, resto] = m
  const enAnio = (programa: string) =>
    filas.filter((f) => f.programa === programa && f.anio === anio)

  if (hoja === 'CE2') {
    const rows = enAnio(resto.replace(/:Econ14$/, ''))
    if (!rows.length) return undefined
    return rows.map((r) => r.costeTotal).filter((v): v is number => v !== null)
  }

  // El atributo puede contener ':' («…residuos urbanos: toneladas»), así que se
  // parte por el PRIMER separador, no por el último.
  const corte = resto.indexOf(':')
  const vals = enAnio(resto.slice(0, corte)).flatMap((r) =>
    r.unidades.filter((u) => u.atributo === resto.slice(corte + 1)),
  )
  return vals.length ? vals.map((v) => v.valor) : undefined
}

async function main() {
  const base = JSON.parse(await readFile(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
  const pub = JSON.parse(await readFile(join(ROOT, 'public/data/indicadores.json'), 'utf8'))
  const propias: CesteRow[] = base.municipio.filas
  const indicadores: Indicador[] = pub.indicadores

  if (!indicadores.length) fail('indicadores.json no publica ningún indicador')
  if (indicadores.length !== Object.keys(SERVICIOS).length) {
    fail(
      `el registro tiene ${Object.keys(SERVICIOS).length} servicios y se publican ${indicadores.length}`,
    )
  }

  for (const i of indicadores) {
    // 1. Las citas resuelven, y al valor que se publica.
    for (const [nombre, mag] of [
      ['numerador', i.numerador],
      ['denominador', i.denominador],
    ] as const) {
      comprobaciones++
      const opciones = candidatos(mag.fuente, propias)
      if (mag.estado === 'declarado') {
        if (opciones === undefined) {
          fail(`${i.id}: ${nombre} dice citar ${mag.fuente}, que no existe en coste-efectivo.json`)
        } else if (!opciones.includes(mag.valor as number)) {
          fail(
            `${i.id}: ${nombre} publica ${mag.valor}, que no es ninguna de las celdas ` +
              `de ${mag.fuente} (${opciones.join(', ')})`,
          )
        }
      }
      // 2. Una celda que no está declarada no puede llevar número.
      comprobaciones++
      if (mag.estado !== 'declarado' && mag.valor !== null) {
        fail(`${i.id}: ${nombre} está ${mag.estado} y aun así publica ${mag.valor}`)
      }
    }

    // 3. El cociente sólo existe si las dos celdas están declaradas.
    comprobaciones++
    const puede = i.numerador.estado === 'declarado' && i.denominador.estado === 'declarado'
    if (i.valor !== null && !puede) fail(`${i.id}: publica cociente con una celda no declarada`)
    if (i.valor !== null && Math.abs(i.valor - i.numerador.valor! / i.denominador.valor!) > 1e-9) {
      fail(`${i.id}: el cociente publicado no es numerador/denominador`)
    }

    // 4. Los pares: mismo modo, suelo de n, y el municipio nunca entre ellos.
    comprobaciones++
    if (i.pares) {
      if (i.pares.modoGestion !== i.modoGestion) {
        fail(`${i.id}: compara ${i.modoGestion} contra pares ${i.pares.modoGestion}`)
      }
      if (i.pares.n < MIN_PARES) fail(`${i.id}: percentil con n=${i.pares.n} < ${MIN_PARES}`)
      if (i.pares.miembros.length !== i.pares.n) fail(`${i.id}: n y miembros no cuadran`)
      if (i.pares.miembros.some((m) => m.ine === base.municipio.ine)) {
        fail(`${i.id}: el propio municipio aparece entre sus pares`)
      }
      if (!i.comparable) fail(`${i.id}: trae pares pero se declara no comparable`)
    }

    // 5. Una concesión nunca puede acabar comparada.
    comprobaciones++
    if (i.modoGestion === 'concesion' && (i.valor !== null || i.pares)) {
      fail(`${i.id}: es concesión y aun así publica cociente o pares`)
    }

    // 6. La serie no interpola: un punto sin dato no lleva valor.
    for (const p of i.serie) {
      comprobaciones++
      if (p.estado !== 'declarado' && p.valor !== null) {
        fail(`${i.id}: la serie ${p.anio} está ${p.estado} y lleva valor`)
      }
    }
  }

  // 7. Los indicadores municipales se RECALCULAN desde los snapshots de origen
  //    y se comparan con lo publicado. Aquí sí se reproduce el cálculo, porque
  //    son agregados: la pregunta que responde es «¿esta cifra sigue saliendo
  //    de los datos que hay hoy en el repositorio?». Un snapshot de contratos
  //    actualizado sin recomputar el panel deja la página mintiendo en silencio,
  //    y eso es exactamente lo que esta comprobación caza.
  const municipales: IndicadorMunicipal[] = pub.municipales ?? []
  if (!municipales.length) fail('indicadores.json no publica indicadores municipales')
  const recalculados = construirIndicadoresMunicipales({
    tenders: JSON.parse(await readFile(join(ROOT, 'public/data/tenders.json'), 'utf8')),
    budgetExecution: JSON.parse(
      await readFile(join(ROOT, 'public/data/budget-execution.json'), 'utf8'),
    ),
  })
  for (const publicado of municipales) {
    comprobaciones++
    const esperado = recalculados.find((r) => r.id === publicado.id)
    if (!esperado) {
      fail(`${publicado.id}: publicado pero ya no se calcula desde las fuentes`)
      continue
    }
    for (const campo of ['numerador', 'denominador'] as const) {
      comprobaciones++
      if (publicado[campo].valor !== esperado[campo].valor) {
        fail(
          `${publicado.id}: ${campo} publica ${publicado[campo].valor} y las fuentes de hoy dan ` +
            `${esperado[campo].valor} — el panel está desfasado respecto a su origen`,
        )
      }
      if (publicado[campo].estado !== 'declarado' && publicado[campo].valor !== null) {
        fail(`${publicado.id}: ${campo} está ${publicado[campo].estado} y aun así publica valor`)
      }
    }
    comprobaciones++
    if (publicado.valor !== null) {
      const propio = publicado.numerador.valor! / publicado.denominador.valor!
      if (Math.abs(publicado.valor - propio) > 1e-9) {
        fail(`${publicado.id}: el valor publicado no es numerador/denominador`)
      }
    }
    // Un porcentaje sin periodo se lee como «este año». Los contratos abarcan
    // casi una década.
    comprobaciones++
    if (!publicado.periodo || /sin declarar/.test(publicado.periodo)) {
      fail(`${publicado.id}: publica una cifra sin declarar el periodo que cubre`)
    }
  }
  for (const r of recalculados) {
    comprobaciones++
    if (!municipales.some((m) => m.id === r.id)) {
      fail(`${r.id}: se calcula desde las fuentes pero no se publica`)
    }
  }

  // 8. La cobertura es una partición: los cubos tienen que sumar el registro.
  comprobaciones++
  const u = pub.universe
  const suma = u.conRatio + u.enConcesion + u.sinUnidad + u.sinCoste + u.noSePresta
  if (suma !== u.serviciosEnRegistro) {
    fail(`la cobertura suma ${suma} y el registro tiene ${u.serviciosEnRegistro}`)
  }
  const recuento = indicadores.filter((i) => situacion(i) === 'con-ratio').length
  if (recuento !== u.conRatio) fail(`universe.conRatio=${u.conRatio} pero hay ${recuento}`)

  // Un «✓» sin número de comprobaciones es indistinguible de una guarda apagada.
  console.log(
    `[check-indicadores] ${comprobaciones} comprobaciones sobre ${indicadores.length} indicadores ` +
      `(${u.conRatio} con cociente, ${u.comparables} comparables)`,
  )
  if (comprobaciones === 0) {
    console.error('[check-indicadores] no se evaluó NADA — la guarda está muerta')
    process.exit(1)
  }
  if (problemas.length) {
    for (const p of problemas) console.error(`  ✗ ${p}`)
    console.error(`[check-indicadores] ${problemas.length} problema(s)`)
    process.exit(1)
  }
  console.log('[check-indicadores] ✓ toda cifra publicada resuelve a su celda')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
