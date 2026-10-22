/**
 * La opinión del editor: el único sitio de /eficiencia donde un juicio y un
 * nombre pueden ir juntos.
 *
 * ## Por qué existe
 *
 * El panel se niega a poner nota, y con razón: una cifra del ministerio no dice
 * si un servicio va bien, y ninguna máquina debe decidirlo. Pero el vecino
 * llega preguntando exactamente eso, y una página que nunca contesta se queda
 * en un archivo. La salida es la de cualquier periódico: los datos van en su
 * sitio, neutros, y la OPINIÓN va aparte, firmada por una persona, rotulada
 * como opinión y con sus hechos enlazados. Diseño:
 * docs/superpowers/specs/2026-10-22-lectura-vecinal-eficiencia-design.md §3.
 *
 * ## Lo que este esquema impide, no sólo pide
 *
 *  · **Ninguna máquina la escribe.** `requiresHumanApproval`, y cualquier campo
 *    con forma de procedencia automática (`modelo`, `generadoPor`, `llm`…), se
 *    rechaza en cualquier profundidad. La firma es de una persona con nombre.
 *  · **Sin hechos no hay opinión.** `hechos` no puede ir vacío y cada uno es un
 *    id que `check:opiniones` resuelve contra el panel publicado. La
 *    jurisprudencia protege la opinión más que la información, pero exige base
 *    fáctica suficiente; un juicio que insinúa un hecho falso se juzga como
 *    información.
 *  · **«Lo que no sabemos» es obligatorio.** Una opinión que no dice dónde se
 *    acaba lo que sabe se lee como certeza.
 *  · **Nombrar tiene condiciones.** Cada persona nombrada lleva la clave de
 *    `competencias.json` por la que se la nombra y el periodo que la opinión le
 *    atribuye, que tiene que caer dentro de su delegación (lo comprueba
 *    `comprobarNombres`). Y una opinión que nombra a alguien no se publica sin
 *    contacto previo: el texto enviado, el canal y un plazo de al menos
 *    `PLAZO_MINIMO_DIAS`, ya vencido el día de publicación.
 *  · **Nada se reescribe en silencio.** Corregir guarda lo anterior en
 *    `correcciones`; retirar deja la fila en `retiradas` con su motivo.
 *
 * Durante la ventana LOREG, la página no pinta ninguna opinión que nombre a
 * alguien (`opinionesVisibles`).
 */

/** Días mínimos entre enviar el texto a quien se nombra y publicarlo. */
export const PLAZO_MINIMO_DIAS = 7

export const TIPOS_HECHO = ['indicador', 'resultado', 'hallazgo'] as const
export type TipoHecho = (typeof TIPOS_HECHO)[number]

export const PANELES = ['coste-efectivo', 'gestion'] as const
export type Panel = (typeof PANELES)[number]

/**
 * Campos que delatan una procedencia automática. Rechazados en cualquier
 * profundidad: si aparecen, alguien pegó un borrador de máquina en el fichero
 * publicado.
 */
export const CAMPOS_PROHIBIDOS: ReadonlySet<string> = new Set([
  'requiresHumanApproval',
  'modelo',
  'model',
  'llm',
  'generadoPor',
  'generatedBy',
  'prompt',
])

export interface Hecho {
  tipo: TipoHecho
  /** Id de un indicador, de un resultado o de un hallazgo firmado del panel. */
  id: string
  /** Opcional: el año y el valor que la opinión cita, para cotejarlos. */
  anio?: number
  valor?: number
}

export interface PersonaNombrada {
  /** Slug de `officials.json`, el mismo que firma `competencias.json`. */
  oficial: string
  nombre: string
  /** Clave de `competencias.json` por la que se la nombra. */
  clave: string
  /** Periodo que la opinión le atribuye (ISO). */
  periodo: { desde: string; hasta: string }
}

export interface ContactoPrevio {
  enviadoEl: string
  canal: string
  plazoDias: number
  /** null mientras no conteste: el silencio se publica como silencio. */
  respuesta: { fecha: string; texto: string; url?: string } | null
}

export interface Replica {
  fecha: string
  autor: string
  /** Íntegra y verbatim, como toda réplica de este sitio. */
  texto: string
  url?: string
}

export interface Correccion {
  fecha: string
  motivo: string
  /** El texto que había, para que la corrección se pueda comprobar. */
  antes: { titulo: string; cuerpo: string[] }
}

