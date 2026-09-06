import { describe, it, expect } from 'vitest'
import {
  archiveTargets,
  applyArchiveUrls,
  archiveReportSources,
} from '../scripts/journalist-archive-sources'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type SourceCitation,
} from '../src/scraper/journalist'

/**
 * /laboratorio/agentes prometía «las fuentes citadas se archivan en Wayback»
 * y ninguna de las 380 fuentes publicadas llevaba archiveUrl: el fetch del
 * agente sólo consulta si existe una copia, nunca la guarda. Este CLI hace
 * verdad la promesa informe a informe y demuestra lo que hizo: cada fuente
 * termina en existente / archivada / fallida, y las llamadas a Save Page Now
 * van espaciadas porque el Wayback anónimo admite unas seis por minuto.
 */
const src = (over: Partial<SourceCitation> & { id: string }): SourceCitation => ({
  kind: 'web',
  title: `Fuente ${over.id}`,
  retrievedAt: '2026-07-31T10:00:00.000Z',
  trust: 'medium',
  url: `https://example.org/${over.id}`,
  ...over,
})

function report(sources: SourceCitation[]): JournalistReport {
  return {
    id: 'r-sample-2026-07-31',
    assignmentId: 'a-sample-bio',
    generatedAt: '2026-07-31T09:00:00.000Z',
    agentVersion: 'journalist-v1',
    promptVersion: 'journalist-draft-v1',
    budgetTokens: 0,
    costUSD: 0,
    sections: [
      {
        kind: 'narrative',
        payload: {
          heading: 'Trayectoria política',
          bodyMarkdown:
            'El sujeto preside el pleno municipal desde 2023. Su grupo ostenta once escaños en la corporación actual.',
          sourceIds: sources.map((s) => s.id),
        },
      },
    ],
    sources,
    warnings: [],
    legalSensitivity: 'low',
    promotedBy: 'curator-0',
    promotedAt: '2026-07-31T10:00:00.000Z',
    corrections: [],
    response: null,
  }
}

const SOURCES: SourceCitation[] = [
  src({ id: 'src-web' }),
  src({ id: 'src-doc', kind: 'official-doc', trust: 'high', url: 'https://bop.dival.es/x.pdf' }),
  src({
    id: 'src-boe',
    kind: 'boe',
    trust: 'high',
    url: 'https://www.boe.es/y',
    archiveUrl: 'https://web.archive.org/web/20260101000000/https://www.boe.es/y',
  }),
  src({
    id: 'src-local',
    kind: 'local-snapshot',
    trust: 'high',
    url: undefined,
    localPath: 'public/data/officials.json',
  }),
]

describe('archiveTargets', () => {
  it('sólo las fuentes con URL de web/official-doc/boe que aún no tienen copia', () => {
    expect(archiveTargets(report(SOURCES)).map((s) => s.id)).toEqual(['src-web', 'src-doc'])
  })
})

describe('applyArchiveUrls', () => {
  it('pone archiveUrl sólo en los ids dados, ignora los desconocidos y no toca la entrada', () => {
    const r = report(SOURCES)
    const before = JSON.parse(JSON.stringify(r))
    const out = applyArchiveUrls(r, [
      {
        id: 'src-web',
        archiveUrl: 'https://web.archive.org/web/20260906000000/https://example.org/src-web',
      },
      { id: 'src-nope', archiveUrl: 'https://web.archive.org/web/1/x' },
    ])
    expect(out.sources.find((s) => s.id === 'src-web')?.archiveUrl).toMatch(/web\.archive\.org/)
    expect(out.sources.find((s) => s.id === 'src-doc')?.archiveUrl).toBeUndefined()
    expect(out.sources.find((s) => s.id === 'src-boe')?.archiveUrl).toBe(SOURCES[2].archiveUrl)
    expect(r).toEqual(before)
    // sigue siendo un informe publicable
    const snap = {
      version: '1.0',
      generatedAt: '2026-09-06T00:00:00.000Z',
      legalNotice:
        'Informes periodísticos elaborados por un agente automático y revisados por curación humana antes de su publicación.',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
      methodologyUrl: '/metodologia',
      items: [out],
    }
    expect(() => validateReportsSnapshot(JSON.stringify(snap))).not.toThrow()
  })
})

describe('archiveReportSources', () => {
  const saved = (url: string) => ({
    archiveUrl: `https://web.archive.org/web/20260906000000/${url}`,
    via: 'saved' as const,
  })
  const existing = (url: string) => ({
    archiveUrl: `https://web.archive.org/web/20250101000000/${url}`,
    via: 'existing' as const,
  })

  it('duerme entre dos guardados pero no tras una copia ya existente', async () => {
    const log: string[] = []
    const r = await archiveReportSources(report(SOURCES), {
      archiveOne: async (url) => {
        log.push(`archive ${url}`)
        return url.includes('src-web') ? existing(url) : saved(url)
      },
      sleep: async (ms) => {
        log.push(`sleep ${ms}`)
      },
      minGapMs: 10_000,
    })
    expect(log).toEqual([
      'archive https://example.org/src-web',
      'archive https://bop.dival.es/x.pdf',
    ])
    expect(r.outcomes.map((o) => o.status)).toEqual(['existing', 'archived'])
    expect(r.report.sources.find((s) => s.id === 'src-doc')?.archiveUrl).toMatch(/20260906/)
  })

  it('espaciado: dos guardados seguidos llevan un sleep entre medias', async () => {
    const log: string[] = []
    await archiveReportSources(report(SOURCES), {
      archiveOne: async (url) => {
        log.push(`archive ${url}`)
        return saved(url)
      },
      sleep: async (ms) => {
        log.push(`sleep ${ms}`)
      },
      minGapMs: 10_000,
    })
    expect(log).toEqual([
      'archive https://example.org/src-web',
      'sleep 10000',
      'archive https://bop.dival.es/x.pdf',
    ])
  })

  it('un fallo se anota y no detiene a los demás', async () => {
    const r = await archiveReportSources(report(SOURCES), {
      archiveOne: async (url) => (url.includes('src-web') ? { error: 'HTTP 429' } : saved(url)),
      sleep: async () => {},
      minGapMs: 0,
    })
    expect(r.outcomes).toEqual([
      { id: 'src-web', url: 'https://example.org/src-web', status: 'failed', detail: 'HTTP 429' },
      {
        id: 'src-doc',
        url: 'https://bop.dival.es/x.pdf',
        status: 'archived',
        detail: 'https://web.archive.org/web/20260906000000/https://bop.dival.es/x.pdf',
      },
    ])
    expect(r.report.sources.find((s) => s.id === 'src-web')?.archiveUrl).toBeUndefined()
  })

  it('respeta --max y no muta el informe de entrada', async () => {
    const input = report(SOURCES)
    const before = JSON.parse(JSON.stringify(input))
    const r = await archiveReportSources(input, {
      archiveOne: async (url) => saved(url),
      sleep: async () => {},
      minGapMs: 0,
      max: 1,
    })
    expect(r.outcomes).toHaveLength(1)
    expect(input).toEqual(before)
  })
})
