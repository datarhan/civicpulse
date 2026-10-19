/**
 * Watch the vocabulary our upstreams actually speak.
 *
 * The most expensive bug of 2026-08-02 was one word. Gobierto emits `formalized`
 * for a signed contract; our enum listed `finalized`, a word the source has
 * never used. `normStatus` coerced all 298 of them to `unknown`, every total was
 * written as `status === 'awarded'`, and €53.5M across 314 signed contracts —
 * including the largest contract the town has ever let — silently disappeared
 * from the published site for months.
 *
 * Nothing caught it. The parser did not throw: coercion is what it is for. The
 * enum test passed, because its hand-written allow-set contained `unknown`, so
 * every mis-coerced row landed on a permitted value. The site rendered a number.
 * Only a human comparing a rendered total against a contract they knew about
 * would ever have noticed.
 *
 * Two signals catch it, and both are arithmetic:
 *
 *   1. **Fallback share.** A field where a large slice of rows lands on
 *      `unknown`/`otro` is a field whose vocabulary we have misread. Before the
 *      fix, `contracts.status` was 41% unknown; after, 5.2%.
 *   2. **New values.** A value the upstream has never emitted before is worth a
 *      human glance the DAY it appears, whether or not it falls into fallback —
 *      because the alternative is finding out when someone notices a number is
 *      wrong. This is why the census is committed: a fresh baseline every run
 *      would make the check unable to fail, which is the exact defect this file
 *      exists to prevent.
 *
 * Pure — no fs, no clock.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2026-10-19: UN AVISO QUE NADIE LEÍA
 *
 * Medido ese día sobre main: 42 avisos cada noche, con la línea base sin
 * aceptar desde el 03-09. Tres defectos los tenían ahí:
 *
 *   · Ruido. `bop.json` guarda seis anuncios, así que sus ids, URL, fechas y
 *     títulos pasaban el tope de 12 valores distintos y cada anuncio nuevo era
 *     «vocabulario nuevo»: 35 de los 42. Un vocabulario es un campo cuyos
 *     valores SE REPITEN y que no es un id, un enlace, una fecha, un sello ni un
 *     correo (`esCampoDeVocabulario`).
 *   · Nadie se enteraba. Un aviso salía 0, `scrape-all.sh` sólo marca los que
 *     fallan, y el parte de salud no ejecutaba esta guarda. Entre el ruido iban
 *     tres palabras de verdad nuevas —`minor_contract`, `educacion`, `social`—
 *     que nadie vio. Ahora cualquier hallazgo sale con 1 y `monitor:health` lo
 *     manda en su parte, con la clase entre corchetes para la huella.
 *   · Nuestras palabras pasaban por del origen. Desde #390 el parser traduce el
 *     estado de las licitaciones; las palabras traducidas no son deriva de
 *     Gobierto y no deben pedir a nadie un `--accept` (`CAMPOS_TRADUCIDOS`). La
 *     palabra de Gobierto se vigila en `sourceStatus`.
 */
import { ESTADOS_DE_LICITACION_TRADUCIDOS } from './tenders'

export interface FieldCensus {
  /** `snapshot.collection.field`, e.g. `tenders.contracts.status`. */
  path: string
  /** value → count, for the low-cardinality fields only. */
  values: Record<string, number>
}

export interface CensusFinding {
  path: string
  kind: 'fallback-share' | 'new-value' | 'value-vanished'
  detail: string
  severity: 'warn' | 'error'
}

/** Values that mean "we could not read this", across the languages in play. */
export const FALLBACK_VALUES = new Set([
  'unknown',
  'otro',
  'other',
  'desconocido',
  'sin-datos',
  'n/a',
  '',
])

/**
 * Above this share of rows landing in a fallback, we are probably misreading the
 * source rather than the source being genuinely vague. 15% is chosen to sit well
 * clear of the healthy 5.2% and well below the 41% the bug produced.
 */
export const FALLBACK_CEILING = 0.15

