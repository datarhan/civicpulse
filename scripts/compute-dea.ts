#!/usr/bin/env tsx
/**
 * Construye public/data/dea.json — el experimento de frontera de /laboratorio.
 *
 * Composición pura sobre coste-efectivo.json: sin red, sin LLM. Toda la
 * política vive en src/scraper/dea-especificacion.ts; esto lee, llama y escribe.
 *
 * La banda de pares sólo existe para una entrega del volcado nacional (el
 * ministerio publica un libro por entrega y aquí se descarga uno), así que el
 * análisis es un corte transversal de un año. El año NO se fija a mano: se toma
 * el más reciente con filas de pares, para que una entrega nueva no deje el
 * snapshot describiendo la anterior sin decirlo.
 *
 * Usage: npm run compute:dea [-- --replicas 2000]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CesteRow } from '../src/scraper/coste-efectivo'
import {
  ESPECIFICACIONES,
  INE_PROPIO,
  analizarEspecificacion,
  panelEquilibrado,
  serieEspecificacion,
} from '../src/scraper/dea-especificacion'
import { REGLA_GRADOS_LIBERTAD } from '../src/scraper/dea'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { RAZON_SESGO_MINIMA } from '../src/scraper/dea-bootstrap'
import {
  medirDeclaracionCongelada,
  MIN_ENTREGAS_CONGELADA,
} from '../src/scraper/declaracion-congelada'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const IN = join(ROOT, 'public/data/coste-efectivo.json')
const OUT = join(ROOT, 'public/data/dea.json')

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const fuente = JSON.parse(await readFile(IN, 'utf8'))
  const replicas = Number(arg('replicas') ?? 2000)
  const alfa = Number(arg('alfa') ?? 0.05)

  // Los pares viven en un bloque y el municipio propio en otro; la frontera los
  // necesita en la misma muestra o Riba-roja no estaría dentro de su propio
  // análisis.
  const filas: CesteRow[] = [...fuente.pares.filas, ...fuente.municipio.filas]
  const aniosPares = [...new Set(fuente.pares.filas.map((f: CesteRow) => f.anio))] as number[]
  if (aniosPares.length === 0) throw new Error('[dea] coste-efectivo.json no trae filas de pares')
  const anio = Math.max(...aniosPares)
  const miembrosBanda = new Set(filas.filter((f) => f.anio === anio).map((f) => f.ine)).size

  const rec = startRun('compute-dea', { mode: 'compose', getStats: () => NO_LLM_STATS })

  const aniosSerie = [...new Set(aniosPares)].sort((a, b) => a - b)

  const especificaciones = ESPECIFICACIONES.map((e) => {
    rec.attempt()
    const a = analizarEspecificacion(e, { filas, anio, miembrosBanda, replicas, alfa })
    if (a.estado === 'publicada') rec.judge()
    else rec.skip('insuficiente')

    // Dos series, y la gracia está en la diferencia. La de muestra variable
    // mezcla el movimiento del municipio con el de quién declaró ese año; la
    // del panel equilibrado usa las MISMAS unidades en todas las entregas, así
    // que lo que se mueve ya no es la composición.
    const panel = panelEquilibrado(e, filas, aniosSerie)
    const comun = { filas, miembrosBanda, replicas, alfa, anios: aniosSerie }
    return {
      ...a,
      serie: serieEspecificacion(e, comun),
      panel: {
        miembros: panel.size,
        incluyePropio: panel.has(INE_PROPIO),
        serie: panel.has(INE_PROPIO)
          ? serieEspecificacion(e, { ...comun, restringirA: panel })
          : [],
      },
    }
  })

  const publicadas = especificaciones.filter((e) => e.estado === 'publicada')
  rec.record('publicadas', publicadas.length)
  rec.record('lps', publicadas.length * replicas)

  // La calidad de la declaración, que es lo que decide qué puede decir la serie
  // temporal. Se mide sobre TODOS los programas de todas las especificaciones,
  // no sólo la principal: el lector tiene que poder ver si el problema es de
  // esta cesta o de la fuente entera.
  const programas = [...new Set(ESPECIFICACIONES.flatMap((e) => e.programas))]
  const declaracion = medirDeclaracionCongelada(filas, programas, aniosSerie)
  const propias = declaracion.series.filter((s) => s.ine === INE_PROPIO)
  rec.record('seriesRevisadas', declaracion.series.length)

  const salida = {
    generatedAt: new Date().toISOString(),
    fuente: {
      snapshot: 'coste-efectivo.json',
      entrega: anio,
      volcado: fuente.source?.volcado ?? null,
      conjunto: fuente.pares?.conjunto ?? null,
    },
    modelo: {
      orientacion: 'entrada',
      reglaGradosLibertad: REGLA_GRADOS_LIBERTAD,
      bootstrap: 'Simar y Wilson (1998), homogéneo y suavizado con reflexión en 1',
      replicas,
      alfa,
      razonSesgoMinima: RAZON_SESGO_MINIMA,
      // Se publica junto al resultado porque es la única forma de que la
      // negativa a nombrar no se lea como opacidad: el método está entero y
      // cualquiera puede rehacer la tabla desde coste-efectivo.json.
      inePropio: INE_PROPIO,
    },
    declaracion: {
      minEntregas: MIN_ENTREGAS_CONGELADA,
      entregas: declaracion.totales.entregas,
      unidadSeries: declaracion.totales.unidadSeries,
      unidadCongeladas: declaracion.totales.unidadCongeladas,
      costeSeries: declaracion.totales.costeSeries,
      costeCongeladas: declaracion.totales.costeCongeladas,
      // Sólo las propias van con nombre de municipio; del resto se publica el
      // recuento, igual que con las puntuaciones.
      propias: propias.map((s) => ({
        programa: s.programa,
        // El código del programa («a1721/170P») es lo que trae el ministerio y
        // no dice nada a nadie. La etiqueta sale del registro curado, no de una
        // segunda tabla escrita a mano aquí.
        label: SERVICIOS[s.programa]?.label ?? s.programa,
        unidad: SERVICIOS[s.programa]?.unidad ?? null,
        magnitud: s.magnitud,
        congelada: s.congelada,
        entregas: s.entregas,
        valor: s.valor,
        repeticionesFinales: s.repeticionesFinales,
        congeladaDesde: s.congeladaDesde,
        desde: s.desde,
        hasta: s.hasta,
      })),
    },
    especificaciones,
    stats: {
      especificaciones: especificaciones.length,
      publicadas: publicadas.length,
      insuficientes: especificaciones.length - publicadas.length,
      banda: miembrosBanda,
      entrega: anio,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, `${JSON.stringify(salida, null, 2)}\n`)
  rec.finish()

  console.log(
    `[dea] entrega ${anio} · banda ${miembrosBanda} municipios · ${replicas} réplicas · α ${alfa}`,
  )
  for (const e of especificaciones) {
    const cob = `${e.cobertura.incluidas}/${e.cobertura.banda}`
    if (e.estado !== 'publicada') {
      console.log(
        `  ${e.id.padEnd(28)} ${cob.padStart(6)}  INSUFICIENTE — ${e.motivoEstado?.slice(0, 60)}…`,
      )
      continue
    }
    const p = e.propia!
    console.log(
      `  ${e.id.padEnd(28)} ${cob.padStart(6)}  θ ${p.theta.toFixed(3)} → ${p.thetaCorregido.toFixed(3)}` +
        `  IC [${p.intervaloAcotaPorAbajo ? p.ic.inferior.toFixed(3) : ' sin cota'}, ${p.ic.superior.toFixed(3)}]` +
        `  eficientes ${e.distribucion!.eficientes}/${e.distribucion!.n}`,
    )
  }
  const d = declaracion.totales
  console.log(
    `[dea] declaración: ${d.unidadCongeladas}/${d.unidadSeries} series de unidad física repiten ` +
      `el mismo valor en ≥${d.minEntregas} entregas, contra ${d.costeCongeladas}/${d.costeSeries} ` +
      'de coste. La serie temporal no puede leerse como eficiencia.',
  )
  const congeladasPropias = propias.filter((s) => s.congelada && s.magnitud === 'unidad')
  if (congeladasPropias.length) {
    console.log(
      `[dea] Riba-roja congela ${congeladasPropias.length}: ` +
        congeladasPropias.map((s) => `${s.programa} (${s.entregas} entregas)`).join(', '),
    )
  }
  console.log(`[dea] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
