/**
 * Canonical entity registry — companies (contract winners) and people
 * (officials) with stable ids and merged name variants (see
 * docs/superpowers/specs/2026-07-29-agent-rag-and-entities-design.md §2).
 *
 * Company identity in the upstream data is a raw `assignee` string:
 * Gobierto publishes no winner NIF and TED notices carry no winner name,
 * so "VARESER 96, S.L." and "VARESER 96 SL" are two contractors to every
 * join in the repo. This module derives one canonical company per
 * normalized name key, deterministically:
 *
 *   1. diacritics fold + lowercase + punctuation→space (stripDiacritics)
 *   2. strip legal-form token sequences ONLY at the END of the name
 *      (S.L., SL, S.L.U., Sociedad Limitada, S.A., …)
 *   3. anything cleverer goes through the CURATED overrides file
 *      (public/data/entity-overrides.json) — never fuzzy matching.
 *
 * UTE names are deliberately never merged into member companies: a UTE
 * is a distinct legal entity.
 *
 * Machine output: public/data/entities.json (compute:entities, nightly).
 * Curated input: entity-overrides.json (entity-alias CLI, git-audited).
 */

import { fnv32 } from './hash'
import { stripDiacritics } from './normalize'

// Longest-first within each shadowing group; matched repeatedly against
// the END of the token list. The FAMILY survives as a canonical token in
// the key: "TRANS SABATER SL" and "TRANS SABATER SA" are different legal
// forms (possibly different entities) and must NOT merge — caught on the
// first live build, 2026-07-29. Within a family, spelling variants
// (S.L. / SL / Sociedad Limitada / S.L.U.) still merge.
const LEGAL_FORM_SUFFIXES: Array<{ tokens: string[]; family: string }> = [
  { tokens: ['sociedad', 'limitada', 'unipersonal'], family: 'sl' },
  { tokens: ['sociedad', 'limitada', 'laboral'], family: 'sl' },
  { tokens: ['sociedad', 'limitada'], family: 'sl' },
  { tokens: ['sociedad', 'anonima', 'unipersonal'], family: 'sa' },
  { tokens: ['sociedad', 'anonima'], family: 'sa' },
  { tokens: ['sociedad', 'cooperativa', 'valenciana'], family: 'coop' },
  { tokens: ['sociedad', 'cooperativa'], family: 'coop' },
  { tokens: ['s', 'l', 'u'], family: 'sl' },
  { tokens: ['s', 'l', 'l'], family: 'sl' },
  { tokens: ['s', 'l'], family: 'sl' },
  { tokens: ['s', 'a', 'u'], family: 'sa' },
  { tokens: ['s', 'a'], family: 'sa' },
  { tokens: ['s', 'coop', 'v'], family: 'coop' },
  { tokens: ['s', 'coop'], family: 'coop' },
  { tokens: ['coop', 'v'], family: 'coop' },
  { tokens: ['slu'], family: 'sl' },
  { tokens: ['sll'], family: 'sl' },
  { tokens: ['sl'], family: 'sl' },
  { tokens: ['sau'], family: 'sa' },
  { tokens: ['sa'], family: 'sa' },
  { tokens: ['sccl'], family: 'coop' },
  { tokens: ['scp'], family: 'scp' },
  { tokens: ['cb'], family: 'cb' },
  { tokens: ['aie'], family: 'aie' },
]

/**
 * Normalize a raw company name to its canonical join key: fold +
 * end-suffix strip, with the legal-form FAMILY appended as a canonical
 * token. Deterministic and conservative — a bare name (no legal form)
 * keys without a family token and therefore does NOT auto-merge with
 * its SL/SA namesakes (an honest miss; use the overrides file).
 */
export function normalizeCompanyKey(raw: string): string {
  const folded = stripDiacritics(String(raw ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!folded) return ''
  let tokens = folded.split(' ')
  let family: string | null = null
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of LEGAL_FORM_SUFFIXES) {
      if (tokens.length <= suffix.tokens.length) continue
      const tail = tokens.slice(tokens.length - suffix.tokens.length)
      if (tail.join(' ') === suffix.tokens.join(' ')) {
        tokens = tokens.slice(0, tokens.length - suffix.tokens.length)
        // Innermost form wins when stacked; in practice stacked suffixes
        // belong to the same family.
        family = suffix.family
        changed = true
        break
      }
    }
  }
  return family ? `${tokens.join(' ')} ${family}` : tokens.join(' ')
}

