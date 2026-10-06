import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  verifyClaimWithEngine,
  type EngineDeps,
  type EngineExtract,
} from '../../src/scraper/claim-verifier-engine'
import { decidirRederivacion } from '../../src/scraper/decision-del-motor'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'
import type { CandidateShortlist } from '../../src/scraper/claim-verifier'

/**
 * El motor sobre las 52 retractaciones que la re-derivación del 04-10-2026 (#233)
 * dejó como «ya no la retractaría», con el razonamiento y la extracción que
 * devolvió el modelo aquel día, sin red (tests/fixtures/motor-sin-respaldo_2026-10-04.json).
 *
 * Dos defectos, los dos medidos en esas filas:
 *
 *   1. En 36, el razonamiento entero concluye que ningún candidato respalda la
 *      declaración, y la extracción devolvió `parcial`: su prompt llama
 *      `parcial` a lo «relacionado temáticamente». El motor publicaba el
 *      veredicto de la extracción.
 *   2. 61 de sus 62 citas son el título del registro seguido de la nota del
 *      propio modelo («relacionado temáticamente, pero no acredita…»). El título
 *      está siempre, literal, en el snippet del candidato, así que el anclaje
 *      pasaba sin esfuerzo: no prueba nada más que el índice.
 *
 * Hoy el motor sólo retracta, y nada de esto se publicó. Pero cualquier vía que
 * un día suba con su veredicto publicaría estos `parcial`, y la re-derivación no
 * podía reescribir la explicación de las 13 filas de charla que siguen
 * retiradas (`atascadas`).
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/motor-sin-respaldo_2026-10-04.json'), 'utf8'),
)
type Fila = {
  n: number
  id: string
  lectura: string
  concluyeSinRespaldo: boolean
  claim: PlenoClaim
  candidatos: CandidateShortlist[]
  razonamiento: string
  extraccion: EngineExtract
}
const FILAS = F.filas as Fila[]
const ATASCADAS = F.atascadas as string[]
const fila = (id: string) => FILAS.find((f) => f.id === id)!

/** La única de las 36 que el detector de conclusiones no reconoce (lo pin la prueba del detector). */
const NO_RECONOCIDA = '1tgd1h4-264-cit-4fee56'

/** El modelo de aquel día, servido desde la fila: razonamiento y extracción tal cual. */
function comoAquelDia(f: Fila, llamadas = { extraer: 0 }): EngineDeps {
  return {
    reasonFn: async () => f.razonamiento,
    extractFn: async () => {
      llamadas.extraer++
      return f.extraccion
    },
  }
}

const juzgar = (f: Fila, llamadas?: { extraer: number }) =>
  verifyClaimWithEngine({ claim: f.claim, candidates: f.candidatos }, comoAquelDia(f, llamadas))

describe('un razonamiento que concluye «sin respaldo»', () => {
  it('no sale nunca `parcial` ni `verificado`, diga lo que diga la extracción', async () => {
    const negativas = FILAS.filter((f) => f.concluyeSinRespaldo && f.id !== NO_RECONOCIDA)
    expect(negativas).toHaveLength(35)
    for (const f of negativas) {
      expect(f.extraccion.verdict, `${f.id}: la fila ya no mide el defecto`).not.toBe('sin-datos')
      const r = await juzgar(f)
      expect(r!.verification.verdict, f.id).toBe('sin-datos')
      expect(r!.sinDatosPorque, f.id).toBe('razonamiento')
      expect(r!.verification.evidence, f.id).toEqual([])
    }
  })

  it('y no llega a la extracción: la extracción no puede deshacer lo que concluyó el modelo', async () => {
    const f = fila('19gax3o-143-cit-a3a7a1')
    const llamadas = { extraer: 0 }
    await juzgar(f, llamadas)
    expect(llamadas.extraer).toBe(0)
  })

  it('la explicación es el razonamiento del modelo, que sí explica la retractación', async () => {
    const f = fila('qz6weg-271-cit-f67afa')
    const r = await juzgar(f)
    expect(r!.verification.summary.length).toBeGreaterThan(0)
    expect(f.razonamiento.replace(/\s+/g, ' ')).toContain(r!.verification.summary.replace(/…$/, ''))
  })
})

