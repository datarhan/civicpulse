/**
 * Registry of the social accounts an official uses in their public role.
 *
 * Feeds three things: the links on a cargo card, an announcement feed for the
 * promise tracker, and reference audio for voice-id (all three enrolled
 * voiceprints so far came from Instagram reels).
 *
 * These are real, living, identified people, so the registry inherits the
 * project's standard contract — machine output is a suggestion, a curator
 * publishes, and the published shape may not carry the approval flag.
 *
 * The hazard specific to this dataset is username enumeration. Tools of the
 * Sherlock family take a handle and report every platform where it exists,
 * which assembles a personal-life dossier rather than a record of how somebody
 * communicates as an elected official — and matches handles, not people, so a
 * stranger's account can land on a councillor's card. Two rules keep that out:
 *
 *   1. an allowlist of platforms with civic relevance, and
 *   2. evidence tying the account to the ROLE, never to a bare name match.
 */

export type SocialPlatformId =
  | 'instagram'
  | 'x'
  | 'facebook'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
  | 'bluesky'
  | 'mastodon'

interface PlatformSpec {
  id: SocialPlatformId
  label: string
  /** Hosts that map to this platform. */
  hosts: string[]
  /** Path of a PROFILE root; posts/reels/status pages must not match. */
  profile: RegExp
  /** Canonical host used when rebuilding the URL. */
  canonicalHost: string
  example: string
}

/**
 * Civic allowlist. Adding a platform here is an editorial decision, not a
 * technical one: it says "an elected official plausibly uses this in their
 * public role". Dating, fitness, gaming, shopping and adult platforms are
 * deliberately absent and should stay that way.
 */
export const SOCIAL_PLATFORMS: PlatformSpec[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    profile: /^\/([A-Za-z0-9._]{1,30})\/?$/,
    canonicalHost: 'www.instagram.com',
    example: 'https://www.instagram.com/robertalcalde/',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    profile: /^\/([A-Za-z0-9_]{1,15})\/?$/,
    canonicalHost: 'x.com',
    example: 'https://x.com/ayto_riba_roja',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
    profile: /^\/([A-Za-z0-9.\-_]{2,60})\/?$/,
    canonicalHost: 'www.facebook.com',
    example: 'https://www.facebook.com/ambrobert/',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    hosts: ['linkedin.com', 'www.linkedin.com', 'es.linkedin.com'],
    profile: /^\/in\/([A-Za-z0-9\-_%]{2,100})\/?$/,
    canonicalHost: 'www.linkedin.com',
    example: 'https://www.linkedin.com/in/someone-1234/',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
    profile: /^\/(?:@([A-Za-z0-9._-]{3,30})|(?:c|user|channel)\/([A-Za-z0-9._-]{2,60}))\/?$/,
    canonicalHost: 'www.youtube.com',
    example: 'https://www.youtube.com/@ribaroja',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hosts: ['tiktok.com', 'www.tiktok.com'],
    profile: /^\/@([A-Za-z0-9._]{2,30})\/?$/,
    canonicalHost: 'www.tiktok.com',
    example: 'https://www.tiktok.com/@ribaroja',
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    hosts: ['bsky.app'],
    profile: /^\/profile\/([A-Za-z0-9.\-_]{2,60})\/?$/,
    canonicalHost: 'bsky.app',
    example: 'https://bsky.app/profile/ribaroja.bsky.social',
  },
  {
    id: 'mastodon',
    label: 'Mastodon',
    hosts: ['mastodon.social', 'mstdn.social', 'mas.to'],
    profile: /^\/@([A-Za-z0-9._]{2,30})\/?$/,
    canonicalHost: 'mastodon.social',
    example: 'https://mastodon.social/@ribaroja',
  },
]

const PLATFORM_IDS = new Set(SOCIAL_PLATFORMS.map((p) => p.id))

export interface SocialAccount {
  slug: string
  platform: SocialPlatformId
  handle: string
  url: string
  /** Verbatim text tying this account to the official's public role. */
  evidence: string
  /** Where that evidence was read. */
  evidenceUrl: string
  addedAt: string
  curator?: string
  note?: string
}

export interface SocialSuggestion extends SocialAccount {
  confidence: number
  requiresHumanApproval: true
  /** The query that surfaced this candidate, for auditability. */
  query?: string
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Map a URL to an allowlisted platform + handle, or null.
 *
 * Only PROFILE roots resolve. A reel, post or status URL identifies a piece of
 * content, not an account — the three Instagram reels behind our voiceprints
 * are exactly that shape, and treating them as accounts would put a permalink
 * where a profile belongs.
 */
export function classifySocialUrl(
  raw: string,
): { platform: SocialPlatformId; handle: string; url: string } | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  const spec = SOCIAL_PLATFORMS.find((p) => p.hosts.includes(host))
  if (!spec) return null

  const path = u.pathname.replace(/\/{2,}/g, '/')
  const m = spec.profile.exec(path)
  if (!m) return null
  const handle = (m[1] ?? m[2] ?? '').trim()
  if (!handle) return null

  // Reserved paths that look like handles but are site furniture.
  if (['p', 'reel', 'reels', 'explore', 'about', 'home', 'watch', 'share'].includes(fold(handle)))
    return null

  const canonicalPath =
    spec.id === 'linkedin'
      ? `/in/${handle}`
      : spec.id === 'bluesky'
        ? `/profile/${handle}`
        : spec.id === 'tiktok' || spec.id === 'mastodon' || spec.id === 'youtube'
          ? `/@${handle}`
          : `/${handle}`
  return { platform: spec.id, handle, url: `https://${spec.canonicalHost}${canonicalPath}` }
}

