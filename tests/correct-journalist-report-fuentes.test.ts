/**
 * `correct-journalist-report`: las tres vías del 28-10-2026.
 *
 * La revisión lectora de la auditoría de #478 encontró en las biografías firmadas
 * tres errores que la CLI no podía corregir sin rehacer el informe entero:
 *
 *   · el extracto de una medición nuestra decía «804 contratos adjudicados
 *     examinados» de un corpus de 804 expedientes, adjudicados o no
 *     (`sources.<id>.excerpt`, sólo para `kind: 'local-snapshot'`);
 *   · una frase sobre «los dos grandes contratos del ámbito» se reescribe con
 *     cifras que ninguna cita de su sección llevaba (`--add-source`);
 *   · el MOTIVO de una corrección decía «se publicó en el BOP once días después»,
 *     y el BOP la publicó al vigésimo tercero (`--amend-reason`, la misma función
 *     que `correct-pleno-finding`).
 *
 * Las filas salen de public/data/journalist-reports.json, no de una forma
 * escrita a mano: el validador que las relee es el de verdad.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyAddSource, applyCorrection } from '../scripts/correct-journalist-report'
import { enmendarMotivoDeFila, reasonDigest } from '../src/scraper/pleno-finding'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportsSnapshot,
} from '../src/scraper/journalist'

const SNAP_TEXT = readFileSync(resolve(__dirname, '../public/data/journalist-reports.json'), 'utf8')
const snapshot = (): JournalistReportsSnapshot => JSON.parse(SNAP_TEXT)
const informe = (assignmentId: string): JournalistReport => {
  const r = snapshot().items.find((x) => x.assignmentId === assignmentId)
  if (!r) throw new Error(`sin informe publicado ${assignmentId}`)
  return r
}
/** El snapshot entero con `next` en lugar de su informe, revalidado como lo hace la CLI. */
const revalida = (next: JournalistReport) => {
  const s = snapshot()
  s.items = s.items.map((r) => (r.id === next.id ? next : r))
  return validateReportsSnapshot(JSON.stringify(s)).items.find((r) => r.id === next.id)!
}

describe('sources.<id>.excerpt — sólo una medición nuestra', () => {
  // src-073 de Eva Lara: «public/data/tenders.json · comprobación nominal…».
  const ID = 'src-073'
  const NUEVO =
    '804 expedientes de contratación examinados, adjudicados o no: ningún adjudicatario coincide con «Lara Catalá».'

  it('reescribe el extracto de una fuente local-snapshot y devuelve el anterior', () => {
    const r = informe('a-eva-lara-bio')
    expect(r.sources.find((s) => s.id === ID)?.kind).toBe('local-snapshot')
    const { sources, original } = applyCorrection(r, `sources.${ID}.excerpt`, NUEVO)
    expect(original).toMatch(/^804 contratos adjudicados examinados/)
    expect(sources!.find((s) => s.id === ID)!.excerpt).toBe(NUEVO)
    const releida = revalida({ ...r, sources: sources! })
    expect(releida.sources.find((s) => s.id === ID)!.excerpt).toBe(NUEVO)
  })

  it('no toca un extracto externo: son las palabras del documento', () => {
    const r = informe('a-eva-lara-bio')
    const externa = r.sources.find((s) => s.kind !== 'local-snapshot')!
    expect(externa).toBeTruthy()
    expect(() => applyCorrection(r, `sources.${externa.id}.excerpt`, NUEVO)).toThrow(
      /only a local-snapshot excerpt/,
    )
  })

  it('ni vacío, ni más de 500 caracteres, ni lo mismo, ni una fuente que no existe', () => {
    const r = informe('a-eva-lara-bio')
    const actual = r.sources.find((s) => s.id === ID)!.excerpt!
    expect(() => applyCorrection(r, `sources.${ID}.excerpt`, '  ')).toThrow(/blank/)
    expect(() => applyCorrection(r, `sources.${ID}.excerpt`, 'x'.repeat(501))).toThrow(/≤500/)
    expect(() => applyCorrection(r, `sources.${ID}.excerpt`, actual)).toThrow(/no-op/)
    expect(() => applyCorrection(r, 'sources.src-999.excerpt', NUEVO)).toThrow(/no source/)
    expect(() => applyCorrection(r, `sources.${ID}.title`, NUEVO)).toThrow(/sources.<id>.excerpt/)
  })
})

