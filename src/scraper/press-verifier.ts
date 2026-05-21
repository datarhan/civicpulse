/**
 * Press claim verifier — projects a `PressClaim` into the shape the
 * existing pleno-transcript verifier expects, then delegates. The
 * heavy lifting (amount-based cross-ref against tenders / BDNS,
 * budget magnitude check, completion-pattern contradiction, promesa-
 * repetida detection, opinativa hard-skip) lives in
 * `src/scraper/claim-verifier.ts:verifyClaim`. We add ONE press-only
 * verification family on top: `dato_municipal`, which cross-references
 * republished municipal statistics (padrón population, paro
 * registered unemployment) against the live INE / SEPE snapshots.
 *
 * The result schema is the SAME `ClaimVerification` shape — so the
 * downstream auto-curate + finding-promote + UI code can be schema-
 * identical to the pleno path. Only the article context (URL, outlet)
 * is preserved on the outer wrapper so the lab page can render
 * "Verificación de prensa" cards with full provenance.
 */

import {
  verifyClaim,
  type ClaimVerdict,
  type ClaimVerification,
  type ClaimEvidence,
} from './claim-verifier'
import type { PlenoClaim, ClaimTopic as PlenoClaimTopic } from './pleno-claim'
import type { PressClaim, ClaimTopic as PressClaimTopic } from './press-claim'
import { matchFactChecks, type FactCheckRow } from './factcheck'

// PressClaim's topic enum extends pleno's with 'demografia' — keep
// the projection sane by mapping the press-only value to the existing
// pleno topic that scores most usefully in the verifier.
function projectTopic(t: PressClaimTopic): PlenoClaimTopic {
  if (t === 'demografia') return 'social'
  return t as PlenoClaimTopic
}

function projectPressClaim(c: PressClaim): PlenoClaim {
  return {
    id: c.id,
    plenoId: c.articleId,
    plenoDate: c.articleDate.slice(0, 10),
    segmentIndex: c.segmentIndex,
    type:
      // dato_municipal is press-only; the pleno verifier won't recognise it,
      // so we project it to afirmacion_numerica which uses the same
      // amount-based cross-reference path. The press-only padron/paro
      // verification below runs BEFORE this projection ever fires.
      c.type === 'dato_municipal' ? 'afirmacion_numerica' : c.type,
    speakerGroup: null,
    speakerSlug: null,
    verbatim: c.verbatim,
    context: c.context,
    topic: projectTopic(c.topic),
    entities: c.entities,
    accusationSubtype: c.accusationSubtype,
    confidence: c.confidence,
    reasoning: c.reasoning,
    requiresHumanApproval: true,
  }
}

interface PadronRow {
  year?: number
  total?: number
}
interface ParoRow {
  month?: string // ISO YYYY-MM
  total?: number
}

