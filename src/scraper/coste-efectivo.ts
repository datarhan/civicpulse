/**
 * Parser for CESEL — the *coste efectivo de los servicios prestados por las
 * entidades locales* (art. 116 ter LRSAL, criterios en la Orden HAP/2075/2014).
 *
 * Every Spanish municipality must calculate and remit this annually, and the
 * Ministerio de Hacienda publishes it. Two tables per entrega:
 *
 *   CE2 — cost per servicio (programa) by economic chapter, plus CodGestion
 *   CE3 — the PHYSICAL UNITS per servicio: toneladas de residuos, puntos de
 *         luz, metros de red, m² con servicio de limpieza…
 *
 * CE3 is the denominator this project had no source for. Together they make
 * «cuánto cuesta y qué se obtiene» computable, and — because the file is
 * national — comparable against real peer municipalities.
 *
 * Two things this parser deliberately does NOT do, because both would publish
 * something false:
 *
 *  - **It does not merge duplicate rows.** A programa can appear more than once
 *    in CE2 with different costs, and the same CE3 attribute can appear twice
 *    with contradictory values (Riba-roja 2021 declares `plantilla adscritas`
 *    as both 0 and 16 for a171). Picking the first would be a coin flip
 *    dressed as a fact. Every row survives; resolving the ambiguity — or
 *    refusing to — is src/scraper/indicadores.ts's job.
 *  - **It does not treat 0 as a quantity.** `viajeros = 0` next to a real bus
 *    budget means «no lo declaré», not «nobody rode the bus». The zero is
 *    carried through untouched so the engine can classify it.
 *
 * Pure parser — the downloads live in scripts/scrape-coste-efectivo.ts.
 */
import * as XLSX from 'xlsx'

/**
 * How the service is run, which decides what the cost figure even means.
 *
 * `otra` and `sin-clasificar` are NOT the same state and must never be folded.
 * `otra` is the source saying «Otro tipo de gestión (**)» — that is data, and
 * it can be any share of an entrega. `sin-clasificar` is this classifier
 * failing to recognise a string — that is a defect, and its share is what the
 * test ceiling is aimed at. Collapsing them would make the ceiling
 * unfalsifiable, which is failure mode 1 of docs/DATA_INTEGRITY.md.
 */
export const MODOS_GESTION = [
  'directa',
  'concesion',
  'mancomunada',
  'consorciada',
  'convenio',
  'mixta',
  'otra',
  'sin-clasificar',
  'no-se-presta',
] as const
export type ModoGestion = (typeof MODOS_GESTION)[number]

export interface UnidadFisica {
  atributo: string
  valor: number
}

export interface CesteRow {
  anio: number
  ine: string
  ente: string
  nombre: string
  programa: string
  modoGestion: ModoGestion
  /** The ministry's own wording, kept verbatim so the classification is auditable. */
  codGestionRaw: string
  costeTotal: number | null
  unidades: UnidadFisica[]
}

