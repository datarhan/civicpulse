/**
 * Schema + validator for the CURATED councillor-retribuciones dataset
 * (public/data/retribuciones.json).
 *
 * This is a legally-material surface: it states a named elected official's
 * salary. So it is HUMAN-CURATED + CITED (never scraped) and validated like
 * promises.json / sindic.json — every snapshot must carry a source with a
 * verbatim quote (≥20 chars), and a per-official figure is only allowed when it
 * can be attributed to a named person AND matches one of the published bracket
 * amounts. The aggregate bracket figures the press publishes WITHOUT naming who
 * gets what live in the `corporation` block, never silently assigned to a
 * specific councillor.
 */

export interface RetribucionSource {
  publisher: string
  url: string
  date: string
  quote: string
  corroboration?: string[]
}

export interface RetribucionBracket {
  role: 'alcalde' | 'concejal'
  amountEuros: number
  count: number
  label: string
}

export interface RetribucionCorporation {
  seats: number
  dedicacionCount: number
  previousDedicacionCount?: number
  totalAnnualEuros: number
  previousTotalAnnualEuros?: number
  savingAnnualEuros?: number
  brackets: RetribucionBracket[]
}

export interface RetribucionByOfficial {
  slug: string
  amountEuros: number
  regime: string
  note?: string
}

export interface RetribucionesSnapshot {
  generatedAt: string
  mandate: string
  source: RetribucionSource
  note?: string
  corporation: RetribucionCorporation
  byOfficial: RetribucionByOfficial[]
}

export class RetribucionesValidationError extends Error {}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new RetribucionesValidationError(msg)
}

const isNonNegNum = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0

export function validateRetribucionesSnapshot(json: unknown): RetribucionesSnapshot {
  const s = json as RetribucionesSnapshot
  must(s && typeof s === 'object', 'snapshot must be an object')
  must(typeof s.mandate === 'string' && s.mandate.length >= 4, 'mandate required')

  const src = s.source
  must(src && typeof src === 'object', 'source required')
  must(typeof src.url === 'string' && /^https?:\/\//.test(src.url), 'source.url must be a URL')
  must(typeof src.publisher === 'string' && src.publisher.length > 0, 'source.publisher required')
  must(
    typeof src.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(src.date),
    'source.date must be ISO',
  )
  must(
    typeof src.quote === 'string' && src.quote.length >= 20,
    'source.quote must be a verbatim citation ≥20 chars',
  )

  const c = s.corporation
  must(c && typeof c === 'object', 'corporation required')
  must(
    isNonNegNum(c.seats) && isNonNegNum(c.dedicacionCount),
    'corporation.seats / dedicacionCount must be ≥0 numbers',
  )
  must(c.dedicacionCount <= c.seats, 'dedicacionCount cannot exceed seats')
  must(isNonNegNum(c.totalAnnualEuros), 'corporation.totalAnnualEuros must be a ≥0 number')
  must(Array.isArray(c.brackets) && c.brackets.length > 0, 'corporation.brackets required')
  for (const b of c.brackets) {
    must(b.role === 'alcalde' || b.role === 'concejal', 'bracket.role must be alcalde|concejal')
    must(isNonNegNum(b.amountEuros) && isNonNegNum(b.count), 'bracket amount/count must be ≥0')
    must(typeof b.label === 'string' && b.label.length > 0, 'bracket.label required')
  }

  // A per-official figure must be attributable: a non-empty slug + regime AND an
  // amount that matches one of the published brackets (no out-of-band numbers).
  const bracketAmounts = new Set(c.brackets.map((b) => b.amountEuros))
  must(Array.isArray(s.byOfficial), 'byOfficial must be an array')
  const seen = new Set<string>()
  for (const o of s.byOfficial) {
    must(typeof o.slug === 'string' && o.slug.length > 0, 'byOfficial.slug required')
    must(!seen.has(o.slug), `duplicate byOfficial slug: ${o.slug}`)
    seen.add(o.slug)
    must(isNonNegNum(o.amountEuros), `byOfficial[${o.slug}].amountEuros must be a ≥0 number`)
    must(
      bracketAmounts.has(o.amountEuros),
      `byOfficial[${o.slug}].amountEuros ${o.amountEuros} is not one of the published brackets`,
    )
    must(
      typeof o.regime === 'string' && o.regime.length > 0,
      `byOfficial[${o.slug}].regime required`,
    )
  }

  return s
}
