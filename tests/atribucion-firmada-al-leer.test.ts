import { describe, expect, it } from 'vitest'

import { huellaDeLiteralFirmado } from '../src/scraper/atribucion-firmada'
import { comprobarFirmasAlLeer } from '../scripts/verified-rebuild'

/**
 * Lo que la recomposición comprueba de cada firma contra las declaraciones y
 * las transcripciones, porque el validador sólo tiene la huella del literal:
 *
 *  · un motivo que reimprime el literal revienta: la CLI nunca lo escribe, así
 *    que es un fichero editado a mano, y el fichero se sirve;
 *  · un tramo que ya no contiene las palabras —la sesión se re-transcribió, el
 *    fichero se perdió— NO revienta: la entrada pasa a obsoleta y la
 *    declaración sale sin el grupo firmado.
 */

const LITERAL = 'trabajamos no para un conservatorio para dos conservatorios y lo hicimos'
const ID = 'p1-039-cit-aaaaaa'

const claim = (verbatim = LITERAL) =>
  ({ id: ID, plenoId: 'p1', speakerGroup: null, verbatim }) as never

const entrada = (reason: string) => ({
  speakerGroup: 'PSOE',
  from: null,
  literal: huellaDeLiteralFirmado(LITERAL),
  segundos: { desde: 4016, hasta: 4095 },
  fuente: 'current',
  reason,
  editor: 'María de la Fuente Llorens',
  appliedAt: '2026-10-04T12:00:00.000Z',
})

const doc = (reason: string) =>
  ({ version: 1, generatedAt: '', entries: { [ID]: entrada(reason) } }) as never

const MOTIVO = 'Responde al portavoz popular, a quien la presidencia acaba de dar la palabra.'
const conTexto = (texto: string) => () => [{ fuente: 'current', texto }]
const EN_EL_TRAMO = `[4061.0 → 4064.5] (SPEAKER_01) ${LITERAL}`
const EN_OTRO_MOMENTO = `[9000.0 → 9004.0] (SPEAKER_01) ${LITERAL}`

describe('comprobarFirmasAlLeer', () => {
  it('con el tramo intacto, no marca nada', () => {
    const perdidos = comprobarFirmasAlLeer(
      doc(MOTIVO),
      [{ claim: claim() }] as never,
      new Map([[ID, claim()]]),
      conTexto(EN_EL_TRAMO),
    )
    expect([...perdidos]).toEqual([])
  })

  it('si el tramo ya no contiene las palabras, la marca como perdida, sin reventar', () => {
    const perdidos = comprobarFirmasAlLeer(
      doc(MOTIVO),
      [{ claim: claim() }] as never,
      new Map([[ID, claim()]]),
      conTexto(EN_OTRO_MOMENTO),
    )
    expect([...perdidos]).toEqual([ID])
  })

  it('sin ninguna transcripción de la sesión, también perdida: no se comprobó nada', () => {
    const perdidos = comprobarFirmasAlLeer(
      doc(MOTIVO),
      [{ claim: claim() }] as never,
      new Map([[ID, claim()]]),
      () => [],
    )
    expect([...perdidos]).toEqual([ID])
  })

  it('un motivo que reimprime el literal revienta', () => {
    expect(() =>
      comprobarFirmasAlLeer(
        doc(`Dice «${LITERAL}», y es el gobierno quien lo dice.`),
        [{ claim: claim() }] as never,
        new Map([[ID, claim()]]),
        conTexto(EN_EL_TRAMO),
      ),
    ).toThrow(/reimprime el literal/)
  })

  it('una firma cuya declaración no está no se comprueba: la cuenta la recomposición aparte', () => {
    const perdidos = comprobarFirmasAlLeer(doc(MOTIVO), [] as never, new Map(), () => {
      throw new Error('no debería leer ninguna transcripción')
    })
    expect([...perdidos]).toEqual([])
  })
})
