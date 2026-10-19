/**
 * Correcciones curadas del registro de contratos — validador, mezcla y guarda.
 *
 * `public/data/tenders.json` se raspa cada noche del Gobierto municipal
 * (ribalicita), y Gobierto puede publicar mal el estado de un contrato que la
 * Plataforma de Contratación tiene bien. El caso que abrió este fichero,
 * cotejado el 2026-10-19: 51/2022, el cambio a LED del alumbrado del casco
 * urbano, adjudicado a EIFFAGE ENERGÍA, S.L.U. y formalizado el 21-02-2023 por
 * 481.777,60 € sin IVA. El 11-01-2024 el Ayuntamiento anuló el ANUNCIO de
 * formalización —«Pendiente publicación referida la financiación del contrato a
 * través de los fondos FEDER»— y no volvió a publicarlo; Gobierto lo tradujo a
 * `revoked` y dejó la adjudicataria en blanco. /presupuesto lo pintaba
 * «Renuncia», fuera del dinero comprometido.
 *
 * La capa automática del parser (`sinEstadoImposible`, tenders.ts) ya quita ese
 * estado imposible, pero sólo puede dejar el centinela: del registro sabe que
 * el estado es falso, no cuál es el bueno. Restituirlo —un estado comprometido
 * y una empresa con nombre junto a una cifra— lo decide una persona con el
 * anuncio delante. Así que vive aquí, en un fichero CURADO que sólo escribe
 * `npm run contract-correction`, y se aplica en `scripts/scrape-tenders.ts`
 * después de parsear, como `officials-corrections.ts` hace con el padrón.
 *
 * ## Lo que una corrección puede decir
 *
 * Sólo lo que dice un anuncio de la Plataforma: que el contrato está
 * adjudicado o formalizado y con quién, con la cita literal del anuncio que lo
 * dice y la del que explica por qué el registro lo publica mal. No hay campo
 * para un juicio: el validador rechaza a cualquier profundidad los mismos
 * campos que `competencias.ts`. Y sólo restituye un estado COMPROMETIDO: para
 * quitar uno ya está la capa automática, y para inventar una cancelación no hay
 * puerta.
 *
 * ## Una corrección que ya no corrige no se aplica, y se dice
 *
 * Si Gobierto ya publica la fila bien, si la fila no está, o si nombra a otra
 * adjudicataria, la corrección no se aplica y la pasada la anota en
 * `contractCorrections.sobran`. No lanza: en el padrón, lanzar tumbó el
 * adaptador entero (`scripts/scrape-officials.ts` lo cuenta), y aquí se
 * llevaría por delante los 813 contratos de la noche por uno. La guarda
 * `check:contract-corrections` sale con 1 por ella, y el parte de salud la
 * manda: hay que retirarla con `--retirar` para que el fichero no afirme una
 * discrepancia que ya no existe.
 *
 * La fila se busca por enlace y número de lote, no por `id`: el parser numera
 * los ids repetidos (`#1`, `#2`) por orden de aparición en el CSV, y ese orden
 * no es estable de una noche a otra.
 */
import { CAMPOS_PROHIBIDOS } from './competencias'
import type { Contract, ContractStatus } from './tenders'

/** Lo único que una corrección puede restituir: un estado comprometido. */
export const ESTADOS_CORREGIDOS = [
  'formalized',
  'awarded',
] as const satisfies readonly ContractStatus[]
export type EstadoCorregido = (typeof ESTADOS_CORREGIDOS)[number]

export interface FuenteContrato {
  title: string
  /** La ficha de la licitación en la Plataforma, que enumera el anuncio. */
  url: string
  /** YYYY-MM-DD de publicación del anuncio citado. */
  date: string
  /** Literal del anuncio, ≥20 caracteres; la prueba lo busca en la fixture. */
  quote: string
}

export interface CorreccionContrato {
  permalink: string
  /** `batchNumber` de la fila; 0 cuando el expediente no tiene lotes. */
  lote: number
  /** El `id` que la fila tenía al firmar; sólo para leerla, no para buscarla. */
  id: string
  status: EstadoCorregido
  /** La adjudicataria, como la escribe el anuncio. */
  assignee: string
  /** Por qué el registro lo publica mal, en una frase. */
  motivo: string
  /** El anuncio que dice el estado y la adjudicataria. */
  source: FuenteContrato
  /** El anuncio que explica la discrepancia (p. ej. una anulación de anuncio). */
  motivoSource: FuenteContrato
  curatedBy: string
  curatedAt: string
}

