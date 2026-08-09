/**
 * Curator CLI: promote one or more machine-extracted claims into a
 * human-edited editorial finding in public/data/pleno-findings.json.
 *
 *   npm run promote-claim -- <claimId> [claimId ...] \
 *       --title "<≥10-char title>" \
 *       --summary "<≥40-char editorial paragraph>" \
 *       [--severity informational|notable|critical] \
 *       [--curator "<name>"] \
 *       [--related-promise <id> ...] \
 *       [--edit]    # write /tmp/finding-*.json for review, don't persist
 *
 * The script:
 *   1. Looks up each claimId in pleno-claims-verified.json to pull
 *      verbatim quotes + verifier evidence + sourceRefs.
 *   2. Assembles a PlenoFinding candidate and validates it against the
 *      full schema (verbatim ≥20, summary ≥40, critical requires ≥1
 *      evidence ref, etc.).
 *   3. Merges into pleno-findings.json (dedup by id; reject duplicates
 *      unless --force is passed).
 *
 * Every promotion creates a git-auditable record. Mutations only via
 * this CLI or by PR-editing pleno-findings.json directly.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateFindingsSnapshot,
  type PlenoFinding,
  type FindingQuote,
  type FindingRef,
  type FindingSeverity,
  type PlenoFindingsSnapshot,
} from '../src/scraper/pleno-finding'
import { SPEAKER_GROUPS, type SpeakerGroup } from '../src/scraper/pleno-votes'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import {
  evidenceStance,
  toPublishedSnippet,
  type ClaimVerification,
} from '../src/scraper/claim-verifier'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const FINDINGS = resolve('public/data/pleno-findings.json')

interface VerifiedSnapshot {
  items: Array<{ claim: PlenoClaim; verification: ClaimVerification }>
}

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run promote-claim -- <claimId> [claimId ...] \\\n' +
      '      --title "<title>" --summary "<summary>" \\\n' +
      '      [--severity informational|notable|critical] \\\n' +
      '      [--curator "<name>"] [--related-promise <id>] \\\n' +
      '      [--extra-corroboration \'[{"kind":"press|document|transcript","ref":"<url>","snippet":"<≤240 chars>"}, …]\'] \\\n' +
      '      [--edit] [--force]\n',
  )
  process.exit(2)
}

function loadVerified(): VerifiedSnapshot {
  if (!existsSync(VERIFIED)) {
    process.stderr.write(
      `[promote-claim] ${VERIFIED} missing — run extract:pleno-claims + verify:pleno-claims first\n`,
    )
    process.exit(1)
  }
  return JSON.parse(readFileSync(VERIFIED, 'utf8')) as VerifiedSnapshot
}

function loadFindings(): PlenoFindingsSnapshot {
  if (!existsSync(FINDINGS)) {
    return {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      legalNotice:
        'Este registro recoge hallazgos editoriales verificados manualmente sobre las intervenciones de los plenos. Cada hallazgo cita una o más afirmaciones literales (verbatim) del pleno y los documentos municipales que confirman o contradicen cada afirmación. Las réplicas de los grupos políticos se publican literalmente a través del campo `response`.',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
      methodologyUrl: '/metodologia',
      items: [],
    }
  }
  return validateFindingsSnapshot(readFileSync(FINDINGS, 'utf8'))
}

function evidenceToRefs(ev: ClaimVerification['evidence']): {
  crossChecked: FindingRef[]
  contradiction: FindingRef[]
} {
  const crossChecked: FindingRef[] = []
  const contradiction: FindingRef[] = []
  for (const e of ev) {
    if (e.kind === 'prior-claim') continue // not representable as a findings ref
    // Fit the schema's 240-char cap, and drop the prompt's `· sim=0.50` tail
    // when the model handed back the rendered candidate line instead of the
    // document's own text. Shared with both auto-curators — see
    // toPublishedSnippet.
    const snippet = toPublishedSnippet(e.snippet)
    // Evidence kinds are a superset of FindingRef kinds (they also include
    // 'factcheck'/'boe'); preserve the existing runtime behaviour and let the
    // findings validator be the gate on which kinds are accepted.
    const ref: FindingRef = { kind: e.kind as FindingRef['kind'], ref: e.ref, snippet }
    // Read the stance the verifier RECORDED. This used to be a local
    // heuristic — `similarity ≥ 0.65` counted as corroborating and the
    // fallback branch was literally `corroboration.push(ref) // default:
    // treat as supporting reference`, so a document nobody classified was
    // published as support. Only a recorded 'contradicts' now separates.
    if (evidenceStance(e) === 'contradicts') contradiction.push(ref)
    else crossChecked.push(ref)
  }
  return { crossChecked, contradiction }
}

/** Curator-supplied refs eligible to land in `crossChecked[]`. The
 *  CLI restricts the kinds here to the three curator-only values
 *  (`press`, `document`, `transcript`) — the remaining six kinds are
 *  populated only by the verifier path. */