function verifyDatoMunicipal(
  claim: PressClaim,
  inputs: {
    padron?: { items?: PadronRow[] } | unknown
    paro?: { items?: ParoRow[] } | unknown
    budget?: unknown
  },
): ClaimVerification | null {
  const ent = claim.entities
  const count = typeof ent.count === 'number' ? ent.count : null
  const evidence: ClaimEvidence[] = []
  const checkedAgainst: string[] = []

  const verbatim = claim.verbatim.toLowerCase()
  const mentionsPadron =
    /pobl[aá]ci[oó]n|habitantes|padr[oó]n|empadronad/.test(verbatim) ||
    (ent.referencedEntity || '').toLowerCase().includes('padr')
  const mentionsParo =
    /paro|desempleo|paro registrado|sepe/.test(verbatim) ||
    (ent.referencedEntity || '').toLowerCase().includes('paro')

  if (mentionsPadron && count != null) {
    const rows = (inputs.padron as { items?: PadronRow[] } | undefined)?.items ?? []
    checkedAgainst.push('padron')
    const latest = rows
      .filter((r) => r.total != null)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0]
    if (latest?.total != null) {
      const diff = Math.abs(latest.total - count) / latest.total
      if (diff <= 0.02) {
        evidence.push({
          kind: 'budget',
          ref: `padron:${latest.year}`,
          snippet: `Padrón INE ${latest.year}: ${latest.total.toLocaleString('es-ES')} habitantes (cifra del medio: ${count.toLocaleString('es-ES')})`,
          similarity: 1 - diff,
        })
      }
    }
  }

  if (mentionsParo && count != null) {
    const rows = (inputs.paro as { items?: ParoRow[] } | undefined)?.items ?? []
    checkedAgainst.push('paro')
    const latest = rows
      .filter((r) => r.total != null)
      .sort((a, b) => (b.month ?? '').localeCompare(a.month ?? ''))[0]
    if (latest?.total != null) {
      const diff = Math.abs(latest.total - count) / Math.max(latest.total, 1)
      if (diff <= 0.05) {
        evidence.push({
          kind: 'budget',
          ref: `paro:${latest.month}`,
          snippet: `SEPE paro registrado ${latest.month}: ${latest.total} (cifra del medio: ${count})`,
          similarity: 1 - diff,
        })
      }
    }
  }

  if (checkedAgainst.length === 0) return null

  let verdict: ClaimVerdict = 'sin-datos'
  let summary = 'No se ha encontrado el dato municipal en las series INE / SEPE recientes.'
  if (evidence.length > 0) {
    verdict = 'verificado'
    summary =
      'El dato municipal citado coincide con la última publicación oficial (INE padrón / SEPE paro).'
  }

  return { claimId: claim.id, verdict, summary, evidence, checkedAgainst }
}

export interface PressVerifierInputs {
  claim: PressClaim
  tenders?: unknown
  bdns?: unknown
  budget?: unknown
  promises?: unknown
  padron?: unknown
  paro?: unknown
  priorClaims?: PlenoClaim[]
  /**
   * Optional third-party fact-checks from the Google Fact Check Tools
   * API (Newtral / Maldita / EFE Verifica / AFP Factual). When passed,
   * the verifier looks for token-overlap matches against the press
   * claim and appends them as evidence rows with kind='factcheck'.
   * A sin-datos verdict is upgraded when ≥1 published fact-check has
   * a non-unknown rating.
   */
  factchecks?: FactCheckRow[]
}

export interface PressClaimVerification extends ClaimVerification {
  articleUrl: string
  articleSource: string
  articleSourceHost: string | null
  articleFingerprint: string
}

/**
 * Cross-reference a press claim against the third-party fact-check
 * index. Adds up to 3 `kind: 'factcheck'` evidence rows to the
 * incoming ClaimVerification + (optionally) upgrades the verdict
 * when our verifier returned sin-datos but the fact-checkers agree.
 *
 * Verdict-upgrade rule (deliberately conservative):
 *   - Our verdict was sin-datos AND the fact-checker majority verdict
 *     is verificado / parcial / contradicho → adopt their verdict.
 *   - Our verdict was already definitive → keep ours, just attach
 *     the fact-check rows as additional corroboration.
 *   - When fact-checkers disagree among themselves, keep our verdict
 *     and leave a curator note.
 */
