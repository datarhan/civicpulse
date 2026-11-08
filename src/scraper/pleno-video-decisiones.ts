/**
 * Lo que decide una persona cuando las dos fuentes de vídeo de un pleno no dicen
 * lo mismo: `public/data/pleno-video-decisiones.json`, curado, que sólo escribe
 * `npm run video:decidir`.
 *
 * `pleno-video-fuentes.ts` no deja ganar a ninguna fuente: un vídeo atado a la
 * sesión equivocada es una transcripción, y unas citas, atribuidas a otro pleno.
 * La sesión se queda sin vídeo y `check:relations` (`video-fuentes`) la pone en
 * rojo para que la lea alguien. Pero hasta el 08-11-2026 no había dónde dejar lo
 * que ese alguien decidía, así que la alerta no se podía apagar: estuvo roja
 * desde el 27-10 con dos sesiones de mayo de 2023, y una era de verdad
 * —`buag5g` llevaba desde el 01-08 la transcripción de otra sesión del mismo día.
 *
 * Una decisión guarda lo que decía cada fuente el día que se tomó (`canal`,
 * `regmeet`). Si cualquiera de las dos cambia, deja de valer y la discrepancia
 * vuelve a salir: se decidió entre unos vídeos concretos, no para siempre.
 *
 * El esquema no tiene sitio para un nombre: decide «el operador», y lo que se
 * publica es la razón y la evidencia, que cualquiera puede comprobar.
 *
 * Puro — sin red, sin fs. La CLI es `scripts/decidir-video-pleno.ts`.
 */
import {
  videoDeSesion,
  type FilaRegmeet,
  type SesionLite,
  type VideoCanal,
} from './pleno-video-fuentes'

export interface DecisionVideo {
  plenoId: string
  /** La fecha de la sesión, para leer la fila sin abrir plenos.json. */
  fecha: string
  /** El id de YouTube elegido: uno de los que daba alguna de las dos fuentes. */
  elegido: string
  /** Los ids que el canal daba a la fecha de la sesión el día de la decisión. */
  canal: string[]
  /** El id que incrustaba la página de la sesión en regmeet ese día, o null. */
  regmeet: string | null
  razon: string
  evidencia: string[]
  /** AAAA-MM-DD. */
  decididoEl: string
}

/** Lo bastante para decir por qué, no «es el de regmeet». */
export const RAZON_MINIMA = 40

const CAMPOS: ReadonlyArray<keyof DecisionVideo> = [
  'plenoId',
  'fecha',
  'elegido',
  'canal',
  'regmeet',
  'razon',
  'evidencia',
  'decididoEl',
]
const DIA = /^\d{4}-\d{2}-\d{2}$/
const YT = /^[\w-]{11}$/

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Los errores de una fila; vacío si vale. */
function erroresDeFila(f: unknown, i: number): string[] {
  const donde = `fila ${i}`
  if (!f || typeof f !== 'object' || Array.isArray(f)) return [`${donde}: no es un objeto`]
  const o = f as Record<string, unknown>
  const id = esTexto(o.plenoId) ? o.plenoId : donde
  const e: string[] = []
  for (const k of Object.keys(o))
    if (!(CAMPOS as readonly string[]).includes(k)) e.push(`${id}: campo fuera del esquema «${k}»`)
  if (!esTexto(o.plenoId)) e.push(`${donde}: sin plenoId`)
  if (!esTexto(o.fecha) || !DIA.test(o.fecha)) e.push(`${id}: fecha no es AAAA-MM-DD`)
  if (!esTexto(o.decididoEl) || !DIA.test(o.decididoEl))
    e.push(`${id}: decididoEl no es AAAA-MM-DD`)
  if (!esTexto(o.elegido) || !YT.test(o.elegido)) e.push(`${id}: elegido no es un id de YouTube`)
  const canal = Array.isArray(o.canal) ? o.canal : null
  if (!canal || !canal.every((c) => esTexto(c) && YT.test(c)))
    e.push(`${id}: canal no es una lista de ids de YouTube`)
  if (o.regmeet !== null && !(esTexto(o.regmeet) && YT.test(o.regmeet)))
    e.push(`${id}: regmeet no es un id de YouTube ni null`)
  if (canal && esTexto(o.elegido) && !canal.includes(o.elegido) && o.regmeet !== o.elegido)
    e.push(`${id}: elegido ${o.elegido} no lo daba ninguna fuente`)
  if (!esTexto(o.razon) || o.razon.trim().length < RAZON_MINIMA)
    e.push(`${id}: la razón tiene que decir por qué (≥ ${RAZON_MINIMA} caracteres)`)
  if (!Array.isArray(o.evidencia) || o.evidencia.length === 0 || !o.evidencia.every(esTexto))
    e.push(`${id}: sin evidencia`)
  return e
}

