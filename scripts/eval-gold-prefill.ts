/**
 * Prefill / refresh the verifier gold set (P0).
 *
 *   npm run eval:gold-prefill -- [--sample 50] [--out tests/fixtures/verifier-gold.json]
 *
 * Draws a stratified sample of verified claims, prefills each with its CURRENT
 * verdict + evidence (a starting label the curator corrects), and merges into
 * the gold file WITHOUT touching any row already flagged `reviewed:true`.
 * Only `reviewed:true` rows are scored by `npm run eval:verifier`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import {
  stratifiedSample,
  toGoldRow,
  mergeGold,
  type VerifiedItemLike,
} from '../src/scraper/gold-prefill'
import type { GoldRow } from '../src/scraper/verifier-eval'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')

function parseArgs(argv: string[]): { sample: number; out: string } {
  let sample = 50
  let out = 'tests/fixtures/verifier-gold.json'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sample') sample = Number(argv[++i])
    else if (argv[i] === '--out') out = argv[++i]
    else {
      process.stderr.write(`[gold-prefill] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  if (!Number.isFinite(sample) || sample < 1) {
    process.stderr.write('[gold-prefill] --sample must be a positive integer\n')
    process.exit(2)
  }
  return { sample, out }
}

function main() {
  const { sample, out } = parseArgs(process.argv.slice(2))
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[gold-prefill] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as { items: VerifiedItemLike[] }
  const items = snap.items ?? []

  const outPath = resolve(out)
  const existing: GoldRow[] = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, 'utf8')).rows ?? [])
    : []

  const fresh = stratifiedSample(items, sample).map(toGoldRow)
  const rows = mergeGold(existing, fresh)

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), rows }, null, 2) + '\n',
  )

  const reviewed = rows.filter((r) => r.reviewed).length
  process.stdout.write(
    `[gold-prefill] ${rows.length} rows (${reviewed} reviewed, ${rows.length - reviewed} pending) ` +
      `· sampled ${fresh.length} from ${items.length} claims → ${out}\n` +
      `[gold-prefill] now open ${out}, correct the wrong goldVerdict/goldEvidenceRefs, and set reviewed:true.\n`,
  )
}

main()