export interface OpinionEditor {
  id: string
  panel: Panel
  titulo: string
  cuerpo: string[]
  firma: { nombre: string; rol: string }
  fecha: string
  hechos: Hecho[]
  noSabemos: string[]
  nombra: PersonaNombrada[]
  contactoPrevio: ContactoPrevio | null
  replicas: Replica[]
  correcciones: Correccion[]
}

export interface OpinionesSnapshot {
  version: 1
  actualizadoEl: string
  items: OpinionEditor[]
  retiradas: { id: string; fecha: string; motivo: string }[]
}

export class OpinionEditorValidationError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'OpinionEditorValidationError'
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const SLUG = /^[a-z0-9][a-z0-9-]{2,80}$/

function falla(donde: string, msg: string): never {
  throw new OpinionEditorValidationError(`${donde}: ${msg}`)
}

const texto = (v: unknown, donde: string, min = 1): string => {
  if (typeof v !== 'string' || v.trim().length < min)
    falla(donde, `texto obligatorio (≥${min} caracteres)`)
  return v
}

const fecha = (v: unknown, donde: string): string => {
  if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v)))
    falla(donde, 'fecha ISO YYYY-MM-DD')
  return v
}

/** Días entre dos fechas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
}

function barreProhibidos(v: unknown, ruta: string): void {
  if (Array.isArray(v)) v.forEach((x, i) => barreProhibidos(x, `${ruta}[${i}]`))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (CAMPOS_PROHIBIDOS.has(k))
        falla(
          `${ruta}.${k}`,
          'campo de procedencia automática: una opinión la escribe y la firma una persona',
        )
      barreProhibidos(x, `${ruta}.${k}`)
    }
}

export function validarOpinion(o: unknown, donde = 'opinion'): OpinionEditor {
  if (!o || typeof o !== 'object') falla(donde, 'no es un objeto')
  const x = o as Record<string, unknown>
  if (typeof x.id !== 'string' || !SLUG.test(x.id)) falla(`${donde}.id`, 'slug en minúsculas')
  const d = `opinion «${x.id}»`
  if (!(PANELES as readonly string[]).includes(x.panel as string))
    falla(`${d}.panel`, `uno de ${PANELES.join(', ')}`)
  texto(x.titulo, `${d}.titulo`, 10)
  if (!Array.isArray(x.cuerpo) || x.cuerpo.length === 0) falla(`${d}.cuerpo`, 'al menos un párrafo')
  x.cuerpo.forEach((p, i) => texto(p, `${d}.cuerpo[${i}]`, 20))

  const firma = x.firma as Record<string, unknown> | undefined
  if (!firma) falla(`${d}.firma`, 'obligatoria')
  const nombre = texto(firma.nombre, `${d}.firma.nombre`, 3)
  // Una persona, no «la redacción»: la responsabilidad necesita un nombre a
  // cada lado.
  if (nombre.trim().split(/\s+/).length < 2)
    falla(`${d}.firma.nombre`, 'nombre y apellido de una persona, no un colectivo')
  texto(firma.rol, `${d}.firma.rol`, 3)
  fecha(x.fecha, `${d}.fecha`)

  if (!Array.isArray(x.hechos) || x.hechos.length === 0)
    falla(`${d}.hechos`, 'sin hechos no hay opinión: al menos uno')
  x.hechos.forEach((h, i) => {
    const hh = h as Record<string, unknown>
    if (!(TIPOS_HECHO as readonly string[]).includes(hh.tipo as string))
      falla(`${d}.hechos[${i}].tipo`, `uno de ${TIPOS_HECHO.join(', ')}`)
    texto(hh.id, `${d}.hechos[${i}].id`)
    if ((hh.anio == null) !== (hh.valor == null))
      falla(`${d}.hechos[${i}]`, 'anio y valor van juntos o ninguno')
  })

  if (!Array.isArray(x.noSabemos) || x.noSabemos.length === 0)
    falla(`${d}.noSabemos`, '«lo que no sabemos» es obligatorio')
  x.noSabemos.forEach((n, i) => texto(n, `${d}.noSabemos[${i}]`, 20))

  if (!Array.isArray(x.nombra)) falla(`${d}.nombra`, 'lista (vacía si no nombra a nadie)')
  x.nombra.forEach((p, i) => {
    const pp = p as Record<string, unknown>
    texto(pp.oficial, `${d}.nombra[${i}].oficial`)
    texto(pp.nombre, `${d}.nombra[${i}].nombre`)
    texto(pp.clave, `${d}.nombra[${i}].clave`)
    const per = pp.periodo as Record<string, unknown> | undefined
    if (!per) falla(`${d}.nombra[${i}].periodo`, 'obligatorio: qué periodo se le atribuye')
    fecha(per.desde, `${d}.nombra[${i}].periodo.desde`)
    fecha(per.hasta, `${d}.nombra[${i}].periodo.hasta`)
    if ((per.desde as string) > (per.hasta as string))
      falla(`${d}.nombra[${i}].periodo`, 'desde posterior a hasta')
  })

  const c = x.contactoPrevio as Record<string, unknown> | null | undefined
  if (x.nombra.length > 0) {
    if (!c) falla(`${d}.contactoPrevio`, 'una opinión que nombra a alguien exige contacto previo')
    fecha(c.enviadoEl, `${d}.contactoPrevio.enviadoEl`)
    texto(c.canal, `${d}.contactoPrevio.canal`)
    if (typeof c.plazoDias !== 'number' || c.plazoDias < PLAZO_MINIMO_DIAS)
      falla(`${d}.contactoPrevio.plazoDias`, `al menos ${PLAZO_MINIMO_DIAS} días`)
    if (diasEntre(c.enviadoEl as string, x.fecha as string) < c.plazoDias)
      falla(
        `${d}.fecha`,
        `se publica antes de que venza el plazo de réplica (${c.plazoDias} días desde ${c.enviadoEl})`,
      )
    if (c.respuesta != null) {
      const r = c.respuesta as Record<string, unknown>
      fecha(r.fecha, `${d}.contactoPrevio.respuesta.fecha`)
      texto(r.texto, `${d}.contactoPrevio.respuesta.texto`)
    }
  }

  if (!Array.isArray(x.replicas)) falla(`${d}.replicas`, 'lista')
  x.replicas.forEach((r, i) => {
    const rr = r as Record<string, unknown>
    fecha(rr.fecha, `${d}.replicas[${i}].fecha`)
    texto(rr.autor, `${d}.replicas[${i}].autor`)
    texto(rr.texto, `${d}.replicas[${i}].texto`)
  })
  if (!Array.isArray(x.correcciones)) falla(`${d}.correcciones`, 'lista')
  x.correcciones.forEach((r, i) => {
    const rr = r as Record<string, unknown>
    fecha(rr.fecha, `${d}.correcciones[${i}].fecha`)
    texto(rr.motivo, `${d}.correcciones[${i}].motivo`, 10)
    const antes = rr.antes as Record<string, unknown> | undefined
    if (!antes || typeof antes.titulo !== 'string' || !Array.isArray(antes.cuerpo))
      falla(`${d}.correcciones[${i}].antes`, 'el texto anterior entero')
  })
  return o as OpinionEditor
}

export function validarOpinionesSnapshot(json: string): OpinionesSnapshot {
  let s: unknown
  try {
    s = JSON.parse(json)
  } catch (e) {
    throw new OpinionEditorValidationError(`JSON inválido: ${(e as Error).message}`)
  }
  barreProhibidos(s, 'opiniones')
  const x = s as Record<string, unknown>
  if (x.version !== 1) falla('opiniones.version', 'debe ser 1')
  fecha(x.actualizadoEl, 'opiniones.actualizadoEl')
  if (!Array.isArray(x.items)) falla('opiniones.items', 'lista')
  if (!Array.isArray(x.retiradas)) falla('opiniones.retiradas', 'lista')
  const ids = new Set<string>()
  x.items.forEach((o, i) => {
    const v = validarOpinion(o, `opiniones.items[${i}]`)
    if (ids.has(v.id)) falla(`opiniones.items[${i}].id`, `«${v.id}» repetido`)
    ids.add(v.id)
  })
  x.retiradas.forEach((r, i) => {
    const rr = r as Record<string, unknown>
    texto(rr.id, `opiniones.retiradas[${i}].id`)
    fecha(rr.fecha, `opiniones.retiradas[${i}].fecha`)
    texto(rr.motivo, `opiniones.retiradas[${i}].motivo`, 10)
    if (ids.has(rr.id as string))
      falla(`opiniones.retiradas[${i}]`, `«${rr.id}» está a la vez publicada y retirada`)
  })
  return s as OpinionesSnapshot
}

export interface CompetenciasLike {
  mandato?: { desde?: string; hasta?: string | null } | null
  asignaciones?: { clave: string; oficial: string; nombre: string }[]
}

/**
 * ¿Se nombra a cada persona por una competencia que de verdad tiene, y sólo
 * para el periodo en que la tiene? Devuelve la lista de problemas; vacía es
 * que no hay ninguno.
 *
 * El periodo atribuido tiene que empezar en el mandato de la delegación o
 * después. Es la regla que impide el error que la propia spec documenta: el
 * salto de coste de la policía local es de 2022, y la delegación vigente es de
 * junio de 2023; atribuírselo a quien la tiene hoy sería falso.
 */
