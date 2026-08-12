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
 * Parse a CESEL *report* — the shape the consulta hands over, as opposed to the
 * flat national dump.
 *
 * Cubre las dos variantes del informe, que difieren en cómo reparten las hojas:
 *
 *   por ENTE      CE1a (gestión) + CE2a (coste) + CE3a (unidades), cabecera que
 *                 empieza por `IdInforme`, un solo ente y sus dependientes.
 *   por COMUNIDAD «CE1a y CE2a» (gestión y coste juntos) + CE3a, cabecera que
 *                 empieza por `Provincia`, todos los entes de la comunidad.
 *
 * Las dos son la única vía a las entregas que el ministerio no vuelca en masa
 * —sólo publica 2021 entero— y la de comunidad es además la única que da PARES
 * de otros años, sin los cuales una comparación quedaría anclada a 2021 para
 * siempre.
 *
 * El sufijo de la hoja ES el prefijo del programa: `165` en CE2a es el mismo
 * servicio que `a165` en el volcado nacional. Sin esa traducción el registro de
 * denominadores no casaría con nada y los servicios desaparecerían en silencio.
 *
 * Ni las columnas ni la fila de cabecera se localizan por índice: las hojas `a`
 * y `b` no tienen el mismo número de columnas de coste y las dos variantes
 * empiezan la tabla a distinta altura.
 */
export function parseCeselInforme(
  buffer: Buffer | ArrayBuffer,
  opts: { anio: number; soloEntes?: Set<string> },
): CesteRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })

  interface Tabla {
    head: string[]
    filas: unknown[][]
  }
  const leer = (nombre: string): Tabla | null => {
    const hoja = wb.Sheets[nombre]
    if (!hoja) return null
    const rows: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null })
    // La cabecera es la fila que contiene la columna del programa; buscarla en
    // vez de fijar el índice cubre las dos variantes de una vez.
    const i = rows.findIndex((r) =>
      (r ?? []).some((c) => /^Grupo de programa/i.test(String(c ?? '').trim())),
    )
    if (i < 0) return null
    return { head: rows[i].map((h) => String(h ?? '').trim()), filas: rows.slice(i + 1) }
  }
  const col = (t: Tabla, re: RegExp) => t.head.findIndex((h) => re.test(h))

  const out: CesteRow[] = []

  for (const sufijo of ['a', 'b'] as const) {
    const costes = leer(`CE${1}${sufijo} y CE2${sufijo}`) ?? leer(`CE2${sufijo}`)
    if (!costes) continue
    const iProg = col(costes, /^Grupo de programa/i)
    const iCoste = col(costes, /^coste_efectivo$/i)
    const iEnte = col(costes, /^C[oó]digo Ente$/i)
    const iNombre = col(costes, /^Nombre Ente$/i)
    if (iProg < 0 || iCoste < 0 || iEnte < 0) continue

    // La gestión viene en la misma hoja (variante comunidad) o en CE1 aparte.
    const iGestionAqui = col(costes, /^Tipo de Gesti/i)
    const gestion = new Map<string, string>()
    if (iGestionAqui < 0) {
      const ce1 = leer(`CE1${sufijo}`)
      if (ce1) {
        const p1 = col(ce1, /^Grupo de programa/i)
        const e1 = col(ce1, /^C[oó]digo Ente$/i)
        const g1 = col(ce1, /^Tipo de Gesti/i)
        if (p1 >= 0 && g1 >= 0) {
          for (const r of ce1.filas) {
            const clave = `${e1 >= 0 ? String(r?.[e1] ?? '').trim() : ''}|${String(r?.[p1] ?? '').trim()}`
            gestion.set(clave, String(r?.[g1] ?? '').trim())
          }
        }
      }
    }

    // Unidades físicas, siempre en CE3.
    const ce3 = leer(`CE3${sufijo}`)
    const unidades = new Map<string, UnidadFisica[]>()
    if (ce3) {
      const p3 = col(ce3, /^Grupo de programa/i)
      const e3 = col(ce3, /^C[oó]digo Ente$/i)
      const a3 = col(ce3, /^Unidades f[ií]sicas/i)
      const v3 = col(ce3, /^N[ºo°]? ?unidades$/i)
      if (p3 >= 0 && a3 >= 0 && v3 >= 0) {
        for (const r of ce3.filas) {
          const ente = e3 >= 0 ? String(r?.[e3] ?? '').trim() : ''
          const programa = String(r?.[p3] ?? '').trim()
          if (!programa) continue
          const clave = `${ente}|${programa}`
          const lista = unidades.get(clave) ?? []
          lista.push({ atributo: atributoKey(r?.[a3]), valor: numeric(r?.[v3]) })
          unidades.set(clave, lista)
        }
      }
    }

    for (const r of costes.filas) {
      const ente = String(r?.[iEnte] ?? '').trim()
      const ine = ineFromEnte(ente)
      // Sólo ayuntamientos. El informe por ente trae además a sus entidades
      // dependientes —Riba-roja aparece junto a una Comunidad de Usuarios que
      // declara «no se presta» en casi todo—, y quedarse con la última fila de
      // cada programa convertía al ayuntamiento entero en un servicio ausente.
      if (!ine) continue
      if (opts.soloEntes && !opts.soloEntes.has(ine)) continue
      const programa = String(r?.[iProg] ?? '').trim()
      if (!programa) continue
      const clave = `${ente}|${programa}`
      const codGestionRaw =
        iGestionAqui >= 0 ? String(r?.[iGestionAqui] ?? '').trim() : (gestion.get(clave) ?? '')
      const modoGestion = clasificarGestion(codGestionRaw)
      out.push({
        anio: opts.anio,
        ine,
        ente,
        nombre: iNombre >= 0 ? String(r?.[iNombre] ?? '').trim() : '',
        programa: sufijo + programa,
        modoGestion,
        codGestionRaw,
        costeTotal: modoGestion === 'no-se-presta' ? null : numeric(r?.[iCoste]),
        unidades: unidades.get(clave) ?? [],
      })
    }
  }
  return out
}
