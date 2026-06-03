import { readFileSync } from 'node:fs'

/**
 * The /plenos department analysis (TopDepartmentsCard + the agenda "Ver"
 * expanders) is driven by `public/data/plenos-agendas.json`. When the agenda
 * scraper has not populated departments (an upstream/scraper concern, not a
 * frontend bug — the page honestly hides the card rather than fabricate data),
 * the agenda-specific assertions cannot hold. e2e specs read this so they
 * verify the always-present chrome unconditionally and gate the agenda
 * assertions on real data — restoring full coverage automatically once the
 * scraper repopulates the snapshot.
 */
export function agendaHasDepartments(): boolean {
  try {
    const a = JSON.parse(readFileSync('public/data/plenos-agendas.json', 'utf8'))
    return Array.isArray(a?.topDepartments) && a.topDepartments.length > 0
  } catch {
    return false
  }
}
