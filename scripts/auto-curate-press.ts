#!/usr/bin/env tsx
/**
 * Auto-curate press findings from the verified-claims snapshot.
 *
 * Hard rules:
 *   - severity is locked to `informational` (curator path lands
 *     notable/critical via promote-press-claim).
 *   - bundles containing ≥1 `contradicho` claim are quarantined to
 *     editorial/press-auto-curation-queue.md, NEVER auto-published.
 *   - LOREG freeze: when promises.json.frozenUntil > today, exit 0
 *     with no writes (same hard-stop as the promises tracker).
 *
 * Reads:
 *   public/data/press-claims-verified.json
 *   public/data/promises.json (for frozenUntil)
 *   public/data/press-findings.json (optional, merges with existing)
 *
 * Writes:
 *   public/data/press-findings.json
 *   editorial/press-auto-curation-queue.md
 *
 * Usage:
 *   npm run auto-curate-press
 *   npm run auto-curate-press -- --dry-run
 *   npm run auto-curate-press -- --max 5
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { clusterArticlesByStory } from '../src/scraper/press-analytics'
import type { PressArticleLite } from '../src/scraper/press-analytics'
import {
  selectBundles,
  composeFinding,
  renderQuarantineMarkdown,
  type VerifiedPressItem,
} from '../src/scraper/press-auto-curate'
import { validatePressFindingsSnapshot, type PressFinding } from '../src/scraper/press-finding'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

const PATHS = {
  verified: join(PROJECT_ROOT, 'public/data/press-claims-verified.json'),
  press: join(PROJECT_ROOT, 'public/data/press.json'),
  promises: join(PROJECT_ROOT, 'public/data/promises.json'),
  findings: join(PROJECT_ROOT, 'public/data/press-findings.json'),
  queue: join(PROJECT_ROOT, 'editorial/press-auto-curation-queue.md'),
}

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}
function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

async function readJson<T = unknown>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function main() {
  const dryRun = hasFlag('--dry-run')
  const max = Number(getFlag('--max')) || 10

  const verifiedSnap = (await readJson(PATHS.verified)) as {
    items?: VerifiedPressItem[]
  } | null
  if (!verifiedSnap || !Array.isArray(verifiedSnap.items)) {
    throw new Error(
      '[auto-curate-press] press-claims-verified.json missing or invalid. Run npm run verify:press-claims first.',
    )
  }

  const promises = (await readJson(PATHS.promises)) as { frozenUntil?: string | null } | null
  // Fail CLOSED on the legal gate: an unreadable promises.json means the
  // LOREG freeze state is unknowable — refuse to auto-publish findings
  // rather than defaulting to "not frozen" (LOREG art. 50).
  if (!promises) {
    throw new Error(
      `[auto-curate-press] ${PATHS.promises} missing or unreadable — cannot determine LOREG freeze state, refusing to publish.`,
    )
  }
  const frozenUntil = promises.frozenUntil ?? null

  // Group by STORY, not by title hash — see selectBundles' third parameter.
  const pressSnap = (await readJson(PATHS.press)) as { items?: PressArticleLite[] } | null
  const storyKeyByArticleId = new Map<string, string>()
  for (const group of clusterArticlesByStory(pressSnap?.items ?? []).values()) {
    const key = group
      .map((a) => a.id)
      .sort()
      .join('+')
    for (const a of group) storyKeyByArticleId.set(a.id, key)
  }

  const result = selectBundles(
    verifiedSnap.items,
    { maxFindings: max, frozenUntil },
    storyKeyByArticleId,
  )

  if (result.frozen) {
    console.log(
      `[auto-curate-press] LOREG freeze active until ${frozenUntil}; exiting without writes.`,
    )
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const newFindings: PressFinding[] = result.eligible.map((b) =>
    composeFinding({ bundle: b, publishedAt: today }),
  )

  console.log(
    `[auto-curate-press] eligible=${result.eligible.length} quarantine=${result.quarantine.length} skipped=${result.skipped.length}`,
  )
  if (dryRun) {
    console.log('[auto-curate-press] --dry-run: no files written.')
    return
  }

  const existing = (await readJson(PATHS.findings)) as { items?: PressFinding[] } | null
  const existingItems = existing?.items ?? []
  const newIds = new Set(newFindings.map((f) => f.id))
  const merged = [...newFindings, ...existingItems.filter((f) => !newIds.has(f.id))]

  const snap = {
    version: '1',
    generatedAt: today,
    legalNotice:
      'Auditoría editorial automatizada. Los lotes con ≥1 veredicto contradicho se mantienen ' +
      'en editorial/press-auto-curation-queue.md hasta revisión humana; los medios afectados ' +
      'pueden ejercer derecho de réplica mediante el formulario .github/ISSUE_TEMPLATE/press-finding-response.yml.',
    contactUrl: 'https://github.com/datarhan/civicpulse/issues',
    methodologyUrl: '/metodologia#laboratorio-prensa',
    items: merged,
  }

  validatePressFindingsSnapshot(JSON.stringify(snap))

  await write(PATHS.findings, JSON.stringify(snap, null, 2) + '\n')
  await write(PATHS.queue, renderQuarantineMarkdown(result.quarantine))

  console.log(
    `[auto-curate-press] wrote ${newFindings.length} new findings to ${PATHS.findings};` +
      ` ${result.quarantine.length} bundles in ${PATHS.queue}`,
  )
}

main().catch((err) => {
  console.error('[auto-curate-press] failed:', err)
  process.exit(1)
})
