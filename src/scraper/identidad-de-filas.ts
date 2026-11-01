/**
 * ¿Sigue cada contrato bajo su `sourceRowId` de una pasada a la siguiente?
 *
 * ## Por qué
 *
 * El `id` de un contrato no aguanta: en un expediente con varias filas es la
 * posición en una consulta sin ORDER BY. Entre el 28 y el 30-10-2026 la fuente
 * movió una fila del 4889055 y 23 ids pasaron a nombrar otro contrato; lo que
 * mantuvo bien lo publicado fue rehacer los derivados esa noche, no el id.
 *
 * `contract_id` distingue todas las filas, pero si sobrevive a una edición sólo
 * se puede saber guardándolo y mirando la edición siguiente. Esto es esa mirada.
 *
 * ## Una medida, no una puerta
 *
 * No hay umbral ni código de salida: lo escribe `scrape-tenders.ts` en el
 * snapshot y lo imprime `check:contract-corrections`. Si conviene re-clavear
 * `id` es una decisión de una persona con estas cuentas delante.
 *
 * Lo que una pasada no pudo medir no es «cero cambios» (regla 2): sale
 * `medida: false` con su motivo, y el informe lo dice con la marca que lee el
 * parte de salud.
 *
 * ## Por qué se guardan los movimientos
 *
 * Casi todas las noches no se mueve nada, y la comparación de cada noche pisa la
 * de la anterior. Una edición medida un martes habría desaparecido el miércoles,
 * que es perder justo lo que se quiere leer: `movimientos` conserva las pasadas
 * en las que algo se movió.
 *
 * ## Lo que no ve
 *
 * Una fila editada Y re-claveada en la misma pasada no tiene con qué casar: se lee
 * como una baja y un alta. Por eso una baja cuenta como movimiento y su clave va
 * en la muestra, aunque suelta no desmienta nada. Y `retocadas` sólo mira título y
 * adjudicataria, que es lo que la fuente ha reescrito hasta ahora.
 */
import type { Contract } from './tenders'

/** Cuántas claves se guardan por clase: bastan para ir a mirar la fila. */
export const MUESTRA_POR_CLASE = 10

/** Cuántas pasadas con movimiento conserva el snapshot; las anteriores siguen en git. */
export const HISTORIAL_DE_MOVIMIENTOS = 20

type FilaDeContrato = Pick<
  Contract,
  | 'id'
  | 'title'
  | 'assignee'
  | 'permalink'
  | 'batchNumber'
  | 'initialAmount'
  | 'finalAmount'
  | 'awardDate'
> & { sourceRowId?: string | null }

export interface MedidaDeIdentidad {
  medida: true
  /** `generatedAt` del snapshot anterior. */
  comparadoCon: string | null
  /** Claves distintas de cada pasada: `conservan + editadas + reutilizadas + cambian` + bajas o altas. */
  conClaveAntes: number
  conClaveAhora: number
  sinClaveAntes: number
  sinClaveAhora: number
  repetidasAntes: number
  repetidasAhora: number
  /** Filas cuyo contenido (`contenidoDeFila`) está en las dos pasadas: `conservan + cambian`. */
  comparables: number
  /** Mismo contenido, misma clave. */
  conservan: number
  /** Mismo contenido, y su clave se fue a la vez que llegaba otra: lo que desmentiría la clave. */
  cambian: number
  /** De las que conservan, las que traen otro título u otra adjudicataria. */
  retocadas: number
  /** Misma clave y mismo enlace, otro lote, importe o fecha: una edición que la clave aguantó. */
  editadas: number
  /** Misma clave en otro enlace: la clave nombra ya otro expediente. */
  reutilizadas: number
  /** Misma clave con otro `id`: lo que el id posicional no aguantó. */
  idMovidos: number
  /** Claves nuevas sin contenido anterior con el que casar. */
  altas: number
  /** Claves que se fueron sin que llegara otra con su contenido. */
  bajas: number
  muestras: Record<'cambian' | 'editadas' | 'reutilizadas' | 'idMovidos' | 'bajas', string[]>
}

export type MotivoSinMedir = 'sin-snapshot-anterior' | 'anterior-sin-clave' | 'actual-sin-clave'

export interface SinMedir {
  medida: false
  motivo: MotivoSinMedir
}

export type Movimiento = MedidaDeIdentidad & { medidoEn: string }

export interface IdentidadDeFilas {
  ultima: (MedidaDeIdentidad | SinMedir) & { medidoEn: string }
  /** Las pasadas en las que algo se movió, la última primero. */
  movimientos: Movimiento[]
}

