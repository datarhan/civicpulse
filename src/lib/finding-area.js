// @ts-check
/**
 * Which concejalía does an editorial finding belong to?
 *
 * Findings carry no department field. The link runs
 *   finding.sourceClaimIds → claim.topic → DEPT_TO_CLAIM_TOPICS → department
 * reusing the mapping `/departamentos` already relies on, deliberately: an
 * área filter invented separately would be a second, unaudited notion of
 * which area a finding belongs to, and the two would drift.
 *
 * An unmapped topic (e.g. "other") resolves to nothing rather than a guess —
 * findings name political groups, so a wrong área would put a finding under a
 * councillor who had nothing to do with it.
 */
import { topicToDeptSlugs } from './department-claim-topics'

/** Departments a finding touches, via the topics of the claims it cites. */
export function findingDeptSlugs(finding, claims) {
  const byId = new Map()
  for (const row of claims?.items ?? []) {
    const c = row.claim ?? row
    if (c?.id) byId.set(c.id, c)
  }
  const out = new Set()
  for (const id of finding?.sourceClaimIds ?? []) {
    const topic = byId.get(id)?.topic
    if (!topic) continue
    for (const slug of topicToDeptSlugs(topic)) out.add(slug)
  }
  return [...out]
}

/** Does this finding pass the área filter? No filter → everything passes. */
export function findingMatchesArea(finding, areaSlug, claims) {
  if (!areaSlug) return true
  return findingDeptSlugs(finding, claims).includes(areaSlug)
}
