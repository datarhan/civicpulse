/**
 * `correct-journalist-report`'s `gaps.<field>.reason` branch.
 *
 * Una «Laguna detectada» dice por qué algo no se pudo comprobar, y su motivo es
 * prosa firmada sobre una persona. El 28-10-2026 seis biografías se corrigieron
 * de «804 contratos adjudicados» a «804 expedientes de contratación, adjudicados
 * o no» en su narrativa, y su laguna «Vínculos societarios y personales» seguía
 * diciendo «Las comprobaciones nominales (804 contratos, …)». La CLI no podía
 * tocarla sin rehacer el informe.
 *
 * Se direcciona por el NOMBRE de la fila, que es lo que lee el visitante, y no
 * por un índice que, corrido uno, reescribiría otra laguna. Las filas salen de
 * public/data/journalist-reports.json y el validador que las relee es el de
 * verdad: ninguna forma escrita a mano.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyCorrection } from '../scripts/correct-journalist-report'
import {
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportsSnapshot,
  type ReportSection,
} from '../src/scraper/journalist'

const SNAP_TEXT = readFileSync(resolve(__dirname, '../public/data/journalist-reports.json'), 'utf8')
const snapshot = (): JournalistReportsSnapshot => JSON.parse(SNAP_TEXT)
const informe = (assignmentId: string): JournalistReport => {
  const r = snapshot().items.find((x) => x.assignmentId === assignmentId)
  if (!r) throw new Error(`sin informe publicado ${assignmentId}`)
  return r
}
const lagunas = (sections: ReportSection[]) =>
  (sections.find((s) => s.kind === 'gaps-detected') as Extract<
    ReportSection,
    { kind: 'gaps-detected' }
  >)!.payload.missing
const revalida = (next: JournalistReport) => {
  const s = snapshot()
  s.items = s.items.map((r) => (r.id === next.id ? next : r))
  return validateReportsSnapshot(JSON.stringify(s)).items.find((r) => r.id === next.id)!
}

describe('applyCorrection — gaps.<field>.reason', () => {
  const FILA = 'Vínculos societarios y personales'
  const NUEVO =
    'Motivo de prueba de una laguna: las comprobaciones nominales no dieron coincidencia.'

  it('reescribe el motivo de esa laguna, y nada más, y el validador lo acepta', () => {
    const r = informe('a-eva-lara-bio')
    const antes = lagunas(r.sections)
    const i = antes.findIndex((g) => g.field === FILA)
    expect(i).toBeGreaterThanOrEqual(0)
    const { sections, original } = applyCorrection(r, `gaps.${FILA}.reason`, NUEVO)
    expect(original).toBe(antes[i].reason)
    const despues = lagunas(sections)
    expect(despues[i]).toEqual({ field: FILA, reason: NUEVO })
    expect(despues.filter((_, j) => j !== i)).toEqual(antes.filter((_, j) => j !== i))
    expect(lagunas(revalida({ ...r, sections }).sections)[i].reason).toBe(NUEVO)
  })

  it('no cambia el informe que recibe', () => {
    const r = informe('a-eva-lara-bio')
    const antes = JSON.stringify(r.sections)
    applyCorrection(r, `gaps.${FILA}.reason`, NUEVO)
    expect(JSON.stringify(r.sections)).toBe(antes)
  })

  it('un nombre con puntos dentro se parte por el último', () => {
    // «Juntsumem, S.L. — titularidad y objeto social»: un corte por el primer
    // punto buscaría la laguna «Juntsumem, S».
    const r = informe('a-david-barbancho-bio')
    const fila = lagunas(r.sections).find((g) => g.field.includes('.'))!
    expect(fila).toBeTruthy()
    const { sections } = applyCorrection(r, `gaps.${fila.field}.reason`, NUEVO)
    expect(lagunas(sections).find((g) => g.field === fila.field)!.reason).toBe(NUEVO)
  })

  it('rechaza una laguna que no existe, un motivo vacío y uno que no cambia nada', () => {
    const r = informe('a-eva-lara-bio')
    const actual = lagunas(r.sections).find((g) => g.field === FILA)!.reason
    expect(() => applyCorrection(r, 'gaps.Una laguna que no existe.reason', NUEVO)).toThrow(
      /exactly 1 gap named/,
    )
    expect(() => applyCorrection(r, `gaps.${FILA}.reason`, '  ')).toThrow(/blank/)
    expect(() => applyCorrection(r, `gaps.${FILA}.reason`, actual)).toThrow(/no-op/)
  })

  it('sólo el motivo: el nombre de la laguna no es un campo corregible', () => {
    const r = informe('a-eva-lara-bio')
    expect(() => applyCorrection(r, `gaps.${FILA}.field`, 'Otro nombre')).toThrow(
      /gaps\.<field>\.reason/,
    )
    expect(() => applyCorrection(r, 'gaps.reason', NUEVO)).toThrow(/gaps\.<field>\.reason/)
  })

  it('exige una sola sección de lagunas', () => {
    const r = informe('a-eva-lara-bio')
    const sinLagunas = { ...r, sections: r.sections.filter((s) => s.kind !== 'gaps-detected') }
    expect(() => applyCorrection(sinLagunas, `gaps.${FILA}.reason`, NUEVO)).toThrow(
      /exactly 1 gaps-detected/,
    )
    const gaps = r.sections.find((s) => s.kind === 'gaps-detected')!
    const dos = { ...r, sections: [...r.sections, gaps] }
    expect(() => applyCorrection(dos, `gaps.${FILA}.reason`, NUEVO)).toThrow(
      /exactly 1 gaps-detected/,
    )
  })
})