/** Stable company id from the normalized key (shared fnv32 — never fork). */
export function companyIdForKey(key: string): string {
  return `co-${fnv32(key)}`
}

// ─── Curated overrides ──────────────────────────────────────────────────────

export interface EntityAlias {
  /** Normalized key being re-pointed (a variant spelling/naming). */
  variantKey: string
  /** Normalized key it merges into. */
  canonicalKey: string
  note?: string
  curator: string
  addedAt: string
}

export interface EntityOverrides {
  version: number
  generatedAt: string
  aliases: EntityAlias[]
}

class EntityValidationError extends Error {
  constructor(msg: string) {
    super(`entity-overrides.json: ${msg}`)
    this.name = 'EntityValidationError'
  }
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new EntityValidationError(msg)
}

/** Validate + parse the curated overrides file (string or object). */
export function validateEntityOverrides(raw: string | unknown): EntityOverrides {
  const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
  must(o && typeof o === 'object', 'must be an object')
  must(typeof o.version === 'number', 'version must be a number')
  must(typeof o.generatedAt === 'string', 'generatedAt must be a string')
  must(Array.isArray(o.aliases), 'aliases must be an array')
  const aliases: EntityAlias[] = (o.aliases as unknown[]).map((a, i) => {
    must(a && typeof a === 'object', `aliases[${i}] must be an object`)
    const al = a as Record<string, unknown>
    must(
      typeof al.variantKey === 'string' && al.variantKey.trim().length > 0,
      `aliases[${i}].variantKey required`,
    )
    must(
      typeof al.canonicalKey === 'string' && al.canonicalKey.trim().length > 0,
      `aliases[${i}].canonicalKey required`,
    )
    must(
      al.variantKey !== al.canonicalKey,
      `aliases[${i}] is a self-alias (variantKey === canonicalKey)`,
    )
    must(typeof al.curator === 'string' && al.curator.length > 0, `aliases[${i}].curator required`)
    must(
      typeof al.addedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(al.addedAt),
      `aliases[${i}].addedAt must be ISO date`,
    )
    return {
      variantKey: al.variantKey as string,
      canonicalKey: al.canonicalKey as string,
      note: typeof al.note === 'string' ? al.note : undefined,
      curator: al.curator as string,
      addedAt: al.addedAt as string,
    }
  })
  const variantKeys = new Set<string>()
  for (const [i, a] of aliases.entries()) {
    must(!variantKeys.has(a.variantKey), `aliases[${i}] duplicates variantKey ${a.variantKey}`)
    variantKeys.add(a.variantKey)
  }
  for (const [i, a] of aliases.entries()) {
    must(
      !variantKeys.has(a.canonicalKey),
      `aliases[${i}] forms a chain: canonicalKey "${a.canonicalKey}" is itself re-aliased ` +
        '(aliases resolve exactly one hop — point every variant at the final key)',
    )
  }
  return { version: o.version as number, generatedAt: o.generatedAt as string, aliases }
}

// ─── Registry build ─────────────────────────────────────────────────────────

export interface CompanyEntity {
  id: string
  nameKey: string
  canonicalName: string
  variants: string[]
  contractIds: string[]
  contractCount: number
  awardedTotalEur: number
  firstAwardDate: string | null
  lastAwardDate: string | null
}

export interface PersonEntity {
  slug: string
  name: string
  party?: string
  role?: string
}

export interface EntityRegistry {
  generatedAt: string
  source: string
  stats: {
    companies: number
    people: number
    variantsMerged: number
    contractRefs: number
  }
  companies: CompanyEntity[]
  people: PersonEntity[]
}

interface TenderLikeRow {
  id?: string | number
  status?: string
  assignee?: string | null
  finalAmountNoTaxes?: number
  finalAmount?: number
  initialAmountNoTaxes?: number
  initialAmount?: number
  awardDate?: string | null
}

