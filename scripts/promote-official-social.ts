#!/usr/bin/env tsx
/**
 * Promote a suggested social account into the published registry.
 *
 *   npm run promote-social -- --slug robert-raga-gadea --platform instagram \
 *       --curator "datarhan" [--note "verificado en la bio"]
 *   npm run promote-social -- --slug robert-raga-gadea --platform x --reject
 *   npm run promote-social -- --list
 *
 * The only path that writes public/data/officials-social.json. Mirrors the
 * promote-place / promote-claim contract: the machine proposes, a human
 * publishes, the approval flag is stripped on the way through, and the whole
 * snapshot is re-validated before it is written — so an invariant can never
 * slip in via a single edited row.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateSocialSnapshot,
  type SocialAccount,
  type SocialSuggestion,
} from '../src/scraper/officials-social'

const SUGGESTIONS = resolve('public/data/officials-social-suggestions.json')
const OUT = resolve('public/data/officials-social.json')

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function loadPublished(): { generatedAt: string; accounts: SocialAccount[] } {
  if (!existsSync(OUT)) return { generatedAt: new Date().toISOString(), accounts: [] }
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

function main() {
  const suggestions: SocialSuggestion[] = existsSync(SUGGESTIONS)
    ? JSON.parse(readFileSync(SUGGESTIONS, 'utf8')).suggestions
    : []

  if (process.argv.includes('--list')) {
    const published = new Set(loadPublished().accounts.map((a) => `${a.slug}::${a.platform}`))
    console.log(`${suggestions.length} suggestion(s):\n`)
    for (const s of suggestions) {
      const mark = published.has(`${s.slug}::${s.platform}`) ? '✓ published' : '· pending'
      console.log(`${mark}  ${s.slug}  ${s.platform}  ${s.url}`)
      console.log(`            ${s.evidence.slice(0, 120)}`)
    }
    return
  }

  const slug = arg('slug')
  const platform = arg('platform')
  if (!slug || !platform) {
    console.error(
      'usage: npm run promote-social -- --slug <slug> --platform <platform> --curator "<name>"\n' +
        '       npm run promote-social -- --list',
    )
    process.exit(1)
  }

  const snap = loadPublished()

  if (process.argv.includes('--reject')) {
    const before = snap.accounts.length
    snap.accounts = snap.accounts.filter((a) => !(a.slug === slug && a.platform === platform))
    if (snap.accounts.length === before) {
      console.error(`[social] nothing published for ${slug}/${platform}`)
      process.exit(1)
    }
    snap.generatedAt = new Date().toISOString()
    validateSocialSnapshot(snap)
    writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n')
    console.log(`[social] removed ${slug}/${platform}`)
    return
  }

  const curator = arg('curator')
  if (!curator) {
    console.error('[social] --curator is required: publishing this is a human act, so it is signed')
    process.exit(1)
  }

  const hit = suggestions.find((s) => s.slug === slug && s.platform === platform)
  if (!hit) {
    console.error(
      `[social] no suggestion for ${slug}/${platform}. Run npm run suggest:officials-social first,\n` +
        `         or add the row by hand if you verified it another way.`,
    )
    process.exit(1)
  }

  // Strip the approval flag rather than copy the row wholesale — the published
  // shape rejects it, and defence in depth beats trusting the spread operator.
  const { requiresHumanApproval: _drop, confidence: _c, query: _q, ...rest } = hit
  const account: SocialAccount = {
    ...rest,
    curator,
    addedAt: new Date().toISOString().slice(0, 10),
    ...(arg('note') ? { note: arg('note') as string } : {}),
  }

  snap.accounts = snap.accounts.filter((a) => !(a.slug === slug && a.platform === platform))
  snap.accounts.push(account)
  snap.accounts.sort((a, b) => a.slug.localeCompare(b.slug) || a.platform.localeCompare(b.platform))
  snap.generatedAt = new Date().toISOString()

  validateSocialSnapshot(snap)
  writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n')
  console.log(`[social] published ${slug} → ${account.url} (curator: ${curator})`)
  console.log(`[social] registry now holds ${snap.accounts.length} account(s)`)
}

main()
