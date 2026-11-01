import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateAssignmentsSnapshot,
  validateReportsSnapshot,
  type JournalistReport,
} from '../src/scraper/journalist'
import { exportSoulMarkdown } from '../src/scraper/journalist-soul-export'
import { CATALOGUE } from '../src/i18n'

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

/**
 * La fila de la bitácora conserva la firma y la fecha de la corrección, así que
 * un motivo enmendado impreso con el rótulo de siempre atribuye a quien corrigió
 * una explicación que escribió otra persona después. Hasta el 01-11-2026 el
 * exportador tiraba `reasonAmendments`: las 21 filas enmendadas salían en los
 * souls como si nadie las hubiera tocado, y la página sí lo decía.
 */
describe('un motivo enmendado en el soul', () => {
  const snap = validateReportsSnapshot(readFileSync('public/data/journalist-reports.json', 'utf8'))
  const informe = (assignmentId: string) => {
    const report = snap.items.find((r) => r.assignmentId === assignmentId)
    if (!report) throw new Error(`sin informe publicado: ${assignmentId}`)
    return report
  }
  const soulDe = (report: JournalistReport) => exportSoulMarkdown(report, { subjectName: 'Sujeto' })

  /** Las entradas de la bitácora del soul, una por fila y en su orden. */
  const entradasDe = (soul: string) =>
    (soul.split('## Bitácora de correcciones\n')[1] ?? '')
      .split('\n## ')[0]
      .split(/^(?=- \*\*\d{4}-\d{2}-\d{2})/m)
      .filter((e) => e.trim().length > 0)

  it('Ramos, warnings[1]: dice cuándo, quién, por qué y la huella del motivo sustituido', () => {
    const report = informe('a-jose-luis-ramos-bio')
    const [entrada] = entradasDe(soulDe(report))
    expect(entrada).toContain('`warnings[1]`')
    expect(entrada).toMatch(/^ {2}- motivo \(enmendado el \d{4}-\d{2}-\d{2}\): /m)
    expect(entrada).not.toMatch(/^ {2}- motivo: /m)
    expect(entrada).toContain(
      'motivo enmendado: 2026-10-28 · Sergei Lutchenko. Los once días median entre los dos decretos',
    )
    expect(entrada).toContain('sha256:2f8c46609e48')
  })

  it.each([
    [
      4,
      'narrative.Conexiones documentadas y comprobaciones de este medio.bodyMarkdown',
      'e2489898129d',
    ],
    [5, 'sources.src-075.excerpt', 'e2489898129d'],
    [6, 'gaps.Vínculos societarios y personales.reason', 'db57e3b10ee2'],
  ])('Hernández, corrección %i: la huella es la de su fila', (i, campo, huella) => {
    const entrada = entradasDe(soulDe(informe('a-jose-angel-hernandez-bio')))[i]
    expect(entrada).toContain(`\`${campo}\``)
    expect(entrada).toMatch(/motivo enmendado: 2026-10-30 · Sergei Lutchenko\. /)
    expect(entrada).toContain(`sha256:${huella}`)
  })

  it('la frase de la huella es la que publica la página', () => {
    const [entrada] = entradasDe(soulDe(informe('a-jose-luis-ramos-bio')))
    expect(entrada).toContain(CATALOGUE.es['bitacora.enmienda.anterior'])
  })

  it('una fila que nadie enmendó sigue rotulada «motivo:» y no menciona enmienda alguna', () => {
    const report = informe('a-jose-angel-hernandez-bio')
    expect(report.corrections[0].reasonAmendments).toBeUndefined()
    const entrada = entradasDe(soulDe(report))[0]
    expect(entrada).toMatch(/^ {2}- motivo: /m)
    expect(entrada).not.toMatch(/motivo \(enmendado|motivo enmendado:/)
  })

  it('con dos enmiendas, el rótulo lleva la fecha de la última y salen las dos en orden', () => {
    const report = structuredClone(informe('a-jose-luis-ramos-bio'))
    report.corrections[0].reasonAmendments?.push({
      previous: 'motivo · sha256:aaaaaaaaaaaa',
      reason: 'Segunda enmienda de esta prueba, con más de veinte caracteres.',
      editor: 'Otra Persona',
      amendedAt: '2026-11-15',
    })
    const [entrada] = entradasDe(soulDe(report))
    expect(entrada).toContain('motivo (enmendado el 2026-11-15): ')
    const primera = entrada.indexOf('motivo enmendado: 2026-10-28 · Sergei Lutchenko.')
    const segunda = entrada.indexOf('motivo enmendado: 2026-11-15 · Otra Persona. Segunda enmienda')
    expect(primera).toBeGreaterThan(-1)
    expect(segunda).toBeGreaterThan(primera)
  })

  it('ninguna fila enmendada de un informe publicado se queda sin decirlo', () => {
    let filas = 0
    for (const report of snap.items) {
      const soul = soulDe(report)
      const entradas = entradasDe(soul)
      expect(entradas, `${report.assignmentId}: entradas de la bitácora`).toHaveLength(
        report.corrections.length,
      )
      expect(soul, `${report.assignmentId}: la huella va sin su etiqueta`).not.toContain(
        'motivo · sha256',
      )
      report.corrections.forEach((c, i) => {
        if (!c.reasonAmendments?.length) return
        filas += 1
        const donde = `${report.assignmentId} · corrección ${i}`
        expect(entradas[i], donde).toMatch(/^ {2}- motivo \(enmendado el /m)
        expect(entradas[i], donde).not.toMatch(/^ {2}- motivo: /m)
        for (const a of c.reasonAmendments) {
          expect(entradas[i], donde).toContain(a.previous.replace('motivo · ', ''))
          expect(entradas[i], donde).toContain(a.reason)
        }
      })
    }
    expect(filas).toBeGreaterThan(0)
  })
})
