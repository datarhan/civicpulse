import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'
import { CORPUS_IDS, corpusReales } from '../src/scraper/claim-verdicts'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * El «no se encontró» del verificador nombra lo que miró, y nada más.
 *
 * Cuando ningún comparador casaba, `verifyClaim` escribía siempre la misma
 * frase: «No se encontró registro en tenders / BDNS / presupuesto. El claim
 * puede ser cierto pero no está atestiguado por los datos abiertos
 * publicados.». Su `checkedAgainst`, en cambio, sólo apunta un corpus cuando su
 * comparador corre de verdad (el comentario de `note()` explica por qué). Así
 * la misma verificación decía dos cosas: una promesa cotejada sólo con el
 * tracker de promesas «no se encontró en tenders / BDNS / presupuesto», y una
 * afirmación con la que no corrió ningún comparador también.
 *
 * La tarjeta de /plenos/:id imprime las dos una encima de otra
 * (tests/claim-ledger-explicacion-fuentes.test.jsx). Esto mira dónde nace la
 * frase: el `summary` tiene que nombrar los corpus del `checkedAgainst` de su
 * propia verificación, con sus nombres, y ninguno más.
 */

function claim(partial: Partial<PlenoClaim> = {}): PlenoClaim {
  return {
    id: 'test-001-afi-abc123',
    plenoId: 'test',
    plenoDate: '2026-03-09',
    segmentIndex: 0,
    type: 'afirmacion_numerica',
    speakerGroup: 'PSOE',
    verbatim: 'hemos invertido 46 millones en la mejora del alumbrado',
    context: 'contexto contexto contexto contexto contexto',
    topic: 'other',
    entities: { amountEuros: 46_000_000 },
    confidence: 0.8,
    reasoning: 'cita numérica',
    requiresHumanApproval: true,
    ...partial,
  }
}

/** Lo que dice que se buscó: la misma alarma que la prueba de la tarjeta. */
const AFIRMA_BUSQUEDA =
  /no se (ha )?encontr|registro en\b|se (consult|cotej|busc)|atestiguad[oa] por|datos abiertos publicados/i

/** Los corpus declarados que el texto nombra, como palabras enteras y en su orden. */
function corpusNombrados(texto: string): string[] {
  const palabras = texto.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []
  return palabras.filter((p) => (CORPUS_IDS as readonly string[]).includes(p))
}

/** Un contrato, una subvención y un presupuesto que no tienen nada que ver con la cita. */
const AJENOS = {
  tenders: {
    contracts: [
      {
        permalink: 'https://contrataciones.example/x1',
        title: 'Suministro de papel para oficinas',
        finalAmount: 3_000,
      },
    ],
  },
  tendersTed: {
    contracts: [
      {
        permalink: 'https://ted.example/x2',
        title: 'Servicio de limpieza de edificios',
        finalAmount: 12_000,
      },
    ],
  },
  bdns: {
    items: [{ titulo: 'Ayudas a la natalidad', importe: 5_000, bdnsCode: '111' }],
  },
  budget: {
    snapshot: {
      totalExpense: 40_000_000,
      expenseByProgram: [{ name: 'Cultura', amount: 1_000_000 }],
      expenseByEconomicChapter: [],
    },
  },
}

describe('verifyClaim · el sin-datos que no encontró nada', () => {
  it('sin ningún comparador que correr, no dice que se buscara', () => {
    const v = verifyClaim({ claim: claim() })
    expect(v.verdict).toBe('sin-datos')
    // Lo positivo primero: es de verdad el caso sin corpus.
    expect(v.checkedAgainst).toEqual([])
    expect(v.summary.length).toBeGreaterThan(0)
    expect(v.summary).not.toMatch(AFIRMA_BUSQUEDA)
    expect(corpusNombrados(v.summary)).toEqual([])
  })

  it('una promesa cotejada sólo con el tracker nombra el tracker', () => {
    const v = verifyClaim({
      claim: claim({ type: 'promesa', entities: {}, verbatim: 'haremos un auditorio nuevo' }),
      promises: {
        items: [{ id: 'p-1', quote: 'bajaremos el IBI un diez por ciento', madeAt: '2023-05-01' }],
      },
    })
    expect(v.verdict).toBe('sin-datos')
    expect(v.checkedAgainst).toEqual(['promises'])
    expect(corpusNombrados(v.summary)).toEqual(['promises'])
    // Y nada de lo que no se miró, dicho con otro nombre.
    expect(v.summary).not.toMatch(/tenders|bdns|presupuesto/i)
  })

  it('con los cuatro corpus mirados, nombra los cuatro y en el orden de la lista', () => {
    const v = verifyClaim({ claim: claim(), ...AJENOS })
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence).toEqual([])
    // Lo positivo primero: corrieron los cuatro comparadores.
    expect(corpusReales(v.checkedAgainst)).toEqual(['tenders', 'tenders-ted', 'bdns', 'budget'])
    expect(corpusNombrados(v.summary)).toEqual(corpusReales(v.checkedAgainst))
  })

  it('con sólo contratos locales, no nombra los europeos', () => {
    const v = verifyClaim({ claim: claim(), tenders: AJENOS.tenders })
    expect(v.verdict).toBe('sin-datos')
    expect(v.checkedAgainst).toEqual(['tenders'])
    expect(corpusNombrados(v.summary)).toEqual(['tenders'])
  })
})
