#!/usr/bin/env tsx
/**
 * oro:atribucion — sortea el conjunto de oro de la atribución (paso 1.1) y lo
 * CONGELA: la hoja que una persona escucha, el manifiesto del sorteo y un sello
 * en el repositorio. La regla del sorteo y la de puntuación, en
 * src/scraper/oro-atribucion.ts.
 *
 *   npm run oro:atribucion                  # sortea y escribe, si no hay ya uno
 *   npm run oro:atribucion -- --comprobar   # ¿la hoja sigue siendo la sorteada?
 *   … -- --dir RUTA                         # otro directorio (desde un worktree)
 *   … -- --sello RUTA                       # otro sello (sólo ensayos y pruebas)
 *   … -- --ensayo                           # sin exigir las fuentes comiteadas (ensayos)
 *
 * La hoja y el manifiesto van a editorial/oro-atribucion/ (gitignorado): cuando se
 * rellene, una frase con su bloque al lado nombra por eliminación al concejal de
 * un bloque de un escaño, y eso no se publica. Al repositorio sólo va el SELLO
 * (`scripts/lib/oro-atribucion-sello.json`): la huella de la lista sorteada, la
 * semilla y el commit, sin una sola frase. Fija el sorteo en público antes de
 * escuchar nada, y `--comprobar` lo coteja.
 *
 * Un sorteo hecho no se rehace: volver a sortear después de ver una tanda es
 * elegir el oro mirando los resultados. La semilla es fija, y el script se niega
 * si ya hay hoja, manifiesto o sello.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transcriptKind } from '../src/lib/transcript-kind.js'
import { sha256Short } from '../src/scraper/hash'
import {
  BARRA,
  BLOQUE_RESERVA,
  COLUMNAS_HOJA,
  ETIQUETAS_ESCUCHA,
  FUERA_DEL_DENOMINADOR,
  hojaOro,
  huellaDeLista,
  leerHojaOro,
  PALABRAS_MIN,
  palabras,
  PRIMERA_TANDA,
  PUNTUADAS_OBJETIVO,
  SEGUNDA_TANDA,
  SEMILLA_ORO,
  sortearOro,
  TAMANO_LISTA,
  type Candidata,
} from '../src/scraper/oro-atribucion'
import { validarDecisiones } from '../src/scraper/pleno-video-decisiones'
import { resolveVideoForPleno } from '../src/scraper/pleno-video-match'
import { normaliseForQuoteMatch } from '../src/scraper/quote-match'
import { locateQuote } from '../src/scraper/speaker-map-align'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

const arg = (k: string) => {
  const i = process.argv.indexOf(k)
  return i >= 0 ? process.argv[i + 1] : undefined
}
export const RUTA_SELLO = 'scripts/lib/oro-atribucion-sello.json'
// --sello: sólo para pruebas y ensayos, que no pueden dejar el sello de verdad.
const SELLO = resolve(arg('--sello') ?? RUTA_SELLO)
const DATA = resolve('public/data')
/** Cobertura mínima para decir que una cita servida cae en una línea. */
const COBERTURA_CITA = 0.8

const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

export interface Poblacion {
  candidatas: Candidata[]
  fuera: Record<string, string[]>
}

export function poblacionEnDisco(): Poblacion {
  const plenos = leer(resolve(DATA, 'plenos.json')).items as { id: string; date: string }[]
  const videos = leer(resolve(DATA, 'pleno-videos.json')).items
  const regmeet = existsSync(resolve(DATA, 'pleno-videos-regmeet.json'))
    ? leer(resolve(DATA, 'pleno-videos-regmeet.json')).items
    : undefined
  const decisiones = existsSync(resolve(DATA, 'pleno-video-decisiones.json'))
    ? validarDecisiones(leer(resolve(DATA, 'pleno-video-decisiones.json'))).items
    : []
  const fecha = new Map(plenos.map((p) => [p.id, p.date]))
  const fuera: Record<string, string[]> = { acta: [], 'sin-video': [], 'sin-lineas': [] }
  const candidatas: Candidata[] = []

  for (const f of readdirSync(resolve(DATA, 'pleno-transcripts')).sort()) {
    if (!f.endsWith('.txt')) continue
    const id = f.slice(0, -4)
    const texto = readFileSync(resolve(DATA, 'pleno-transcripts', f), 'utf8')
    if (transcriptKind(texto) !== 'audio') {
      fuera.acta.push(id)
      continue
    }
    let video: string
    try {
      video = resolveVideoForPleno(id, plenos, videos, regmeet, decisiones).url
    } catch {
      fuera['sin-video'].push(id)
      continue
    }
    const antes = candidatas.length
    // La línea se nombra por su segundo de inicio: es lo que se escucha, y sigue
    // valiendo si la transcripción se rehace o el lector salta una línea.
    const vistos = new Map<string, number>()
    parseDiarizedTranscript(texto).forEach((s) => {
      if (palabras(s.text) < PALABRAS_MIN) return
      const base = `${id}@${s.start}`
      const k = (vistos.get(base) ?? 0) + 1
      vistos.set(base, k)
      candidatas.push({
        plenoId: id,
        fecha: fecha.get(id) ?? '',
        turnoId: k === 1 ? base : `${base}#${k}`,
        texto: s.text,
        desde: s.start,
        hasta: s.end,
        video,
      })
    })
    // Sin ninguna línea: una transcripción alucinada sin etiquetas de hablante.
    if (candidatas.length === antes) fuera['sin-lineas'].push(id)
  }
  return { candidatas, fuera }
}