/** Fields with more distinct values than this are free text, not vocabulary. */
export const MAX_ENUM_CARDINALITY = 12

/**
 * Below this many rows, a fallback share means nothing.
 *
 * The check's own first real run proved the need: `boe.items.epigrafe` tripped
 * the error threshold at 50% — which was 2 empty values out of 4 rows, in a
 * snapshot that legitimately holds a handful of entries, some of which have no
 * epigrafe at all. A percentage over a four-row sample is noise, and noise is
 * how a check earns a reputation for crying wolf and gets ignored. The
 * formalized bug it exists to catch was 298 rows out of 730.
 */
export const MIN_ROWS_FOR_SHARE = 30

/**
 * Campos que escribe una traducción NUESTRA, con todo lo que puede escribir.
 * Una palabra de ese conjunto que aparece, o una de fuera que deja de aparecer,
 * la ha movido el parser y no el origen. Lo que la traducción no puede producir
 * sigue avisando: eso sí sería un defecto, nuestro o de la fuente.
 */
export const CAMPOS_TRADUCIDOS: Readonly<Record<string, ReadonlySet<string>>> = {
  'tenders.tenders.status': ESTADOS_DE_LICITACION_TRADUCIDOS,
}

/** snapshot file → collections inside it worth censusing. */
export const WATCHED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['tenders.json', ['contracts', 'tenders']],
  ['plenos.json', ['items']],
  ['empleo.json', ['items']],
  ['boe.json', ['items']],
  ['bop.json', ['anuncios']],
  ['quejas.json', ['items']],
  ['officials.json', ['officials']],
  ['pleno-votes.json', ['items']],
  ['promises.json', ['items']],
]

/** Nombres de campo que nunca son vocabulario: identifican, enlazan o fechan. */
const NO_ES_VOCABULARIO = /^(?:id|date|email)$|(?:Id|Url|At|Date)$/

/**
 * ¿Es este campo un vocabulario —un puñado de palabras que se repiten— o una
 * lista de cosas? Un campo en el que ningún valor se repite es una lista,
 * quepa o no bajo el tope; y un id, un enlace, una fecha, un sello o un correo
 * no lo son aunque se repitan (los anuncios del BOP, los plenos de una
 * votación, el día en que se dio de alta un lote de promesas).
 */
export function esCampoDeVocabulario(campo: string, values: Record<string, number>): boolean {
  if (NO_ES_VOCABULARIO.test(campo)) return false
  const cuentas = Object.values(values)
  if (cuentas.length < 2 || cuentas.length > MAX_ENUM_CARDINALITY) return false
  return cuentas.some((n) => n >= 2)
}

/**
 * El censo de unos snapshots ya leídos, `{ 'tenders.json': doc, … }`. Un campo
 * entra si alguna fila lo trae como texto, no sólo la primera: `sourceStatus`
 * es `null` donde Gobierto deja el estado en blanco.
 */
