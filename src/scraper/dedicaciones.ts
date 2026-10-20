/**
 * Schema + validator for the CURATED per-councillor dedicaciones dataset
 * (public/data/dedicaciones.json).
 *
 * This is the project's most libel-material surface: it states a NAMED elected
 * official's salary. It is human-curated + cited (NEVER scraped) and validated
 * like promises.json. The figures come from the pleno acuerdo that sets the
 * régimen económico — today the 16/03/2026 update (Expediente 1462/2026/GEN) of
 * the 07/07/2023 acuerdo (Expediente 4533/2023/GEN) — which assigns each amount
 * to a PUESTO (Alcaldía, a numbered Tenencia de Alcaldía, a concejalía delegada
 * with its áreas), never to a person.
 *
 * Which councillor holds each puesto is the curator's attribution, and it rests
 * on the appointment acts, not on officials.json: the Tenencias on the
 * Alcaldía resolution that names them (Res. 2512/2023), the concejalías on the
 * delegation decree (Res. 2513/2023), both read into the 07/07/2023 pleno. The
 * áreas the acuerdo gives a Tenencia can share nothing with its holder's
 * current officials.json portfolios, so "the áreas match" is not a basis the
 * note may claim. Guards:
 *   - the source must carry a URL, an ISO date, and a verbatim quote (≥20),
 *   - every amount published (brackets and byOfficial) must be written, in
 *     Spanish notation, in that quote or in one of `source.amountQuotes` —
 *     further verbatim passages of the SAME document. A ≥20-character quote
 *     that supports none of the figures ("Fijar un incremento … para la
 *     anualidad 2026") cited the act without citing the numbers; a salary
 *     beside a named person needs the passage that fixes it,
 *   - every per-official amount must match one of the published brackets
 *     (no out-of-band number can be attributed to a named person),
 *   - the note may not say the councillors without dedicación receive ONLY
 *     session attendance: the régimen the acuerdo sets also pays each wedding
 *     officiated, attendance at other bodies and dietas (acuerdo of
 *     07/07/2023, TERCERO and CUARTO). What they receive is the curator's to
 *     word; "only" is a claim the acuerdo contradicts,
 *   - a row whose amount includes the holder's personal seniority carries it
 *     as `antiguedadEuros` with `antiguedadQuote`, one of the passages the
 *     source already cites, which must write the total, the seniority AND the
 *     base that results (total − antigüedad). The 2026 cuadro gives the
 *     Alcaldía «53.734,99 5.460,49 59.195,48»: the page published the total as
 *     «lo fijado por cargo», and beside ISPA's 48.647,50 € for 2024 it read as
 *     a 21,7 % raise where the base rose 11,4 %. Seniority belongs to whoever
 *     holds the cargo, not to the cargo, so the page has to be able to say so
 *     — from a field, never from a sentence typed beside the figure,
 *   - slugs are unique.
 */

export interface DedicacionSource {
  title: string
  url: string
  date: string
  expediente?: string
  quote: string
  /**
   * More verbatim passages of the same document, for when the figures sit in
   * a table that no single contiguous quote spans. Each one is copied from the
   * act, never retyped.
   */
  amountQuotes?: string[]
}

export interface DedicacionBracket {
  amountEuros: number
  count: number
}

export interface DedicacionByOfficial {
  slug: string
  amountEuros: number
  dedicacion: 'exclusiva' | 'parcial'
  role: string
  /**
   * The part of `amountEuros` that is the holder's personal seniority
   * (antigüedad, trienios), when the act writes it apart. Absent when the act
   * gives none; never 0 — a zero says nothing a missing field does not.
   */
  antiguedadEuros?: number
  /** The passage (one of the source's own) that writes base, antigüedad and total. */
  antiguedadQuote?: string
}

export interface DedicacionesSnapshot {
  generatedAt: string
  mandate: string
  source: DedicacionSource
  note?: string
  brackets: DedicacionBracket[]
  sinDedicacionCount?: number
  byOfficial: DedicacionByOfficial[]
}

export class DedicacionesValidationError extends Error {}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new DedicacionesValidationError(msg)
}

const isPosNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/**
 * The ways a Spanish act writes `n` euros: «59.195,48» and «59195,48».
 * Exported so the test builds its fixtures from it rather than restating it.
 */
export function importeEnNotacionEs(n: number): string[] {
  const [ent, dec] = n.toFixed(2).split('.')
  const agrupado = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return agrupado === ent ? [`${ent},${dec}`] : [`${agrupado},${dec}`, `${ent},${dec}`]
}

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether `texto` writes the amount `n` as a whole figure — «47.978,79» is not
 * found inside «147.978,79» nor inside «47.978,795».
 */
export function textoContieneImporte(texto: string, n: number): boolean {
  return importeEnNotacionEs(n).some((f) =>
    new RegExp(`(?<![\\d.,])${escapeRe(f)}(?![\\d]|[.,]\\d)`).test(texto),
  )
}

/**
 * «solo/sólo/únicamente/exclusivamente … asistencias»: the acuerdo's régimen
 * for the councillors without dedicación is not only session attendance.
 */
export const NOTA_SOLO_ASISTENCIAS =
  /(?<![\p{L}])(?:s[oó]lo|únicamente|exclusivamente)\s+(?:perciben\s+|cobran\s+)?(?:las\s+)?asistencias/iu

