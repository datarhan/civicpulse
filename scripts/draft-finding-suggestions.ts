/**
 * Machine-drafts finding templates from the verifier's output.
 *
 * Takes every verified/parcial/contradicho entry in
 * public/data/pleno-claims-verified.json and asks the LLM to write a
 * title + summary + severity suggestion for each. Writes to
 * public/data/pleno-findings-suggestions.json — requiresHumanApproval:true
 * on every record. Curator one-clicks a draft into pleno-findings.json via
 * `npm run promote-claim` (existing CLI) using the pre-filled title +
 * summary + severity from the suggestion.
 *
 * Skips sin-datos claims — drafting a finding when we have no
 * corroborating evidence is not useful editorially.
 *
 *   npm run draft:findings                # everything
 *   npm run draft:findings -- --limit 10  # first 10 only
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { callLLM, resetBudget } from '../src/llm/client'
import {
  FINDING_DRAFT_PROMPT_VERSION,
  buildFindingDraftSystemPrompt,
  buildFindingDraftUserPrompt,
} from '../src/llm/prompts'
import { FindingDraftResponseSchema } from '../src/llm/schemas'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { ClaimVerification } from '../src/scraper/claim-verifier'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const OUT = resolve('public/data/pleno-findings-suggestions.json')

interface VerifiedSnapshot {
  items: Array<{ claim: PlenoClaim; verification: ClaimVerification }>
}

interface FindingSuggestion {
  sourceClaimId: string
  plenoId: string
  plenoDate: string
  verdict: string
  draft: {
    title: string
    summary: string
    severity: string
    reasoning: string
    confidence: number
  }
  requiresHumanApproval: true
  generatedAt: string
}

async function main() {
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity

  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[draft-findings] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const verified = JSON.parse(readFileSync(VERIFIED, 'utf8')) as VerifiedSnapshot
  const candidates = verified.items.filter((it) =>
    ['verificado', 'parcial', 'contradicho', 'promesa-repetida'].includes(it.verification.verdict),
  )
  process.stdout.write(
    `[draft-findings] ${candidates.length} candidate(s) (verified/parcial/contradicho/repetida)\n`,
  )

  resetBudget()
  const systemPrompt = buildFindingDraftSystemPrompt()
  const drafts: FindingSuggestion[] = []
  let processed = 0

  for (const it of candidates) {
    if (processed >= limit) break
    const userPrompt = buildFindingDraftUserPrompt({
      verbatim: it.claim.verbatim,
      speakerGroup: it.claim.speakerGroup,
      topic: it.claim.topic,
      verdict: it.verification.verdict,
      evidence: it.verification.evidence.map((e) => ({
        kind: e.kind,
        snippet: e.snippet,
        similarity: e.similarity,
      })),
      plenoDate: it.claim.plenoDate,
    })
    const response = await callLLM({
      systemPrompt,
      userPrompt,
      promptVersion: FINDING_DRAFT_PROMPT_VERSION,
      schema: FindingDraftResponseSchema,
      input: { claimId: it.claim.id, verdict: it.verification.verdict },
    })
    processed += 1
    if (!response || !response.draft) {
      process.stdout.write(`[draft-findings] ${it.claim.id} · LLM returned null (skipped)\n`)
      continue
    }
    const d = response.draft
    // Safety: severity=critical requires ≥1 contradiction evidence row.
    // If the LLM proposes critical but evidence doesn't back it, bump down
    // to notable (same policy as the finding validator).
    const hasContradiction = it.verification.evidence.some((e) => e.snippet.includes('no coincide'))
    const safeSeverity = d.severity === 'critical' && !hasContradiction ? 'notable' : d.severity
    drafts.push({
      sourceClaimId: it.claim.id,
      plenoId: it.claim.plenoId,
      plenoDate: it.claim.plenoDate,
      verdict: it.verification.verdict,
      draft: {
        title: d.title.trim(),
        summary: d.summary.trim(),
        severity: safeSeverity,
        reasoning: d.reasoning.trim(),
        confidence: d.confidence,
      },
      requiresHumanApproval: true,
      generatedAt: new Date().toISOString(),
    })
    process.stdout.write(
      `[draft-findings] ${it.claim.id} · ${safeSeverity} · conf=${d.confidence.toFixed(2)}\n`,
    )
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Machine-drafted finding templates. Each carries requiresHumanApproval:true. A curator reviews and promotes via `npm run promote-claim -- <sourceClaimId> --title "…" --summary "…"` (copying values from the draft).',
      contract:
        'Machine-written; never substitutes for the curator-only pleno-findings.json. The finding validator enforces its own invariants on promotion (severity=critical requires ≥1 contradiction, summary ≥40 chars, etc.).',
    },
    stats: {
      candidatesSeen: candidates.length,
      draftsProduced: drafts.length,
      droppedByLlm: processed - drafts.length,
    },
    items: drafts,
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
  process.stdout.write(`[draft-findings] wrote ${drafts.length} draft(s) → ${OUT}\n`)
}

main().catch((err) => {
  process.stderr.write(
    `[draft-findings] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
