// @ts-check
import { useMemo } from 'react'
import { useJsonFetch } from './useJsonFetch'

/**
 * Curator-verified social accounts per official.
 *
 * Reads public/data/officials-social.json, which ONLY the promote-social CLI
 * writes. The machine-written suggestions file is deliberately not fetched
 * here: an unverified account on a councillor's card would attribute someone
 * else's posts to a named person. A 404 (registry not yet created) degrades to
 * an empty map, so cards simply show no links.
 */
export function useOfficialsSocial() {
  return useJsonFetch('/data/officials-social.json')
}

/** Display metadata per platform. Order drives render order on the card. */
export const SOCIAL_PLATFORM_META = {
  x: { label: 'X', glyph: '𝕏' },
  instagram: { label: 'Instagram', glyph: '◙' },
  facebook: { label: 'Facebook', glyph: 'f' },
  bluesky: { label: 'Bluesky', glyph: '☁' },
  mastodon: { label: 'Mastodon', glyph: 'ⓜ' },
  youtube: { label: 'YouTube', glyph: '▸' },
  tiktok: { label: 'TikTok', glyph: '♪' },
  linkedin: { label: 'LinkedIn', glyph: 'in' },
}

const ORDER = Object.keys(SOCIAL_PLATFORM_META)

/** Group the flat registry into `slug → account[]`, in stable render order. */
export function indexSocialBySlug(data) {
  const map = new Map()
  for (const a of data?.accounts ?? []) {
    if (!map.has(a.slug)) map.set(a.slug, [])
    map.get(a.slug).push(a)
  }
  for (const list of map.values()) {
    list.sort((x, y) => ORDER.indexOf(x.platform) - ORDER.indexOf(y.platform))
  }
  return map
}

/** Convenience hook for a single official. */
export function useSocialFor(slug) {
  const { data, loading, error } = useOfficialsSocial()
  const accounts = useMemo(() => indexSocialBySlug(data).get(slug) ?? [], [data, slug])
  return { accounts, loading, error }
}