export function censoDe(docs: Readonly<Record<string, unknown>>): FieldCensus[] {
  const out: FieldCensus[] = []
  for (const [file, collections] of WATCHED) {
    const doc = docs[file] as Record<string, unknown> | undefined
    if (!doc || typeof doc !== 'object') continue
    for (const coll of collections) {
      const rows = doc[coll]
      if (!Array.isArray(rows) || rows.length === 0) continue
      const campos = new Set<string>()
      for (const r of rows as Array<Record<string, unknown>>)
        for (const [k, v] of Object.entries(r ?? {})) if (typeof v === 'string') campos.add(k)
      for (const field of campos) {
        const counts: Record<string, number> = {}
        for (const r of rows as Array<Record<string, unknown>>) {
          const v = r?.[field]
          if (typeof v === 'string') counts[v] = (counts[v] ?? 0) + 1
        }
        if (!esCampoDeVocabulario(field, counts)) continue
        out.push({ path: `${file.replace('.json', '')}.${coll}.${field}`, values: counts })
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Lo que imprime la guarda y con qué código sale. Todo hallazgo sale con 1:
 * un aviso que sale 0 no lo lee nadie, que es como `minor_contract` llevaba
 * semanas sin que nadie lo viera. Cada renglón lleva `✗` y la clase entre
 * corchetes, que es lo que `pickCheckDiagnosis` y la huella del parte leen.
 */
export function informeDeVocabulario(
  campos: number,
  findings: CensusFinding[],
): { texto: string; codigo: 0 | 1 } {
  const errores = findings.filter((f) => f.severity === 'error').length
  const lineas = [
    `[vocabulary] ${campos} field(s) · ${errores} error · ${findings.length - errores} warn`,
    '',
  ]
  // Un renglón por hallazgo, con el valor dentro: el parte sólo se lleva el
  // renglón marcado, y «processType» a secas no dice qué palabra apareció.
  for (const f of findings) lineas.push(`  ✗ [${f.kind}] ${f.path} — ${f.detail}`)
  if (findings.length === 0) lineas.push('  vocabulary unchanged.')
  else
    lineas.push(
      '',
      '  If the parser handles every value above, accept the current vocabulary with:',
      '  npm run check:vocabulary -- --accept',
    )
  return { texto: lineas.join('\n'), codigo: findings.length > 0 ? 1 : 0 }
}

export function censusFindings(
  current: FieldCensus[],
  baseline: FieldCensus[],
  traducidos: Readonly<Record<string, ReadonlySet<string>>> = CAMPOS_TRADUCIDOS,
): CensusFinding[] {
  const out: CensusFinding[] = []
  const base = new Map(baseline.map((b) => [b.path, b]))

  for (const c of current) {
    const total = Object.values(c.values).reduce((a, b) => a + b, 0)
    if (total === 0) continue

    const fb = Object.entries(c.values)
      .filter(([v]) => FALLBACK_VALUES.has(v.toLowerCase()))
      .reduce((a, [, n]) => a + n, 0)
    const share = fb / total
    if (share > FALLBACK_CEILING && total >= MIN_ROWS_FOR_SHARE) {
      out.push({
        path: c.path,
        kind: 'fallback-share',
        severity: 'error',
        detail:
          `${Math.round(share * 100)}% of rows fall back to unknown ` +
          `(${fb}/${total}). The source vocabulary has probably moved — compare ` +
          `the parser's allow-set against the raw values.`,
      })
    }

    const prev = base.get(c.path)
    if (!prev) continue // first sighting of a field is not drift
    const nuestras = traducidos[c.path]
    for (const v of Object.keys(c.values)) {
      if (nuestras?.has(v)) continue // la escribió nuestra traducción
      if (!(v in prev.values)) {
        out.push({
          path: c.path,
          kind: 'new-value',
          severity: 'warn',
          detail: `new upstream value ${JSON.stringify(v)} (${c.values[v]} row(s)) — is the parser expecting it?`,
        })
      }
    }
    // A value that used to be common and is now absent is the same smell in
    // reverse: an upstream rename we have started dropping on the floor.
    for (const [v, n] of Object.entries(prev.values)) {
      // Una palabra que la traducción ya no puede escribir la retiró el parser.
      if (nuestras && !nuestras.has(v)) continue
      if (n >= 10 && !(v in c.values)) {
        out.push({
          path: c.path,
          kind: 'value-vanished',
          severity: 'warn',
          detail: `value ${JSON.stringify(v)} had ${n} row(s) and is now absent — renamed upstream?`,
        })
      }
    }
  }
  return out
}

/** Build a census from parsed rows. Skips free-text and numeric fields. */
export function buildCensus(
  path: string,
  rows: Array<Record<string, unknown>>,
): FieldCensus | null {
  if (!rows.length) return null
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const v = r[path.split('.').pop() as string]
    if (typeof v !== 'string') continue
    counts[v] = (counts[v] ?? 0) + 1
  }
  const distinct = Object.keys(counts).length
  if (distinct < 2 || distinct > MAX_ENUM_CARDINALITY) return null
  return { path, values: counts }
}
