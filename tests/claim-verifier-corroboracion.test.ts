import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'

/**
 * La corroboración tiene el mismo defecto que tuvo `contradicho`, un piso más
 * abajo: en el corpus real produjo dos `parcial` cuya única evidencia era otro
 * expediente (cazados por el reader-review el 17-08-2026 y demovidos por CLI).
 * Los dos casos van aquí reproducidos, con sus controles positivos al lado
 * para que el arreglo no pueda pasar matando al verificador entero.
 */
const claim = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    plenoId: 'p1',
    type: 'afirmacion_numerica',
    topic: 'hacienda',
    speakerGroup: 'PSOE',
    verbatim: 'x'.repeat(30),
    context: '',
    entities: {},
    confidence: 0.9,
    ...overrides,
  }) as never

const tenders = (rows: Array<{ title: string; finalAmount: number }>) => ({ contracts: rows })

describe('corroborar exige el mismo objeto, no sólo un importe parecido', () => {
  it('505 mil € de contenedores NO se corroboran con el renting de vehículos de 466.200 €', () => {
    // 15uvjew-137-afi-3bd4bc, tal cual se publicó: amountSim ≈ 0,85 y UN solo
    // token compartido («compra», del «con opción a compra» del renting) que
    // la contención convierte en 0,5. El importe parecido más una palabra
    // suelta no son el objeto.
    const v = verifyClaim({
      claim: claim({
        entities: { amountEuros: 505_000, referencedEntity: 'compra de contenedores' },
      }),
      tenders: tenders([
        {
          title:
            'Suministro de renting de siete vehículos: dos vehículos tipo turismo y cinco furgonetas para los servicios municipales, con opción a compra',
          finalAmount: 466_200,
        },
      ]),
    })
    expect(v.evidence.filter((e) => e.kind === 'tender' && e.stance === 'checked')).toEqual([])
    expect(v.verdict).not.toBe('parcial')
  })

  it('con el objeto de verdad delante, el mismo importe sí corrobora (control)', () => {
    const v = verifyClaim({
      claim: claim({
        entities: { amountEuros: 505_000, referencedEntity: 'compra de contenedores' },
      }),
      tenders: tenders([
        {
          title: 'Contrato de suministro para la compra de contenedores de residuos urbanos',
          finalAmount: 505_000,
        },
      ]),
    })
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
  })

  it('una cita de obra NO se ancla a un tender que sólo comparte palabras genéricas', () => {
    // 15uvjew-011-cit-2bd6bf: la entidad habla de la clasificación de IDRACUA
    // en la contratación del servicio (del agua); el tender es el software de
    // gestión policial. Comparten «contratación», «servicio», «procedimiento»
    // — contención 3/5 ≥ 0,5 con el overlapScore viejo.
    const v = verifyClaim({
      claim: claim({
        type: 'cita_obra',
        entities: {
          referencedEntity:
            'idracua - clasificación en el procedimiento de contratación del servicio',
        },
      }),
      tenders: tenders([
        {
          title:
            'Contratación administrativa mixta de suministro y servicio, para la implantación del programa de gestión policial a adjudicar por procedimiento abierto súper simplificado',
          finalAmount: 100_000,
        },
      ]),
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toEqual([])
    expect(v.verdict).not.toBe('parcial')
  })

  it('una cita de obra con tokens distintivos compartidos sí ancla (control)', () => {
    const v = verifyClaim({
      claim: claim({
        type: 'cita_obra',
        entities: {
          referencedEntity: 'concesión del servicio de abastecimiento de agua potable a idracua',
        },
      }),
      tenders: tenders([
        {
          title:
            'Contrato de concesión del servicio público de abastecimiento de agua potable y alcantarillado',
          finalAmount: 2_000_000,
        },
      ]),
    })
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
  })
})
