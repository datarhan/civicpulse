/**
 * Síndic de Greuges de la Comunitat Valenciana — curated resoluciones
 * schema + validator.
 *
 * CORRECCIÓN 2026-08-24. Esta cabecera decía que el portal era «JS-rendered
 * behind an Oracle APEX-style POST with viewstate» y que automatizarlo era
 * «low-value-high-effort» para «~1–5 resoluciones per year». Las dos mitades
 * eran falsas, y la frase es la razón por la que nadie volvió a mirar durante
 * 125 días mientras este fichero publicaba un cero:
 *
 *   · elsindic.com es WordPress con un buscador Elasticsearch. Se consulta por
 *     POST a `wp-admin/admin-ajax.php?action=buscador_expedientes_elastic_search`,
 *     que el `robots.txt` del propio organismo permite de forma explícita.
 *   · Contra este ayuntamiento hay 38 expedientes entre 2013 y 2026, no 1–5 al
 *     año, y 14 de ellos con «Resolución de consideraciones a la Administración».
 *
 * El índice transcrito vive ahora en `sindic-expedientes.ts` y se raspa solo.
 * Este fichero sigue siendo CURADO, y la división es la que importa: el índice
 * copia un registro público sin emitir juicio; una ficha de aquí lleva el
 * `resumen` VERBATIM leído del PDF y un `sentido` que alguien ha decidido. Eso
 * no lo puede escribir un cron. Un moderador las añade con `npm run sindic:add`
 * y cada una lleva número de resolución, fecha, URL al PDF en elsindic.com,
 * materia, sentido (fallo) y, si aplica, la queja enlazada de nuestra base.
 *
 * This file is the single source of truth for the schema. The CLI
 * rejects any input that doesn't validate here.
 */

export const ALLOWED_SENTIDOS = [
  'recomendacion',
  'sugerencia',
  'recordatorio-deberes',
  'cierre-sin-recomendacion',
  'inadmitida',
  'archivada',
] as const
export type SindicSentido = (typeof ALLOWED_SENTIDOS)[number]

export const ALLOWED_MATERIAS = [
  'urbanismo',
  'vivienda',
  'medio-ambiente',
  'via-publica',
  'servicios-publicos',
  'seguridad',
  'hacienda-tributaria',
  'transparencia',
  'contratacion',
  'servicios-sociales',
  'salud',
  'educacion',
  'igualdad',
  'cultura',
  'otros',
] as const
export type SindicMateria = (typeof ALLOWED_MATERIAS)[number]

export interface SindicResolucion {
  id: string // e.g. "sindic-202400427"
  expediente: string // Síndic's internal nº (e.g. "202400427")
  fecha: string // ISO date yyyy-mm-dd
  materia: SindicMateria
  sentido: SindicSentido
  titulo: string // short description (≤200 chars)
  resumen: string // verbatim resumen (≤2000 chars, no editorial)
  urlPdf: string // https://www.elsindic.com/... full PDF
  quejaIdRelacionada: string | null // our Q-XXX if linked, else null
}

export interface SindicSnapshot {
  generatedAt: string
  note: string
  source: {
    platform: string
    portal: string
  }
  items: SindicResolucion[]
}

/**
 * El id de una ficha, DERIVADO de su PDF.
 *
 * Era `sindic-<expediente>`, y colisionaba: un expediente lleva varias
 * resoluciones —202502231 tiene «consideraciones» el 22/07/2025 y «cierre» el
 * 10/09/2025— así que la segunda ficha del mismo expediente habría chocado con
 * la primera y el CLI la habría rechazado como duplicada. Con el registro a 0
 * filas nunca llegó a pasar; se arregla ahora porque arreglarlo después habría
 * pedido migrar ids ya publicados.
 *
 * Lo único único por resolución es el documento: el buscador del Síndic sirve
 * cada PDF en `/resoluciones/expedientes/<año>/<expediente>/<docId>.pdf`.
 */
export function idResolucion(expediente: string, urlPdf: string): string {
  const doc = (urlPdf.split('?')[0].split('/').pop() ?? '').replace(/\.pdf$/i, '')
  if (!/^[0-9A-Za-z._-]+$/.test(doc))
    throw new Error(`urlPdf must end in a document filename: got ${JSON.stringify(urlPdf)}`)
  return `sindic-${expediente}-${doc}`
}

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/
const quejaIdRe = /^Q-[0-9A-Z]{4,}$/

