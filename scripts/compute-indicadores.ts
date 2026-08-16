#!/usr/bin/env tsx
/**
 * Build public/data/indicadores.json — el panel de coste unitario por servicio.
 *
 * Composición pura sobre coste-efectivo.json: sin red, sin LLM. Toda la
 * política vive en src/scraper/indicadores.ts; esto sólo lee, llama y escribe.
 *
 * Usage: npm run compute:indicadores
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirIndicadores, situacion } from '../src/scraper/indicadores'
import { validarResultados } from '../src/scraper/resultados'
import { construirIndicadoresMunicipales } from '../src/scraper/indicadores-friccion'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { startRun, NO_LLM_STATS } from '../src/scraper/run-manifest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const IN = join(ROOT, 'public/data/coste-efectivo.json')
const OUT = join(ROOT, 'public/data/indicadores.json')

const leer = async (rel: string) => JSON.parse(await readFile(join(ROOT, rel), 'utf8'))

async function main() {
  const fuente = JSON.parse(await readFile(IN, 'utf8'))
  // La entrega que titula la sale del motor: la más reciente con datos.

  const rec = startRun('compute-indicadores', {
    mode: 'compose',
    getStats: () => NO_LLM_STATS,
  })

  // Índice de precios para la serie. Es opcional a propósito: si el snapshot
  // del IPC no está, la serie sale sólo en corrientes y la página lo rotula,
  // en vez de fingir euros constantes que nadie ha calculado.
  let ipc: Record<number, number> | undefined
  try {
    ipc = (await leer('public/data/ipc.json')).medias
    console.log(`[indicadores] IPC cargado · ${Object.keys(ipc ?? {}).length} años`)
  } catch {
    console.warn('[indicadores] SIN ipc.json — la serie se publica en euros corrientes')
  }

  const snap = construirIndicadores({
    municipio: fuente.municipio,
    pares: fuente.pares,
    citaUrl: fuente.source.volcado,
    ipc,
    supramunicipal: fuente.supramunicipal?.filas ?? [],
  })
  const anioBase = snap.indicadores[0]?.citas[0]?.entrega ?? 0

  // Attempted = every service in the registry. Judged = the ones that produced
  // a ratio. Everything else is skipped WITH ITS REASON, so a page that shows
  // four cards instead of thirteen can say which seven the source blocked.
  for (const i of snap.indicadores) {
    rec.attempt()
    const s = situacion(i)
    if (s === 'con-ratio') rec.judge()
    else rec.skip(s)
  }
  rec.record('comparables', snap.universe.comparables)

  // Dimensión 4 — fricción institucional y salud fiscal. Cero fuentes nuevas:
  // los contratos y la ejecución presupuestaria ya están descargados.
  const municipales = construirIndicadoresMunicipales({
    tenders: await leer('public/data/tenders.json'),
    budgetExecution: await leer('public/data/budget-execution.json'),
    pmp: await leer('public/data/pmp.json').catch(() => undefined),
    budget: await leer('public/data/budget.json').catch(() => undefined),
    // El mismo snapshot que alimenta el panel de servicios, ahora también para
    // medir si alguien vuelve a contar lo que declara.
    costeEfectivo: fuente,
  })
  for (const m of municipales) {
    rec.attempt()
    if (m.valor !== null) rec.judge()
    else rec.skip('municipal-sin-datos')
  }

  // ── El escalón de resultados, AL LADO del coste ─────────────────────────
  // Cada tarjeta de producto decía «la fuente no publica ningún indicador de
  // resultado»; éste es ese indicador, de las fuentes que sí lo publican, y
  // las ausencias medidas de las que no. Validado antes de publicarse: un
  // resultado a medias hereda la credibilidad de las tarjetas de al lado.
  let resultados = { items: [] as unknown[], ausencias: [] as unknown[] }
  try {
    const crimen = await leer('public/data/criminalidad.json')
    resultados.items.push({
      id: 'crimen-infracciones-por-mil',
      servicioRelacionado: 'b132-130p-coste-unitario',
      etiqueta: 'Infracciones penales conocidas',
      valor: crimen.ultimo.tasaPorMil,
      unidad: '‰ habitantes/año',
      periodo: String(crimen.ultimo.anio),
      serie: crimen.serie
        .filter((p: { tasaPorMil: number | null }) => p.tasaPorMil !== null)
        .map((p: { anio: number; tasaPorMil: number }) => ({ anio: p.anio, valor: p.tasaPorMil })),
      pares: crimen.pares,
      comoSeLee:
        'Hechos conocidos por TODOS los cuerpos —Policía Nacional, Guardia Civil y policía ' +
        'local— agregados por el Ministerio del Interior. No es un producto del servicio ' +
        'municipal, no depende de su coste y no se puede leer contra la tarjeta de al lado: ' +
        'se publica junto a ella, nunca dividido por ella.',
      caveats: [
        'Son hechos CONOCIDOS (denunciados o registrados), no hechos ocurridos: un cambio en la denuncia mueve la cifra sin que cambie la calle.',
        `La banda de comparación es propia y menor que la de coste: sólo los municipios de la banda que superan 20.000 habitantes publican en el portal (n=${crimen.pares?.n ?? '—'}).`,
      ],
      fuente: crimen.fuente,
    })
  } catch {
    console.warn('[indicadores] SIN criminalidad.json — el panel sale sin ese resultado')
  }
  resultados.ausencias.push(
    {
      tema: 'Calidad del aire',
      motivo:
        'No hay ninguna estación de la red valenciana (RVVCCA) dentro del término municipal: ' +
        'ningún código de estación empieza por 46214, y la más cercana está en Vilamarxant. ' +
        'Tomar prestada la del vecino publicaría un aire que nadie midió aquí.',
    },
    {
      tema: 'Reciclaje (serie)',
      motivo:
        'La Generalitat publica UN corte con todas las fracciones por municipio (2022, CC-BY); ' +
        'los años posteriores sólo existen en un panel interactivo sin descarga reconstruible. ' +
        'Sin serie comparable, la serie no se publica.',
    },
  )
  resultados = validarResultados(resultados)

  const salida = {
    generatedAt: new Date().toISOString(),
    conjunto: fuente.pares.conjunto,
    anioBase,
    source: fuente.source,
    // `fuenteGeneratedAt` viaja con la cobertura para que /datos pueda fechar
    // coste-efectivo.json sin descargar sus 3,9 MB sólo para leer un campo.
    cobertura: { ...fuente.cobertura, fuenteGeneratedAt: fuente.generatedAt ?? null },
    ...snap,
    municipales,
    // CE4 del año base: lo que otros entes declaran prestar a este municipio.
    // La página lo enseña junto a los bloqueados — explica los ceros.
    supramunicipales: (fuente.supramunicipal?.filas ?? []).filter(
      (s: { anio: number }) => s.anio === anioBase,
    ),
    resultados,
    stats: {
      indicadores: snap.indicadores.length,
      conRatio: snap.universe.conRatio,
      comparables: snap.universe.comparables,
      municipales: municipales.filter((m) => m.valor !== null).length,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(salida, null, 2) + '\n')
  rec.finish()

  console.log(
    `[indicadores] ${snap.indicadores.length} servicios · ${snap.universe.conRatio} con cociente · ` +
      `${snap.universe.comparables} comparables · entrega ${anioBase}`,
  )
  for (const i of snap.indicadores) {
    const s = situacion(i)
    const cifra =
      i.valor === null
        ? `— (${i.numerador.motivo ?? i.denominador.motivo ?? s})`
        : `${i.valor.toFixed(2)} ${i.unidad}`
    console.log(
      `  ${i.servicio!.padEnd(15)} ${cifra.padStart(22)}  ${i.pares ? `pares n=${i.pares.n} p${i.pares.percentil}` : ''}`,
    )
  }
  for (const m of municipales) {
    const cifra =
      m.valor === null
        ? '—'
        : m.formato === 'porcentaje'
          ? `${(m.valor * 100).toFixed(1)} %`
          : m.valor.toFixed(2)
    console.log(`  ${m.id.padEnd(30)} ${cifra.padStart(9)}  (${m.periodo})`)
  }
  if (Object.keys(SERVICIOS).length !== snap.indicadores.length) {
    throw new Error('[indicadores] el registro y la salida no cuadran')
  }
  console.log(`[indicadores] → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