export interface SnapshotAnterior {
  generatedAt?: string
  contracts?: readonly FilaDeContrato[]
  identidadDeFilas?: IdentidadDeFilas
}

/**
 * Lo que hace que dos filas sean el mismo contrato sin mirar ninguna clave.
 *
 * El lote va dentro aunque la pregunta sea por enlace, importe y fecha: sin él,
 * sobre la descarga del 01-11-2026, 13 grupos de filas comparten contenido; con
 * él, 7. Entre el 28 y el 30-10 ninguna fila cambió este contenido, ni con las
 * adjudicatarias reescritas ni con la fila desplazada del 4889055: es lo bastante
 * firme para hacer de referencia.
 *
 * No es único: 4889055 trae 98/2026 dos veces, igual en todo salvo `contract_id`.
 * Por eso aquí se comparan claves por grupo y nunca fila contra fila.
 */
export function contenidoDeFila(c: FilaDeContrato): string {
  return [c.permalink, c.batchNumber, c.initialAmount, c.finalAmount, c.awardDate].join('|')
}

function indexar(filas: readonly FilaDeContrato[]) {
  const porClave = new Map<string, FilaDeContrato>()
  let sinClave = 0
  let repetidas = 0
  for (const f of filas) {
    if (!f.sourceRowId) sinClave += 1
    else if (porClave.has(f.sourceRowId)) repetidas += 1
    else porClave.set(f.sourceRowId, f)
  }
  return { porClave, sinClave, repetidas }
}

/** Las claves de `filas` que no están en `otras`, agrupadas por contenido. */
function ausentesPorContenido(
  filas: ReadonlyMap<string, FilaDeContrato>,
  otras: ReadonlyMap<string, FilaDeContrato>,
): Map<string, string[]> {
  const grupos = new Map<string, string[]>()
  for (const [clave, fila] of filas) {
    if (otras.has(clave)) continue
    const contenido = contenidoDeFila(fila)
    grupos.set(contenido, [...(grupos.get(contenido) ?? []), clave])
  }
  return grupos
}

const muestra = (claves: readonly string[]) => [...claves].sort().slice(0, MUESTRA_POR_CLASE)

export function medirIdentidad(
  anterior: SnapshotAnterior | null,
  actuales: readonly FilaDeContrato[],
): MedidaDeIdentidad | SinMedir {
  if (!anterior?.contracts?.length) return { medida: false, motivo: 'sin-snapshot-anterior' }
  const antes = indexar(anterior.contracts)
  const ahora = indexar(actuales)
  if (antes.porClave.size === 0) return { medida: false, motivo: 'anterior-sin-clave' }
  if (ahora.porClave.size === 0) return { medida: false, motivo: 'actual-sin-clave' }

  let conservan = 0
  let retocadas = 0
  const editadas: string[] = []
  const reutilizadas: string[] = []
  const idMovidos: string[] = []
  for (const [clave, previa] of antes.porClave) {
    const fila = ahora.porClave.get(clave)
    if (!fila) continue
    if (fila.id !== previa.id) idMovidos.push(clave)
    if (contenidoDeFila(fila) === contenidoDeFila(previa)) {
      conservan += 1
      if (fila.title !== previa.title || fila.assignee !== previa.assignee) retocadas += 1
    } else if (fila.permalink === previa.permalink) editadas.push(clave)
    else reutilizadas.push(clave)
  }

  // Sólo cuenta como cambio de clave la que se fue sin dejar rastro y otra que
  // llegó con su contenido: entre gemelas, una simple permuta no ha cambiado nada.
  const idas = ausentesPorContenido(antes.porClave, ahora.porClave)
  const llegadas = ausentesPorContenido(ahora.porClave, antes.porClave)
  const cambian: string[] = []
  const bajas: string[] = []
  const altas: string[] = []
  for (const [contenido, claves] of idas) {
    const nuevas = llegadas.get(contenido) ?? []
    const pares = Math.min(claves.length, nuevas.length)
    cambian.push(...nuevas.slice(0, pares))
    bajas.push(...claves.slice(pares))
    llegadas.set(contenido, nuevas.slice(pares))
  }
  for (const nuevas of llegadas.values()) altas.push(...nuevas)

  return {
    medida: true,
    comparadoCon: anterior.generatedAt ?? null,
    conClaveAntes: antes.porClave.size,
    conClaveAhora: ahora.porClave.size,
    sinClaveAntes: antes.sinClave,
    sinClaveAhora: ahora.sinClave,
    repetidasAntes: antes.repetidas,
    repetidasAhora: ahora.repetidas,
    comparables: conservan + cambian.length,
    conservan,
    cambian: cambian.length,
    retocadas,
    editadas: editadas.length,
    reutilizadas: reutilizadas.length,
    idMovidos: idMovidos.length,
    altas: altas.length,
    bajas: bajas.length,
    muestras: {
      cambian: muestra(cambian),
      editadas: muestra(editadas),
      reutilizadas: muestra(reutilizadas),
      idMovidos: muestra(idMovidos),
      bajas: muestra(bajas),
    },
  }
}

