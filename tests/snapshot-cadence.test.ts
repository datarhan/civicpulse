import { describe, it, expect } from 'vitest'
import {
  classifyFreshness,
  DEFAULT_EXPECTATIONS,
  type DatasetExpectation,
} from '../src/scraper/snapshot-cadence'

const EXP: DatasetExpectation[] = [
  { file: 'tenders.json', cls: 'nightly', maxAgeDays: 3 },
  { file: 'obras.json', cls: 'ci-blocked', maxAgeDays: 8 },
  { file: 'participa.json', cls: 'derived', maxAgeDays: 45 },
  { file: 'promises.json', cls: 'curated', maxAgeDays: 120 },
  { file: 'pmp.json', cls: 'manual', maxAgeDays: 130, hint: 'npm run scrape:pmp' },
]

describe('data-freshness', () => {
  it('flags a nightly dataset that stopped moving', () => {
    const [r] = classifyFreshness([{ file: 'tenders.json', ageDays: 9 }], EXP)
    expect(r.status).toBe('stale')
  })

  it('gives the CI-blocked adapters a longer leash but still flags them', () => {
    // These six cannot be fetched from GitHub runners, so they only refresh
    // when someone runs scrape-ci-blocked.sh. That is exactly the decay path
    // this check exists to surface.
    expect(classifyFreshness([{ file: 'obras.json', ageDays: 5 }], EXP)[0].status).toBe('ok')
    const late = classifyFreshness([{ file: 'obras.json', ageDays: 30 }], EXP)[0]
    expect(late.status).toBe('stale')
    expect(late.note).toMatch(/scrape-ci-blocked/)
  })

  it('does NOT call a retired upstream stale', () => {
    // participa.ribarroja.es was decommissioned in May. Reporting it as stale
    // every night would train everyone to ignore this check.
    const [r] = classifyFreshness(
      [{ file: 'participa.json', ageDays: 400, upstreamStatus: 'retired' }],
      EXP,
    )
    expect(r.status).toBe('retired')
  })

  it('tolerates a curated file being old', () => {
    // "No new pleno votes this month" is a real answer, not a failure.
    expect(classifyFreshness([{ file: 'promises.json', ageDays: 60 }], EXP)[0].status).toBe('ok')
  })

  it('reports a missing generatedAt as unknown rather than fresh', () => {
    expect(classifyFreshness([{ file: 'tenders.json', ageDays: null }], EXP)[0].status).toBe(
      'unknown',
    )
  })

  it('ignores files it has no expectation for', () => {
    expect(classifyFreshness([{ file: 'not-tracked.json', ageDays: 999 }], EXP)).toEqual([])
  })

  it('la clase manual avisa pasado su presupuesto Y nombra el comando', () => {
    // La inyección del plan: un pmp.json de 200 días. Es trimestral y alimenta
    // una ficha firmada; que nadie lo refresque tiene que salir en el digest
    // con el remedio delante, no como un «stale» genérico que nadie sabe
    // atender.
    expect(classifyFreshness([{ file: 'pmp.json', ageDays: 100 }], EXP)[0].status).toBe('ok')
    const tarde = classifyFreshness([{ file: 'pmp.json', ageDays: 200 }], EXP)[0]
    expect(tarde.status).toBe('stale')
    expect(tarde.note).toMatch(/manual/)
    expect(tarde.note).toMatch(/npm run scrape:pmp/)
  })

  it('las expectativas reales cubren las fuentes manuales de eficiencia', () => {
    // La regresión que motivó la clase: pmp y coste-efectivo estaban
    // «DELIBERADAMENTE FUERA» y su ausencia era invisible. Si alguien los
    // vuelve a sacar de la tabla, esto lo dice.
    const manuales = DEFAULT_EXPECTATIONS.filter((e) => e.cls === 'manual').map((e) => e.file)
    expect(manuales).toContain('pmp.json')
    expect(manuales).toContain('coste-efectivo.json')
    expect(manuales).toContain('ipc.json')
    for (const e of DEFAULT_EXPECTATIONS.filter((x) => x.cls === 'manual')) {
      expect(e.hint, `${e.file} sin hint`).toBeTruthy()
    }
  })
})
