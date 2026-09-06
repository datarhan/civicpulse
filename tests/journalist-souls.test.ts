import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateAssignmentsSnapshot, validateReportsSnapshot } from '../src/scraper/journalist'
import { exportSoulMarkdown } from '../src/scraper/journalist-soul-export'

/**
 * Cada informe publicado enseña «Descargar soul.md ↓», construido a partir del
 * slug del sujeto (AgenteReporte.jsx). El 06-09-2026 existía UN fichero de 21:
 * veinte enlaces muertos en producción, y ningún test lo veía porque el
 * exportador sólo estaba pinado por determinismo, no por presencia.
 *
 * El contrato: para cada informe publicado existe su soul y es EXACTAMENTE el
 * export del informe vigente — así una v2 promovida sin re-exportar sale roja.
 */
describe('souls de los informes publicados', () => {
  const snap = validateReportsSnapshot(readFileSync('public/data/journalist-reports.json', 'utf8'))
  const assignments = validateAssignmentsSnapshot(
    readFileSync('public/data/journalist-assignments.json', 'utf8'),
  )
  const byId = new Map(assignments.items.map((a) => [a.id, a]))

  it('hay informes publicados', () => {
    expect(snap.items.length).toBeGreaterThan(0)
  })

  for (const report of snap.items) {
    it(`${report.assignmentId}: public/data/souls/<slug>.md existe y es el export vigente`, () => {
      const a = byId.get(report.assignmentId)
      expect(a?.subject.slug, `assignment ${report.assignmentId} without subject slug`).toBeTruthy()
      const slug = a!.subject.slug as string
      const path = resolve('public/data/souls', `${slug}.md`)
      expect(existsSync(path), `missing ${path}`).toBe(true)
      const expected = exportSoulMarkdown(report, {
        subjectName: a!.subject.name,
        subjectSlug: slug,
      })
      expect(readFileSync(path, 'utf8'), `stale soul for ${slug}`).toBe(expected)
    })
  }
})
