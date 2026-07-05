/**
 * Curator gate — promote a Tier-B queja ↔ contract link into the published set.
 *
 *   npm run promote-relation -- <quejaId> <tenderId> --curator "<name>" [--note "…"]
 *   npm run promote-relation -- <quejaId> <tenderId> --reject
 *
 * Promotion requires the pair to exist as a GATED Tier-B link
 * (`requiresHumanApproval: true`) in public/data/queja-contract-relations.json —
 * Tier-A links are already published and need no promotion. Writes the curated
 * public/data/queja-contract-relations-approved.json (validated on every write).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateApprovalsSnapshot,
  appendApproval,
  removeApproval,
  type ApprovalsSnapshot,
} from '../src/scraper/queja-relation-approval'

const RELATIONS = resolve('public/data/queja-contract-relations.json')
const APPROVED = resolve('public/data/queja-contract-relations-approved.json')

const argv = process.argv.slice(2)
const VALUE_FLAGS = new Set(['--curator', '--note'])

function flagValue(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
function positionals(): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t.startsWith('--')) {
      if (VALUE_FLAGS.has(t)) i++
      continue
    }
    out.push(t)
  }
  return out
}

function loadApprovals(): ApprovalsSnapshot {
  if (!existsSync(APPROVED)) return { generatedAt: new Date().toISOString(), approvals: [] }
  return validateApprovalsSnapshot(readFileSync(APPROVED, 'utf8'))
}

function fail(msg: string, code = 1): never {
  process.stderr.write(`[promote-relation] ${msg}\n`)
  process.exit(code)
}

function main(): void {
  const [quejaId, tenderId] = positionals()
  if (!quejaId || !tenderId) {
    fail(
      'usage: promote-relation <quejaId> <tenderId> --curator "<name>" [--note "…"] [--reject]',
      2,
    )
  }
  const reject = argv.includes('--reject')
  let snap = loadApprovals()

  if (reject) {
    snap = removeApproval(snap, quejaId, tenderId)
  } else {
    const curator = flagValue('--curator')
    if (!curator || !curator.trim()) fail('--curator "<name>" is required', 2)
    const rel = existsSync(RELATIONS)
      ? (JSON.parse(readFileSync(RELATIONS, 'utf8')) as { links?: Array<Record<string, unknown>> })
      : { links: [] }
    const link = (rel.links ?? []).find((l) => l.quejaId === quejaId && l.tenderId === tenderId)
    if (!link) fail(`no relation link for ${quejaId} ↔ ${tenderId} in the snapshot`)
    if (!link.requiresHumanApproval)
      fail(`${quejaId} ↔ ${tenderId} is already Tier A (published) — nothing to promote`)
    snap = appendApproval(snap, {
      quejaId,
      tenderId,
      curator: (curator as string).trim(),
      note: flagValue('--note'),
      approvedAt: new Date().toISOString(),
    })
  }

  snap.generatedAt = new Date().toISOString()
  const validated = validateApprovalsSnapshot(JSON.stringify(snap))
  writeFileSync(APPROVED, JSON.stringify(validated, null, 2) + '\n')
  process.stdout.write(
    `[promote-relation] ${reject ? 'removed' : 'approved'} ${quejaId} ↔ ${tenderId} · ` +
      `total approvals: ${validated.approvals.length}\n`,
  )
}

main()
