/**
 * Parse BDNS "convocatorias" payloads from MinHac's REST endpoint:
 *   /bdnstrans/api/convocatorias/busqueda?vpd=GE&descripcion=riba-roja
 *
 * The scraper CLI concatenates all pages into a single JSON array; this
 * parser accepts either the concatenated array or the single-page object
 * with a `content` property.
 *
 * ## La búsqueda trae dos municipios
 *
 * «riba-roja» casa también con Riba-roja d'Ebre, en Tarragona. Hasta el
 * 06-10-2026 el sitio publicaba cuatro convocatorias suyas (792222, 732847,
 * 702610, 668659) como subvenciones recibidas por Riba-roja de Túria, y la
 * 668659 no dice «Ebre» en ninguna parte: «SN AYUNTAMIENTO DE RIBAROJA». Un
 * filtro por el nombre no basta, así que una recibida se publica sólo si la
 * sitúa aquí un campo estructurado de la propia BDNS (`ubicarConvocatoria`):
 * una concesión al NIF del Ayuntamiento o la región NUTS de su ficha. Lo que
 * ninguno de los dos sitúa se aparta, con su motivo: un fallo honesto antes que
 * una atribución falsa, como en el place-resolver. Las pruebas, sobre filas
 * reales, en tests/parse-bdns-municipio.test.ts.
 */
import { stripDiacritics } from './normalize'

/**
 * El municipio tal como lo nombra el catálogo de órganos LOCAL de la BDNS
 * (agrupación 462140, provincia «VALÈNCIA / VALENCIA»). Se compara entero: con
 * `includes('RIBA-ROJA')`, un Ayuntamiento de Riba-roja d'Ebre que un día
 * convocara en la BDNS habría pasado por el nuestro.
 */
export const MUNICIPIO_BDNS = 'RIBA-ROJA DE TÚRIA'

/**
 * NIF del Ayuntamiento en las concesiones de la BDNS: 148 concesiones a
 * «AYUNTAMIENTO DE RIBA-ROJA DE TURIA» el 06-10-2026. No sale del código INE:
 * P4621400C, el de pegarle la P al 46214, es el del Ayuntamiento de Real.
 */
export const NIF_AYUNTAMIENTO = 'P4621600H'

/** La región NUTS 3 del municipio (Valencia / València). */
const NUTS_DEL_MUNICIPIO = 'ES523'

/**
 * Las regiones que contienen Riba-roja de Túria y NO Riba-roja d'Ebre, que
 * está en ES514 (Tarragona), dentro de ES51 (Cataluña). «ES» y «ES5» contienen
 * a los dos: no deciden.
 */
const NUTS_PROPIAS: ReadonlySet<string> = new Set(['ES52', NUTS_DEL_MUNICIPIO])

export type SubsidyDirection = 'granted' | 'received'

export interface BdnsItem {
  id: number
  bdnsCode: string
  description: string
  date: string // ISO
  organ: string
  level1: string
  level2: string | null
  direction: SubsidyDirection
  sourceUrl: string
}

interface Raw {
  id: number
  numeroConvocatoria: string
  descripcion: string
  fechaRecepcion: string
  nivel1: string
  nivel2?: string | null
  nivel3?: string | null
}

function normalize(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw as Raw[]
  if (raw && typeof raw === 'object' && 'content' in raw) {
    return ((raw as { content: Raw[] }).content ?? []) as Raw[]
  }
  return []
}

