import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCite } from '../../src/scraper/claim-verifier-llm'
import { verifyClaimWithEngine, type EngineExtract } from '../../src/scraper/claim-verifier-engine'
import type { CandidateShortlist } from '../../src/scraper/claim-verifier'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

/**
 * Una cita cuyo campo lleva tilde.
 *
 * El 06-10-2026, con el snippet de contrato nuevo (snippet-de-contrato.ts:
 * «adjudicación: 35.252,87 € con IVA …»), el modelo citó copiando el rótulo:
 * `tender[1].adjudicación=35.252,87 € con IVA`. `parseCite` sólo aceptaba un
 * campo en ASCII, la cita no se leía, y el motor devolvía `sin-datos` («cita sin
 * anclar») sobre un razonamiento que decía que el registro «respalda
 * genuinamente» la declaración, con «fuerza alta». En una pasada `--base` ese
 * `sin-datos` retracta lo que estaba bien. Del campo no se fía nada —lo que se
 * ancla es el valor—, así que no hay por qué rechazarlo por su ortografía.
 *
 * Las respuestas son las del modelo de ese día, tal cual
 * (tests/fixtures/motor-snippet-nuevo_2026-10-06.json).
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/motor-snippet-nuevo_2026-10-06.json'), 'utf8'),
)
type Fila = {
  id: string
  claim: PlenoClaim
  candidatos: CandidateShortlist[]
  razonamiento: string
  extraccion: EngineExtract
}
const fila = (id: string) => (F.filas as Fila[]).find((f) => f.id === id)!

const comoAquelDia = (f: Fila) =>
  verifyClaimWithEngine(
    { claim: f.claim, candidates: f.candidatos },
    { reasonFn: async () => f.razonamiento, extractFn: async () => f.extraccion },
  )

const P = 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl='

describe('parseCite', () => {
  it('lee un campo con tilde o eñe: lo que se ancla es el valor', () => {
    expect(parseCite('tender[1].adjudicación=35.252,87 € con IVA · el importe coincide')).toEqual({
      field: 'adjudicación',
      value: '35.252,87 € con IVA',
    })
    expect(parseCite('tender[0].título=Servicio postal · mismo objeto')).toEqual({
      field: 'título',
      value: 'Servicio postal',
    })
    expect(parseCite('tender[2].año=2024 · la fecha')).toEqual({ field: 'año', value: '2024' })
  })
})

describe('el motor con las respuestas del 06-10-2026', () => {
  it('1077bc: la cita del importe ancla en el registro, y es `verificado`', async () => {
    const r = await comoAquelDia(fila('k4olcs-018-afi-1077bc'))
    expect(r!.verification.verdict).toBe('verificado')
    expect(r!.verification.evidence.map((e) => e.ref)).toEqual([`${P}xkXNO23MYwoZDGvgaZEVxQ%3D%3D`])
  })

  it('ddd6c4: la cita de la adjudicación a Hidraqua ancla en el registro, y es `parcial`', async () => {
    const r = await comoAquelDia(fila('k4olcs-101-cit-ddd6c4'))
    expect(r!.verification.verdict).toBe('parcial')
    expect(r!.verification.evidence.map((e) => e.ref)).toEqual([`${P}pK1YW0Z3femXQV0WE7lYPw%3D%3D`])
  })

  it('b8c30e: una cita del título sigue sin sostener nada (#249)', async () => {
    const r = await comoAquelDia(fila('c8kr44-142-cit-b8c30e'))
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('solo-el-titulo')
  })
})
