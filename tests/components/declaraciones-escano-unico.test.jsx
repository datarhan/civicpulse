import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from '../setup/mockFetch'
import Declaraciones from '../../src/pages/Declaraciones'

/**
 * El filtro de grupo de /declaraciones no cuenta un cero que es una política.
 *
 * Un grupo con un solo escaño nombra a quien lo ocupa, así que ninguna
 * declaración lleva su etiqueta sin firma (tests/declaraciones-escano-unico.test.ts).
 * El filtro pintaba una lista fija —PSOE, PP, VOX, Compromís, EU-Podem— con su
 * cuenta al lado, y en cuanto se retiren esas etiquetas diría «VOX 0»: que ese
 * grupo no dijo nada en ningún pleno. No es eso: sus declaraciones están, sin
 * grupo. Un cero que significa «no lo publicamos» es un centinela pintado como
 * dato (DATA_INTEGRITY, regla 3).
 *
 * Así que el filtro saca un botón por grupo que de verdad lleva declaraciones,
 * y una nota dice qué grupos no los tienen y por qué, con los grupos derivados
 * de la composición de officials.json, nunca de una lista escrita aquí.
 */

const COMPOSICION = { PSOE: 11, PP: 7, VOX: 1, 'EU-Podem': 1, Compromís: 1 }

const declaracion = (id, speakerGroup) => ({
  claim: {
    id,
    plenoId: 'p1',
    plenoDate: '2026-01-19',
    segmentIndex: 1,
    type: 'afirmacion_numerica',
    speakerGroup,
    verbatim: `Literal de prueba número ${id} con cifras de 2026.`,
    context: 'Contexto de prueba.',
    topic: 'fiscal',
    entities: {},
    confidence: 0.9,
    reasoning: 'Prueba.',
  },
  verification: {
    claimId: id,
    verdict: 'sin-datos',
    summary: 'Un «sin datos» no es un desmentido: la afirmación puede ser cierta.',
    evidence: [],
    checkedAgainst: [],
  },
  visibility: 'toggle',
})

function pintar({ composicion = COMPOSICION, items }) {
  installFetchMock({
    '/data/pleno-claims/index.json': {
      plenos: [{ plenoId: 'p1', plenoDate: '2026-01-19', chunkPath: 'pleno-claims/p1.json' }],
      totals: { items: items.length, byVerdict: { 'sin-datos': items.length } },
    },
    '/data/pleno-claims/p1.json': { items },
    '/data/plenos.json': { items: [] },
    '/data/officials.json': { composition: composicion, officials: [] },
  })
  return render(
    <MemoryRouter>
      <Declaraciones />
    </MemoryRouter>,
  )
}

const CORPUS = [
  declaracion('p1-001-afi-aaaaaa', 'PSOE'),
  declaracion('p1-002-afi-bbbbbb', 'PSOE'),
  declaracion('p1-003-afi-cccccc', 'PP'),
  declaracion('p1-004-afi-dddddd', null),
]

const boton = (nombre) => screen.queryByRole('button', { name: new RegExp(`^${nombre}\\b`) })

describe('/declaraciones · el filtro de grupo no pinta un cero de política', () => {
  it('no hay botón para un grupo sin ninguna declaración atribuida', async () => {
    pintar({ items: CORPUS })
    // Midió algo: los grupos que sí llevan declaraciones tienen el suyo.
    expect(await screen.findByRole('button', { name: /^PSOE\b/ })).toBeTruthy()
    expect(boton('PP')).toBeTruthy()
    for (const g of ['VOX', 'EU-Podem', 'Compromís']) expect(boton(g), g).toBeNull()
  })

  it('una nota nombra los grupos de un escaño, derivados de la composición, y por qué no tienen botón', async () => {
    pintar({ items: CORPUS })
    const nota = await screen.findByText(/tienen un escaño cada uno/)
    expect(nota.textContent).toMatch(/VOX, EU-Podem y Compromís/)
    expect(nota.textContent).toMatch(/se publican sin grupo/)
    const porQue = screen.getByRole('link', { name: /por qué/i })
    expect(porQue.getAttribute('href')).toBe('/metodologia#verificacion-declaraciones')
  })

  it('la nota sale de officials.json: otra composición, otros grupos', async () => {
    pintar({ items: CORPUS, composicion: { PSOE: 12, PP: 8, VOX: 1 } })
    const nota = await screen.findByText(/tiene un escaño/)
    expect(nota.textContent).toMatch(/^VOX tiene un escaño/)
    expect(nota.textContent).not.toMatch(/Compromís|EU-Podem/)
  })

  it('sin grupos de un escaño no hay nota', async () => {
    pintar({ items: CORPUS, composicion: { PSOE: 12, PP: 9 } })
    expect(await screen.findByRole('button', { name: /^PSOE\b/ })).toBeTruthy()
    expect(screen.queryByText(/escaño/)).toBeNull()
  })

  /**
   * La nota afirma algo de los datos —«sus declaraciones se publican sin
   * grupo»—, así que sale de los datos, no sólo de la composición. Señalado por
   * la revisión lectora del pre-push (03-10-2026) sobre la rama sin firmar: la
   * nota lo decía de VOX mientras el filtro, dos líneas más arriba, contaba 51
   * declaraciones de VOX. Un grupo de un escaño que lleva declaraciones
   * atribuidas —hoy, hasta que se retiren; mañana, si una persona firma una—
   * tiene su botón y la nota no lo nombra.
   */
  it('no nombra a un grupo de un escaño que sí lleva declaraciones atribuidas', async () => {
    pintar({ items: [...CORPUS, declaracion('p1-005-afi-eeeeee', 'VOX')] })
    expect(await screen.findByRole('button', { name: /^VOX\b/ })).toBeTruthy()
    const nota = await screen.findByText(/tienen un escaño cada uno/)
    expect(nota.textContent).toMatch(/^EU-Podem y Compromís tienen/)
    expect(nota.textContent).not.toMatch(/VOX/)
  })

  it('si todos los de un escaño llevan declaraciones atribuidas, no hay nota', async () => {
    pintar({
      items: [
        ...CORPUS,
        declaracion('p1-005-afi-eeeeee', 'VOX'),
        declaracion('p1-006-afi-ffffff', 'EU-Podem'),
        declaracion('p1-007-afi-gggggg', 'Compromís'),
      ],
    })
    expect(await screen.findByRole('button', { name: /^VOX\b/ })).toBeTruthy()
    expect(screen.queryByText(/escaño/)).toBeNull()
  })
})