function parseDate(s: string): string {
  if (!s) return new Date(0).toISOString()
  // BDNS feeds ISO-ish "2026-01-19" (occasionally with a zoneless time
  // suffix) or "19/01/2026". Pin the calendar date at UTC midnight: feeding
  // a zoneless datetime to new Date() parses it in the HOST zone, which can
  // shift the day (e.g. "…T00:30:00" on a UTC+1 host lands on the previous
  // UTC day) and silently mis-order stats.latestDate.
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return new Date(`${iso[1]}T00:00:00.000Z`).toISOString()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`).toISOString()
  return new Date(s).toISOString()
}

export function parseBdnsConvocatorias(json: string): BdnsItem[] {
  const rows = normalize(JSON.parse(json))
  const seen = new Set<string>()
  const out: BdnsItem[] = []
  for (const r of rows) {
    const code = String(r.numeroConvocatoria || '').trim()
    if (!code || seen.has(code)) continue
    seen.add(code)

    // The Ayuntamiento appears in nivel2/nivel3 when it's the granting
    // body; records whose levels don't name the municipality as the
    // convocant (e.g. a Generalitat-level call to which the Ayto might
    // apply) count as "received", and `ubicarConvocatoria` decides whether
    // they are about this Riba-roja at all.
    const nivel3 = (r.nivel3 ?? '').toUpperCase()
    const isGranted = plegar(r.nivel2) === plegar(MUNICIPIO_BDNS) && /AYUNTAMIENTO/.test(nivel3)

    out.push({
      id: r.id,
      bdnsCode: code,
      description: (r.descripcion || '').trim(),
      date: parseDate(r.fechaRecepcion),
      organ: [r.nivel1, r.nivel2, r.nivel3].filter(Boolean).join(' · '),
      level1: r.nivel1,
      level2: r.nivel2 ?? null,
      direction: isGranted ? 'granted' : 'received',
      sourceUrl: `https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/${code}`,
    })
  }

  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return out
}

/** Sin tildes, en mayúsculas y con los espacios plegados: así compara la BDNS. */
function plegar(s: string | null | undefined): string {
  return stripDiacritics(s ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── ¿Es de Riba-roja de Túria? ─────────────────────────────────────────────

/** Dónde queda una convocatoria. Sólo `propio` se publica. */
export const LUGARES = ['propio', 'ajeno', 'sin-determinar'] as const
export type Lugar = (typeof LUGARES)[number]

/** Lo que el CLI consulta de cada recibida, tal como lo devuelve la BDNS. */
export interface PruebasDeLugar {
  /** /convocatorias?vpd=GE&numConv=<código>: trae `regiones`. */
  ficha: unknown
  /** /concesiones/busqueda?…&numeroConvocatoria=<código>&nifCif=NIF_AYUNTAMIENTO */
  concesiones: unknown
}

export interface Ubicacion {
  lugar: Lugar
  /** Qué campo decidió, con su valor, para el informe de la corrida. */
  motivo: string
}

/** Una convocatoria que la búsqueda trajo y no se publica. */
export interface Descartada {
  bdnsCode: string
  description: string
  date: string
  organ: string
  sourceUrl: string
  lugar: Exclude<Lugar, 'propio'>
  motivo: string
}

type Concesiones = 'al-ayuntamiento' | 'ninguna' | 'ilegible'

function leerConcesiones(respuesta: unknown): Concesiones {
  const filas = (respuesta as { content?: unknown } | null)?.content
  if (!Array.isArray(filas)) return 'ilegible'
  // Se mira el NIF de cada fila y no sólo si hay filas: si la API dejara de
  // filtrar por `nifCif`, devolvería las concesiones de todos los beneficiarios.
  const alAyuntamiento = filas.some((f) => {
    const beneficiario = (f as { beneficiario?: unknown } | null)?.beneficiario
    return (
      typeof beneficiario === 'string' && beneficiario.trim().split(/\s+/)[0] === NIF_AYUNTAMIENTO
    )
  })
  return alAyuntamiento ? 'al-ayuntamiento' : 'ninguna'
}

/** «ES523 - Valencia / València» → «ES523». Sin un código NUTS delante, null. */
function codigoNuts(descripcion: string): string | null {
  const m = descripcion.trim().match(/^([A-Z]{2}[0-9A-Z]{0,3})\s+-(\s|$)/i)
  return m ? m[1].toUpperCase() : null
}

/**
 * Dónde sitúa una convocatoria recibida, mirando primero lo más concreto.
 *
 *  1. La convocada por el propio Ayuntamiento la sitúa su órgano.
 *  2. Una concesión a NIF_AYUNTAMIENTO la sitúa aquí, diga la región lo que diga.
 *     Sólo puede decir que sí: muchas convocatorias no tienen la concesión
 *     registrada, o la tienen a nombre de una entidad del pueblo.
 *  3. Si no, la región de la ficha: propia si cae en ES52/ES523, ajena si no
 *     contiene ES523. Una región que contiene a los dos municipios («ES - ESPAÑA»),
 *     una mezcla de propias y ajenas, o una sin código NUTS no deciden.
 *
 * Lo que no decide nada es `sin-determinar`, y no se publica.
 */
export function ubicarConvocatoria(item: BdnsItem, pruebas?: PruebasDeLugar): Ubicacion {
  if (item.direction === 'granted') return { lugar: 'propio', motivo: `convoca ${item.organ}` }
  if (!pruebas) return { lugar: 'sin-determinar', motivo: 'sin ficha ni concesiones consultadas' }

  const concesiones = leerConcesiones(pruebas.concesiones)
  if (concesiones === 'al-ayuntamiento') {
    return { lugar: 'propio', motivo: `concesión a ${NIF_AYUNTAMIENTO}` }
  }
  const sinConcesion =
    concesiones === 'ilegible'
      ? 'las concesiones no se pudieron leer'
      : `ninguna concesión a ${NIF_AYUNTAMIENTO}`

  const regiones = (pruebas.ficha as { regiones?: unknown } | null)?.regiones
  if (!Array.isArray(regiones)) {
    return { lugar: 'sin-determinar', motivo: `la ficha no trae regiones; ${sinConcesion}` }
  }
  const rotulos = regiones.map((r) =>
    String((r as { descripcion?: unknown })?.descripcion ?? '').trim(),
  )
  const rotulo = rotulos.join(' · ') || 'ninguna'
  const codigos = rotulos.map(codigoNuts)
  if (codigos.length === 0 || codigos.some((c) => c === null)) {
    return {
      lugar: 'sin-determinar',
      motivo: `región sin código NUTS (${rotulo}); ${sinConcesion}`,
    }
  }
  const propia = codigos.some((c) => NUTS_PROPIAS.has(c as string))
  const ajena = codigos.some((c) => !NUTS_DEL_MUNICIPIO.startsWith(c as string))
  if (propia && !ajena) return { lugar: 'propio', motivo: `región ${rotulo}` }
  if (ajena && !propia) return { lugar: 'ajeno', motivo: `región ${rotulo}; ${sinConcesion}` }
  return {
    lugar: 'sin-determinar',
    motivo: `región ${rotulo}: no distingue Riba-roja de Túria de Riba-roja d'Ebre; ${sinConcesion}`,
  }
}