/**
 * Qué líneas sorteadas tienen encima una cita servida. Va al manifiesto, no a la
 * hoja (la hoja es ciega), para poder decir después cuánto del oro cae en lo que
 * de verdad se publica.
 */
function lineasConCita(sesiones: readonly string[]): Set<string> {
  const con = new Set<string>()
  for (const id of sesiones) {
    const trozo = resolve(DATA, 'pleno-claims', `${id}.json`)
    if (!existsSync(trozo)) continue
    const lineas = parseDiarizedTranscript(
      readFileSync(resolve(DATA, 'pleno-transcripts', `${id}.txt`), 'utf8'),
    )
    let heno = ''
    const marcas: { at: number; start: number }[] = []
    for (const s of lineas) {
      // Una línea que normaliza a nada dejaría un espacio doble que locateQuote
      // colapsa, y las marcas se desplazarían.
      const t = normaliseForQuoteMatch(s.text)
      if (!t) continue
      marcas.push({ at: heno.length, start: s.start })
      heno += t + ' '
    }
    for (const it of leer(trozo).items as { claim: { verbatim: string } }[]) {
      const { coverage, at, length } = locateQuote(it.claim.verbatim, heno)
      if (coverage < COBERTURA_CITA || at < 0) continue
      // La línea donde empieza la cita y las que cubre.
      let ultima = marcas[0]
      for (const m of marcas) if (m.at <= at) ultima = m
      if (ultima) con.add(`${id}@${ultima.start}`)
      for (const m of marcas) if (m.at > at && m.at < at + length) con.add(`${id}@${m.start}`)
    }
  }
  return con
}

function gitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/**
 * El commit que se apunta tiene que CONTENER la regla y los datos del sorteo: si
 * el módulo, el script o public/data están sin comitear, el commit no reproduce
 * nada. Se niega en vez de apuntar uno que miente.
 */