/** Lowercase and strip diacritics, so a re-encoded entrega cannot break matching. */
function norm(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Map the ministry's CodGestion vocabulary onto the comparability classes.
 *
 * The 2021 Comunitat Valenciana entrega publishes fourteen distinct strings.
 * The grouping follows the ministry's own top-level word (directa / indirecta)
 * because that is what determines whether the council bears the cost:
 *
 *  - the four «Gestión directa por …» variants (entidad local, organismo
 *    autónomo, entidad pública empresarial, sociedad mercantil local) all mean
 *    the cost lands in the council's accounts → `directa`
 *  - the three «Gestión indirecta …» variants (concesión a riesgo y ventura,
 *    concierto, interesada) all mean it does not → `concesion`
 *  - anything carrying «+ otra forma de gestión (*)» is a hybrid: part of the
 *    cost sits elsewhere, which makes it exactly as uncomparable as a
 *    concession, so it joins `otra` and never enters a peer pool.
 */
export function clasificarGestion(codGestion: string): ModoGestion {
  const s = norm(codGestion)
  if (!s) return 'sin-clasificar'
  if (s.includes('no se presta')) return 'no-se-presta'
  // Check the hybrid marker BEFORE the family words it is appended to.
  if (s.includes('otra forma de gestion')) return 'otra'
  if (s.includes('otro tipo de gestion')) return 'otra'
  if (s.includes('indirecta')) return 'concesion'
  if (s.includes('mancomunada') || s.includes('comarcal') || s.includes('diputacion')) {
    return 'mancomunada'
  }
  if (s.includes('consorciada')) return 'consorciada'
  if (s.includes('convenio')) return 'convenio'
  if (s.includes('mixta')) return 'mixta'
  if (s.includes('directa')) return 'directa'
  return 'sin-clasificar'
}

/**
 * '17-46-214-AA-000' → '46214'.
 *
 * Only `AA` entes are municipalities. Consorcios (`CC`), mancomunidades and
 * the rest share the file but are not comparable units, so they resolve null
 * and the caller drops them.
 */
export function ineFromEnte(ente: string): string | null {
  const m = /^\d{2}-(\d{2})-(\d{3})-AA-\d{3}$/.exec(String(ente ?? '').trim())
  return m ? m[1] + m[2] : null
}

function numeric(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = Number(
    String(v ?? '')
      .replace(/\s/g, '')
      .replace(/\.(?=\d{3}\b)/g, '')
      .replace(',', '.'),
  )
  return Number.isFinite(n) ? n : 0
}

/** Attribute names ship with stray whitespace — 'Nº puntos de luz  ' is real. */
const atributoKey = (s: unknown) =>
  String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')

/**
 * Parse a CESEL national/annual workbook into one row per CE2 row, with the
 * matching CE3 units attached.
 *
 * @param opts.soloEntes  restrict to these INE codes, so a 45 MB national file
 *                        can be reduced at parse time instead of in memory.
 */
export function parseCeselWorkbook(
  buffer: Buffer | ArrayBuffer,
  opts: { anio: number; soloEntes?: Set<string> },
): CesteRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ce2Name = wb.SheetNames.find((n) => /CE2\s*$/.test(n))
  const ce3Name = wb.SheetNames.find((n) => /CE3\s*$/.test(n))
  if (!ce2Name || !ce3Name) return []

  const unidades = new Map<string, UnidadFisica[]>()
  for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[ce3Name])) {
    const key = `${r.Ente}|${r.Programa}`
    const list = unidades.get(key) ?? []
    list.push({ atributo: atributoKey(r.Atributo), valor: numeric(r.Valor) })
    unidades.set(key, list)
  }

  const out: CesteRow[] = []
  for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[ce2Name])) {
    const ente = String(r.Ente ?? '')
    const ine = ineFromEnte(ente)
    if (!ine) continue
    if (opts.soloEntes && !opts.soloEntes.has(ine)) continue
    const codGestionRaw = String(r.CodGestion ?? '').trim()
    const modoGestion = clasificarGestion(codGestionRaw)
    const programa = String(r.Programa ?? '').trim()
    out.push({
      anio: opts.anio,
      ine,
      ente,
      // CE2 spells it `Litente`, CE3 spells it `LitEnte`. Both appear.
      nombre: String(r.Litente ?? r.LitEnte ?? '').trim(),
      programa,
      modoGestion,
      codGestionRaw,
      costeTotal: modoGestion === 'no-se-presta' ? null : numeric(r.Econ14),
      unidades: unidades.get(`${ente}|${programa}`) ?? [],
    })
  }
  return out
}

/**
 * Parse a per-entity CESEL report — the file the consulta hands over when you
 * pick one ente and one entrega and press the Excel button.
 *
 * Tercera forma de entrada, y la única vía a las entregas que el ministerio no
 * vuelca en masa (sólo publica 2021 entero). No es la tabla plana nacional sino
 * un informe con ocho hojas, tres de las cuales importan, duplicadas por
 * sufijo:
 *
 *   CE1a/CE1b → programa → tipo de gestión
 *   CE2a/CE2b → programa → coste, con el total en la columna `coste_efectivo`
 *   CE3a/CE3b → programa → unidad física + nº de unidades
 *
 * El sufijo de la hoja ES el prefijo del programa: `165` en CE2a es el mismo
 * servicio que `a165` en el volcado nacional, y `151/150P` en CE2b es
 * `b151/150P`. Sin esa traducción el registro de denominadores no casaría con
 * nada y los servicios desaparecerían de la página en silencio.
 *
 * Las columnas se localizan por el TEXTO de su cabecera, no por índice: las
 * hojas `a` y `b` tienen distinto número de columnas de coste.
 */