/** Las que se publican y las que se apartan, cada una con su motivo. */
export function separarPorMunicipio(
  items: BdnsItem[],
  pruebas: ReadonlyMap<string, PruebasDeLugar>,
): { propias: BdnsItem[]; descartadas: Descartada[] } {
  const propias: BdnsItem[] = []
  const descartadas: Descartada[] = []
  for (const item of items) {
    const { lugar, motivo } = ubicarConvocatoria(item, pruebas.get(item.bdnsCode))
    if (lugar === 'propio') {
      propias.push(item)
      continue
    }
    const { bdnsCode, description, date, organ, sourceUrl } = item
    descartadas.push({ bdnsCode, description, date, organ, sourceUrl, lugar, motivo })
  }
  return { propias, descartadas }
}

/**
 * Más de esta fracción de recibidas sin situar y la corrida no se escribe. El
 * 06-10-2026 no había ninguna: las 18 se situaban por NIF o por región.
 */
export const TECHO_SIN_DETERMINAR = 0.25

/**
 * Por qué no debe escribirse esta separación, o null si puede.
 *
 * El filtro aparta lo que no puede situar, y eso es lo correcto con una fila;
 * con todas, es que la ficha o la concesión de la BDNS cambió de forma bajo el
 * parser. Sin este techo, ese día el sitio perdería en silencio todas las
 * subvenciones recibidas (la clase nº 7 de docs/DATA_INTEGRITY.md).
 */
export function rechazoDeLaCorrida(separacion: {
  propias: BdnsItem[]
  descartadas: Pick<Descartada, 'lugar'>[]
}): string | null {
  const publicadas = separacion.propias.filter((i) => i.direction === 'received').length
  const juzgadas = publicadas + separacion.descartadas.length
  if (juzgadas === 0) return null
  const sinSituar = separacion.descartadas.filter((d) => d.lugar === 'sin-determinar').length
  if (sinSituar > TECHO_SIN_DETERMINAR * juzgadas) {
    return (
      `${sinSituar} de ${juzgadas} convocatorias recibidas sin situar ` +
      `(techo ${TECHO_SIN_DETERMINAR * 100} %): ¿ha cambiado la ficha o la concesión de la BDNS?`
    )
  }
  if (publicadas === 0) {
    return `se apartaron las ${juzgadas} recibidas: ninguna se sitúa en Riba-roja de Túria`
  }
  return null
}