const FUENTES_DEL_SORTEO = [
  'src/scraper/oro-atribucion.ts',
  'scripts/oro-atribucion.ts',
  'public/data/pleno-transcripts',
  'public/data/plenos.json',
  'public/data/pleno-videos.json',
  'public/data/pleno-videos-regmeet.json',
  'public/data/pleno-video-decisiones.json',
  'public/data/pleno-claims',
]
function fuentesSucias(): string[] {
  const out = execFileSync('git', ['status', '--porcelain', '--', ...FUENTES_DEL_SORTEO], {
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

interface Manifiesto {
  semilla: number
  huellaLista: string
  elegidas: { n: number; tanda: number; turnoId: string; huella: string }[]
}

function comprobar(dir: string) {
  const HOJA = resolve(dir, 'hoja-oro.tsv')
  const MANIFIESTO = resolve(dir, 'manifiesto.json')
  if (!existsSync(MANIFIESTO) || !existsSync(HOJA))
    throw new Error(`no hay sorteo congelado en ${dir}`)
  const m = leer(MANIFIESTO) as Manifiesto
  const { filas, errores } = leerHojaOro(readFileSync(HOJA, 'utf8'))
  if (filas.length !== m.elegidas.length)
    errores.push(`la hoja tiene ${filas.length} fila(s) y el sorteo ${m.elegidas.length}`)
  const porN = new Map(filas.map((f) => [f.n, f]))
  for (const e of m.elegidas) {
    const f = porN.get(e.n)
    if (!f) errores.push(`falta la fila ${e.n}`)
    else if (f.huella !== e.huella || f.turnoId !== e.turnoId || f.tanda !== e.tanda)
      errores.push(`la fila ${e.n} no es la sorteada (cambió una columna congelada)`)
  }
  if (huellaDeLista(m.elegidas.map((e) => e.huella)) !== m.huellaLista)
    errores.push('el manifiesto no cuadra con su propia huella')
  if (existsSync(SELLO)) {
    const sello = leer(SELLO) as { huellaLista: string }
    if (sello.huellaLista !== m.huellaLista)
      errores.push(`el manifiesto no es el del sello del repositorio (${SELLO})`)
  } else errores.push(`no hay sello en ${SELLO}: el sorteo no está fijado en el repositorio`)
  const hechas = filas.filter((f) => f.escuchado)
  const porTanda = new Map<number, number>()
  for (const f of hechas) porTanda.set(f.tanda, (porTanda.get(f.tanda) ?? 0) + 1)
  process.stdout.write(
    `[oro] ${filas.length} fila(s) · ${hechas.length} escuchada(s)` +
      `${[...porTanda].map(([t, k]) => ` · tanda ${t}: ${k}`).join('')} · ${errores.length} error(es)\n`,
  )
  for (const e of errores) process.stdout.write(`  ✗ ${e}\n`)
  if (errores.length) process.exitCode = 1
}

function sortear(dir: string) {
  const HOJA = resolve(dir, 'hoja-oro.tsv')
  const MANIFIESTO = resolve(dir, 'manifiesto.json')
  for (const p of [HOJA, MANIFIESTO, SELLO])
    if (existsSync(p))
      throw new Error(`ya existe ${p}: un sorteo hecho no se rehace (ver la cabecera del script)`)
  const sucias = process.argv.includes('--ensayo') ? [] : fuentesSucias()
  if (sucias.length)
    throw new Error(
      `hay fuentes del sorteo sin comitear, y el commit apuntado no las tendría:\n  ${sucias.join('\n  ')}`,
    )

  const { candidatas, fuera } = poblacionEnDisco()
  const { elegidas, repetidas } = sortearOro(candidatas, SEMILLA_ORO)
  if (elegidas.length < TAMANO_LISTA)
    throw new Error(`sólo ${elegidas.length} líneas sorteables: hacen falta ${TAMANO_LISTA}`)
  const sesiones = [...new Set(elegidas.map((e) => e.plenoId))].sort()
  const conCita = lineasConCita(sesiones)
  const head = gitHead()
  const huellaPoblacion = sha256Short(
    candidatas
      .map((c) => `${c.turnoId}|${sha256Short(c.texto)}|${c.video}`)
      .sort()
      .join('\n'),
  )
  const hoy = new Date().toISOString().slice(0, 10)
  const reservas = Math.ceil((TAMANO_LISTA - PRIMERA_TANDA - SEGUNDA_TANDA) / BLOQUE_RESERVA)
  const cabecera = [
    `Conjunto de oro de la atribución (paso 1.1) · sorteado ${hoy} · semilla ${SEMILLA_ORO} · commit ${head ?? '?'} · población ${huellaPoblacion}`,
    `${elegidas.length} líneas (≥${PALABRAS_MIN} palabras) de ${sesiones.length} sesiones de audio, al azar y repartidas entre sesiones.`,
    `TANDA 1 = filas 1–${PRIMERA_TANDA} (diciembre). TANDA 2 = filas ${PRIMERA_TANDA + 1}–${PRIMERA_TANDA + SEGUNDA_TANDA} (enero). Tandas 3–${2 + reservas} = RESERVA: no se escucha salvo que lo pida la regla de ampliación.`,
    'Abre el enlace (arranca 5 s antes) y escribe en «escuchado» quién HABLA entre «desde_s» y «hasta_s», aunque la frase transcrita no sea exactamente la que oyes (eso va en «notas»):',
    `  ${ETIQUETAS_ESCUCHA.join(' · ')}`,
    '  · el bloque es el de la persona A LA FECHA DE LA SESIÓN; el alcalde o la alcaldesa moderando cuenta como su bloque.',
    '  · varias-voces: hablan varias y ninguna ocupa casi todo el intervalo. no-distingo: una sola, pero no sabes quién. nadie-habla: silencio o ruido.',
    'Rellena «oyente» y «fecha_escucha» (AAAA-MM-DD). Escucha en orden, y no mires ningún mapa ni el bloque publicado antes de terminar la tanda.',
    'No cambies el orden ni las columnas de la izquierda: `npm run oro:atribucion -- --comprobar` lo vigila.',
  ]
  const { tsv, huellas } = hojaOro(elegidas, cabecera)
  const huellaLista = huellaDeLista(huellas)
  mkdirSync(dir, { recursive: true })
  // `wx`: si entre la comprobación de arriba y aquí apareció un fichero, no se pisa.
  writeFileSync(HOJA, tsv, { flag: 'wx' })
  writeFileSync(
    MANIFIESTO,
    JSON.stringify(
      {
        paso: '1.1',
        sorteadoEl: hoy,
        semilla: SEMILLA_ORO,
        commit: head,
        huellaLista,
        poblacion: {
          huella: huellaPoblacion,
          lineas: candidatas.length,
          frasesRepetidas: repetidas,
          sesiones: new Set(candidatas.map((c) => c.plenoId)).size,
          fuera,
        },
        tandas: {
          1: PRIMERA_TANDA,
          2: SEGUNDA_TANDA,
          reserva: { bloques: reservas, deCada: BLOQUE_RESERVA },
        },
        regla: {
          unidad:
            'línea de transcripción de ≥8 palabras; se etiqueta quién habla entre desde_s y hasta_s',
          metodo:
            'el bloque del método es el que cubre la mayor parte del intervalo, o se abstiene',
          precision:
            'aciertos ÷ líneas donde el método da un bloque de varios escaños (a la fecha de la sesión) y la escucha da un bloque o no-concejal',
          errores:
            'un no-concejal o un bloque de un escaño escuchados donde el método dijo otro bloque son errores',
          cobertura: 'líneas con bloque del método ÷ escuchadas, publicada al lado',
          barra: `cota inferior de Wilson ≥ ${BARRA} sobre las puntuadas`,
          veredicto: `uno solo, al llegar a ${PUNTUADAS_OBJETIVO} puntuadas o al acabarse la lista; ampliar por cobertura, nunca por errores; sin mirar por el camino`,
          fueraDelDenominador: FUERA_DEL_DENOMINADOR,
          descartar:
            'cuando los errores hacen la barra inalcanzable con lo que queda (barraInalcanzable)',
          unEscano:
            'lo que un método atribuye a un bloque de un escaño se cuenta aparte y no suma para la barra',
          segundaEscucha: 'cada desacuerdo se re-escucha a ciegas, mezclado con tantos acuerdos',
          detalle: 'src/scraper/oro-atribucion.ts, cabecera',
        },
        columnas: COLUMNAS_HOJA,
        etiquetas: ETIQUETAS_ESCUCHA,
        elegidas: elegidas.map((e, i) => ({
          n: e.n,
          tanda: e.tanda,
          plenoId: e.plenoId,
          turnoId: e.turnoId,
          huella: huellas[i],
          solapaCita: conCita.has(e.turnoId.replace(/#\d+$/, '')),
        })),
        notas: [],
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  )
  writeFileSync(
    SELLO,
    JSON.stringify(
      {
        paso: '1.1',
        explicacion:
          'Huella del conjunto de oro de la atribución sorteado. Las frases y las etiquetas no se publican; esto fija el sorteo antes de escuchar.',
        sorteadoEl: hoy,
        semilla: SEMILLA_ORO,
        commit: head,
        lineas: elegidas.length,
        sesiones: sesiones.length,
        huellaPoblacion,
        huellaLista,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  )
  const solapan = elegidas.filter((e) => conCita.has(e.turnoId.replace(/#\d+$/, ''))).length
  process.stdout.write(
    `[oro] ${elegidas.length} líneas de ${sesiones.length} sesiones · población ${candidatas.length} ` +
      `(${repetidas} frases repetidas fuera) · ${solapan} con una cita servida encima · fuera: ${Object.entries(
        fuera,
      )
        .map(([k, v]) => `${k}=${v.length}`)
        .join(
          ' ',
        )}\n[oro] hoja → ${HOJA}\n[oro] manifiesto → ${MANIFIESTO}\n[oro] sello → ${SELLO} (comitéalo)\n`,
  )
}

function main() {
  const dir = resolve(arg('--dir') ?? 'editorial/oro-atribucion')
  // Lo que se rellena nombra por eliminación: nunca bajo public/, que se publica.
  const relativa = relative(process.cwd(), dir)
  if (!relativa.startsWith('..') && relativa.split(sep)[0] === 'public')
    throw new Error(`--dir ${dir} está bajo public/: lo de ahí se publica`)
  if (process.argv.includes('--comprobar')) comprobar(dir)
  else sortear(dir)
}

// realpath: invocado por un enlace simbólico, la comparación literal salía falsa y
// el script terminaba en 0 sin hacer nada.
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? '.')).href) {
  try {
    main()
  } catch (err) {
    process.stderr.write(`[oro] ${(err as Error).message}\n`)
    process.exitCode = 1
  }
}
