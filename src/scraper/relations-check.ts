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

import { deriveRespaldo, RESPALDO_VALUES, type SourceLike } from './area-fit'
import { ALLOWED_DEPARTMENT_SLUGS } from './departments'
import { normalizeCompanyKey } from './entities'

export type CheckLevel = 'error' | 'warn'
export type CheckStatus = 'ok' | 'broken' | 'empty' | 'skipped'

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
  quejas?: {
    items?: Array<{ service_request_id?: string; concejal_slug?: string }>
    stats?: { byConcejal?: Record<string, unknown> }
  } | null
  /** Curator-promoted social accounts (officials-social.json). */
  social?: { accounts?: Array<{ slug?: string; platform?: string }> } | null
  /** Journalist assignments — subject.slug points at an official. */
  assignments?: {
    items?: Array<{ id?: string; subject?: { slug?: string; kind?: string } }>
  } | null
  /** Canonical entity registry — people[] mirrors the roster. */
  entitiesPeople?: { people?: Array<{ slug?: string }> } | null
  tenders?: {
    contracts?: Array<{ id?: string | number }>
    tenders?: Array<{ id?: string | number }>
  } | null
  relations?: { links?: Array<{ quejaId?: string; tenderId?: string | number }> } | null
  approvedRelations?: {
    approvals?: Array<{ quejaId?: string; tenderId?: string | number }>
  } | null
  dedicaciones?: { byOfficial?: Array<{ slug?: string }> } | null
  officials?: { officials?: Array<{ slug?: string; portfolios?: string[] }> } | null
  /** Curated «encaje declarado» rows (area-fit.json). */
  areaFit?: {
    rows?: Array<{
      officialSlug?: string
      portfolio?: string
      reportId?: string
      formacion?: { evidence?: Array<{ sourceIds?: string[] }>; respaldo?: string }
      experiencia?: { evidence?: Array<{ sourceIds?: string[] }>; respaldo?: string }
    }>
    /** Curator-signed biography warnings, cited BY INDEX into a report. */
    avisos?: Array<{
      officialSlug?: string
      reportId?: string
      avisoIndex?: number
      eje?: string
      verbatim?: string
    }>
  } | null
  /** journalist-reports.json — the reports encaje rows cite. */
  reports?: {
    items?: Array<{
      id?: string
      /** `selfDeclared` is the only place the respaldo axis can be read from. */
      sources?: Array<{ id?: string; selfDeclared?: boolean }>
      warnings?: string[]
    }>
  } | null
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
  // A check with zero refs verified NOTHING, but reported [ok] — three of the
  // thirteen were permanently in that state, so a green summary implied
  // coverage that did not exist. `empty` keeps them non-failing while making
  // the difference legible.
  return {
    name,
    level,
    status: broken.length > 0 ? 'broken' : checked === 0 ? 'empty' : 'ok',
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
    social,
    assignments,
    areaFit,
    reports,
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

    // ── officials hub ────────────────────────────────────────────────────
    // The project treats the elected official as its central entity, yet none
    // of the joins that make that true were verified: a renamed or removed slug
    // would silently empty a councillor's page with every check still green.
    check('quejas-officials', 'error', quejas != null && officials != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const q of quejas?.items ?? []) {
        if (!q?.concejal_slug) continue
        checked += 1
        if (!officialSlugs.has(q.concejal_slug))
          broken.push(`${q.service_request_id ?? '?'} routed to unknown ${q.concejal_slug}`)
      }
      for (const slug of Object.keys(quejas?.stats?.byConcejal ?? {})) {
        checked += 1
        if (!officialSlugs.has(slug)) broken.push(`stats.byConcejal has unknown ${slug}`)
      }
      return { checked, broken }
    }),

    check('social-officials', 'error', social != null && officials != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const a of social?.accounts ?? []) {
        checked += 1
        if (!a?.slug || !officialSlugs.has(a.slug))
          broken.push(`${a?.platform ?? '?'} account filed under unknown ${a?.slug ?? '?'}`)
      }
      return { checked, broken }
    }),

    check('assignments-officials', 'error', assignments != null && officials != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const a of assignments?.items ?? []) {
        if (a?.subject?.kind !== 'official' || !a?.subject?.slug) continue
        checked += 1
        if (!officialSlugs.has(a.subject.slug))
          broken.push(`${a?.id ?? '?'} profiles unknown official ${a.subject.slug}`)
      }
      return { checked, broken }
    }),

    // Three ways an encaje row can lie about a named person, all referential:
    // it can name someone who is not a councillor, attach a judgement to an área
    // somebody else runs, or cite a source that is not in the report it claims.
    check('areafit-officials', 'error', areaFit != null && officials != null, () => {
      let checked = 0
      const broken: string[] = []
      const portfoliosBySlug = new Map(
        (officials?.officials ?? []).map((o) => [o?.slug, new Set(o?.portfolios ?? [])]),
      )
      for (const r of areaFit?.rows ?? []) {
        checked += 1
        if (!r?.officialSlug || !officialSlugs.has(r.officialSlug)) {
          broken.push(`encaje row for unknown official ${r?.officialSlug ?? '?'}`)
          continue
        }
        const held = portfoliosBySlug.get(r.officialSlug)
        if (!r?.portfolio || !held?.has(r.portfolio))
          broken.push(`${r.officialSlug} does not hold the área "${r?.portfolio ?? '?'}"`)
      }
      return { checked, broken }
    }),

    check('areafit-report-sources', 'error', areaFit != null && reports != null, () => {
      let checked = 0
      const broken: string[] = []
      const sourcesByReport = new Map(
        (reports?.items ?? []).map((r) => [
          r?.id,
          new Set((r?.sources ?? []).map((s) => s?.id).filter((s): s is string => !!s)),
        ]),
      )
      for (const r of areaFit?.rows ?? []) {
        const known = sourcesByReport.get(r?.reportId)
        for (const field of ['formacion', 'experiencia'] as const) {
          for (const ev of r?.[field]?.evidence ?? []) {
            for (const id of ev?.sourceIds ?? []) {
              checked += 1
              if (!known || !known.has(id))
                broken.push(`${r?.officialSlug}/${r?.portfolio}.${field} cites unknown ${id}`)
            }
          }
        }
      }
      return { checked, broken }
    }),

    // An aviso is an INDEX into a biography's `warnings`, and an index means
    // nothing once the list under it moves. The published validator re-resolves
    // it where the write happens; nothing re-checked it afterwards, and a
    // biography can be re-run any night. The text is compared, not just the
    // bound: a reordered list keeps every index in range while moving one
    // councillor's warning under another's claim.
    check('areafit-avisos', 'error', areaFit != null && reports != null, () => {
      let checked = 0
      const broken: string[] = []
      const warningsByReport = new Map(
        (reports?.items ?? []).map((r) => [r?.id, r?.warnings ?? []] as const),
      )
      for (const a of areaFit?.avisos ?? []) {
        checked += 1
        const where = `aviso ${a?.officialSlug ?? '?'}#${a?.avisoIndex ?? '?'}`
        const warnings = warningsByReport.get(a?.reportId)
        if (!warnings) {
          broken.push(`${where} cites report ${a?.reportId ?? '?'}, which resolves nowhere`)
          continue
        }
        const i = a?.avisoIndex
        if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= warnings.length) {
          broken.push(
            `${where}: index outside the ${warnings.length} warning(s) of ${a?.reportId ?? '?'}`,
          )
          continue
        }
        if (warnings[i as number] !== a?.verbatim) {
          broken.push(
            `${where}: verbatim is not warning ${i} of ${a?.reportId ?? '?'} any more — ` +
              'the biography was re-run after the mapping was signed',
          )
        }
      }
      return { checked, broken }
    }),

    // «Nobody corroborated this» and «nobody looked» read identically from
    // outside, so the guard asserts the classifier RAN: an assessment that
    // cites evidence carries a respaldo, and no published respaldo is
    // `sin-clasificar`. An assessment that cites NOTHING is exempt by design —
    // there is no citation whose backing could be described, and demanding one
    // would condemn most of the published rows.
    check('areafit-respaldo-classified', 'error', areaFit != null, () => {
      let checked = 0
      const broken: string[] = []
      const allowed = new Set<string>(RESPALDO_VALUES)
      for (const r of areaFit?.rows ?? []) {
        for (const field of ['formacion', 'experiencia'] as const) {
          const a = r?.[field]
          const cites = (a?.evidence ?? []).length > 0
          const v = a?.respaldo
          if (!cites && v === undefined) continue
          checked += 1
          const where = `${r?.officialSlug ?? '?'}/${r?.portfolio ?? '?'}.${field}`
          if (v === undefined) {
            broken.push(`${where} cites evidence but carries no respaldo`)
          } else if (v === 'sin-clasificar') {
            broken.push(`${where}: respaldo is sin-clasificar — nobody said what backs this`)
          } else if (!allowed.has(v)) {
            // Not pedantry: the surface renders only the three values with
            // published copy, so an unknown one prints NO backing line at all.
            broken.push(`${where}: respaldo "${v}" is not one of ${RESPALDO_VALUES.join(' | ')}`)
          }
        }
      }
      return { checked, broken }
    }),

    // RE-DERIVE, DO NOT TRUST — the same move the published validator makes on
    // an aviso's `verbatim`: a stored string is only ever a copy of a fact that
    // lives somewhere else, and copies go stale silently. `selfDeclared` is
    // re-classified by its own backfill; when it moves, nothing else re-reads
    // the rows that were derived from it.
    //
    // Both directions are broken because both are stale, but they are not
    // equally harmful, and this is the one that justifies an error level:
    // `corroborada` published over self-declared sources makes the card say
    // «alguna fuente independiente de la persona» about a NAMED councillor
    // while every source behind it is his own CV — the surface claiming
    // stronger evidence than it holds, which is the failure this whole feature
    // exists to prevent. The reverse only makes us say less than we could.
    //
    // `discrepancia-documentada` is EXEMPT on purpose, not by omission:
    // `deriveRespaldo` never returns it (two sources disagreeing is a curator's
    // reading of them, not a flag comparison), so re-deriving would report
    // every curator judgement as a mismatch and train everyone to ignore this
    // check.
    check('areafit-respaldo-derived', 'error', areaFit != null && reports != null, () => {
      let checked = 0
      const broken: string[] = []
      const sourcesByReport = new Map(
        (reports?.items ?? []).map((r) => {
          const byId: Record<string, SourceLike> = {}
          for (const s of r?.sources ?? []) {
            if (typeof s?.id === 'string') byId[s.id] = { id: s.id, selfDeclared: s.selfDeclared }
          }
          return [r?.id, byId] as const
        }),
      )
      for (const r of areaFit?.rows ?? []) {
        // An absent map is an EMPTY one, never a permissive one: every id then
        // reads unclassified and the mismatch surfaces.
        const sources = sourcesByReport.get(r?.reportId) ?? {}
        for (const field of ['formacion', 'experiencia'] as const) {
          const a = r?.[field]
          const evidence = a?.evidence ?? []
          if (!evidence.length) continue
          if (a?.respaldo === 'discrepancia-documentada') continue
          checked += 1
          const derived = deriveRespaldo(
            evidence.map((ev) => ({ label: '', sourceIds: ev?.sourceIds ?? [] })),
            sources,
          )
          if (derived !== a?.respaldo) {
            broken.push(
              `${r?.officialSlug ?? '?'}/${r?.portfolio ?? '?'}.${field}: publica ` +
                `«${a?.respaldo ?? 'sin respaldo'}», las fuentes citadas derivan «${derived}»`,
            )
          }
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
