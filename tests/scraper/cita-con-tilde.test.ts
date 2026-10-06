import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCite } from '../../src/scraper/claim-verifier-llm'
import { verifyClaimWithEngine, type EngineExtract } from '../../src/scraper/claim-verifier-engine'
import type { CandidateShortlist } from '../../src/scraper/claim-verifier'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'
import { snippetDeContrato } from '../../src/scraper/snippet-de-contrato'

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

/**
 * La otra tilde que ya había mordido: brxx5g-134-cit-0c354a, 02-08-2026, cita
 * dos veces un campo «título». Ahora se lee, y como lo citado es el título del
 * registro, la regla de #249 no lo deja sostener un respaldo: queda apartada
 * para un curador, no `parcial`. Antes no se leía y salía «cita sin anclar», que
 * en una pasada `--base` retracta en vez de apartar.
 */
describe('brxx5g-134: un «título» con tilde se lee, y por ser el título no sostiene nada', () => {
  const B = JSON.parse(
    readFileSync(resolve('tests/fixtures/cita-titulo-brxx5g-134_2026-08-02.json'), 'utf8'),
  )
  // Sólo lo que el motor lee de una declaración: id y tipo.
  const claim = { id: B.id, type: 'cita_obra' } as unknown as PlenoClaim
  const relleno = (i: number) => ({
    kind: 'tender' as const,
    ref: `relleno-${i}`,
    snippet: 'awarded · objeto: Servicio postal',
    similarity: 0.4,
  })
  const conSnippets = (snippet: (fila: Record<string, unknown>) => string) =>
    [0, 1, 2, 3, 4, 5, 6].map((i) =>
      B.contratos[String(i)]
        ? {
            kind: 'tender' as const,
            ref: String(B.contratos[String(i)].permalink),
            snippet: snippet(B.contratos[String(i)]),
            similarity: 0.5,
          }
        : relleno(i),
    )
  const juzgar = (candidates: CandidateShortlist[]) =>
    verifyClaimWithEngine(
      { claim, candidates },
      {
        reasonFn: async () => B.razonamiento,
        extractFn: async () => B.extraccion as EngineExtract,
      },
    )

  it('las dos citas se leen', () => {
    for (const c of B.extraccion.cites)
      expect(parseCite(c.snippet)?.field, c.snippet).toBe('título')
  })

  it('con el snippet de hoy, la extracción `parcial` se queda en `sin-datos` por el título', async () => {
    const r = await juzgar(conSnippets(snippetDeContrato))
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('solo-el-titulo')
    expect(r!.verification.evidence).toEqual([])
  })

  it('y con el de aquel día —el título cortado a 230 caracteres—, igual', async () => {
    const r = await juzgar(conSnippets((f) => String(f.title).slice(0, 230)))
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('solo-el-titulo')
  })
})

/**
 * Que el campo se lea no sube nada por sí solo. Lo que decide sigue siendo el
 * VALOR: tiene que estar, literal, en un dato del registro que no sea su título.
 * Y el motor sigue sin emitir `contradicho`. (Que el overlay no admita del motor
 * más que `sin-datos` lo fija tests/trinquete.test.ts.)
 */
describe('un campo con tilde no sube nada por sí solo', () => {
  const f = fila('k4olcs-018-afi-1077bc')
  const conCita = (verdict: string, snippet: string) =>
    verifyClaimWithEngine(
      { claim: f.claim, candidates: f.candidatos },
      {
        reasonFn: async () => f.razonamiento,
        extractFn: async () =>
          ({ verdict, cites: [{ candidateIndex: 1, snippet }] }) as unknown as EngineExtract,
      },
    )

  it('un valor que no está en el registro no ancla, se escriba como se escriba el campo', async () => {
    const r = await conCita('verificado', 'tender[1].adjudicación=99.999,99 € con IVA · inventado')
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('cita-sin-anclar')
  })

  it('el motor no emite `contradicho`, aunque la cita ancle en un valor', async () => {
    const r = await conCita('contradicho', 'tender[1].adjudicación=35.252,87 € con IVA · no cuadra')
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.sinDatosPorque).toBe('extraccion')
  })
})
