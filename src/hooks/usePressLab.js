// @ts-check
/**
 * Single hook loading all 7 press-lab JSON snapshots in parallel and
 * memoising them for the /laboratorio page. Each snapshot is optional:
 * missing files resolve to empty arrays so the page renders honest
 * empty-states (e.g., first run before the LLM extractor has produced
 * any claim suggestions yet).
 */
import { useEffect, useState } from 'react'

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

async function fetchOptional(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

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
  })

  useEffect(() => {
    let cancelled = false
    Promise.all(FILES.map(fetchOptional)).then((blobs) => {
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
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