/** Valida el fichero entero. Una fila con errores no entra en `items`. */
export function validarDecisiones(json: unknown): { items: DecisionVideo[]; errores: string[] } {
  const filas = (json as { items?: unknown } | null)?.items
  if (!Array.isArray(filas)) return { items: [], errores: ['el fichero no tiene items'] }
  const items: DecisionVideo[] = []
  const errores: string[] = []
  const vistos = new Set<string>()
  filas.forEach((f, i) => {
    const e = erroresDeFila(f, i)
    const id = (f as { plenoId?: unknown })?.plenoId
    if (typeof id === 'string') {
      if (vistos.has(id)) e.push(`${id}: dos decisiones para la misma sesión`)
      vistos.add(id)
    }
    if (e.length > 0) errores.push(...e)
    else items.push(f as DecisionVideo)
  })
  return { items, errores }
}

/**
 * Vale mientras las dos fuentes digan lo mismo que el día de la decisión: los
 * mismos ids del canal para la fecha (en cualquier orden) y el mismo de regmeet.
 */
export function decisionVigente(
  d: DecisionVideo,
  canal: readonly string[],
  regmeet: string | null,
): boolean {
  const a = [...d.canal].sort()
  const b = [...canal].sort()
  return d.regmeet === regmeet && a.length === b.length && a.every((x, i) => x === b[i])
}

export interface PeticionDecision {
  plenoId: string
  elegido: string
  razon: string
  evidencia: string[]
  /** AAAA-MM-DD; la CLI pasa el día de hoy. */
  hoy: string
}

export interface DatosDecision {
  plenos: readonly SesionLite[]
  canal: readonly VideoCanal[]
  regmeet: readonly FilaRegmeet[]
  existentes: readonly DecisionVideo[]
}

/**
 * La fila que la CLI escribirá, o un error que dice por qué no. Sólo se decide
 * lo que hoy discrepa, entre los vídeos que hoy da alguna fuente, y una sesión
 * decidida no se re-decide por encima: se retira primero y queda en git.
 */
export function prepararDecision(p: PeticionDecision, datos: DatosDecision): DecisionVideo {
  const sesion = datos.plenos.find((s) => s.id === p.plenoId)
  if (!sesion) throw new Error(`la sesión ${p.plenoId} no existe en plenos.json`)
  if (datos.existentes.some((d) => d.plenoId === p.plenoId))
    throw new Error(`${p.plenoId} ya tiene una decisión: retírala antes de tomar otra`)
  const r = videoDeSesion(sesion, datos.canal, datos.regmeet)
  if (r.estado !== 'discrepan')
    throw new Error(
      `en ${p.plenoId} las fuentes no discrepan (${r.estado}): no hay nada que decidir`,
    )
  const canal = datos.canal.filter((v) => v.plenoDate === sesion.date).map((v) => v.ytId)
  const fila = datos.regmeet.find((f) => f.plenoId === sesion.id)
  const regmeet = fila?.lectura === 'con-video' && fila.ytId ? fila.ytId : null
  if (!canal.includes(p.elegido) && regmeet !== p.elegido)
    throw new Error(
      `${p.elegido} no lo da ninguna fuente para ${p.plenoId}: canal ${canal.join(', ') || '—'}, regmeet ${regmeet ?? '—'}`,
    )
  const decision: DecisionVideo = {
    plenoId: sesion.id,
    fecha: sesion.date,
    elegido: p.elegido,
    canal,
    regmeet,
    razon: p.razon.trim(),
    evidencia: p.evidencia.map((e) => e.trim()),
    decididoEl: p.hoy,
  }
  const { errores } = validarDecisiones({ items: [decision] })
  if (errores.length > 0) throw new Error(errores.join('; '))
  return decision
}