export function comprobarNombres(o: OpinionEditor, comp: CompetenciasLike): string[] {
  const problemas: string[] = []
  const desdeMandato = comp.mandato?.desde ?? null
  for (const p of o.nombra) {
    const a = (comp.asignaciones ?? []).find((x) => x.clave === p.clave)
    if (!a) {
      problemas.push(`${o.id}: «${p.clave}» no es una competencia de competencias.json`)
      continue
    }
    if (a.oficial !== p.oficial)
      problemas.push(
        `${o.id}: «${p.nombre}» no tiene la competencia «${p.clave}» (la tiene ${a.nombre})`,
      )
    if (!desdeMandato)
      problemas.push(`${o.id}: competencias.json no dice desde cuándo es el mandato`)
    else if (p.periodo.desde < desdeMandato)
      problemas.push(
        `${o.id}: atribuye a «${p.nombre}» un periodo desde ${p.periodo.desde}, anterior a su delegación (${desdeMandato})`,
      )
    const hasta = comp.mandato?.hasta
    if (hasta && p.periodo.hasta > hasta)
      problemas.push(`${o.id}: atribuye a «${p.nombre}» un periodo posterior al mandato (${hasta})`)
  }
  return problemas
}

/**
 * Las opiniones que la página puede pintar hoy, para un panel. Con la ventana
 * LOREG abierta (`nombresOn` falso) no sale ninguna que nombre a alguien: es
 * la misma disciplina que ya apaga cada vía automática, extendida a la única
 * vía humana que nombra a candidatos.
 */
