/**
 * Schema + validator for the CURATED per-councillor dedicaciones dataset
 * (public/data/dedicaciones.json).
 *
 * This is the project's most libel-material surface: it states a NAMED elected
 * official's salary. It is human-curated + cited (NEVER scraped) and validated
 * like promises.json. The figures come from the pleno acuerdo that fixes the
 * régimen económico (Expediente 4533/2023/GEN, 07/07/2023), which assigns each
 * amount to a CARGO (role + delegated áreas); each cargo is mapped to its
 * concejal because the áreas in the acuerdo coincide literally with the
 * officials.json portfolios. Guards:
 *   - the source must carry a URL, an ISO date, and a verbatim quote (≥20),
 *   - every per-official amount must match one of the published brackets
 *     (no out-of-band number can be attributed to a named person),
 *   - slugs are unique.
 */

export interface DedicacionSource {
  title: string
  url: string
  date: string
  expediente?: string
  quote: string
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

  must(Array.isArray(s.brackets) && s.brackets.length > 0, 'brackets required')
  const bracketAmounts = new Set<number>()
  for (const b of s.brackets) {
    must(
      isPosNum(b.amountEuros) && Number.isFinite(b.count),
      'bracket amount/count must be numbers',
    )
    bracketAmounts.add(b.amountEuros)
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
      o.dedicacion === 'exclusiva' || o.dedicacion === 'parcial',
      `byOfficial[${o.slug}].dedicacion enum`,
    )
    must(typeof o.role === 'string' && o.role.length > 0, `byOfficial[${o.slug}].role required`)
  }

  return s
}

/** Per-official figure for a slug, or null. */
export function dedicacionForSlug(snap: DedicacionesSnapshot | null, slug: string) {
  return snap?.byOfficial.find((o) => o.slug === slug) || null
}