const CURATOR_REF_KINDS = new Set(['press', 'document', 'transcript'])
const MAX_EXTRA_CORROBORATION = 10

function parseExtraCorroboration(raw: string): FindingRef[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    process.stderr.write(
      `[promote-claim] --extra-corroboration: invalid JSON (${(err as Error).message})\n`,
    )
    process.exit(2)
  }
  if (!Array.isArray(parsed)) {
    process.stderr.write('[promote-claim] --extra-corroboration: must be a JSON array\n')
    process.exit(2)
  }
  if (parsed.length > MAX_EXTRA_CORROBORATION) {
    process.stderr.write(
      `[promote-claim] --extra-corroboration: max ${MAX_EXTRA_CORROBORATION} entries (got ${parsed.length})\n`,
    )
    process.exit(2)
  }
  const out: FindingRef[] = []
  for (let i = 0; i < parsed.length; i++) {
    const e = parsed[i] as Record<string, unknown>
    if (!e || typeof e !== 'object') {
      process.stderr.write(`[promote-claim] --extra-corroboration[${i}]: must be object\n`)
      process.exit(2)
    }
    const kind = String(e.kind ?? '')
    const ref = String(e.ref ?? '')
    const snippetRaw = String(e.snippet ?? '')
    if (!CURATOR_REF_KINDS.has(kind)) {
      process.stderr.write(
        `[promote-claim] --extra-corroboration[${i}].kind: must be one of ${[...CURATOR_REF_KINDS].join('|')} (got ${kind})\n`,
      )
      process.exit(2)
    }
    if (ref.length === 0 || ref.length > 2000) {
      process.stderr.write(
        `[promote-claim] --extra-corroboration[${i}].ref: 1-2000 chars required\n`,
      )
      process.exit(2)
    }
    if (snippetRaw.length === 0) {
      process.stderr.write(`[promote-claim] --extra-corroboration[${i}].snippet: required\n`)
      process.exit(2)
    }
    // Same trimming discipline as the verifier path, through the same helper.
    out.push({ kind: kind as FindingRef['kind'], ref, snippet: toPublishedSnippet(snippetRaw) })
  }
  return out
}