export function opinionesVisibles(
  snap: { items?: OpinionEditor[] } | null | undefined,
  panel: Panel,
  nombresOn: boolean,
): OpinionEditor[] {
  return (snap?.items ?? [])
    .filter((o) => o.panel === panel)
    .filter((o) => nombresOn || o.nombra.length === 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Estado de un hecho citado contra el panel publicado. Mismo vocabulario que `check:eficiencia-findings`. */
export type EstadoHecho = 'coincide' | 'movido' | 'contradice' | 'sin-indicador'

export interface PanelLike {
  indicadores?: { id: string; serie?: { anio: number; valor?: number | null }[] }[]
  resultados?: { items?: { id: string; serie?: { anio: number; valor: number }[] }[] } | null
}

/** Tolerancia relativa al cotejar un valor citado. */
const TOLERANCIA = 0.005

/**
 * `ultimoCitado`: el año más reciente que la MISMA opinión cita de ese hecho.
 * Una opinión que compara 2021 con 2024 cita 2021 a propósito, y que el panel
 * tenga años posteriores a 2021 no es noticia; lo es que tenga uno posterior a
 * 2024. Sin él, se compara con el propio año citado.
 */
export function cotejarHecho(
  h: Hecho,
  panel: PanelLike,
  hallazgos: { items?: { id: string }[] } | null,
  ultimoCitado?: number,
): EstadoHecho {
  if (h.tipo === 'hallazgo')
    return (hallazgos?.items ?? []).some((f) => f.id === h.id) ? 'coincide' : 'sin-indicador'
  const serie =
    h.tipo === 'indicador'
      ? panel.indicadores?.find((i) => i.id === h.id)?.serie
      : panel.resultados?.items?.find((r) => r.id === h.id)?.serie
  if (!serie) return 'sin-indicador'
  if (h.anio == null) return 'coincide'
  const punto = serie.find((p) => p.anio === h.anio)
  if (!punto || typeof punto.valor !== 'number') return 'sin-indicador'
  if (Math.abs(punto.valor - (h.valor as number)) > Math.abs(h.valor as number) * TOLERANCIA)
    return 'contradice'
  const ultimo = Math.max(...serie.map((p) => p.anio))
  return ultimo > Math.max(h.anio, ultimoCitado ?? h.anio) ? 'movido' : 'coincide'
}

/** Un snapshot vacío, el que crea `npm run opinion -- init`. */
export function opinionesVacias(hoy: string): OpinionesSnapshot {
  return { version: 1, actualizadoEl: hoy, items: [], retiradas: [] }
}

/**
 * Publicar un borrador: sólo con la confirmación explícita de quien firma, y
 * sólo si el borrador ya no lleva ninguna marca de máquina. Pura: el CLI lee y
 * escribe; aquí se decide.
 */
export function publicarOpinion(
  snap: OpinionesSnapshot,
  borrador: unknown,
  confirmoFirma: string,
  hoy: string,
  comp: CompetenciasLike,
  /** `nombresVisibles(frozenUntil, hoy)`: falso durante la ventana LOREG. */
  nombresOn = true,
): OpinionesSnapshot {
  barreProhibidos(borrador, 'borrador')
  const o = validarOpinion(borrador, 'borrador')
  if (!nombresOn && o.nombra.length > 0)
    falla(
      'publicar',
      'periodo electoral: no se publica ninguna opinión que nombre a alguien hasta que se levante la congelación',
    )
  if (confirmoFirma.trim() !== o.firma.nombre.trim())
    falla(
      'publicar',
      `--confirmo-firma «${confirmoFirma}» no coincide con la firma «${o.firma.nombre}»: publica quien firma`,
    )
  if (o.fecha !== hoy)
    falla('publicar', `la fecha de la opinión (${o.fecha}) tiene que ser hoy (${hoy})`)
  const problemas = comprobarNombres(o, comp)
  if (problemas.length) falla('publicar', problemas.join(' · '))
  if (snap.items.some((x) => x.id === o.id) || snap.retiradas.some((x) => x.id === o.id))
    falla('publicar', `ya existe una opinión «${o.id}»: corrígela, no la publiques dos veces`)
  const out: OpinionesSnapshot = { ...snap, actualizadoEl: hoy, items: [...snap.items, o] }
  validarOpinionesSnapshot(JSON.stringify(out))
  return out
}

export function replicarOpinion(
  snap: OpinionesSnapshot,
  id: string,
  replica: Replica,
  hoy: string,
): OpinionesSnapshot {
  const i = snap.items.findIndex((o) => o.id === id)
  if (i < 0) falla('replica', `no hay opinión «${id}»`)
  const items = snap.items.slice()
  items[i] = { ...items[i], replicas: [...items[i].replicas, replica] }
  const out = { ...snap, actualizadoEl: hoy, items }
  validarOpinionesSnapshot(JSON.stringify(out))
  return out
}

export function corregirOpinion(
  snap: OpinionesSnapshot,
  id: string,
  nuevo: { titulo: string; cuerpo: string[] },
  motivo: string,
  hoy: string,
): OpinionesSnapshot {
  const i = snap.items.findIndex((o) => o.id === id)
  if (i < 0) falla('corregir', `no hay opinión «${id}»`)
  const viejo = snap.items[i]
  const items = snap.items.slice()
  items[i] = {
    ...viejo,
    titulo: nuevo.titulo,
    cuerpo: nuevo.cuerpo,
    correcciones: [
      ...viejo.correcciones,
      { fecha: hoy, motivo, antes: { titulo: viejo.titulo, cuerpo: viejo.cuerpo } },
    ],
  }
  const out = { ...snap, actualizadoEl: hoy, items }
  validarOpinionesSnapshot(JSON.stringify(out))
  return out
}

export function retirarOpinion(
  snap: OpinionesSnapshot,
  id: string,
  motivo: string,
  hoy: string,
): OpinionesSnapshot {
  if (!snap.items.some((o) => o.id === id)) falla('retirar', `no hay opinión «${id}»`)
  const out = {
    ...snap,
    actualizadoEl: hoy,
    items: snap.items.filter((o) => o.id !== id),
    retiradas: [...snap.retiradas, { id, fecha: hoy, motivo }],
  }
  validarOpinionesSnapshot(JSON.stringify(out))
  return out
}