describe('--add-source — una cita nueva, enlazada a una sección', () => {
  const SECCION = 'Conexiones documentadas y comprobaciones de este medio'
  const PLACSP = {
    kind: 'official-doc',
    title: 'PLACSP · expediente 27/2018 · concesión del abastecimiento de agua potable',
    url: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=pK1YW0Z3femXQV0WE7lYPw%3D%3D',
    publisher: 'Plataforma de Contratación del Sector Público',
    excerpt: 'Valor estimado del contrato 55.685.178,79 Euros',
    trust: 'high',
  }
  const AHORA = '2026-10-28T18:00:00.000Z'

  it('asigna el siguiente src-NNN, sella retrievedAt y la enlaza a la sección', () => {
    const r = informe('a-rafael-gomez-bio-v2')
    const max = Math.max(...r.sources.map((s) => Number(/^src-(\d+)$/.exec(s.id)?.[1] ?? 0)))
    const { sections, sources, id, corrected } = applyAddSource(r, PLACSP, SECCION, AHORA)
    expect(id).toBe(`src-${String(max + 1).padStart(3, '0')}`)
    const nueva = sources.find((s) => s.id === id)!
    expect(nueva.retrievedAt).toBe(AHORA)
    expect(nueva.url).toBe(PLACSP.url)
    const sec = sections.find(
      (s) => s.kind === 'narrative' && (s.payload as { heading: string }).heading === SECCION,
    )!
    expect((sec.payload as { sourceIds: string[] }).sourceIds.at(-1)).toBe(id)
    expect(corrected).toBe(`${PLACSP.title} · ${PLACSP.url}`)
    // Y el validador de verdad la acepta tal cual.
    const releida = revalida({ ...r, sections, sources })
    expect(releida.sources.find((s) => s.id === id)?.excerpt).toBe(PLACSP.excerpt)
  })

  it('sin extracto no hay cita: no sostendría nada', () => {
    const r = informe('a-rafael-gomez-bio-v2')
    expect(() => applyAddSource(r, { ...PLACSP, excerpt: ' ' }, SECCION, AHORA)).toThrow(
      /needs its excerpt/,
    )
  })

  it('una URL que el informe ya cita se enlaza, no se duplica', () => {
    const r = informe('a-rafael-gomez-bio-v2')
    const conUrl = r.sources.find((s) => s.url)!
    expect(() => applyAddSource(r, { ...PLACSP, url: conUrl.url }, SECCION, AHORA)).toThrow(
      /already cites/,
    )
  })

  it('rechaza claves que no son de una cita, tipos inventados y una sección que no existe', () => {
    const r = informe('a-rafael-gomez-bio-v2')
    expect(() =>
      applyAddSource(r, { ...PLACSP, requiresHumanApproval: true }, SECCION, AHORA),
    ).toThrow(/unknown keys/)
    expect(() => applyAddSource(r, { ...PLACSP, kind: 'rumor' }, SECCION, AHORA)).toThrow(/kind/)
    expect(() => applyAddSource(r, PLACSP, 'Una sección que no existe', AHORA)).toThrow(
      /exactly 1 narrative section/,
    )
  })
})

describe('--amend-reason — el motivo de una corrección, enmendado como en /hallazgos', () => {
  // corrections[0] de Esther Gómez: el motivo de «once días».
  const NUEVO =
    'El cambio de delegaciones no consta sólo en el registro municipal: lo dictó la Resolución 2639/2023, once días después del decreto original, y se publicó en el BOP de València el 10-07-2023; atribuirlo al registro ocultaba la fuente oficial que lo sostiene.'
  const ENMIENDA = {
    reason:
      'Once días median entre los dos decretos (17-06 y 28-06-2023); el BOP publicó la modificación el 10-07-2023.',
    editor: 'Sergei Lutchenko',
    amendedAt: '2026-10-28',
  }

  it('sustituye el motivo, deja la huella del anterior y el validador la conserva', () => {
    const r = informe('a-esther-gomez-bio')
    const fila = JSON.parse(JSON.stringify(r.corrections[0]))
    const anterior = fila.reason
    expect(anterior).toMatch(/once días después del decreto original/)
    const previous = enmendarMotivoDeFila(fila, NUEVO, ENMIENDA)
    expect(previous).toBe(reasonDigest(anterior))
    expect(fila.reason).toBe(NUEVO)
    const releida = revalida({ ...r, corrections: [fila, ...r.corrections.slice(1)] })
    expect(releida.corrections[0].reasonAmendments).toEqual([{ previous, ...ENMIENDA }])
    // El motivo anterior no viaja en la fila: sólo su huella.
    expect(JSON.stringify(releida.corrections[0])).not.toContain(anterior)
  })

  it('la firma una persona: la cuenta de rol no basta, tampoco al releer', () => {
    const r = informe('a-esther-gomez-bio')
    const fila = JSON.parse(JSON.stringify(r.corrections[0]))
    expect(() =>
      enmendarMotivoDeFila(fila, NUEVO, { ...ENMIENDA, editor: 'civicpulse-curator' }),
    ).toThrow(/persona/)
    const mala = {
      ...fila,
      reason: NUEVO,
      reasonAmendments: [
        { previous: reasonDigest(fila.reason), ...ENMIENDA, editor: 'civicpulse-curator' },
      ],
    }
    expect(() => revalida({ ...r, corrections: [mala, ...r.corrections.slice(1)] })).toThrow(
      /persona/,
    )
  })
})