export interface ContractCorrections {
  note: string
  corrections: CorreccionContrato[]
}

/** La marca que lleva una fila corregida en el fichero publicado. */
export interface MarcaCorreccion {
  url: string
  motivo: string
  curatedAt: string
}

export type ContratoCorregido = Contract & { correccion?: MarcaCorreccion }

export interface FilaRef {
  permalink: string
  lote: number
  id: string
}

export type PorQueSobra = 'sin-fila' | 'ya-corregida-en-origen' | 'adjudicataria-distinta'

export interface Sobrante extends FilaRef {
  porque: PorQueSobra
}

export class ContractCorrectionsError extends Error {}

const esTexto = (v: unknown, min = 1): v is string =>
  typeof v === 'string' && v.trim().length >= min
const esFecha = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const esUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/\S+$/.test(v)
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

function barrerProhibidos(v: unknown, donde: string, errores: string[]): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => barrerProhibidos(x, `${donde}[${i}]`, errores))
    return
  }
  if (!esObjeto(v)) return
  for (const [k, x] of Object.entries(v)) {
    const ruta = donde ? `${donde}.${k}` : k
    if (CAMPOS_PROHIBIDOS.has(k)) errores.push(`${ruta}: campo con forma de juicio, prohibido`)
    barrerProhibidos(x, ruta, errores)
  }
}

function validarFuente(f: unknown, donde: string, errores: string[]): void {
  if (!esObjeto(f)) {
    errores.push(`${donde} debe ser un objeto {title, url, date, quote}`)
    return
  }
  if (!esTexto(f.title, 10)) errores.push(`${donde}.title vacío (≥10 caracteres)`)
  if (!esUrl(f.url)) errores.push(`${donde}.url debe ser una URL absoluta`)
  if (!esFecha(f.date)) errores.push(`${donde}.date debe ser YYYY-MM-DD`)
  if (!esTexto(f.quote, 20))
    errores.push(`${donde}.quote: cita literal del anuncio (≥20 caracteres)`)
}

const clave = (permalink: string, lote: number) => `${permalink}#${lote}`

export function validateContractCorrections(json: unknown): ContractCorrections {
  if (!esObjeto(json))
    throw new ContractCorrectionsError('contract-corrections: debe ser un objeto')
  const errores: string[] = []
  barrerProhibidos(json, '', errores)
  if (!esTexto(json.note, 20)) errores.push('note vacía: dice qué es este fichero a quien lo abra')
  if (!Array.isArray(json.corrections)) errores.push('corrections debe ser una lista')
  const vistas = new Set<string>()
  for (const [i, c] of (Array.isArray(json.corrections) ? json.corrections : []).entries()) {
    const d = `corrections[${i}]`
    if (!esObjeto(c)) {
      errores.push(`${d} debe ser un objeto`)
      continue
    }
    if (!esUrl(c.permalink)) errores.push(`${d}.permalink debe ser una URL absoluta`)
    if (!Number.isInteger(c.lote) || (c.lote as number) < 0)
      errores.push(`${d}.lote debe ser un entero ≥ 0`)
    if (!esTexto(c.id)) errores.push(`${d}.id vacío`)
    if (!ESTADOS_CORREGIDOS.includes(c.status as EstadoCorregido))
      errores.push(`${d}.status debe ser uno de ${ESTADOS_CORREGIDOS.join(', ')}`)
    if (!esTexto(c.assignee, 3)) errores.push(`${d}.assignee vacío`)
    if (!esTexto(c.motivo, 30)) errores.push(`${d}.motivo: una frase (≥30 caracteres)`)
    validarFuente(c.source, `${d}.source`, errores)
    validarFuente(c.motivoSource, `${d}.motivoSource`, errores)
    if (!esTexto(c.curatedBy)) errores.push(`${d}.curatedBy vacío: lo firma una persona`)
    if (!esFecha(c.curatedAt)) errores.push(`${d}.curatedAt debe ser YYYY-MM-DD`)
    if (esUrl(c.permalink) && Number.isInteger(c.lote)) {
      const k = clave(c.permalink, c.lote as number)
      if (vistas.has(k)) errores.push(`${d}: corrección duplicada para ${k}`)
      vistas.add(k)
    }
  }
  if (errores.length > 0)
    throw new ContractCorrectionsError(
      `contract-corrections inválido:\n  - ${errores.join('\n  - ')}`,
    )
  return json as unknown as ContractCorrections
}