/** Un alta suelta no dice nada de la clave: casi todas las semanas entra un contrato. */
function hayMovimiento(m: MedidaDeIdentidad): boolean {
  return m.cambian + m.retocadas + m.editadas + m.reutilizadas + m.idMovidos + m.bajas > 0
}

/** El bloque `identidadDeFilas` de un snapshot nuevo, con el historial del anterior. */
export function registrarIdentidad(
  anterior: SnapshotAnterior | null,
  medidoEn: string,
  actuales: readonly FilaDeContrato[],
): IdentidadDeFilas {
  const m = medirIdentidad(anterior, actuales)
  const movimientos = anterior?.identidadDeFilas?.movimientos ?? []
  return {
    ultima: { ...m, medidoEn },
    movimientos:
      m.medida && hayMovimiento(m)
        ? [{ ...m, medidoEn }, ...movimientos].slice(0, HISTORIAL_DE_MOVIMIENTOS)
        : movimientos,
  }
}

const ETIQUETA = '[identidad-de-filas]'

const POR_QUE: Readonly<Record<MotivoSinMedir, string>> = {
  'sin-snapshot-anterior': 'no había snapshot anterior legible con el que comparar',
  'anterior-sin-clave': 'el snapshot anterior no trae sourceRowId',
  'actual-sin-clave': 'la fuente ha dejado de traer contract_id',
}

const dia = (iso: string | null) => (iso ?? '¿?').slice(0, 10)

function desglose(m: MedidaDeIdentidad): string {
  return [
    `cambian de clave ${m.cambian}`,
    `editadas ${m.editadas}`,
    `reutilizadas ${m.reutilizadas}`,
    `retocadas ${m.retocadas}`,
    `id movido ${m.idMovidos}`,
    `altas ${m.altas}`,
    `bajas ${m.bajas}`,
    `sin clave ${m.sinClaveAntes} → ${m.sinClaveAhora}`,
    `repetidas ${m.repetidasAntes} → ${m.repetidasAhora}`,
  ].join(' · ')
}

function renglonesDeMovimiento(m: Movimiento): string[] {
  const claves = Object.entries(m.muestras)
    .filter(([, lista]) => lista.length > 0)
    .map(([clase, lista]) => `${clase}: ${lista.join(', ')}`)
  return [
    `  ${dia(m.comparadoCon)} → ${dia(m.medidoEn)}: ${m.conservan} de ${m.comparables} · ${desglose(m)}`,
    ...(claves.length > 0 ? [`    muestra — ${claves.join(' · ')}`] : []),
  ]
}

/**
 * El informe, para `scrape-tenders.ts` y `check:contract-corrections`.
 *
 * NO COMPROBADO es la marca que `clasificarGuarda` lee: sin ella, una pasada que
 * no midió saldría en el parte como limpia. Sólo la lleva lo que no se midió, y
 * el historial queda detrás de un renglón sin sangrar para no entrar en el motivo.
 */
export function renglonesDeIdentidad(doc: { identidadDeFilas?: IdentidadDeFilas }): string[] {
  const r = doc.identidadDeFilas
  if (!r) return [`${ETIQUETA} NO COMPROBADO: este tenders.json no trae identidadDeFilas`]
  const u = r.ultima
  const ultima =
    u.medida === false
      ? [`${ETIQUETA} NO COMPROBADO: ${POR_QUE[u.motivo]}`]
      : [
          `${ETIQUETA} ${u.conservan} de ${u.comparables} filas con el mismo enlace, lote, importes ` +
            `y fecha conservan su sourceRowId (${dia(u.comparadoCon)} → ${dia(u.medidoEn)})`,
          `  ${desglose(u)}`,
        ]
  return [
    ...ultima,
    r.movimientos.length > 0
      ? `${ETIQUETA} pasadas con movimiento: ${r.movimientos.length}`
      : `${ETIQUETA} ningún movimiento guardado en este snapshot`,
    ...r.movimientos.flatMap(renglonesDeMovimiento),
  ]
}
