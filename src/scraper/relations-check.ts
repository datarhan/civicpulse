/**
 * Cross-snapshot referential-integrity checks — the "foreign keys" of
 * the flat-file data architecture (see docs/superpowers/specs/
 * 2026-07-29-data-layer-refactor-design.md §W3).
 *
 * Every per-file validator in this repo guards its own snapshot at write
 * time; nothing audited the committed snapshot SET as a whole, so a
 * cross-file break (a finding citing a re-keyed claimId, a manifest
 * pointing at a pruned chunk, a relation referencing a re-scraped
 * tender) could ship silently — the class of bug documented in
 * scrape-queja-contract-relations.ts ("the previous correlator rotted
 * here"). This module is pure: the CLI (scripts/check-relations.ts)
 * does the I/O and decides the exit code.
 *
 * Levels: 'error' = a published surface would render a dangling
 * reference; 'warn' = known debt worth surfacing (stale overlay entries
 * after a re-extract, best-effort agenda joins, curated-vs-scraped slug
 * drift) that must not red a nightly.
 */

import { ALLOWED_DEPARTMENT_SLUGS } from './departments'
import { normalizeCompanyKey } from './entities'

export type CheckLevel = 'error' | 'warn'
export type CheckStatus = 'ok' | 'broken' | 'skipped'

export interface RelationCheckResult {
  name: string
  level: CheckLevel
  status: CheckStatus
  /** Number of references examined (0 when skipped). */
  checked: number
  /** Sample of broken references, capped at 20. */
  broken: string[]
}

export interface RelationsCheckInputs {
  verified?: { items?: Array<{ claim?: { id?: string } }> } | null
  overlay?: { entries?: Record<string, unknown> } | null
  manifest?: {
    plenos?: Array<{ plenoId?: string; chunkPath?: string; itemCount?: number }>
    totals?: { items?: number }
  } | null
  /** Parsed chunk files keyed by their manifest chunkPath. */
  chunkFiles?: Record<string, { items?: unknown[] } | null> | null
  findings?: {
    items?: Array<{ id?: string; sourceClaimIds?: string[]; relatedPromiseIds?: string[] }>
  } | null
  plenos?: { items?: Array<{ id?: string }> } | null
  votes?: { items?: Array<{ id?: string; plenoId?: string; itemNumber?: number }> } | null
  /** plenos-agendas.json — agenda items carry `number` (not itemNumber). */
  agendas?: { plenos?: Array<{ id?: string; agenda?: Array<{ number?: number }> }> } | null
  promises?: { items?: Array<{ id?: string; departmentSlug?: string | null }> } | null
  promiseSuggestions?: { suggestions?: Array<{ promiseId?: string }> } | null
  quejas?: { items?: Array<{ service_request_id?: string }> } | null
  tenders?: {
    contracts?: Array<{ id?: string | number }>
    tenders?: Array<{ id?: string | number }>
  } | null
  relations?: { links?: Array<{ quejaId?: string; tenderId?: string | number }> } | null
  approvedRelations?: {
    approvals?: Array<{ quejaId?: string; tenderId?: string | number }>
  } | null
  dedicaciones?: { byOfficial?: Array<{ slug?: string }> } | null
  officials?: { officials?: Array<{ slug?: string }> } | null
  entities?: {
    companies?: Array<{
      id?: string
      nameKey?: string
      variants?: string[]
      contractIds?: Array<string | number>
    }>
  } | null
  entityOverrides?: {
    aliases?: Array<{ variantKey?: string; canonicalKey?: string }>
  } | null
}

const CAP = 20

function check(
  name: string,
  level: CheckLevel,
  available: boolean,
  run: () => { checked: number; broken: string[] },
): RelationCheckResult {
  if (!available) return { name, level, status: 'skipped', checked: 0, broken: [] }
  const { checked, broken } = run()
  return {
    name,
    level,
    status: broken.length > 0 ? 'broken' : 'ok',
    checked,
    broken: broken.slice(0, CAP),
  }
}