export function parseCeselInforme(
  buffer: Buffer | ArrayBuffer,
  opts: { anio: number; ine: string; nombre?: string },
): CesteRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })

  const leerHoja = (nombre: string): { head: string[]; filas: unknown[][] } | null => {
    const hoja = wb.Sheets[nombre]
    if (!hoja) return null
    const rows: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null })
    const i = rows.findIndex((r) => String(r?.[0] ?? '').trim() === 'IdInforme')
    if (i < 0) return null
    return { head: rows[i].map((h) => String(h ?? '').trim()), filas: rows.slice(i + 1) }
  }

  const col = (head: string[], re: RegExp) => head.findIndex((h) => re.test(h))
  const out: CesteRow[] = []
  const enteAA = `17-${opts.ine.slice(0, 2)}-${opts.ine.slice(2)}-AA-000`

  /**
   * El informe trae al ente principal Y a sus entidades dependientes: en 2024
   * Riba-roja aparece junto a una Comunidad de Usuarios (`17-00-040-JJ-000`)
   * que declara «No se presta el servicio» para casi todo. Quedarse con la
   * última fila de cada programa —que es lo que hace un `Map.set` ingenuo—
   * convertía el ayuntamiento entero en «no se presta».
   *
   * El volcado nacional publica la fila del ayuntamiento sola, así que para que
   * las dos formas de entrada signifiquen lo mismo hay que filtrar por ente.
   */
  const soloAyuntamiento = (head: string[], filas: unknown[][]) => {
    const iEnte = col(head, /^C[oó]digo Ente$/i)
    if (iEnte < 0) return filas
    return filas.filter((r) => String(r?.[iEnte] ?? '').trim() === enteAA)
  }

  for (const sufijo of ['a', 'b'] as const) {
    const ce1 = leerHoja(`CE1${sufijo}`)
    const ce2 = leerHoja(`CE2${sufijo}`)
    const ce3 = leerHoja(`CE3${sufijo}`)
    if (!ce2) continue

    const iProg2 = col(ce2.head, /^Grupo de programa/i)
    const iCoste = col(ce2.head, /^coste_efectivo$/i)
    if (iProg2 < 0 || iCoste < 0) continue

    const gestion = new Map<string, string>()
    if (ce1) {
      const iProg1 = col(ce1.head, /^Grupo de programa/i)
      const iTipo = col(ce1.head, /^Tipo de Gesti/i)
      if (iProg1 >= 0 && iTipo >= 0) {
        for (const r of soloAyuntamiento(ce1.head, ce1.filas)) {
          const p = String(r?.[iProg1] ?? '').trim()
          if (p) gestion.set(p, String(r[iTipo] ?? '').trim())
        }
      }
    }

    const unidades = new Map<string, UnidadFisica[]>()
    if (ce3) {
      const iProg3 = col(ce3.head, /^Grupo de programa/i)
      const iAtr = col(ce3.head, /^Unidades f[ií]sicas/i)
      const iVal = col(ce3.head, /^N[ºo°]? ?unidades$/i)
      if (iProg3 >= 0 && iAtr >= 0 && iVal >= 0) {
        for (const r of soloAyuntamiento(ce3.head, ce3.filas)) {
          const p = String(r?.[iProg3] ?? '').trim()
          if (!p) continue
          const lista = unidades.get(p) ?? []
          lista.push({ atributo: atributoKey(r[iAtr]), valor: numeric(r[iVal]) })
          unidades.set(p, lista)
        }
      }
    }

    for (const r of soloAyuntamiento(ce2.head, ce2.filas)) {
      const programa = String(r?.[iProg2] ?? '').trim()
      if (!programa) continue
      const codGestionRaw = gestion.get(programa) ?? ''
      const modoGestion = clasificarGestion(codGestionRaw)
      out.push({
        anio: opts.anio,
        ine: opts.ine,
        ente: `17-${opts.ine.slice(0, 2)}-${opts.ine.slice(2)}-AA-000`,
        nombre: opts.nombre ?? '',
        // El sufijo de la hoja es el prefijo del programa en el volcado nacional.
        programa: sufijo + programa,
        modoGestion,
        codGestionRaw,
        costeTotal: modoGestion === 'no-se-presta' ? null : numeric(r[iCoste]),
        unidades: unidades.get(programa) ?? [],
      })
    }
  }
  return out
}