describe('una cita que sólo es el título del registro', () => {
  it('no sostiene un respaldo: 1qi8axv-038 era `verificado` sobre el título de un contrato', async () => {
    const f = fila('1qi8axv-038-afi-0222fe')
    expect(f.concluyeSinRespaldo).toBe(false)
    expect(f.extraccion.verdict).toBe('verificado')
    const r = await juzgar(f)
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('solo-el-titulo')
    expect(r!.verification.evidence).toEqual([])
    expect(r!.upgraded).toBe(false)
  })

  it('ninguna de las 52 sale `parcial` ni `verificado`: todas citan títulos', async () => {
    for (const f of FILAS) {
      const r = await juzgar(f)
      expect(r!.verification.verdict, f.id).toBe('sin-datos')
    }
  })

  it('un valor del registro (el importe) sí ancla', async () => {
    const r = await verifyClaimWithEngine(
      {
        claim: FILAS[0].claim,
        candidates: [
          {
            kind: 'tender',
            ref: 't0',
            snippet:
              'Suministro con instalación de juegos infantiles en Parque Asunción · €40.727,1 · awarded',
            similarity: 0.6,
          },
        ],
      },
      {
        reasonFn: async () =>
          'El contrato [0] coincide en el parque y en el importe de 40.727,10 euros.',
        extractFn: async () => ({
          verdict: 'parcial',
          cites: [
            { candidateIndex: 0, snippet: 'tender[0].importe=€40.727,1 · el importe coincide' },
          ],
        }),
      },
    )
    expect(r!.verification.verdict).toBe('parcial')
    expect(r!.verification.evidence.map((e) => e.ref)).toEqual(['t0'])
  })

  it('una nota nuestra en el snippet no es un valor del registro', async () => {
    const r = await verifyClaimWithEngine(
      {
        claim: FILAS[0].claim,
        candidates: [
          {
            kind: 'tender',
            ref: 't0',
            snippet: 'Obras calle Mayor · €482.000 (matches claim) · awarded',
            similarity: 0.6,
          },
        ],
      },
      {
        reasonFn: async () => 'El contrato [0] coincide con la obra.',
        extractFn: async () => ({
          verdict: 'verificado',
          cites: [{ candidateIndex: 0, snippet: 'tender[0].nota=matches claim · coincide' }],
        }),
      },
    )
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('cita-sin-anclar')
  })
})

/**
 * Las 13 de charla «sólo el tema» (INFORME.md §4.d): resumen retirado, y `--ids`
 * no las reescribía mientras la extracción dijera `parcial`.
 */
describe('la re-derivación de las 13 atascadas', () => {
  it('reescribe las 12 cuyo razonamiento concluye «sin respaldo» y aparta la otra para un curador', async () => {
    expect(ATASCADAS).toHaveLength(13)
    const reescritas: string[] = []
    const apartadas: string[] = []
    for (const id of ATASCADAS) {
      const r = await juzgar(fila(id))
      const d = decidirRederivacion({
        juzgada: true,
        veredicto: r!.verification.verdict,
        sinDatosPorque: r!.sinDatosPorque,
      })
      if (d.accion === 'reescribir') reescritas.push(id)
      else if (d.accion === 'apartar') apartadas.push(id)
    }
    expect(reescritas).toHaveLength(12)
    // Su razonamiento concluye «respaldo parcial/débil-moderado»: su `sin-datos`
    // lo pone la regla del título, no el modelo, y escribirlo bajo «Sin datos»
    // diría dos cosas a la vez. Para un curador.
    expect(apartadas).toEqual(['1sqj7is-081-cit-50c5bb'])
  })
})
