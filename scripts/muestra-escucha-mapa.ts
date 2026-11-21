#!/usr/bin/env tsx
/**
 * Sortea la muestra de etiquetas que una persona tiene que ESCUCHAR antes de que el
 * mapa de hablantes por texto pueda sustituir al de audio.
 *
 *   npx tsx scripts/muestra-escucha-mapa.ts --gemini DIR --texto DIR \
 *        [--n 80] [--solo-texto 50] [--semilla 20261120] --out HOJA.tsv
 *
 * ## Por qué una muestra y no el oro que ya hay
 *
 * Las 8 firmas de `pleno-claim-relabels.json` son correcciones: se eligieron por
 * estar mal. Seis son de una misma sesión y siete de un mismo bloque, y con 0 de 8
 * la cota superior de Wilson ronda el 32 %. `automation-policy.ts` pide ≥50
 * elementos y una cota inferior ≥0,95. Una muestra sorteada ANTES de mirar
 * resultados es lo único que mide la tasa de error.
 *
 * ## Qué se sortea
 *
 * La unidad es la CITA extraída (`public/data/pleno-claims/<id>.json`): es lo que
 * se publica con un bloque al lado, y se escucha en un segundo concreto. Una
 * etiqueta publicada no sirve: el diarizador mete a varias personas en una, y
 * «el bloque de la voz» de 500 s con tres voces no tiene respuesta.
 *
 * - **Muestra A** (`--n`, 80 por defecto): citas a las que uno de los dos mapas da
 *   bloque, por el mismo `blocResolverFor` que el extractor. Van TODAS las de un
 *   bloque de un escaño, porque ahí un error nombra a una persona. El resto se
 *   reparte por estratos sesión × bloque propuesto, por turnos, para que ni una
 *   sesión ni el PSOE se coman la muestra.
 * - **Muestra B** (`--solo-texto`, 50): citas a las que SÓLO el texto da bloque.
 *   Contra Gemini no se pueden juzgar, así que tienen su propia cota.
 *
 * El orden dentro de cada estrato es un barajado con semilla: el mismo comando da
 * la misma hoja, y la semilla queda en la cabecera.
 *
 * La hoja NO lleva nombres de concejales, sólo el bloque propuesto por cada mapa:
 * se escucha para decir de qué bloque es la voz, y para eso no hace falta poner a
 * nadie en una tabla. La columna `escuchado_bloque` la rellena una persona;
 * `sin-identificar` es una respuesta válida.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  singleSeatBlocs,
  seatsFromOfficials,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'
import type { SpeakerMap } from '../src/scraper/speaker-map'
import { normaliseForQuoteMatch } from '../src/scraper/quote-match'
import { alignSpeakerMap, blocResolverFor, locateQuote } from '../src/scraper/speaker-map-align'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

function arg(name: string): string | null {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}
const dirA = arg('--gemini')
const dirB = arg('--texto')
const out = arg('--out')
const N = Number(arg('--n') ?? 80)
const NB = Number(arg('--solo-texto') ?? 50)
const SEMILLA = Number(arg('--semilla') ?? 20261120)
if (!dirA || !dirB || !out) {
  process.stderr.write('uso: muestra-escucha-mapa.ts --gemini DIR --texto DIR --out HOJA.tsv\n')
  process.exit(2)
}

/** mulberry32: barajado reproducible, sin dependencias. */
function aleatorio(semilla: number) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = aleatorio(SEMILLA)
const barajar = <T>(xs: T[]): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const ids = (dir: string) =>
  new Set(
    readdirSync(resolve(dir))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, '')),
  )
const A = ids(dirA)
const comunes = [...ids(dirB)].filter((id) => A.has(id)).sort()
const doc = JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')) as OfficialsDoc
const unEscano = new Set(singleSeatBlocs(seatsFromOfficials(doc)))

