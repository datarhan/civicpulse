/**
 * The deterministic half of the decision sheet `triage:senalamientos` leaves
 * after each review sweep: where, in `public/data`, does each figure a flag
 * quotes live — and does a model's proposal about the flag cite only figures
 * that exist?
 *
 * A reader-review flag is a model's reading of a page. About half of them were
 * wrong about the implication while quoting real figures, and the commonest
 * shape (the `revisar-superficies` skill's «dos cifras ciertas») is two correct
 * figures from different fields. Checking one starts the same way every time:
 * find the field behind each figure. That is mechanical, so it runs before any
 * model is asked; and a proposal whose reasoning cites a figure found neither
 * in the flag nor in the data is a confabulation, not a proposal — the same
 * rule reader-review's grounding filter applies to the flags themselves.
 *
 * Pure: the caller reads the snapshots and hands them in.
 */

export interface Cifra {
  /** As written on the page, e.g. «328.461,34». */
  raw: string
  valor: number
  /** A bare year locates nothing useful: it matches every dated row. */
  esAnio: boolean
  /** 1e6 when printed in millions («68,0 M€»): `valor` is then in millions. */
  escala?: number
  /** Decimals as printed, which is the precision it can be matched at. */
  decimales: number
}

// Thousands with dots, decimals with a comma: «1.234,56», «62,68», «805».
const NUMERO = /(?<![\w.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(?![\w])/g

// A date is not a figure: «13 de octubre», «2026-09-28» and «09/09/2026»
// split into pieces that match hundreds of unrelated rows. The year of a
// spelled-out date stays, as a year.
const MESES =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'
const FECHAS = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  new RegExp(`\\b\\d{1,2} de (?:${MESES})\\b`, 'gi'),
]

export function cifrasDe(texto: string): Cifra[] {
  const out: Cifra[] = []
  const limpio = FECHAS.reduce((t, re) => t.replace(re, ' '), texto)
  for (const m of limpio.matchAll(NUMERO)) {
    const raw = m[1]
    const valor = Number(raw.replace(/\./g, '').replace(',', '.'))
    const decimales = raw.includes(',') ? raw.split(',')[1].length : 0
    const tras = limpio.slice((m.index ?? 0) + m[0].length)
    if (/^\s*(?:M€|M\b|millones)/.test(tras)) {
      out.push({ raw: `${raw} M`, valor, esAnio: false, escala: 1e6, decimales })
      continue
    }
    // Single digits match everywhere — «3 grupos», a date's day — and so
    // locate nothing.
    if (!Number.isFinite(valor) || valor < 10) continue
    out.push({
      raw,
      valor,
      esAnio: Number.isInteger(valor) && valor >= 1900 && valor <= 2100,
      decimales,
    })
  }
  return out
}

export interface Ubicacion {
  file: string
  path: string
}

export type IndiceCifras = Map<string, Ubicacion[]>

const clave = (v: number) => v.toFixed(2)
// An amount printed in millions is matched at the precision printed: «68,0 M€»
// is every stored amount that rounds to 68.0 million.
const claveMillones = (millones: number, decimales: number) =>
  `M${decimales}:${millones.toFixed(decimales)}`
const claveDe = (c: Cifra) =>
  c.escala === 1e6 ? claveMillones(c.valor, Math.min(c.decimales, 2)) : clave(c.valor)
const POR_VALOR = 40

function anotar(indice: IndiceCifras, v: number | string, u: Ubicacion) {
  const k = typeof v === 'string' ? v : clave(v)
  const lista = indice.get(k)
  if (!lista) indice.set(k, [u])
  else if (lista.length < POR_VALOR) lista.push(u)
}

/**
 * Every number in the snapshots, keyed by value: numeric fields, list lengths
 * (a page's «805 contratos» is usually `items.length`, not a stored number),
 * and the forms a page prints a stored number in — rounded to the unit, and a
 * share as a percentage.
 */
export function indexarCifras(snapshots: Record<string, unknown>): IndiceCifras {
  const indice: IndiceCifras = new Map()
  const visitar = (file: string, x: unknown, path: string) => {
    if (typeof x === 'number' && Number.isFinite(x)) {
      const u = { file, path }
      anotar(indice, x, u)
      if (!Number.isInteger(x)) anotar(indice, Math.round(x), u)
      if (x > 0 && x <= 1) anotar(indice, Math.round(x * 1000) / 10, u)
      if (Math.abs(x) >= 1e5)
        for (const d of [0, 1, 2]) anotar(indice, claveMillones(x / 1e6, d), u)
    } else if (Array.isArray(x)) {
      anotar(indice, x.length, { file, path: `${path}.length` })
      x.forEach((v, i) => visitar(file, v, `${path}[${i}]`))
    } else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) visitar(file, v, path ? `${path}.${k}` : k)
    }
  }
  for (const [file, data] of Object.entries(snapshots)) visitar(file, data, '')
  return indice
}

