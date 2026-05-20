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
}

export interface PressClaimVerification extends ClaimVerification {
  articleUrl: string
  articleSource: string
  articleSourceHost: string | null
  articleFingerprint: string
}

export function verifyPressClaim(inputs: PressVerifierInputs): PressClaimVerification {
  const { claim } = inputs

  if (claim.type === 'dato_municipal') {
    const result = verifyDatoMunicipal(claim, {
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
    return {
      ...result,
      articleUrl: claim.articleUrl,
      articleSource: claim.articleSource,
      articleSourceHost: claim.articleSourceHost,
      articleFingerprint: claim.articleFingerprint,
    }
  }

  const projected = projectPressClaim(claim)
  const result = verifyClaim({
    claim: projected,
    tenders: inputs.tenders,
    bdns: inputs.bdns,
    budget: inputs.budget,
    promises: inputs.promises,
    priorClaims: inputs.priorClaims,
  })

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
