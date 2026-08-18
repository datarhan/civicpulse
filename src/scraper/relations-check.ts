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
import { stripLeadingListConjunction } from './corporacion'
import { ALLOWED_DEPARTMENT_SLUGS } from './departments'
import { normalizeCompanyKey } from './entities'
import {
  BREAKDOWN_SOURCE_KINDS,
  isIndependentlyVerified,
  isSiteRelativeRef,
  VOTE_SOURCE_KIND_IDS,
} from './pleno-votes'
import {
  classifyClaimVisibility,
  CLAIM_VISIBILITIES,
  type ClaimVisibilityInput,
} from './claim-public-gate'
import { QUOTE_PROVENANCE_STATUS_IDS } from './quote-provenance'

export type CheckLevel = 'error' | 'warn'
export type CheckStatus = 'ok' | 'broken' | 'empty' | 'skipped'

/** One half of a vote's `provenance`, as much of it as the checks below read.
 *  Structural only — `isIndependentlyVerified` owns the rule about what a
 *  `verificado` ref has to carry, so this file never restates it. */
interface VoteRefShape {
  kind?: string
  url?: string
  verification?: string
  verifiedAgainst?: { kind?: string; url?: string } | null
}

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
  /**
   * `pleno-claims-verified.json` — the PUBLISHED ledger, i.e. already
   * `mergeVerified(base, overlay)`. Typed as `ClaimVisibilityInput & {id}` so
   * items can be handed to `classifyClaimVisibility` directly: the gate's
   * parameter is structural precisely so no caller builds an adapter out of the
   * fields it thinks the gate reads, and an adapter here would fail OPEN.
   */
  verified?: { items?: Array<ClaimVisibilityInput & { claim?: { id?: string } }> } | null
  overlay?: { entries?: Record<string, unknown> } | null
  manifest?: {
    plenos?: Array<{ plenoId?: string; chunkPath?: string; itemCount?: number }>
    totals?: { items?: number }
  } | null
  /** Parsed chunk files keyed by their manifest chunkPath. */
  chunkFiles?: Record<string, { items?: unknown[] } | null> | null
  findings?: {
    items?: Array<{
      id?: string
      plenoDate?: string
      sourceClaimIds?: string[]
      relatedPromiseIds?: string[]
      /** Published verbatims — see `findings-quote-provenance`. */
      quotes?: Array<{ text?: string; sourceClaimId?: string | null }>
      /** «Documentos cotejados» — see the two findings-crosschecked-* checks. */
      crossChecked?: Array<{ kind?: string; ref?: string }>
    }>
  } | null
  /**
   * `finding-quote-provenance.json` — which transcript each published verbatim
   * comes from. Derived by `compute:finding-quote-provenance`.
   */
  quoteProvenance?: {
    stats?: { quotes?: number }
    contraste?: { stats?: { porContraste?: Record<string, number> } }
    quotes?: Record<string, Array<{ status?: string; reason?: string; gate?: string | null }>>
  } | null
  plenos?: { items?: Array<{ id?: string }> } | null
  votes?: {
    items?: Array<{
      id?: string
      plenoId?: string
      itemNumber?: number
      votes?: unknown[]
      votesRetracted?: unknown
      provenance?: {
        outcome?: VoteRefShape
        breakdown?: VoteRefShape | null
      }
    }>
    retractions?: Array<{
      voteId?: string
      scope?: string
      editor?: string
      retractedAt?: string
      revokedAt?: string
    }>
  } | null
  /** Site-absolute paths that exist in the build (`/data/…`). The CLI collects
   *  them; supplied so a citation pointing at our own artefact can be resolved
   *  offline instead of trusted. */
  publishedAssets?: Set<string> | null
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
    contracts?: Array<{ id?: string | number; permalink?: string }>
    tenders?: Array<{ id?: string | number; permalink?: string }>
  } | null
  /** pleno-videos.json — a 60-item window over the channel feed, NOT an archive. */
  videos?: { items?: Array<{ url?: string; plenoDate?: string }> } | null
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
      /**
       * `selfDeclared` is the only place the respaldo axis can be read from.
       * `kind`/`localId` carry the corpus citation of a `local-snapshot`
       * source — the one class `check:citations` cannot see, because it probes
       * `url` and these have none.
       */
      sources?: Array<{ id?: string; selfDeclared?: boolean; kind?: string; title?: string }>
      warnings?: string[]
      /** Only `portrait` matters here — see the `portrait-officials` check. */
      sections?: Array<{
        kind?: string
        payload?: { officialSlug?: string; portfolios?: string[] }
      }>
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
    videos,
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
    quoteProvenance,
    publishedAssets,
  } = inputs

  const verifiedIds = new Set(
    (verified?.items ?? []).map((it) => it?.claim?.id).filter((id): id is string => !!id),
  )
  const verifiedById = new Map<string, ClaimVisibilityInput>(
    (verified?.items ?? [])
      .filter((it): it is ClaimVisibilityInput & { claim: { id: string } } => !!it?.claim?.id)
      .map((it) => [it.claim.id, it]),
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
  const tenderPermalinks = new Set<string>(
    [...(tenders?.contracts ?? []), ...(tenders?.tenders ?? [])]
      .map((t) => t?.permalink)
      .filter((p): p is string => !!p),
  )
  const videoDateByUrl = new Map<string, string | undefined>(
    (videos?.items ?? [])
      .filter((v): v is { url: string; plenoDate?: string } => !!v?.url)
      .map((v) => [v.url, v.plenoDate]),
  )
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

    /**
     * Every verbatim `/hallazgos` publishes must carry a provenance row saying
     * which transcript it comes from.
     *
     * 95 of the 177 published quotes appear only in the transcript their
     * session had BEFORE it was re-transcribed, and the page marks them. A
     * quote with no row renders unmarked — that is, as confirmed against the
     * best available text — so a missing row is not a gap in a report, it is a
     * false statement on a page about a named political group.
     *
     * The status must be one of the three the enum defines, imported rather
     * than restated: a fourth value appearing here means the page is receiving
     * a status its wording map does not cover.
     */
    check('findings-quote-provenance', 'error', findings != null && quoteProvenance != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const f of findings?.items ?? []) {
        const rows = quoteProvenance?.quotes?.[f?.id ?? ''] ?? null
        const quotes = f?.quotes ?? []
        if (quotes.length === 0) continue
        if (rows == null) {
          checked += quotes.length
          broken.push(`${f?.id ?? '?'} has ${quotes.length} quote(s) and no provenance row`)
          continue
        }
        quotes.forEach((_q, i) => {
          checked += 1
          const status = rows[i]?.status
          if (status == null) broken.push(`${f?.id ?? '?'}[${i}] has no provenance status`)
          else if (!QUOTE_PROVENANCE_STATUS_IDS.includes(status as never)) {
            broken.push(`${f?.id ?? '?'}[${i}] carries unknown status "${status}"`)
          }
        })
      }
      return { checked, broken }
    }),

    /**
     * Every verbatim `/hallazgos` publishes must also carry the editorial
     * gate's verdict on the claim behind it, and that verdict must still be the
     * one the live verifier output produces.
     *
     * `claim-public-gate.ts` governs `/plenos`; `/hallazgos` never consulted
     * it. Of the 177 published quotes it would show 16, toggle 86 and HIDE 75 —
     * every one of the 75 an `acusacion_publica` the verifier could not ground.
     * The page now says so, which makes the mark load-bearing: a quote with no
     * `gate`, or with a stale one, renders as an accusation somebody checked.
     *
     * Re-derived here rather than trusted, because the verdict engine re-judges
     * claims on a schedule of its own — a claim regrounded overnight leaves the
     * page asserting «no contrastada» about a named political group with data
     * sitting in the same repo. `verified` is the published ledger, i.e.
     * `mergeVerified(base, overlay)`, the same composition the snapshot is
     * built from; a disagreement between them is itself the defect.
     *
     * `checked` counts every published quote (177), so a traversal that matched
     * nothing reports `empty` instead of a confident `ok`.
     */
    check(
      'findings-quote-contrast',
      'error',
      findings != null && quoteProvenance != null && verified != null,
      () => {
        let checked = 0
        const broken: string[] = []
        for (const f of findings?.items ?? []) {
          const rows = quoteProvenance?.quotes?.[f?.id ?? ''] ?? null
          const quotes = f?.quotes ?? []
          if (quotes.length === 0) continue
          if (rows == null) {
            checked += quotes.length
            broken.push(`${f?.id ?? '?'} has ${quotes.length} quote(s) and no provenance row`)
            continue
          }
          quotes.forEach((q, i) => {
            checked += 1
            const id = f?.id ?? '?'
            const gate = rows[i]?.gate
            if (gate == null) {
              broken.push(`${id}[${i}] carries no editorial-gate verdict`)
              return
            }
            if (!CLAIM_VISIBILITIES.includes(gate as never)) {
              broken.push(`${id}[${i}] carries unknown gate verdict "${gate}"`)
              return
            }
            const claimId = q?.sourceClaimId
            const item = claimId ? verifiedById.get(claimId) : undefined
            if (item == null) {
              broken.push(`${id}[${i}] quotes claim ${claimId ?? '—'}, absent from the verifier`)
              return
            }
            const live = classifyClaimVisibility(item)
            if (live !== gate) {
              broken.push(`${id}[${i}] published gate ${gate}, verifier now says ${live}`)
            }
          })
        }
        return { checked, broken }
      },
    ),

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

    /**
     * Every `crossChecked[]` tender a published finding cites must be a
     * contract this repo actually publishes.
     *
     * The obvious check — "is this ref still in the verifier's evidence for
     * this finding's claims?" — is the WRONG one, and measuring it is what
     * prompted this: 138 of the 157 tender refs are no longer in the live
     * `pleno-claims-verified.json`. That is not orphaning. `crossChecked[]`
     * means «documentos cotejados» — what the claims were checked AGAINST,
     * explicitly not a filtered list of what agrees (see PlenoFinding). The
     * verdict engine later re-judged most of those claims to `sin-datos` and
     * emits evidence only for grounded cites, so the association drops out of
     * the current snapshot while remaining true of the record. Asserting it
     * would red the nightly on 138 correct citations and pressure a curator
     * into deleting them.
     *
     * What is genuinely invariant is that the cited document EXISTS in our
     * corpus. That catches the real harm — a fabricated or drifted URL on a
     * legally-material surface — without asserting a verdict. tenders.json is
     * a cumulative snapshot (its permalink set only grows), so `error` is safe.
     * Only `kind: 'tender'` is joined; bdns/budget/promise and the three
     * curator-only kinds have no permalink corpus to resolve against and are
     * deliberately not counted, so `checked` never overstates coverage.
     */
    check('findings-crosschecked-tenders', 'error', findings != null && tenders != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const f of findings?.items ?? []) {
        for (const c of f?.crossChecked ?? []) {
          if (c?.kind !== 'tender' || !c?.ref) continue
          checked += 1
          if (!tenderPermalinks.has(c.ref)) {
            broken.push(`${f?.id ?? '?'} cross-checks unknown tender ${c.ref}`)
          }
        }
      }
      return { checked, broken }
    }),

    /**
     * The pleno recording a finding cites as provenance should be the video
     * for THAT session. `warn`, not `error`, for a measured reason:
     * pleno-videos.json is a 60-item window over the council's channel feed,
     * not an archive, so a correct citation ages out as the channel uploads
     * other content. Both current misses are one such video — «Ple
     * Extraordinari 3 de juliol de 2026», present in the snapshot until it was
     * pushed out of the window on 2026-07-26. The citation is right and the
     * snapshot is the limitation, so this must surface as debt and never
     * red a nightly. A DATE mismatch is the case worth reading: that would be
     * a finding pointing at the wrong session's recording.
     */
    check('findings-crosschecked-video', 'warn', findings != null && videos != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const f of findings?.items ?? []) {
        for (const c of f?.crossChecked ?? []) {
          if (c?.kind !== 'pleno-video' || !c?.ref) continue
          checked += 1
          if (!videoDateByUrl.has(c.ref)) {
            broken.push(`${f?.id ?? '?'} cites video outside the channel window: ${c.ref}`)
            continue
          }
          const vDate = videoDateByUrl.get(c.ref)
          if (f?.plenoDate != null && vDate != null && vDate !== f.plenoDate) {
            broken.push(`${f?.id ?? '?'} (${f.plenoDate}) cites the video of ${vDate}: ${c.ref}`)
          }
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

    /**
     * La decisión del curador tiene que estar EN lo publicado, no sólo escrita
     * en el overlay.
     *
     * `downgrade-verdict` escribe el overlay y DESPUÉS reconstruye; si el
     * rebuild revienta (guarda de atribución, base ausente) imprime «overlay
     * written but rebuild FAILED» y el monolito se queda como estaba. Mientras
     * las marcas se derivaban de `base ⊕ overlay`, la página seguía mostrando
     * la decisión y la discrepancia con el monolito salía por otro lado; desde
     * que la verdad es el monolito, marcas y comprobación leen el mismo fichero
     * y coinciden — en silencio— sobre un ledger que no recogió la corrección.
     *
     * Esta es la comprobación que lo rompe: para cada entrada cuyo claim SÍ
     * está publicado, el veredicto publicado tiene que ser el del overlay. A
     * nivel de error, porque el hueco que tapa es una corrección de curador que
     * no llegó a la página.
     */
    check('overlay-aplicado', 'error', overlay != null && verified != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const [cid, entry] of Object.entries(overlay?.entries ?? {})) {
        const publicado = verifiedById.get(cid) as
          | { verification?: { verdict?: unknown } }
          | undefined
        // Una entrada cuyo claim ya no existe la cuenta `overlay-verified`
        // arriba; aquí sólo se comparan las que tienen fila publicada.
        if (publicado == null) continue
        checked += 1
        const suyo = (entry as { verification?: { verdict?: unknown } })?.verification?.verdict
        const enLaPagina = publicado.verification?.verdict
        if (suyo != null && enLaPagina !== suyo) {
          broken.push(
            `${cid}: el overlay dice ${String(suyo)} y lo publicado dice ${String(enLaPagina)} — ` +
              'la decisión no llegó al ledger (¿un rebuild que falló después de escribir?)',
          )
        }
      }
      return { checked, broken }
    }),

    // A retracted vote must not silently reappear, and a withdrawn breakdown
    // must not silently come back as a tally. The hard stop is in
    // `validateSnapshot` — it runs on every write, so `pleno-vote` and
    // `promote-vote` cannot republish a withdrawn id at all. This is the
    // read-side twin: it catches a hand-edited or merge-resolved file that
    // never went through a CLI, which is exactly how the last two curated-file
    // defects arrived.
    //
    // `checked` counts LEDGER ENTRIES, so a file with no retractions reports
    // `empty`, not `ok` — a green line here must never be mistaken for
    // "reappearance was verified" when there was nothing to verify.
    check('votes-retractions', 'error', votes != null, () => {
      let checked = 0
      const broken: string[] = []
      const published = new Map(
        (votes?.items ?? []).filter((v) => v?.id).map((v) => [v.id as string, v]),
      )
      const liveBreakdowns = new Set<string>()
      for (const r of votes?.retractions ?? []) {
        checked += 1
        const id = r?.voteId ?? '?'
        if (!r?.editor || !r?.retractedAt) {
          broken.push(`${id} retraction has no editor/retractedAt signature`)
        }
        if (r?.revokedAt) continue // lifted, deliberately and on the record
        if (r?.scope === 'record') {
          if (published.has(id)) broken.push(`${id} is retracted but published again in items[]`)
        } else if (r?.scope === 'breakdown') {
          liveBreakdowns.add(id)
          const item = published.get(id)
          if (!item) {
            broken.push(`${id} has a breakdown retraction but no vote in items[]`)
          } else if ((item.votes?.length ?? 0) > 0 || item.votesRetracted == null) {
            broken.push(`${id} has a live breakdown retraction but publishes a tally again`)
          }
        } else {
          broken.push(`${id} has unknown retraction scope "${String(r?.scope)}"`)
        }
      }
      // The mirror: a stamped row whose ledger entry vanished would leave the
      // withdrawn tuples unrecoverable and the withdrawal unattributed.
      for (const v of votes?.items ?? []) {
        if (v?.votesRetracted == null) continue
        checked += 1
        if (!liveBreakdowns.has(v.id as string)) {
          broken.push(`${v?.id ?? '?'} is stamped votesRetracted with no live ledger entry`)
        }
      }
      return { checked, broken }
    }),

    // ── vote provenance, per claim ───────────────────────────────────────
    // A vote asserts two facts — the outcome, and how each group voted — and
    // until 2026-08-05 both hung off one `sourceUrl` that, on all 17 rows,
    // pointed at regmeet. regmeet publishes no per-bloc tally at all, so half
    // of every row was attributed to a source that does not carry it. Nothing
    // could catch it: the URL resolves, it just does not contain the claim.
    //
    // The hard stop is in `validateSnapshot` — it runs before every write, so
    // no CLI can produce such a row. These two are the read-side twins, for a
    // hand-edited or merge-resolved file that never went through a CLI.
    //
    // `checked` counts PUBLISHED BREAKDOWNS, so a file whose tallies have all
    // been withdrawn reports `empty` rather than a green line that would read
    // as «provenance verified» over nothing.
    check('votes-breakdown-source', 'error', votes != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const v of votes?.items ?? []) {
        if ((v?.votes?.length ?? 0) === 0) continue // no tally, nothing to source
        checked += 1
        const id = v?.id ?? '?'
        const ref = v?.provenance?.breakdown
        if (ref == null) {
          broken.push(
            `${id} publishes ${v.votes?.length} per-bloc tuple(s) with no breakdown source`,
          )
          continue
        }
        if (!ref.kind || !(BREAKDOWN_SOURCE_KINDS as readonly string[]).includes(ref.kind)) {
          broken.push(
            `${id} cites a "${String(ref.kind)}" breakdown source, which publishes no per-bloc tally ` +
              `(allowed: ${BREAKDOWN_SOURCE_KINDS.join(', ')})`,
          )
          continue
        }
        // Our own artefacts are checkable without the network: if the file is
        // not in the build, the citation is a 404 for every reader.
        if (ref.url && isSiteRelativeRef(ref.url) && publishedAssets != null) {
          if (!publishedAssets.has(ref.url)) {
            broken.push(`${id} cites ${ref.url}, which is not in public/`)
          }
        }
        // A `verificado` flag that is not backed by an independent document is
        // a claim the site makes about its own rigour, so it belongs at error
        // level with the other structural defects rather than in the warn tier
        // that counts honest debt. `validateSourceRef` refuses to write one;
        // this catches a hand-edited or merge-resolved file that skipped it.
        if (ref.verification === 'verificado' && !isIndependentlyVerified(ref)) {
          const against = ref.verifiedAgainst?.kind
          broken.push(
            `${id} breakdown is marked verificado but ` +
              (against == null
                ? `names no verifiedAgainst — nothing says what it was cotejado against`
                : !VOTE_SOURCE_KIND_IDS.includes(against as never)
                  ? `was cotejado against an unknown kind of document ("${String(against)}")`
                  : `was cotejado against a ${against}, which is not independent of the ` +
                    `${String(ref.kind)} the tally came from`),
          )
        }
      }
      return { checked, broken }
    }),

    // Warn, not error, and the distinction is the point. A `sin-verificar`
    // breakdown is now HONESTLY cited — the transcript does carry the nominal
    // call — but no second document has been read against it, and three of the
    // first nineteen taken from it were wrong. That is disclosed debt, which
    // is what 'warn' means in this file, and it is the state of 16 live rows:
    // erroring would red the nightly indefinitely over a condition the site
    // already declares, and a permanently-red check is one everybody learns to
    // skip. What must never be silent is the COUNT, so every row is listed.
    //
    // What this line must NOT say is what it said until 2026-08-09 — «never
    // cotejado against the acta», which reads as sixteen rows nobody got round
    // to. The acta is not unread, it is UNREACHABLE: no acta is cached in this
    // repo, all 45 transcripts on disk are Whisper output, and
    // scripts/fetch-pleno-actas.ts has four independent breakages against the
    // Aug-2026 portal (it reads a `link` that points at regmeet, extracts
    // retired Drupal markup, uses plain http, and no npm script runs it).
    // Blaming a curator for an upstream we cannot fetch is the same class of
    // error as the disclaimer this batch removed from the outcome row.
    //
    // The tier that does block is the one above, and it blocks at write time.
    // Rows leave this count only via `isIndependentlyVerified` — the same
    // predicate the validator and the surfaces use — so a self-verified row
    // cannot go quiet here while going red there.
    check('votes-breakdown-verified', 'warn', votes != null, () => {
      let checked = 0
      const broken: string[] = []
      for (const v of votes?.items ?? []) {
        if ((v?.votes?.length ?? 0) === 0) continue
        const ref = v?.provenance?.breakdown
        if (ref == null) continue // already an error above; not double-counted
        checked += 1
        if (isIndependentlyVerified(ref)) continue
        broken.push(
          ref.verification === 'verificado'
            ? `${v?.id ?? '?'} breakdown claims verificado without an independent source — ` +
                `still counted unverified (see votes-breakdown-source)`
            : `${v?.id ?? '?'} breakdown is ${String(ref.verification)} — cited to ` +
                `${String(ref.kind)}, no independent source cotejado against it. The acta ` +
                `that would settle it is unreachable, not unread (scripts/fetch-pleno-actas.ts)`,
        )
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

    // A biography's `portrait` seeds the chips printed beside the councillor's
    // photograph: his party and, one per chip, the áreas he runs. It is copied
    // out of officials.json when the report runs, and nothing joined it back.
    // `extractPortfolios` once comma-split the council's «…, Empleo y
    // Emprendimiento, y Comercio.» without dropping the list conjunction and
    // published an área literally named «y Comercio»; officials.json and
    // area-fit.json were repaired in a720cfc, the portrait seed was not, and the
    // wrong chip stayed on a live page for nine days with no check to say so.
    //
    // WHAT THIS DELIBERATELY DOES NOT CHECK. A portrait is a point-in-time
    // snapshot of the register on the day the report ran, so it is NOT required
    // to equal officials.json today. Delegations move mid-mandate — the Ramos
    // biography says as much in its own body text («El registro municipal
    // vigente recoge hoy, en lugar de Comercio, las áreas de Actividades y
    // Edificios públicos») — and a check that reddened on that would be
    // permanently red for an honest reason, i.e. the kind everybody learns to
    // skip. Equality is therefore not the predicate.
    //
    // What IS checkable is vocabulary. A portfolio whose name only becomes a
    // real área after dropping the Spanish list conjunction was never a
    // delegation, it was a parse — no register ever named an área "y Comercio".
    // The rule is imported from the parser that produces these strings, so the
    // two cannot drift (DATA_INTEGRITY §1: export the rule, never restate it),
    // and officials.json says whether the stripped form is an área this person
    // actually holds, which is what makes the message actionable rather than a
    // shrug. Both arms are `error`: neither can fire for an honest reason.
    /**
     * Una biografía publicada no puede citar una declaración que ya no existe.
     *
     * `check:citations` no puede ver esta clase: prueba `source.url`, y una
     * fuente `local-snapshot` no tiene URL — cita una fila del corpus por su
     * id, dentro del título. Así que cuando dos plenos se re-transcribieron y
     * se re-extrajeron con ids nuevos, dos fuentes de la biografía de un
     * concejal con NOMBRE Y APELLIDOS se quedaron apuntando a filas que no
     * existen en ningún sitio, y ninguna comprobación lo dijo. Lo cazó una
     * revisión humana del diff, que es exactamente lo que una guarda barata
     * evita tener que repetir.
     *
     * A nivel de aviso y no de error a propósito: una fuente huérfana no
     * publica nada falso por sí sola —el extracto sigue siendo lo que el
     * modelo leyó el día que lo leyó— pero sí deja sin respaldo comprobable
     * una frase sobre una persona viva, y eso lo tiene que ver un curador. No
     * hay CLI para retirar una fuente: hoy la vía es corregir la prosa que se
     * apoyaba en ella con `correct-journalist-report`.
     */
    check('report-claim-sources', 'warn', reports != null && verified != null, () => {
      let checked = 0
      const broken: string[] = []
      const idEnTitulo = /\b([a-z0-9]{5,8}-\d{3}-(?:pro|afi|cit|acu)-[0-9a-f]{6})\b/
      for (const r of reports?.items ?? []) {
        for (const s of r?.sources ?? []) {
          if (s?.kind !== 'local-snapshot') continue
          const m = idEnTitulo.exec(s?.title ?? '')
          if (!m) continue // una fuente local que no cita una fila por id
          checked += 1
          if (!verifiedIds.has(m[1])) {
            broken.push(`${r?.id ?? '?'} · ${s?.id ?? '?'} cita ${m[1]}, que no está publicada`)
          }
        }
      }
      return { checked, broken }
    }),

    check('portrait-officials', 'error', reports != null && officials != null, () => {
      let checked = 0
      const broken: string[] = []
      const portfoliosBySlug = new Map(
        (officials?.officials ?? []).map((o) => [o?.slug, new Set(o?.portfolios ?? [])]),
      )
      for (const r of reports?.items ?? []) {
        for (const s of r?.sections ?? []) {
          if (s?.kind !== 'portrait') continue
          const slug = s?.payload?.officialSlug
          checked += 1
          if (!slug || !officialSlugs.has(slug)) {
            broken.push(`${r?.id ?? '?'} portrait of unknown official ${slug ?? '?'}`)
            continue
          }
          for (const p of s?.payload?.portfolios ?? []) {
            checked += 1
            const stripped = stripLeadingListConjunction(p)
            // A clean name: held today, or an área he has since handed over.
            // Either way it is history we cannot disprove, so we say nothing.
            if (stripped === p) continue
            broken.push(
              `${r?.id ?? '?'} portrait de ${slug}: «${p}» arrastra la conjunción de lista ` +
                `del parser — el área es «${stripped}»` +
                (portfoliosBySlug.get(slug)?.has(stripped)
                  ? ', que es la que officials.json le atribuye hoy'
                  : ', que hoy no figura entre sus áreas'),
            )
          }
        }
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
          // Only the ids: `deriveRespaldo` takes `CitedSources`, so this check
          // need not invent a label or a short form it would then be asserting.
          const derived = deriveRespaldo(
            evidence.map((ev) => ({ sourceIds: ev?.sourceIds ?? [] })),
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