/** Cents, so 59.195,48 − 5.460,49 is 53.734,99 and not 53.734,990000000005. */
const enCentimos = (n: number) => Math.round(n * 100) / 100

/**
 * The seniority inside one row's amount, if the curator recorded it. Both
 * fields or neither; the passage must be one the source already cites (a
 * retyped line is not a quote) and must write all three figures, so the base
 * the page derives is a figure the act itself prints.
 */
function validarAntiguedad(o: DedicacionByOfficial, pasajes: string[]) {
  const tiene = o.antiguedadEuros !== undefined
  const cita = o.antiguedadQuote !== undefined
  if (!tiene && !cita) return
  must(
    tiene,
    `byOfficial[${o.slug}].antiguedadEuros required beside antiguedadQuote — a passage with no figure says nothing`,
  )
  must(
    cita,
    `byOfficial[${o.slug}].antiguedadQuote required beside antiguedadEuros — seniority beside a named person needs the passage that writes it`,
  )
  const a = o.antiguedadEuros as number
  must(
    isPosNum(a) && a < o.amountEuros,
    `byOfficial[${o.slug}].antiguedadEuros must be > 0 and below amountEuros (omit the field when the act gives none)`,
  )
  const q = o.antiguedadQuote as string
  must(
    pasajes.includes(q),
    `byOfficial[${o.slug}].antiguedadQuote must be source.quote or one of source.amountQuotes, copied exactly`,
  )
  const base = enCentimos(o.amountEuros - a)
  must(
    textoContieneImporte(q, o.amountEuros) && textoContieneImporte(q, a),
    `byOfficial[${o.slug}].antiguedadQuote does not write the total ${importeEnNotacionEs(o.amountEuros)[0]} and the antigüedad ${importeEnNotacionEs(a)[0]}`,
  )
  must(
    textoContieneImporte(q, base),
    `byOfficial[${o.slug}].antiguedadQuote does not write the base ${importeEnNotacionEs(base)[0]} (total − antigüedad)`,
  )
}

export function validateDedicacionesSnapshot(json: unknown): DedicacionesSnapshot {
  const s = json as DedicacionesSnapshot
  must(s && typeof s === 'object', 'snapshot must be an object')
  must(typeof s.mandate === 'string' && s.mandate.length >= 4, 'mandate required')

  const src = s.source
  must(src && typeof src === 'object', 'source required')
  must(typeof src.url === 'string' && /^https?:\/\//.test(src.url), 'source.url must be a URL')
  must(
    typeof src.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(src.date),
    'source.date must be ISO',
  )
  must(
    typeof src.quote === 'string' && src.quote.length >= 20,
    'source.quote must be a verbatim citation ≥20 chars',
  )

  const pasajes: string[] = [src.quote]
  if (src.amountQuotes !== undefined) {
    must(Array.isArray(src.amountQuotes), 'source.amountQuotes must be an array')
    for (const q of src.amountQuotes) {
      must(
        typeof q === 'string' && q.length >= 20,
        'source.amountQuotes: each must be a verbatim passage ≥20 chars',
      )
      pasajes.push(q)
    }
  }
  const citado = (n: number) => pasajes.some((q) => textoContieneImporte(q, n))

  must(
    s.note === undefined || (typeof s.note === 'string' && !NOTA_SOLO_ASISTENCIAS.test(s.note)),
    'note: the councillors without dedicación do not receive ONLY session attendance — the acuerdo also pays weddings officiated, other bodies and dietas (07/07/2023, TERCERO and CUARTO)',
  )

  must(Array.isArray(s.brackets) && s.brackets.length > 0, 'brackets required')
  const bracketAmounts = new Set<number>()
  for (const b of s.brackets) {
    must(
      isPosNum(b.amountEuros) && Number.isFinite(b.count),
      'bracket amount/count must be numbers',
    )
    bracketAmounts.add(b.amountEuros)
    must(
      citado(b.amountEuros),
      `bracket ${importeEnNotacionEs(b.amountEuros)[0]} € is not written in source.quote nor in source.amountQuotes`,
    )
  }

  must(Array.isArray(s.byOfficial) && s.byOfficial.length > 0, 'byOfficial required')
  const seen = new Set<string>()
  for (const o of s.byOfficial) {
    must(typeof o.slug === 'string' && o.slug.length > 0, 'byOfficial.slug required')
    must(!seen.has(o.slug), `duplicate byOfficial slug: ${o.slug}`)
    seen.add(o.slug)
    must(isPosNum(o.amountEuros), `byOfficial[${o.slug}].amountEuros must be > 0`)
    must(
      bracketAmounts.has(o.amountEuros),
      `byOfficial[${o.slug}].amountEuros ${o.amountEuros} is not one of the published brackets`,
    )
    must(
      citado(o.amountEuros),
      `byOfficial[${o.slug}].amountEuros ${importeEnNotacionEs(o.amountEuros)[0]} € is not written in source.quote nor in source.amountQuotes`,
    )
    must(
      o.dedicacion === 'exclusiva' || o.dedicacion === 'parcial',
      `byOfficial[${o.slug}].dedicacion enum`,
    )
    must(typeof o.role === 'string' && o.role.length > 0, `byOfficial[${o.slug}].role required`)
    validarAntiguedad(o, pasajes)
  }

  return s
}

/** Per-official figure for a slug, or null. */
export function dedicacionForSlug(snap: DedicacionesSnapshot | null, slug: string) {
  return snap?.byOfficial.find((o) => o.slug === slug) || null
}