interface Item {
  plenoId: string
  cita: string
  /** Segundo de inicio de la línea publicada donde está la cita: donde se escucha. */
  desde: number
  etiqueta: string
  gemini: string
  texto: string
  propuesto: string
  verbatim: string
}
const poblacionA: Item[] = []
const poblacionB: Item[] = []
for (const id of comunes) {
  const published = parseDiarizedTranscript(
    readFileSync(resolve('public/data/pleno-transcripts', `${id}.txt`), 'utf8'),
  )
  const pc = resolve('public/data/pleno-claims', `${id}.json`)
  if (!existsSync(pc)) continue
  const citas = (
    JSON.parse(readFileSync(pc, 'utf8')).items as Array<{ claim: { id: string; verbatim: string } }>
  ).map((x) => x.claim)
  const leer = (d: string) =>
    JSON.parse(readFileSync(resolve(d, `${id}.json`), 'utf8')) as SpeakerMap
  const resolver = (m: SpeakerMap) =>
    blocResolverFor(published, alignSpeakerMap({ published, map: m }))
  const rg = resolver(leer(dirA))
  const rt = resolver(leer(dirB))
  // Dónde está la cita, con el mismo emparejador que blocResolverFor.
  let hay = ''
  const marcas: Array<{ at: number; i: number }> = []
  published.forEach((s, i) => {
    marcas.push({ at: hay.length, i })
    hay += normaliseForQuoteMatch(s.text) + ' '
  })
  for (const c of citas) {
    const g = rg(c.verbatim)
    const t = rt(c.verbatim)
    if (!g && !t) continue
    const { at } = locateQuote(c.verbatim, hay)
    let i = 0
    for (const m of marcas) if (m.at <= at) i = m.i
    const item: Item = {
      plenoId: id,
      cita: c.id,
      desde: published[i].start,
      etiqueta: published[i].speaker,
      gemini: g ?? '—',
      texto: t ?? '—',
      propuesto: t ?? g!,
      verbatim: c.verbatim.slice(0, 140).replace(/\t/g, ' '),
    }
    poblacionA.push(item)
    if (t && !g) poblacionB.push(item)
  }
}

/** Sorteo estratificado por sesión × bloque propuesto, por turnos. */
function estratificar(pob: Item[], n: number, obligatorios: Item[] = []): Item[] {
  const elegidos = [...obligatorios]
  const ya = new Set(elegidos)
  const estratos = new Map<string, Item[]>()
  for (const it of barajar(pob)) {
    if (ya.has(it)) continue
    const k = `${it.plenoId}|${it.propuesto}`
    estratos.set(k, [...(estratos.get(k) ?? []), it])
  }
  const colas = barajar([...estratos.values()])
  while (elegidos.length < n && colas.some((c) => c.length)) {
    for (const c of colas) {
      const it = c.shift()
      if (it && elegidos.length < n) elegidos.push(it)
    }
  }
  return elegidos
}

const deUnEscano = poblacionA.filter((it) => unEscano.has(it.gemini) || unEscano.has(it.texto))
const muestraA = estratificar(poblacionA, Math.max(N, deUnEscano.length), deUnEscano)
const enA = new Set(muestraA)
const muestraB = estratificar(
  poblacionB.filter((it) => !enA.has(it)),
  NB,
)

const cab = [
  `# Hoja de escucha · mapa de hablantes por texto · sorteada ${new Date().toISOString().slice(0, 10)} · semilla ${SEMILLA}`,
  `# Sesiones: ${comunes.join(' ')}`,
  `# A: ${muestraA.length} de ${poblacionA.length} citas extraídas con bloque en algún mapa (${deUnEscano.length} de un bloque de un escaño, todas dentro).`,
  `# B: ${muestraB.length} de ${poblacionB.length} citas con bloque SÓLO en el texto.`,
  `# Escuchar desde «desde_s» la frase de «cita» y escribir en escuchado_bloque el bloque de quien la DICE (o sin-identificar). No mirar las columnas de los mapas antes.`,
  [
    'muestra',
    'plenoId',
    'cita_id',
    'desde_s',
    'etiqueta_publicada',
    'cita',
    'escuchado_bloque',
    'oyente',
    'notas',
    'bloque_gemini',
    'bloque_texto',
  ].join('\t'),
]
const fila = (m: string, it: Item) =>
  [
    m,
    it.plenoId,
    it.cita,
    it.desde.toFixed(1),
    it.etiqueta,
    it.verbatim,
    '',
    '',
    '',
    it.gemini,
    it.texto,
  ].join('\t')
writeFileSync(
  out,
  [...cab, ...muestraA.map((it) => fila('A', it)), ...muestraB.map((it) => fila('B', it))].join(
    '\n',
  ) + '\n',
)
process.stdout.write(
  `hoja → ${out}\n  A ${muestraA.length}/${poblacionA.length} (${deUnEscano.length} de un escaño) · B ${muestraB.length}/${poblacionB.length} · ${comunes.length} sesiones\n`,
)