// ─── Lo que el Ayuntamiento recibe, por su NIF ──────────────────────────────
//
// La búsqueda por «riba-roja» trae las convocatorias cuyo TEXTO nombra el
// municipio. Una convocatoria de la Generalitat o de la Diputación abierta a
// todos los ayuntamientos no nombra a ninguno, y el nuestro la cobra igual. El
// 11-10-2026 la BDNS registraba 148 concesiones a NIF_AYUNTAMIENTO en 121
// convocatorias, por 46,3 M€, y el snapshot publicaba 14 recibidas, siete de
// ellas entre esas 121: un 6 %. La consulta por NIF no devuelve nada anterior a
// 2022 (2015–2021: cero filas), así que las siete recibidas más viejas siguen
// viniendo sólo de la búsqueda por nombre.
//
// Las concesiones van en su propio bloque, `concesiones`: una fila por
// CONCESIÓN, con su importe. Los euros se suman aquí y sólo aquí; una
// convocatoria puede tener varias (la 754381, el Plan Abierto de Inversiones de
// la Diputación, ocho).
//
// Sus convocatorias NO entran en `items`, que es lo que lee el verificador
// (claim-verifier.ts y el corpus de embed-verifier-corpus.ts). Medido el
// 11-10-2026 sobre las 7.564 afirmaciones de pleno publicadas: con las 114
// convocatorias nuevas en `items`, el tramo determinista subía 14 de
// `sin-datos` a `parcial` y no bajaba ninguna, varias por puro solapamiento de
// palabras —«plan de contratación 2026» contra una convocatoria de empleo de
// LABORA—. Un veredicto automático no sube sin una precisión medida
// (automation-policy.ts), así que ampliar lo que lee el verificador es otro
// paso, con su medición. Hasta entonces `items` sigue siendo lo que trae la
// búsqueda por nombre, y `stats.received` cuenta esas convocatorias.
//
// El importe es lo CONCEDIDO, no lo cobrado: los pagos son otro registro de la
// BDNS. La prosa que lo enseñe dice «concedido».

/**
 * El instrumento de una subvención, plegado. Las 148 del 11-10-2026 lo traen
 * («SUBVENCIÓN y ENTREGA DINERARIA SIN CONTRAPRESTACIÓN »). Otro instrumento
 * —un préstamo, una garantía— se publica como concesión pero no suma en los
 * euros recibidos: un préstamo se devuelve.
 */
export const INSTRUMENTO_SUBVENCION = 'SUBVENCION Y ENTREGA DINERARIA SIN CONTRAPRESTACION'

export interface ConcesionRecibida {
  id: number
  codConcesion: string
  /** El código de su convocatoria. */
  bdnsCode: string
  convocatoria: string
  /** `fechaConcesion`, a medianoche UTC. */
  fecha: string
  /** Lo concedido, en euros; null si la fila no trae un número. */
  importe: number | null
  instrumento: string
  esSubvencion: boolean
  organ: string
  level1: string
  /** La ficha de la convocatoria: la concesión no tiene página propia. */
  sourceUrl: string
}

export interface ConcesionesLeidas {
  concesiones: ConcesionRecibida[]
  /** Filas de otro beneficiario: si la API deja de filtrar por `nifCif`. */
  ajenas: number
  /** `totalElements` de la primera página, o null si no venía paginado. */
  declaradas: number | null
}