function parseArgs(argv: string[]): {
  claimIds: string[]
  title: string
  summary: string
  severity: FindingSeverity
  curator: string
  relatedPromises: string[]
  extraCorroboration: FindingRef[]
  edit: boolean
  force: boolean
  /**
   * 'auto' (default): if every cited claim shares the same speakerSlug,
   *   stamp the finding with individualSpeaker. If they don't agree,
   *   leave it null (bloc-level only). NEVER fabricate.
   * 'none': explicitly suppress individual attribution even when the
   *   underlying claims agree. Useful when the curator wants the
   *   finding bloc-level for editorial reasons.
   * '<slug>': force the finding to attribute to this slug. Slug must
   *   exist in officials.json AND match every quote's speakerGroup
   *   party. Used when claims came from the LLM with speakerSlug=null
   *   but the curator confirmed individual identity from the audio.
   */
  individualSpeaker: 'auto' | 'none' | string
} {
  const opts = {
    claimIds: [] as string[],
    title: '',
    summary: '',
    severity: 'notable' as FindingSeverity,
    curator: 'civicpulse-curator',
    relatedPromises: [] as string[],
    extraCorroboration: [] as FindingRef[],
    edit: false,
    force: false,
    individualSpeaker: 'auto' as 'auto' | 'none' | string,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--title') opts.title = argv[++i]
    else if (a === '--summary') opts.summary = argv[++i]
    else if (a === '--severity') opts.severity = argv[++i] as FindingSeverity
    else if (a === '--curator') opts.curator = argv[++i]
    else if (a === '--related-promise') opts.relatedPromises.push(argv[++i])
    else if (a === '--extra-corroboration') {
      opts.extraCorroboration = parseExtraCorroboration(argv[++i])
    } else if (a === '--edit') opts.edit = true
    else if (a === '--force') opts.force = true
    else if (a === '--individual-speaker') opts.individualSpeaker = argv[++i]
    else if (a.startsWith('--')) {
      process.stderr.write(`[promote-claim] unknown flag ${a}\n`)
      process.exit(2)
    } else opts.claimIds.push(a)
  }
  if (opts.claimIds.length === 0) usage()
  if (opts.title.length < 10) {
    process.stderr.write('[promote-claim] --title must be ≥10 chars\n')
    process.exit(2)
  }
  if (opts.summary.length < 40) {
    process.stderr.write('[promote-claim] --summary must be ≥40 chars\n')
    process.exit(2)
  }
  return opts
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const verified = loadVerified()
  const findings = loadFindings()

  // Resolve every claimId
  const rows = opts.claimIds.map((id) => {
    const row = verified.items.find((r) => r.claim.id === id)
    if (!row) {
      process.stderr.write(`[promote-claim] claimId ${id} not found in ${VERIFIED}\n`)
      process.exit(1)
    }
    return row
  })
  const anchor = rows[0].claim
  const plenoId = anchor.plenoId
  const plenoDate = anchor.plenoDate
  for (const r of rows) {
    if (r.claim.plenoId !== plenoId) {
      process.stderr.write(
        '[promote-claim] all claims must belong to the same pleno — mixing is not supported\n',
      )
      process.exit(1)
    }
  }

  // Assemble quotes + evidence rolls
  const quotes: FindingQuote[] = rows.map((r) => ({
    text: r.claim.verbatim,
    speakerGroup: r.claim.speakerGroup,
    sourceClaimId: r.claim.id,
  }))
  const crossChecked: FindingRef[] = []
  const contradiction: FindingRef[] = []
  for (const r of rows) {
    const split = evidenceToRefs(r.verification.evidence)
    crossChecked.push(...split.crossChecked)
    contradiction.push(...split.contradiction)
    if (r.verification.verdict === 'contradicho') {
      // Ensure at least one contradiction ref is present (the verifier's
      // summary is cited as a synthetic ref).
      if (split.contradiction.length === 0) {
        contradiction.push({
          kind: 'tender',
          ref: `verdict:${r.claim.id}`,
          snippet: r.verification.summary.slice(0, 240),
        })
      }
    }
  }
  // Curator-supplied refs (URL/PDF/transcript). They land in crossChecked[]
  // like everything else: a curator attaching a document is a curator saying
  // "read this alongside", and the CLI verifies nothing about whether it
  // supports the finding. If it refutes one, the curator says so in the
  // summary. Dedup by ref so a curator-added URL that also surfaces in the
  // verifier's evidence doesn't appear twice on the published card.
  if (opts.extraCorroboration.length > 0) {
    const seen = new Set(crossChecked.map((c) => c.ref))
    for (const e of opts.extraCorroboration) {
      if (seen.has(e.ref)) continue
      seen.add(e.ref)
      crossChecked.push(e)
    }
  }

  // Deterministic finding id: f-<plenoDate>-<first-claim-id-short>
  const shortAnchor = anchor.id.split('-').slice(-2).join('-')
  const id = `f-${plenoDate}-${shortAnchor}`

  // ─── Individual attribution gate (libel-material) ──────────────────────
  // The schema admits an optional individualSpeaker field. We populate it
  // only when (a) the curator explicitly opted in via --individual-speaker
  // <slug> OR (b) all cited claims agree on the same speakerSlug AND the
  // curator hasn't passed --individual-speaker none. Either way we
  // resolve the slug against officials.json + cross-check party with
  // every quote's speakerGroup; mismatches abort the run.
  let individualSpeaker: PlenoFinding['individualSpeaker'] = null
  if (opts.individualSpeaker !== 'none') {
    let candidateSlug: string | null = null
    if (opts.individualSpeaker === 'auto') {
      const slugs = new Set(rows.map((r) => r.claim.speakerSlug ?? '').filter(Boolean))
      if (slugs.size === 1) candidateSlug = [...slugs][0] || null
    } else {
      candidateSlug = opts.individualSpeaker
    }
    if (candidateSlug) {
      const officialsPath = resolve('public/data/officials.json')
      if (!existsSync(officialsPath)) {
        process.stderr.write('[promote-claim] officials.json missing\n')
        process.exit(1)
      }
      const officialsRaw = JSON.parse(readFileSync(officialsPath, 'utf8')) as {
        officials?: Array<{ slug: string; name: string; party: string }>
      }
      const o = (officialsRaw.officials ?? []).find((x) => x.slug === candidateSlug)
      if (!o) {
        process.stderr.write(
          `[promote-claim] individual-speaker slug "${candidateSlug}" not in officials.json\n`,
        )
        process.exit(1)
      }
      // Cross-check party with every quote's speakerGroup. A mismatch is
      // editorial abort — the curator should resolve the inconsistency
      // before promotion, not paper over it.
      for (const r of rows) {
        if (r.claim.speakerGroup && r.claim.speakerGroup !== o.party) {
          process.stderr.write(
            `[promote-claim] party mismatch on claim ${r.claim.id}: speakerGroup=${r.claim.speakerGroup}, official.party=${o.party}\n` +
              `[promote-claim]   abort — re-extract or pass --individual-speaker none if intentional\n`,
          )
          process.exit(1)
        }
      }
      // Type-narrow: party must be one of the allowed blocs (the schema
      // validator will catch this too, but failing here gives a cleaner
      // error message). Imported, not restated — the local copy had drifted,
      // omitting EU-Podem and carrying the retired `Otro` sentinel.
      if (!(SPEAKER_GROUPS as readonly string[]).includes(o.party)) {
        process.stderr.write(
          `[promote-claim] official ${o.slug} has party "${o.party}" which is not a tracked bloc\n`,
        )
        process.exit(1)
      }
      individualSpeaker = {
        slug: o.slug,
        name: o.name,
        party: o.party as SpeakerGroup,
      }
      process.stderr.write(
        `[promote-claim] individualSpeaker → ${o.name} (${o.party}) [${opts.individualSpeaker === 'auto' ? 'auto-detected from claims' : 'explicit'}]\n`,
      )
    }
  }

  const finding: PlenoFinding = {
    id,
    plenoId,
    plenoDate,
    title: opts.title,
    summary: opts.summary,
    severity: opts.severity,
    sourceClaimIds: rows.map((r) => r.claim.id),
    quotes,
    crossChecked,
    contradiction,
    relatedPromiseIds: opts.relatedPromises,
    curatorName: opts.curator,
    publishedAt: new Date().toISOString().slice(0, 10),
    ...(individualSpeaker ? { individualSpeaker } : {}),
    response: null,
  }

  // Dedup by id — reject or merge via --force
  const existingIdx = findings.items.findIndex((f) => f.id === id)
  if (existingIdx >= 0 && !opts.force) {
    process.stderr.write(
      `[promote-claim] finding ${id} already exists; pass --force to overwrite\n`,
    )
    process.exit(1)
  }

  const nextItems = [...findings.items]
  if (existingIdx >= 0) nextItems[existingIdx] = finding
  else nextItems.push(finding)
  nextItems.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  const snapshot: PlenoFindingsSnapshot = {
    ...findings,
    generatedAt: new Date().toISOString(),
    items: nextItems,
  }
  const serialized = JSON.stringify(snapshot, null, 2) + '\n'
  // Re-validate before writing (defence-in-depth).
  validateFindingsSnapshot(serialized)

  if (opts.edit) {
    const tmp = `/tmp/finding-${id}.json`
    writeFileSync(tmp, JSON.stringify(finding, null, 2) + '\n')
    process.stdout.write(
      `[promote-claim] EDIT MODE — wrote ${tmp} (not applied).\n` +
        `  Review, then: cp ${tmp} public/data/pleno-findings.json.partial && ...\n`,
    )
    return
  }

  writeFileSync(FINDINGS, serialized, 'utf8')
  process.stdout.write(
    `[promote-claim] ${existingIdx >= 0 ? 'updated' : 'promoted'} finding ${id} ` +
      `(${rows.length} claim(s), ${crossChecked.length} cross-checked${opts.extraCorroboration.length > 0 ? ` [+${opts.extraCorroboration.length} curator]` : ''}, ${contradiction.length} contradiction) → ${FINDINGS}\n`,
  )
}

main()
