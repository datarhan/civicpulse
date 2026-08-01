#!/usr/bin/env tsx
/**
 * Propose the social accounts each official uses in their public role.
 *
 *   npm run suggest:officials-social            # every official
 *   npm run suggest:officials-social -- --slug robert-raga-gadea
 *
 * Writes public/data/officials-social-suggestions.json — machine-written,
 * every row `requiresHumanApproval: true`, NEVER rendered. A curator promotes
 * rows into public/data/officials-social.json via `npm run promote-social`.
 *
 * Deliberately NOT username enumeration. Tools of the Sherlock family take a
 * handle and report every platform where it exists, which profiles a person's
 * private life and matches handles rather than people. This searches for the
 * PERSON in their public role and keeps a candidate only when the search
 * result itself ties the account to that role (see `isRoleEvidence`), so a
 * namesake's account cannot reach a councillor's card.
 *
 * Search runs through the repo's existing dispatcher, which prefers a
 * self-hosted SearXNG instance (SEARXNG_URL) and costs nothing.
 */
import { writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
/**
 * Queries SearXNG directly rather than through the journalist-tools wrapper.
 * That wrapper hard-caps at 8 results and does not re-rank, so for a query like
 * `"Robert Raga" instagram alcalde …` the first eight hits are Wikipedia pages
 * about the name "Robert" and the profile never survives truncation. Here the
 * whole result set matters, because the handful of rows we want are social
 * profile URLs that can sit anywhere in the ranking.
 */
async function searchAll(
  query: string,
): Promise<Array<{ url: string; title: string; text: string }>> {
  const base = (process.env.SEARXNG_URL ?? '').replace(/\/$/, '')
  if (!base) throw new Error('SEARXNG_URL not set — see scripts/searxng/docker-compose.yml')
  const params = new URLSearchParams({ q: query, format: 'json', language: 'es', safesearch: '0' })
  const res = await fetch(`${base}/search?${params}`, {
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`)
  const data = (await res.json()) as {
    results?: Array<{ url?: string; title?: string; content?: string }>
  }
  return (data.results ?? [])
    .filter((r) => r.url && /^https?:\/\//.test(r.url))
    .map((r) => ({ url: r.url as string, title: r.title ?? '', text: r.content ?? '' }))
}
import {
  classifySocialUrl,
  accountBelongsToPerson,
  SOCIAL_PLATFORMS,
  validateSocialSuggestions,
  type SocialSuggestion,
} from '../src/scraper/officials-social'

const OFFICIALS = resolve('public/data/officials.json')
const OUT = resolve('public/data/officials-social-suggestions.json')
const MUNICIPALITY = 'Riba-roja de Túria'

interface Official {
  slug: string
  name: string
  party?: string
  role?: string
}

/**
 * Queries phrased around the public role, never around a bare handle. The
 * platform-scoped ones simply steer the engine; a hit still has to pass the
 * role-evidence check to survive.
 */
function queriesFor(o: Official): string[] {
  const role = /alcalde/i.test(o.role ?? '') ? 'alcalde' : 'concejal'
  // Role-scoped queries surface news and institutional pages, not profiles, so
  // they alone returned zero candidates for the mayor even though his account
  // exists. Site-scoped queries find the profile itself AND bring back the bio
  // in the snippet, which is what the role-evidence check needs to read.
  // Spanish officials carry two surnames but present socially with one:
  // searching the full legal name returns nothing, while the short form finds
  // the account. The ownership check still demands a given name AND a surname,
  // so the short form is no looser — it only improves recall.
  const parts = o.name.split(/\s+/).filter(Boolean)
  const short = parts.length > 2 ? parts.slice(0, 2).join(' ') : o.name

  // Plain-form queries, NOT `site:` — the configured SearXNG engines answer
  // `site:instagram.com "…"` with zero results, while naming the platform in
  // the query surfaces the profile reliably.
  const platforms = ['instagram', 'twitter X', 'facebook', 'linkedin']
  // Use the SHORT municipality form here. Appending the accented "de Túria"
  // derails the upstream engines completely: `"Robert Raga" instagram alcalde
  // Riba-roja de Túria` comes back as ten Wikipedia pages about the given name
  // "Robert", while dropping those two words returns his Instagram, Facebook
  // and X profiles in the top four. "Riba-roja" is unambiguous enough on its
  // own, and the ownership check still demands the role.
  const town = 'Riba-roja'
  return [
    `"${o.name}" ${role} ${MUNICIPALITY}`,
    ...platforms.map((p) => `"${short}" ${p} ${role} ${town}`),
    `"${short}" ${o.party ?? ''} ${town} perfil oficial`.replace(/\s+/g, ' '),
  ]
}

async function main() {
  const slugArg = process.argv.includes('--slug')
    ? process.argv[process.argv.indexOf('--slug') + 1]
    : null
  const officials: Official[] = JSON.parse(await readFile(OFFICIALS, 'utf8')).officials
  const targets = slugArg ? officials.filter((o) => o.slug === slugArg) : officials
  if (targets.length === 0) {
    console.error(`[social] no official matches --slug ${slugArg}`)
    process.exit(1)
  }

  console.log(
    `[social] searching ${targets.length} official(s) across ${SOCIAL_PLATFORMS.length} allowlisted platforms`,
  )

  const suggestions: SocialSuggestion[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const o of targets) {
    const seen = new Set<string>()
    let hits = 0
    for (const q of queriesFor(o)) {
      // SearXNG proxies upstream engines that throttle bursts, and a throttled
      // query comes back as an empty result set rather than an error — silent
      // recall loss. Pace the sweep.
      await new Promise((r) => setTimeout(r, 2500))
      let results: Array<{ url: string; title: string; text: string }>
      try {
        results = await searchAll(q)
      } catch (err) {
        console.warn(`[social] ${o.slug}: search failed (${(err as Error).message})`)
        continue
      }
      for (const r of results) {
        const cls = classifySocialUrl(r.url)
        if (!cls) continue
        const key = `${cls.platform}::${cls.handle.toLowerCase()}`
        if (seen.has(key)) continue

        // The evidence is the search result's own words. The account's display
        // name must BE the person (not the Ajuntament, not a party branch) and
        // the role must appear somewhere — checking only the latter filed the
        // town hall's own @ajribarojadeturia under the mayor, because its bio
        // names him.
        const evidence = [r.title, r.text].filter(Boolean).join(' — ').slice(0, 400)
        if (!accountBelongsToPerson({ title: r.title, snippet: r.text }, o)) continue

        seen.add(key)
        hits += 1
        suggestions.push({
          slug: o.slug,
          platform: cls.platform,
          handle: cls.handle,
          url: cls.url,
          evidence,
          evidenceUrl: r.url,
          addedAt: today,
          confidence: Math.min(0.9, 0.5 + 0.2 * (r.title?.length ? 1 : 0)),
          requiresHumanApproval: true,
          query: q,
        })
      }
    }
    console.log(`  ${o.slug.padEnd(34)} ${hits} candidate(s)`)
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    municipality: MUNICIPALITY,
    method:
      'Role-scoped web search via the repo dispatcher (SearXNG first). Candidates survive only ' +
      'when the result text names the person AND their office. No username enumeration.',
    requiresHumanApproval: true,
    suggestions,
  }
  validateSocialSuggestions(payload)
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `\n[social] ${suggestions.length} candidate(s) → ${OUT}` +
      `\nNothing is published. Promote with: npm run promote-social -- --slug <slug> --platform <p> --curator "<name>"`,
  )
}

main().catch((err) => {
  console.error('[social] failed:', err)
  process.exit(1)
})
