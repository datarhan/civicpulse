// @ts-check
/**
 * Officials ↔ published journalist reports join. An official gets an
 * internal «Biografía» route ONLY when a non-archived assignment about
 * them has a PUBLISHED report (join on assignmentId). Assignment status
 * alone once lied — superseded drafts kept listing until the archived
 * status landed — so the published-reports index stays the truth and the
 * status filter is defence in depth. Newest promotedAt wins per slug.
 */

/**
 * @param {{ items?: Array<{ id: string, status: string, subject?: { slug?: string, kind?: string } }> } | null | undefined} assignments
 * @param {{ items?: Array<{ assignmentId: string, promotedAt?: string }> } | null | undefined} reports
 * @returns {Map<string, string>} officials slug → SPA route of the report
 */
export function bioReportRoutes(assignments, reports) {
  const published = new Map()
  for (const r of reports?.items ?? []) published.set(r.assignmentId, r)
  const best = new Map()
  for (const a of assignments?.items ?? []) {
    if (a.status === 'archived') continue
    const slug = a.subject?.slug
    if (!slug || a.subject?.kind !== 'official') continue
    const report = published.get(a.id)
    if (!report) continue
    const prev = best.get(slug)
    if (!prev || String(report.promotedAt ?? '') > String(prev.promotedAt ?? '')) {
      best.set(slug, { assignmentId: a.id, promotedAt: report.promotedAt })
    }
  }
  const routes = new Map()
  for (const [slug, v] of best) routes.set(slug, `/laboratorio/agentes/${v.assignmentId}`)
  return routes
}
