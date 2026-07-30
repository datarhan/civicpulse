// @ts-check
import { useMemo } from 'react'
import { useJournalistAssignments } from './useJournalistAssignments'
import { useJournalistReports } from './useJournalistReports'
import { bioReportRoutes } from '../lib/journalist-links'
import { PERIODISTAS_ENABLED } from '../flags'

/**
 * Slug → internal route of the official's published journalist report.
 * Both snapshots ride the session snapshot store, so the two extra
 * fetches are one-time per session (~36 KB combined). Empty when the
 * Periodistas IA flag is off — the /laboratorio/agentes routes don't
 * exist then, so consumers fall back to the external cvUrl instead of
 * rendering a dead internal link.
 *
 * @returns {Map<string, string>}
 */
export function useBioReportRoutes() {
  const assignments = useJournalistAssignments()
  const reports = useJournalistReports()
  return useMemo(
    () => (PERIODISTAS_ENABLED ? bioReportRoutes(assignments.data, reports.data) : new Map()),
    [assignments.data, reports.data],
  )
}