interface RawConcesion {
  id?: unknown
  codConcesion?: unknown
  fechaConcesion?: unknown
  beneficiario?: unknown
  instrumento?: unknown
  importe?: unknown
  numeroConvocatoria?: unknown
  convocatoria?: unknown
  nivel1?: unknown
  nivel2?: unknown
  nivel3?: unknown
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const convocatoriaUrl = (code: string) =>
  `https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/${code}`

/**
 * Las concesiones de /concesiones/busqueda?nifCif=NIF_AYUNTAMIENTO: acepta las
 * páginas concatenadas en un array, una página suelta o las filas a secas. Se
 * mira el NIF de cada fila, como en `leerConcesiones`: si la API dejara de
 * filtrar, devolvería las de todos los beneficiarios.
 */
export function parseBdnsConcesiones(json: string): ConcesionesLeidas {
  const raw = JSON.parse(json) as unknown
  const paginas = Array.isArray(raw) ? raw : [raw]
  const primera = paginas[0] as { totalElements?: unknown } | undefined
  const declaradas =
    primera && typeof primera === 'object' && typeof primera.totalElements === 'number'
      ? primera.totalElements
      : null
  const filas: RawConcesion[] = paginas.flatMap((p) => {
    const content = (p as { content?: unknown } | null)?.content
    if (Array.isArray(content)) return content as RawConcesion[]
    return p && typeof p === 'object' && !('content' in p) ? [p as RawConcesion] : []
  })

  const vistas = new Set<number>()
  const concesiones: ConcesionRecibida[] = []
  let ajenas = 0
  for (const f of filas) {
    if (texto(f.beneficiario).split(/\s+/)[0] !== NIF_AYUNTAMIENTO) {
      ajenas++
      continue
    }
    const id = Number(f.id)
    const code = texto(f.numeroConvocatoria)
    if (!Number.isFinite(id) || !code || vistas.has(id)) continue
    vistas.add(id)
    const importe = typeof f.importe === 'number' && Number.isFinite(f.importe) ? f.importe : null
    const instrumento = texto(f.instrumento)
    concesiones.push({
      id,
      codConcesion: texto(f.codConcesion),
      bdnsCode: code,
      convocatoria: texto(f.convocatoria),
      fecha: parseDate(texto(f.fechaConcesion)),
      importe,
      instrumento,
      esSubvencion: plegar(instrumento) === INSTRUMENTO_SUBVENCION,
      organ: [f.nivel1, f.nivel2, f.nivel3].map(texto).filter(Boolean).join(' · '),
      level1: texto(f.nivel1),
      sourceUrl: convocatoriaUrl(code),
    })
  }
  concesiones.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
  return { concesiones, ajenas, declaradas }
}

export interface ResumenConcesiones {
  total: number
  convocatorias: number
  /** Euros concedidos en subvenciones, al céntimo. */
  importe: number
  otrosInstrumentos: number
  sinImporte: number
  /** Primera y última `fecha`, como AAAA-MM-DD; null sin filas. */
  desde: string | null
  hasta: string | null
}

export function resumirConcesiones(concesiones: ConcesionRecibida[]): ResumenConcesiones {
  const subvenciones = concesiones.filter((c) => c.esSubvencion)
  const centimos = subvenciones.reduce((s, c) => s + Math.round((c.importe ?? 0) * 100), 0)
  const fechas = concesiones.map((c) => c.fecha.slice(0, 10)).sort()
  return {
    total: concesiones.length,
    convocatorias: new Set(concesiones.map((c) => c.bdnsCode)).size,
    importe: centimos / 100,
    otrosInstrumentos: concesiones.length - subvenciones.length,
    sinImporte: concesiones.filter((c) => c.importe === null).length,
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
  }
}

/**
 * Cuánto pueden caer las concesiones frente al snapshot anterior antes de que la
 * corrida no se crea. La ventana de la BDNS corre: el año que sale se lleva sus
 * concesiones (las de 2022 eran 39 de 148, un 26 %). La mitad ya no es eso.
 */
export const TECHO_CAIDA_CONCESIONES = 0.5

/** Por encima de esta fracción, un campo que falta es un campo renombrado. */
const TECHO_FALTANTES = 0.1

/**
 * Por qué no debe escribirse la vía por NIF, o null si puede. La clase nº 7 de
 * docs/DATA_INTEGRITY.md: sin esto, el día que la API cambie de forma el sitio
 * publicaría «0 concesiones» con toda la tranquilidad de un año sin ayudas.
 */
export function rechazoDeLasConcesiones(
  leidas: ConcesionesLeidas,
  contexto: { anterior?: number | null } = {},
): string | null {
  const { concesiones, ajenas, declaradas } = leidas
  const n = concesiones.length
  if (ajenas > 0) {
    return `${ajenas} concesiones de otro NIF: la API ha dejado de filtrar por ${NIF_AYUNTAMIENTO}`
  }
  if (n === 0) return `cero concesiones a ${NIF_AYUNTAMIENTO}: ¿ha cambiado la API de la BDNS?`
  if (declaradas !== null && n < declaradas) {
    return `${n} concesiones leídas de ${declaradas} que declara la API: la paginación se cortó`
  }
  const resumen = resumirConcesiones(concesiones)
  if (resumen.sinImporte > TECHO_FALTANTES * n) {
    return `${resumen.sinImporte} de ${n} concesiones sin importe: ¿ha cambiado de nombre el campo?`
  }
  if (resumen.otrosInstrumentos > TECHO_FALTANTES * n) {
    return (
      `${resumen.otrosInstrumentos} de ${n} concesiones fuera de «${INSTRUMENTO_SUBVENCION}»: ` +
      '¿ha cambiado el rótulo del instrumento?'
    )
  }
  const { anterior } = contexto
  if (anterior != null && n < anterior * (1 - TECHO_CAIDA_CONCESIONES)) {
    return `${n} concesiones, frente a ${anterior} en el snapshot anterior: cae más de la mitad`
  }
  return null
}