export interface Localizada {
  cifra: Cifra
  ubicaciones: Ubicacion[]
  /** Found in so many places that listing them would only be noise. */
  comun: boolean
}

/** Past this many places a value locates nothing: «20» is in every table. */
export const DEMASIADO_COMUN = 12

export function localizar(cifras: Cifra[], indice: IndiceCifras, max = 5): Localizada[] {
  const vistos = new Set<string>()
  const out: Localizada[] = []
  for (const cifra of cifras) {
    const k = claveDe(cifra)
    if (vistos.has(k)) continue
    vistos.add(k)
    const todas = cifra.esAnio ? [] : (indice.get(k) ?? [])
    const comun = todas.length > DEMASIADO_COMUN
    out.push({ cifra, ubicaciones: comun ? [] : todas.slice(0, max), comun })
  }
  return out
}

export interface FlagTexto {
  quote: string
  inference: string
  contradictedBy: string
}

/**
 * Does every figure in `texto` (a model's reasoning about the flag) come from
 * the flag itself or from the data? Years are exempt — they date, they do not
 * measure.
 */
export function anclada(
  texto: string,
  flag: FlagTexto,
  indice: IndiceCifras,
  /** Other text the model was shown — the passage around the sentence. */
  pasaje = '',
): { ok: boolean; sinAncla: string[] } {
  const delFlag = new Set(
    cifrasDe(`${flag.quote} ${flag.inference} ${flag.contradictedBy} ${pasaje}`).map(claveDe),
  )
  const sinAncla = cifrasDe(texto)
    .filter((c) => !c.esAnio && !delFlag.has(claveDe(c)) && !indice.has(claveDe(c)))
    .map((c) => c.raw)
  return { ok: sinAncla.length === 0, sinAncla }
}

export interface Texto {
  file: string
  text: string
}

// What a page shows and what its source holds differ in markup: JSX breaks a
// sentence across lines, interpolates `{fecha}`, wraps a word in <em>. Both
// sides are reduced to their words before comparing.
const plano = (t: string) =>
  t
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[«»“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The passage around a flagged sentence, and the file it lives in: published
 * data for a reportaje or a ficha, the page's source for interface copy. Found
 * by five-word windows of the sentence, so a figure the page interpolates does
 * not hide it. `null` when no window is found anywhere — said, never guessed.
 */
export function contextoDe(
  quote: string,
  textos: Texto[],
  ventana = 700,
): { file: string; pasaje: string } | null {
  const palabras = plano(quote).toLowerCase().split(' ').filter(Boolean)
  const sondas: string[] = []
  for (let i = 0; i + 5 <= palabras.length; i += 3) sondas.push(palabras.slice(i, i + 5).join(' '))
  if (sondas.length === 0 && palabras.length > 0) sondas.push(palabras.join(' '))
  for (const t of textos) {
    // Compared in lower case, cut from the text as written.
    const p = plano(t.text)
    const bajo = p.toLowerCase()
    for (const sonda of sondas) {
      const i = bajo.indexOf(sonda)
      if (i < 0) continue
      const desde = Math.max(0, i - ventana)
      return {
        file: t.file,
        pasaje: `${desde > 0 ? '…' : ''}${p.slice(desde, i + sonda.length + ventana)}${i + sonda.length + ventana < p.length ? '…' : ''}`,
      }
    }
  }
  return null
}