/** Same precedence as src/lib/tender-geo.js contractAmount — sin IVA first. */
function amountOf(c: TenderLikeRow): number {
  if ((c.finalAmountNoTaxes ?? 0) > 0) return c.finalAmountNoTaxes as number
  if ((c.finalAmount ?? 0) > 0) return c.finalAmount as number
  if ((c.initialAmountNoTaxes ?? 0) > 0) return c.initialAmountNoTaxes as number
  return c.initialAmount || 0
}

export function buildEntityRegistry(input: {
  tenders: { contracts?: TenderLikeRow[]; tenders?: TenderLikeRow[] } | null | undefined
  officials: { officials?: Array<Record<string, unknown>> } | null | undefined
  overrides?: EntityOverrides | null
  generatedAt?: string
}): EntityRegistry {
  const aliasMap = new Map<string, string>()
  for (const a of input.overrides?.aliases ?? []) {
    aliasMap.set(a.variantKey, a.canonicalKey)
  }
  const resolveKey = (raw: string): string => {
    const k = normalizeCompanyKey(raw)
    return aliasMap.get(k) ?? k
  }

  interface Acc {
    variantCounts: Map<string, number>
    contractIds: string[]
    awardedTotalEur: number
    firstAwardDate: string | null
    lastAwardDate: string | null
  }
  const byKey = new Map<string, Acc>()
  const rows = [...(input.tenders?.contracts ?? []), ...(input.tenders?.tenders ?? [])]
  let contractRefs = 0
  for (const row of rows) {
    const raw = typeof row?.assignee === 'string' ? row.assignee.trim() : ''
    if (!raw || row?.id == null) continue
    const key = resolveKey(raw)
    if (!key) continue
    let acc = byKey.get(key)
    if (!acc) {
      acc = {
        variantCounts: new Map(),
        contractIds: [],
        awardedTotalEur: 0,
        firstAwardDate: null,
        lastAwardDate: null,
      }
      byKey.set(key, acc)
    }
    acc.variantCounts.set(raw, (acc.variantCounts.get(raw) ?? 0) + 1)
    acc.contractIds.push(String(row.id))
    contractRefs += 1
    if (row.status === 'awarded') {
      acc.awardedTotalEur += amountOf(row)
      const d = typeof row.awardDate === 'string' ? row.awardDate : null
      if (d) {
        if (!acc.firstAwardDate || d < acc.firstAwardDate) acc.firstAwardDate = d
        if (!acc.lastAwardDate || d > acc.lastAwardDate) acc.lastAwardDate = d
      }
    }
  }

  const companies: CompanyEntity[] = [...byKey.entries()].map(([nameKey, acc]) => {
    // canonicalName = most frequent raw variant; ties break to the longest
    // (fuller razón social reads better on public surfaces).
    let canonicalName = ''
    let bestCount = -1
    for (const [variant, count] of acc.variantCounts) {
      if (count > bestCount || (count === bestCount && variant.length > canonicalName.length)) {
        canonicalName = variant
        bestCount = count
      }
    }
    return {
      id: companyIdForKey(nameKey),
      nameKey,
      canonicalName,
      variants: [...acc.variantCounts.keys()].sort(),
      contractIds: acc.contractIds,
      contractCount: acc.contractIds.length,
      awardedTotalEur: Math.round(acc.awardedTotalEur * 100) / 100,
      firstAwardDate: acc.firstAwardDate,
      lastAwardDate: acc.lastAwardDate,
    }
  })
  companies.sort(
    (a, b) => b.awardedTotalEur - a.awardedTotalEur || a.nameKey.localeCompare(b.nameKey),
  )

  const people: PersonEntity[] = (input.officials?.officials ?? [])
    .filter((o) => typeof o?.slug === 'string' && typeof o?.name === 'string')
    .map((o) => ({
      slug: o.slug as string,
      name: o.name as string,
      party: typeof o.party === 'string' ? o.party : undefined,
      role: typeof o.role === 'string' ? o.role : undefined,
    }))

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: 'derived: tenders.json assignees + officials.json · overrides: entity-overrides.json',
    stats: {
      companies: companies.length,
      people: people.length,
      variantsMerged: companies.filter((c) => c.variants.length > 1).length,
      contractRefs,
    },
    companies,
    people,
  }
}
