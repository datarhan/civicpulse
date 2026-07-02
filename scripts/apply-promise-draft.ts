#!/usr/bin/env tsx
/**
 * Apply / reject / retract / mark-reviewed a promise auto-curator draft.
 * The ONLY curator-facing writer of promises.json besides reply/freeze.
 *
 * read → validatePromisesSnapshot → mutate (pure helpers) → re-validate → write.
 * Refuses during LOREG freeze. Removes applied/rejected drafts from the queue.
 *
 * Usage:
 *   npm run apply-promise-draft -- <draftId>                  # approve → publish (no autoPublished stamp; human-approved)
 *   npm run apply-promise-draft -- --reject <draftId> [reason]
 *   npm run apply-promise-draft -- --retract <promiseId>      # remove an auto-published promise
 *   npm run apply-promise-draft -- --mark-reviewed <promiseId>
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePromisesSnapshot, isFrozen } from '../src/scraper/promises'
import {
  validateReviewQueue,
  emptyQueue,
  removeDraftFromQueue,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'
import {
  newPromiseFromDraft,
  insertPromise,
  removeAutoPublished,
  setReviewState,
} from '../src/scraper/promise-apply'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PROMISES = join(ROOT, 'public/data/promises.json')
const QUEUE = join(ROOT, 'editorial/promise-review-queue.json')
const ARCHIVE = join(ROOT, 'editorial/promise-review-archive.json')

function usage(): never {
  console.error(`Usage:
  npm run apply-promise-draft -- <draftId>                  approve → publish
  npm run apply-promise-draft -- --reject <draftId> [reason]
  npm run apply-promise-draft -- --retract <promiseId>
  npm run apply-promise-draft -- --mark-reviewed <promiseId>`)
  process.exit(2)
}

async function loadQueue(path: string): Promise<PromiseReviewQueue> {
  if (!existsSync(path)) return emptyQueue(new Date().toISOString())
  return validateReviewQueue(await readFile(path, 'utf8'))
}

async function writeQueue(path: string, q: PromiseReviewQueue): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    JSON.stringify({ ...q, generatedAt: new Date().toISOString() }, null, 2) + '\n',
  )
}

async function readSnap() {
  const raw = await readFile(PROMISES, 'utf8')
  const snap = validatePromisesSnapshot(raw) // never write on top of a broken snapshot
  if (isFrozen(snap)) {
    console.error('[apply-promise-draft] LOREG freeze active — refusing to mutate promises.json')
    process.exit(0)
  }
  return snap
}

async function writeSnap(snap: unknown) {
  const serialized =
    JSON.stringify({ ...(snap as object), generatedAt: new Date().toISOString() }, null, 2) + '\n'
  validatePromisesSnapshot(serialized) // defence-in-depth
  await writeFile(PROMISES, serialized)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) usage()
  const now = new Date().toISOString()

  if (argv[0] === '--reject') {
    const draftId = argv[1]
    if (!draftId) usage()
    const queue = await loadQueue(QUEUE)
    const draft = queue.drafts.find((d) => d.draftId === draftId)
    if (!draft) {
      console.error(`[apply-promise-draft] draft "${draftId}" not in queue`)
      process.exit(1)
    }
    const archive = await loadQueue(ARCHIVE)
    await writeQueue(ARCHIVE, { ...archive, drafts: [...archive.drafts, draft] })
    await writeQueue(QUEUE, removeDraftFromQueue(queue, draftId))
    console.log(
      `[apply-promise-draft] rejected "${draftId}" → archive${argv[2] ? ` (${argv[2]})` : ''}`,
    )
    return
  }

  if (argv[0] === '--retract') {
    const promiseId = argv[1]
    if (!promiseId) usage()
    const snap = await readSnap()
    await writeSnap(removeAutoPublished(snap, promiseId))
    console.log(`[apply-promise-draft] retracted auto-published promise "${promiseId}"`)
    return
  }

  if (argv[0] === '--mark-reviewed') {
    const promiseId = argv[1]
    if (!promiseId) usage()
    const snap = await readSnap()
    // Guard: setReviewState silently no-ops if the promise doesn't exist or isn't
    // auto-published. Detect that here so the curator gets a clear error instead of
    // a silent no-op that looks like success.
    const target = snap.items.find((p) => p.id === promiseId)
    if (!target || !target.autoPublished) {
      console.error(`[apply-promise-draft] promise "${promiseId}" not found or not auto-published`)
      process.exit(1)
    }
    await writeSnap(setReviewState(snap, promiseId, 'reviewed', now))
    console.log(`[apply-promise-draft] marked "${promiseId}" reviewed`)
    return
  }

  // Default: approve a draft → publish it (human-approved, no autoPublished stamp)
  const draftId = argv[0]
  const queue = await loadQueue(QUEUE)
  const draft = queue.drafts.find((d) => d.draftId === draftId)
  if (!draft) {
    console.error(`[apply-promise-draft] draft "${draftId}" not in queue`)
    process.exit(1)
  }
  const snap = await readSnap()
  const promise = newPromiseFromDraft(draft, now) // no autoPublish meta → human-approved
  await writeSnap(insertPromise(snap, promise))
  await writeQueue(QUEUE, removeDraftFromQueue(queue, draftId))
  console.log(`[apply-promise-draft] published "${draftId}" as promise (human-approved)`)
}

main().catch((err) => {
  console.error('[apply-promise-draft] failed:', err)
  process.exit(1)
})