export function runRelationsChecks(inputs: RelationsCheckInputs): RelationCheckResult[] {
  const {
    verified,
    overlay,
    manifest,
    chunkFiles,
    findings,
    plenos,
    votes,
    agendas,
    promises,
    promiseSuggestions,
    quejas,
    tenders,
    relations,
    approvedRelations,
    dedicaciones,
    officials,
    entities,
    entityOverrides,
  } = inputs

  const verifiedIds = new Set(
    (verified?.items ?? []).map((it) => it?.claim?.id).filter((id): id is string => !!id),
  )
  const promiseIds = new Set(
    (promises?.items ?? []).map((p) => p?.id).filter((id): id is string => !!id),
  )
  const plenoIds = new Set<string>([
    ...((plenos?.items ?? []).map((p) => p?.id).filter((id): id is string => !!id) ?? []),
    ...((manifest?.plenos ?? []).map((p) => p?.plenoId).filter((id): id is string => !!id) ?? []),
  ])
  const quejaIds = new Set(
    (quejas?.items ?? []).map((q) => q?.service_request_id).filter((id): id is string => !!id),
  )
  const tenderIds = new Set<string>([
    ...(tenders?.contracts ?? []).map((c) => String(c?.id)).filter((id) => id !== 'undefined'),
    ...(tenders?.tenders ?? []).map((t) => String(t?.id)).filter((id) => id !== 'undefined'),
  ])
  const linkPairs = new Set(
    (relations?.links ?? []).map((l) => `${l?.quejaId}→${String(l?.tenderId)}`),
  )
  const officialSlugs = new Set(
    (officials?.officials ?? []).map((o) => o?.slug).filter((s): s is string => !!s),
  )
  const agendaKeys = new Set<string>()
  for (const p of agendas?.plenos ?? []) {
    for (const it of p?.agenda ?? []) {
      if (p?.id != null && it?.number != null) agendaKeys.add(`${p.id}|${it.number}`)
    }
  }

  return [
    check('findings-claims', 'error', findings != null && verified != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const f of findings?.items ?? []) {
        for (const cid of f?.sourceClaimIds ?? []) {
          checked += 1
          if (!verifiedIds.has(cid)) broken.push(`${f?.id ?? '?'} cites ${cid}`)
        }
      }
      return { checked, broken }
    }),

    check('findings-promises', 'error', findings != null && promises != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const f of findings?.items ?? []) {
        for (const pid of f?.relatedPromiseIds ?? []) {
          checked += 1
          if (!promiseIds.has(pid)) broken.push(`${f?.id ?? '?'} cites promise ${pid}`)
        }
      }
      return { checked, broken }
    }),

    check('manifest-chunks', 'error', manifest != null && chunkFiles != null, () => {
      let checked = 0
      const broken: string[] = []
      let sum = 0
      for (const p of manifest?.plenos ?? []) {
        checked += 1
        sum += p?.itemCount ?? 0
        const chunk = p?.chunkPath != null ? (chunkFiles?.[p.chunkPath] ?? null) : null
        if (chunk == null) {
          broken.push(`${p?.plenoId ?? '?'}: chunk file ${p?.chunkPath ?? '?'} missing`)
          continue
        }
        const n = chunk.items?.length ?? 0
        if (n !== (p?.itemCount ?? -1)) {
          broken.push(`${p?.plenoId ?? '?'}: itemCount ${p?.itemCount} ≠ ${n} items in file`)
        }
      }
      const declared = manifest?.totals?.items
      if (declared != null && declared !== sum) {
        broken.push(`totals.items ${declared} ≠ Σ itemCount ${sum}`)
      }
      return { checked, broken }
    }),

    check('votes-plenos', 'error', votes != null && (plenos != null || manifest != null), () => {
      let checked = 0
      const broken: string[] = []
      for (const v of votes?.items ?? []) {
        if (!v?.plenoId) continue
        checked += 1
        if (!plenoIds.has(v.plenoId)) broken.push(`${v?.id ?? '?'} → pleno ${v.plenoId}`)
      }
      return { checked, broken }
    }),

    check(
      'relations-quejas-tenders',
      'error',
      relations != null && quejas != null && tenders != null,
      () => {
        let checked = 0
        const broken: string[] = []
        for (const l of relations?.links ?? []) {
          checked += 1
          if (l?.quejaId && !quejaIds.has(l.quejaId)) {
            broken.push(`link → queja ${l.quejaId} unknown`)
          }
          if (l?.tenderId != null && !tenderIds.has(String(l.tenderId))) {
            broken.push(`link → tender ${String(l.tenderId)} unknown`)
          }
        }
        return { checked, broken }
      },
    ),

    check('approved-relations', 'error', approvedRelations != null && relations != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const a of approvedRelations?.approvals ?? []) {
        checked += 1
        const key = `${a?.quejaId}→${String(a?.tenderId)}`
        if (!linkPairs.has(key)) broken.push(`approval ${key} not in relations links`)
      }
      return { checked, broken }
    }),

    check('suggestions-promises', 'error', promiseSuggestions != null && promises != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const s of promiseSuggestions?.suggestions ?? []) {
        if (!s?.promiseId) continue
        checked += 1
        if (!promiseIds.has(s.promiseId)) broken.push(`suggestion → promise ${s.promiseId}`)
      }
      return { checked, broken }
    }),

    check('entities-contracts', 'error', entities != null && tenders != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const co of entities?.companies ?? []) {
        for (const cid of co?.contractIds ?? []) {
          checked += 1
          if (!tenderIds.has(String(cid))) {
            broken.push(`${co?.nameKey ?? co?.id ?? '?'} → contract ${String(cid)} unknown`)
          }
        }
      }
      return { checked, broken }
    }),

    check('promises-dept-slugs', 'error', promises != null, () => {
      let checked = 0
      const broken: string[] = []
      const allowed = new Set<string>(ALLOWED_DEPARTMENT_SLUGS)
      for (const p of promises?.items ?? []) {
        if (p?.departmentSlug == null) continue
        checked += 1
        if (!allowed.has(p.departmentSlug)) {
          broken.push(`promise ${p?.id ?? '?'} departmentSlug ${p.departmentSlug}`)
        }
      }
      return { checked, broken }
    }),

    check('overlay-verified', 'warn', overlay != null && verified != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const cid of Object.keys(overlay?.entries ?? {})) {
        checked += 1
        if (!verifiedIds.has(cid)) broken.push(`overlay entry ${cid} not in verified (stale)`)
      }
      return { checked, broken }
    }),

    check('votes-agendas', 'warn', votes != null && agendas != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const v of votes?.items ?? []) {
        if (!v?.plenoId || v?.itemNumber == null) continue
        checked += 1
        if (!agendaKeys.has(`${v.plenoId}|${v.itemNumber}`)) {
          broken.push(`${v?.id ?? '?'} has no agenda item ${v.plenoId}|${v.itemNumber}`)
        }
      }
      return { checked, broken }
    }),

    check('dedicaciones-officials', 'warn', dedicaciones != null && officials != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const row of dedicaciones?.byOfficial ?? []) {
        if (!row?.slug) continue
        checked += 1
        if (!officialSlugs.has(row.slug)) broken.push(`dedicación → official ${row.slug}`)
      }
      return { checked, broken }
    }),

    check('entity-overrides-keys', 'warn', entityOverrides != null && entities != null, () => {
      // Stale-alias debt, not breakage. Semantics: after an alias applies,
      // its variantKey deliberately does NOT appear as a registry nameKey
      // (that's what merging means) — a variant is LIVE iff some company's
      // raw variants still normalize to it. The canonicalKey must exist as
      // a registry nameKey (the merged company).
      const nameKeys = new Set(
        (entities?.companies ?? []).map((c) => c?.nameKey).filter((k): k is string => !!k),
      )
      const liveVariantKeys = new Set(
        (entities?.companies ?? []).flatMap((c) =>
          (c?.variants ?? []).map((v) => normalizeCompanyKey(v)),
        ),
      )
      let checked = 0
      const broken: string[] = []
      for (const a of entityOverrides?.aliases ?? []) {
        if (a?.canonicalKey) {
          checked += 1
          if (!nameKeys.has(a.canonicalKey)) {
            broken.push(`alias canonical "${a.canonicalKey}" not in registry`)
          }
        }
        if (a?.variantKey) {
          checked += 1
          if (!liveVariantKeys.has(a.variantKey)) {
            broken.push(`alias variant "${a.variantKey}" matches no current razón social`)
          }
        }
      }
      return { checked, broken }
    }),
  ]
}