const normalizarNombre = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()

/**
 * Aplica las correcciones sobre las filas PARSEADAS. Nunca muta la entrada.
 * Una corrección que no corrige nada no se aplica y vuelve en `sobran`.
 */
export function applyContractCorrections(
  contracts: Contract[],
  corrections: ContractCorrections | null,
): { contracts: ContratoCorregido[]; aplicadas: FilaRef[]; sobran: Sobrante[] } {
  const out: ContratoCorregido[] = contracts.map((c) => ({ ...c }))
  const aplicadas: FilaRef[] = []
  const sobran: Sobrante[] = []
  for (const k of corrections?.corrections ?? []) {
    const ref: FilaRef = { permalink: k.permalink, lote: k.lote, id: k.id }
    const i = out.findIndex((c) => c.permalink === k.permalink && c.batchNumber === k.lote)
    if (i === -1) {
      sobran.push({ ...ref, porque: 'sin-fila' })
      continue
    }
    const fila = out[i]
    if (ESTADOS_CORREGIDOS.includes(fila.status as EstadoCorregido)) {
      sobran.push({ ...ref, porque: 'ya-corregida-en-origen' })
      continue
    }
    if (fila.assignee && normalizarNombre(fila.assignee) !== normalizarNombre(k.assignee)) {
      sobran.push({ ...ref, porque: 'adjudicataria-distinta' })
      continue
    }
    out[i] = {
      ...fila,
      status: k.status,
      assignee: k.assignee,
      sourceStatus: fila.sourceStatus ?? fila.status,
      correccion: { url: k.source.url, motivo: k.motivo, curatedAt: k.curatedAt },
    }
    aplicadas.push(ref)
  }
  return { contracts: out, aplicadas, sobran }
}

export type DesenlaceCorreccion = 'aplicada' | 'pendiente' | 'no-aplicada' | 'sobra'

/**
 * Lo que la guarda dice de cada corrección frente al `tenders.json` publicado.
 *
 * `pendiente` cuando el fichero es anterior a la firma: la corrección todavía no
 * ha pasado por ninguna nocturna, y llamarla «no aplicada» sería un rojo que
 * nadie puede arreglar más que esperando.
 */
export function evaluarCorrecciones(
  corrections: ContractCorrections,
  snapshot: {
    generatedAt?: string
    contracts?: ContratoCorregido[]
    contractCorrections?: { sobran?: Sobrante[] }
  },
): (FilaRef & { desenlace: DesenlaceCorreccion; detalle: string })[] {
  const generado = Date.parse(snapshot.generatedAt ?? '')
  return corrections.corrections.map((k) => {
    const ref: FilaRef = { permalink: k.permalink, lote: k.lote, id: k.id }
    const sobra = (snapshot.contractCorrections?.sobran ?? []).find(
      (s) => s.permalink === k.permalink && s.lote === k.lote,
    )
    if (sobra) return { ...ref, desenlace: 'sobra', detalle: sobra.porque }
    const fila = (snapshot.contracts ?? []).find(
      (c) => c.permalink === k.permalink && c.batchNumber === k.lote,
    )
    if (fila?.correccion && fila.status === k.status)
      return { ...ref, desenlace: 'aplicada', detalle: `${fila.sourceStatus} → ${fila.status}` }
    // Un día entero de margen: la firma es una fecha y la pasada, un instante.
    if (!Number.isFinite(generado) || generado < Date.parse(k.curatedAt) + 86_400_000)
      return {
        ...ref,
        desenlace: 'pendiente',
        detalle: `tenders.json es de ${snapshot.generatedAt ?? '¿?'}, anterior a la firma (${k.curatedAt})`,
      }
    return {
      ...ref,
      desenlace: 'no-aplicada',
      detalle: fila ? `la fila publicada dice «${fila.status}»` : 'la fila no está en tenders.json',
    }
  })
}