function applyFactCheckCrossRef(
  inner: ClaimVerification,
  claim: PressClaim,
  factchecks: FactCheckRow[],
): ClaimVerification {
  if (factchecks.length === 0) return inner
  const matches = matchFactChecks(
    { claimVerbatim: claim.verbatim, articleUrl: claim.articleUrl },
    factchecks,
  )
  if (matches.length === 0) return inner

  // Aggregate fact-checker verdicts (ignore 'unknown').
  const nonUnknown = matches.filter((m) => m.row.normalizedVerdict !== 'unknown')
  const consensusKey = (() => {
    if (nonUnknown.length === 0) return null
    const counts: Record<string, number> = {}
    for (const m of nonUnknown) {
      const k = m.row.normalizedVerdict
      counts[k] = (counts[k] || 0) + 1
    }
    const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1])
    // Require a clear plurality (top > rest combined).
    const others = nonUnknown.length - top[1]
    return top[1] > others ? (top[0] as ClaimVerdict) : null
  })()

  const newEvidence: ClaimEvidence[] = matches.map((m) => ({
    kind: 'factcheck',
    ref: m.row.reviewUrl,
    snippet: `${m.row.reviewerName}: "${m.row.verdict}" — ${m.row.reviewTitle.slice(0, 180)}`,
    similarity: m.score,
  }))

  const checkedAgainst = [...inner.checkedAgainst, 'factcheck']

  // Upgrade only when our verifier had no data of its own to go on.
  let verdict = inner.verdict
  let summary = inner.summary
  if (inner.verdict === 'sin-datos' && consensusKey) {
    verdict = consensusKey
    summary = `Adoptado del consenso de fact-checkers terceros (${nonUnknown
      .map((m) => m.row.reviewerName)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(', ')}). Datos municipales no aportaron señal.`
  }

  return {
    ...inner,
    verdict,
    summary,
    evidence: [...inner.evidence, ...newEvidence],
    checkedAgainst,
  }
}

export function verifyPressClaim(inputs: PressVerifierInputs): PressClaimVerification {
  const { claim } = inputs
  const factchecks = inputs.factchecks ?? []

  if (claim.type === 'dato_municipal') {
    const base = verifyDatoMunicipal(claim, {
      padron: inputs.padron,
      paro: inputs.paro,
      budget: inputs.budget,
    }) ?? {
      claimId: claim.id,
      verdict: 'sin-datos' as const,
      summary: 'No se ha encontrado el dato municipal en las series locales.',
      evidence: [],
      checkedAgainst: [],
    }
    const result = applyFactCheckCrossRef(base, claim, factchecks)
    return {
      ...result,
      articleUrl: claim.articleUrl,
      articleSource: claim.articleSource,
      articleSourceHost: claim.articleSourceHost,
      articleFingerprint: claim.articleFingerprint,
    }
  }

  const projected = projectPressClaim(claim)
  const innerResult = verifyClaim({
    claim: projected,
    tenders: inputs.tenders,
    bdns: inputs.bdns,
    budget: inputs.budget,
    promises: inputs.promises,
    priorClaims: inputs.priorClaims,
  })
  const result = applyFactCheckCrossRef(innerResult, claim, factchecks)

  return {
    ...result,
    articleUrl: claim.articleUrl,
    articleSource: claim.articleSource,
    articleSourceHost: claim.articleSourceHost,
    articleFingerprint: claim.articleFingerprint,
  }
}

export interface PressClaimVerifiedSnapshot {
  generatedAt: string
  source: { description: string; contract: string }
  stats: {
    total: number
    byVerdict: Record<ClaimVerdict, number>
  }
  items: Array<{ claim: PressClaim; verification: PressClaimVerification }>
}

export function verifyPressClaimsBatch(
  claims: PressClaim[],
  inputs: Omit<PressVerifierInputs, 'claim'>,
): PressClaimVerifiedSnapshot {
  const items = claims.map((c) => ({
    claim: c,
    verification: verifyPressClaim({ ...inputs, claim: c }),
  }))
  const byVerdict: Record<ClaimVerdict, number> = {
    verificado: 0,
    parcial: 0,
    contradicho: 0,
    'sin-datos': 0,
    'promesa-repetida': 0,
  }
  for (const it of items) byVerdict[it.verification.verdict] += 1
  return {
    generatedAt: new Date().toISOString(),
    source: {
      description: 'Press claims verified against municipal data',
      contract: 'src/scraper/press-verifier.ts',
    },
    stats: { total: items.length, byVerdict },
    items,
  }
}
