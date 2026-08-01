// @ts-check
/**
 * Single hook loading the press-lab JSON snapshots in parallel (via the
 * session-cached snapshot store) and memoising them for the /laboratorio
 * page. Each snapshot is optional: missing files resolve to empty arrays
 * so the page renders honest empty-states (e.g., first run before the
 * LLM extractor has produced any claim suggestions yet).
 */
import { useEffect, useState } from 'react'
import { loadSnapshotOptional } from '../lib/snapshot-store'

const FILES = [
  '/data/press.json',
  '/data/press-summaries.json',
  '/data/press-claims-verified.json',
  '/data/press-trust.json',
  '/data/press-triangulation.json',
  '/data/press-coverage-gaps.json',
  '/data/press-findings.json',
  '/data/factcheck.json',
  '/data/press-link-rot.json',
]

export function usePressLab() {
  const [state, setState] = useState({
    loading: true,
    press: [],
    summaries: [],
    verified: [],
    trust: null,
    triangulation: null,
    gaps: null,
    findings: [],
    factcheck: null,
    linkRot: new Map(),
    generatedAt: null,
  })

  useEffect(() => {
    let cancelled = false
    Promise.all(FILES.map(loadSnapshotOptional)).then((blobs) => {
      if (cancelled) return
      const [press, summaries, verified, trust, triangulation, gaps, findings, factcheck, linkRot] =
        blobs
      const linkRotMap = new Map()
      for (const row of linkRot?.items ?? []) {
        if (!row?.articleUrl) continue
        linkRotMap.set(row.articleUrl, {
          archivedUrl: row.archivedUrl ?? null,
          archivedAt: row.archivedAt ?? null,
          status: row.status ?? 'error',
        })
      }
      // Lab freshness = the oldest of the two canonical inputs the page
      // editorially leans on (verifier output + curated findings).
      // Worst-case wins so the chip doesn't claim a fresher snapshot
      // than the verifier actually ran.
      // `sourceGeneratedAt` is when the CLAIMS were extracted; `generatedAt` is
      // when we last re-verified them. The verifier re-stamps itself on every
      // run even when the extraction step failed, so taking the oldest of the
      // three is the only one of them that cannot overstate freshness.
      const stamps = [
        verified?.sourceGeneratedAt,
        verified?.generatedAt,
        findings?.generatedAt,
      ].filter(Boolean)
      const generatedAt = stamps.length > 0 ? stamps.sort()[0] : null
      setState({
        loading: false,
        press: press?.items ?? [],
        summaries: summaries?.items ?? [],
        verified: verified?.items ?? [],
        trust: trust ?? null,
        triangulation: triangulation ?? null,
        gaps: gaps ?? null,
        findings: findings?.items ?? [],
        factcheck: factcheck ?? null,
        linkRot: linkRotMap,
        generatedAt,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
