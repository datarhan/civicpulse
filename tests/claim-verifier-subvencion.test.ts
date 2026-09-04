import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'

/**
 * Una subvención es dinero que ENTRA; un contrato es dinero que SALE.
 *
 * `15uvjew-183-cit-e0c863` se publicó como `parcial` —«hay datos relacionados
 * pero no idénticos al claim»— con una única fila de evidencia: un contrato
 * menor de obras de 39.900 € en la Casa de la Cultura, bajo la declaración
 * «hemos conseguido una subvención de 39.000 euros para cultura». Lo único que
 * se parecía era la cifra. La BDNS —el registro donde consta una subvención—
 * se miró y no dio nada, y eso es `sin-datos`.
 *
 * Lo cazó la revisión lectora del 4-09-2026, no una prueba: las dos cifras eran
 * correctas y el defecto estaba en lo que la página decía sobre ellas.
 *
 * Familia de `claim-verifier-corroboracion`: allí lo que no cuadraba era el
 * objeto, aquí es la DIRECCIÓN del dinero.
 *
 * Las dos filas son las de producción, copiadas al pie. La primera versión de
 * esta prueba inventó un claim con un `referencedEntity` distinto, el
 * emparejador no llegaba a enganchar el contrato, y el caso «no publica
 * parcial» salía verde SIN evidencia ninguna — verde por no ejecutar, que es
 * el defecto que DATA_INTEGRITY pone el primero. Los controles de abajo son
 * los que lo destaparon.
 */
const claim = (overrides: Record<string, unknown> = {}) =>
  ({
    id: '15uvjew-183-cit-e0c863',
    plenoId: '15uvjew',
    plenoDate: '2026-07-27',
    segmentIndex: 183,
    type: 'cita_convenio',
    speakerGroup: null,
    verbatim:
      'resulta que la parte de cultura hemos conseguido una subvención de 39.000 euros para hacer esas inversiones que íbamos a hacer.',
    context: '',
    topic: 'cultura',
    entities: { amountEuros: 39000, referencedEntity: 'subvención para inversiones en cultura' },
    confidence: 0.75,
    ...overrides,
  }) as never

/** El expediente real, tal cual lo trae el registro de contratación. */
const OBRA = {
  contracts: [
    {
      id: '7062700',
      title:
        'Contrato de obras, de carácter menor, de habilitación de tres espacios para el conservatorio profesional municipal en el edificio Casa de la Cultura.',
      permalink:
        'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=5ELLOtridrPzAq95uGTrDQ%3D%3D',
      status: 'awarded',
      contractType: 'construction',
      awardDate: '2024-12-26',
      finalAmount: 48279,
      finalAmountNoTaxes: 39900,
    },
  ],
}

describe('un contrato no corrobora una subvención', () => {
  it('no publica `parcial` con un contrato como única evidencia', () => {
    const v = verifyClaim({ claim: claim(), tenders: OBRA })
    expect(v.verdict).toBe('sin-datos')
  })

  /**
   * La fila se sigue enseñando: «mirado y descartado» se dice, no se borra —
   * es lo que permite a un lector juzgar el parecido por su cuenta. Y es la
   * mitad que prueba que el caso de arriba se ganó por la puerta nueva y no
   * porque el emparejador no llegara a mirar.
   */
  it('deja el contrato a la vista como lo que se miró', () => {
    const v = verifyClaim({ claim: claim(), tenders: OBRA })
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
    expect(v.checkedAgainst).toContain('tenders')
  })

  /**
   * CONTROL. Sin la palabra que marca el flujo, el mismo claim y el mismo
   * contrato siguen sosteniendo `parcial` con la misma similitud de 0,62: la
   * puerta corta un caso, no la corroboración entera.
   */
  it('la misma evidencia sigue sosteniendo `parcial` cuando el literal NO habla de una subvención', () => {
    const v = verifyClaim({
      claim: claim({
        verbatim:
          'resulta que la parte de cultura hemos conseguido 39.000 euros para hacer esas inversiones que íbamos a hacer.',
      }),
      tenders: OBRA,
    })
    expect(v.verdict).toBe('parcial')
    expect(v.evidence.map((e) => e.kind)).toEqual(['tender'])
  })

  /**
   * «Subvencionar» describe lo que el ayuntamiento hace con su propio dinero, y
   * eso sí puede salir por contrato. La puerta pide el sustantivo, no la
   * familia entera.
   */
  it('no se dispara con el verbo «subvencionar»', () => {
    const v = verifyClaim({
      claim: claim({
        verbatim:
          'la parte de cultura, que vamos a subvencionar con 39.000 euros para hacer esas inversiones que íbamos a hacer.',
      }),
      tenders: OBRA,
    })
    expect(v.verdict).toBe('parcial')
  })
})