export function validateResolucion(r: unknown): SindicResolucion {
  if (!r || typeof r !== 'object') throw new Error('resolucion must be an object')
  const o = r as Record<string, unknown>

  const id = String(o.id ?? '').trim()
  if (!id.startsWith('sindic-'))
    throw new Error(`id must start with 'sindic-': got ${JSON.stringify(id)}`)

  const expediente = String(o.expediente ?? '').trim()
  if (!/^[0-9]{5,}$/.test(expediente))
    throw new Error(`expediente must be all-digits (≥5): got ${JSON.stringify(expediente)}`)

  const fecha = String(o.fecha ?? '').trim()
  if (!isoDateRe.test(fecha))
    throw new Error(`fecha must be ISO YYYY-MM-DD: got ${JSON.stringify(fecha)}`)

  const materia = String(o.materia ?? '') as SindicMateria
  if (!ALLOWED_MATERIAS.includes(materia))
    throw new Error(`materia not allowed: ${JSON.stringify(materia)}`)

  const sentido = String(o.sentido ?? '') as SindicSentido
  if (!ALLOWED_SENTIDOS.includes(sentido))
    throw new Error(`sentido not allowed: ${JSON.stringify(sentido)}`)

  const titulo = String(o.titulo ?? '').trim()
  if (titulo.length < 10 || titulo.length > 200)
    throw new Error(`titulo length must be 10–200 chars: got ${titulo.length}`)

  const resumen = String(o.resumen ?? '').trim()
  if (resumen.length < 20 || resumen.length > 2000)
    throw new Error(`resumen length must be 20–2000 chars: got ${resumen.length}`)

  const urlPdf = String(o.urlPdf ?? '').trim()
  if (!/^https:\/\/(www\.)?elsindic\.com\//.test(urlPdf))
    throw new Error(`urlPdf must live on elsindic.com: got ${JSON.stringify(urlPdf)}`)

  const qRaw = o.quejaIdRelacionada
  const quejaIdRelacionada =
    qRaw === null || qRaw === undefined || qRaw === '' ? null : String(qRaw).trim().toUpperCase()
  if (quejaIdRelacionada && !quejaIdRe.test(quejaIdRelacionada))
    throw new Error(
      `quejaIdRelacionada must match ${quejaIdRe}: got ${JSON.stringify(quejaIdRelacionada)}`,
    )

  // El id se comprueba aquí y no arriba porque hasta ahora no había con qué
  // derivarlo. Comprobar la derivación —y no sólo el prefijo— es lo que impide
  // que un fichero editado a mano reintroduzca la colisión que el CLI evita.
  const esperado = idResolucion(expediente, urlPdf)
  if (id !== esperado)
    throw new Error(`id must be derived from expediente + urlPdf: expected ${esperado}, got ${id}`)

  return {
    id,
    expediente,
    fecha,
    materia,
    sentido,
    titulo,
    resumen,
    urlPdf,
    quejaIdRelacionada,
  }
}

export function validateSnapshot(raw: unknown): SindicSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error('snapshot must be an object')
  const o = raw as Record<string, unknown>
  const items = Array.isArray(o.items) ? o.items.map(validateResolucion) : []
  const ids = new Set<string>()
  for (const it of items) {
    if (ids.has(it.id)) throw new Error(`duplicate resolucion id: ${it.id}`)
    ids.add(it.id)
  }
  // Enforce chronological order (newest first) when there are ≥ 2 items.
  for (let i = 1; i < items.length; i++) {
    if (items[i - 1].fecha < items[i].fecha) {
      throw new Error(
        `items must be sorted newest first: ${items[i - 1].id} precedes ${items[i].id}`,
      )
    }
  }
  return {
    generatedAt: String(o.generatedAt ?? new Date().toISOString()),
    note: String(o.note ?? ''),
    source: {
      platform: 'Síndic de Greuges de la Comunitat Valenciana',
      portal: 'https://www.elsindic.com',
    },
    items,
  }
}

export function stats(snap: SindicSnapshot) {
  const bySentido: Record<string, number> = {}
  const byMateria: Record<string, number> = {}
  const withQueja = snap.items.filter((i) => i.quejaIdRelacionada).length
  for (const i of snap.items) {
    bySentido[i.sentido] = (bySentido[i.sentido] ?? 0) + 1
    byMateria[i.materia] = (byMateria[i.materia] ?? 0) + 1
  }
  return {
    total: snap.items.length,
    bySentido,
    byMateria,
    withQuejaRelacionada: withQueja,
  }
}
