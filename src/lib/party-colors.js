// @ts-check
/**
 * Canonical party brand palette. Dependency-free (no React, no fetch) so
 * hooks, pages, and components can all import it — same contract as
 * formatters.js.
 *
 * Tuned so white text at ≥9px bold meets WCAG AA (≥4.5:1): the original
 * brand values fail contrast; these are the darkened AA-safe variants used
 * in Spanish political press for print.
 *
 * `Otro` is deliberately the neutral slate — an explicitly-"other" party
 * renders the same as an unknown one. (Until June 2026 the repo carried two
 * divergent copies: useOfficials painted Otro purple #6D3FE5 while
 * usePromises used slate #64748B. Slate won: purple read as a real party
 * brand.) NOTE: src/scraper/journalist-agent/shared.ts also exports a
 * PARTY_TONE — that one maps to design-token tone NAMES (civic/warn/…),
 * a different domain; do not merge it here.
 */
export const PARTY_COLORS = {
  PSOE: '#D01832',
  PP: '#2463EB',
  VOX: '#3A8018',
  Compromís: '#A06116',
  Ciudadanos: '#B05A10',
  'EU-Podem': '#8C1A2B',
  Otro: '#64748B',
}

/**
 * @param {string|null|undefined} party
 * @returns {string} hex color — neutral slate for unknown parties
 */
export function partyColor(party) {
  return PARTY_COLORS[party] || '#64748B'
}