const ROLE_MARKERS = [
  'alcalde',
  'alcaldesa',
  'alcaldia',
  'concejal',
  'concejala',
  'regidor',
  'regidora',
  'ayuntamiento',
  'ajuntament',
  'portavoz',
  'portaveu',
  'edil',
  'corporacion municipal',
  'riba-roja',
  'ribarroja',
  'riba roja',
]

/**
 * Does `text` tie this account to the official's public role?
 *
 * Requires BOTH a distinctive part of the person's name AND a role/place
 * marker. A bare name match is how a stranger's account ends up on a
 * councillor's card, and a bare role marker matches every account in town.
 * A surname alone is not enough — surnames repeat across a corporation.
 */
export function isRoleEvidence(text: string, official: { name: string }): boolean {
  const t = fold(text)
  if (!t) return false
  const parts = fold(official.name).split(/\s+/).filter(Boolean)
  if (parts.length === 0) return false
  const given = parts[0]
  const surnames = parts.slice(1)

  // Given name must be present, plus at least one surname — that pairing is
  // what distinguishes the person from a namesake.
  const hasGiven = new RegExp(`(^|[^\\p{L}])${given}([^\\p{L}]|$)`, 'u').test(t)
  const hasSurname = surnames.some((s) => new RegExp(`(^|[^\\p{L}])${s}([^\\p{L}]|$)`, 'u').test(t))
  if (!hasGiven || !hasSurname) return false

  return ROLE_MARKERS.some((m) => t.includes(m))
}

/**
 * Names that mark an account as belonging to an ORGANISATION rather than a
 * person — town hall, party branch, group. These accounts are civically useful
 * but they are not the councillor's, and filing one under a person would
 * attribute every institutional post to them.
 */
const ORG_MARKERS = [
  'ajuntament',
  'ayuntamiento',
  'ayto',
  'consell',
  'conselleria',
  'generalitat',
  'psoe',
  'pspv',
  'partido',
  'partit',
  'compromis',
  'podem',
  'esquerra',
  'grup municipal',
  'grupo municipal',
  'agrupacio',
  'agrupacion',
  'oficial de',
  'diputacio',
  'diputacion',
]

/**
 * Does this search result describe an account belonging to THIS person?
 *
 * Two independent things must hold, and the split matters:
 *
 *   1. the profile's OWN display name (carried in the result title, before the
 *      handle) is the person, and it is not an organisation, and
 *   2. the role appears somewhere in the result — title or bio snippet.
 *
 * Checking only (2) let the town hall's own @ajribarojadeturia through, because
 * its bio names the mayor. Checking only (1) would accept any namesake.
 */
export function accountBelongsToPerson(
  result: { title?: string; snippet?: string },
  official: { name: string },
): boolean {
  const title = fold(result.title ?? '')
  if (!title) return false
  // The display name is whatever precedes the handle / site suffix.
  const display = title.split(/[(|·•@]/)[0]
  if (ORG_MARKERS.some((m) => display.includes(m))) return false

  const parts = fold(official.name).split(/\s+/).filter(Boolean)
  const given = parts[0]
  const surnames = parts.slice(1)
  const inDisplay = (w: string) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u').test(display)
  if (!given || !inDisplay(given)) return false
  if (!surnames.some(inDisplay)) return false

  return isRoleEvidence(`${result.title ?? ''} ${result.snippet ?? ''}`, official)
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[officials-social] ${msg}`)
}

function checkAccount(a: any, i: number, where: string) {
  must(a && typeof a === 'object', `${where}[${i}] is not an object`)
  must(typeof a.slug === 'string' && a.slug.length > 0, `${where}[${i}] missing slug`)
  must(PLATFORM_IDS.has(a.platform), `${where}[${i}] platform "${a.platform}" is not allowlisted`)
  must(typeof a.handle === 'string' && a.handle.length > 0, `${where}[${i}] missing handle`)
  must(
    typeof a.url === 'string' && classifySocialUrl(a.url) !== null,
    `${where}[${i}] url is not an allowlisted profile URL`,
  )
  must(
    typeof a.evidence === 'string' && a.evidence.trim().length >= 8,
    `${where}[${i}] missing evidence tying the account to the role`,
  )
  must(
    typeof a.evidenceUrl === 'string' && /^https?:\/\//.test(a.evidenceUrl),
    `${where}[${i}] missing evidenceUrl`,
  )
  must(/^\d{4}-\d{2}-\d{2}/.test(String(a.addedAt)), `${where}[${i}] missing ISO addedAt`)
}

/** Published registry. Curator-owned; the approval flag must be gone. */
export function validateSocialSnapshot(snap: any): void {
  must(snap && typeof snap === 'object', 'snapshot is not an object')
  must(Array.isArray(snap.accounts), 'snapshot.accounts must be an array')
  const seen = new Set<string>()
  snap.accounts.forEach((a: any, i: number) => {
    checkAccount(a, i, 'accounts')
    must(
      !('requiresHumanApproval' in a),
      `accounts[${i}] still carries requiresHumanApproval — promote strips it`,
    )
    const key = `${a.slug}::${a.platform}`
    must(!seen.has(key), `accounts[${i}] duplicate entry for ${key}`)
    seen.add(key)
  })
}

/** Machine-written candidates. Never rendered; every row must be flagged. */
export function validateSocialSuggestions(snap: any): void {
  must(snap && typeof snap === 'object', 'suggestions snapshot is not an object')
  must(Array.isArray(snap.suggestions), 'snapshot.suggestions must be an array')
  snap.suggestions.forEach((s: any, i: number) => {
    checkAccount(s, i, 'suggestions')
    must(
      s.requiresHumanApproval === true,
      `suggestions[${i}] must carry requiresHumanApproval: true`,
    )
    must(
      typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1,
      `suggestions[${i}] confidence must be 0..1`,
    )
  })
}
