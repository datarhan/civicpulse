/**
 * Acceptance test for Package 1 (verifier recall fix) + Package 2A
 * (TED tender merge). Locks the contract that a numeric press claim
 * whose amount + buyer-name overlap a TED notice gets upgraded to
 * `verificado` with a `kind:'tender'` evidence row.
 *
 * The corresponding /laboratorio live run shows 0/27 verificado today
 * only because the press-claim corpus doesn't happen to share an
 * amount with the 54 indexed TED notices. This test guarantees that
 * when overlap exists, the verifier fires.
 */
import { describe, expect, it } from 'vitest'

import { verifyClaim } from '../src/scraper/claim-verifier'
import { asTenderRow, type TenderTedRow } from '../src/scraper/tenders-ted'

const sampleTed: TenderTedRow = {
  id: 'abc123abc123',
  publicationNumber: '142719-2024',
  title: 'Anuncio TED 142719-2024',
  buyerName: 'Alcaldía del Ayuntamiento de Riba-roja de Túria',
  contractNature: ['services'],
  publicationDate: '2024-03-08T00:00:00.000Z',
  totalValueEur: 940519.6,
  currency: 'EUR',
  pdfUrl: 'https://ted.europa.eu/es/notice/142719-2024/pdf',
  htmlUrl: 'https://ted.europa.eu/es/notice/142719-2024/notice',
}

describe('verifyClaim — recall against TED', () => {
  it('upgrades to verificado when a numeric press claim matches a TED notice by amount + buyer', () => {
    const claim = {
      id: 'probe-001',
      type: 'afirmacion_numerica' as const,
      topic: 'fiscal' as const,
      verbatim:
        'La Alcaldía del Ayuntamiento de Riba-roja de Túria adjudicó un contrato de servicios por 940.520 €',
      context: '',
      entities: {
        amountEuros: 940520,
        referencedEntity: 'Alcaldía del Ayuntamiento de Riba-roja',
      },
      confidence: 0.95,
      attributedSource: 'outlet',
      speakerGroup: null,
      accusationSubtype: null,
    }
    const result = verifyClaim({
      claim: claim as never,
      tendersTed: { contracts: [asTenderRow(sampleTed)] },
    })
    expect(result.verdict).toBe('verificado')
    expect(result.evidence.length).toBeGreaterThanOrEqual(1)
    const top = result.evidence[0]
    expect(top.kind).toBe('tender')
    expect(top.ref).toContain('ted.europa.eu')
    expect(top.similarity).toBeGreaterThan(0.9)
  })

  it('leaves the verdict at sin-datos when no overlap exists', () => {
    const claim = {
      id: 'probe-002',
      type: 'afirmacion_numerica' as const,
      topic: 'urbanismo' as const,
      verbatim: 'El Ayuntamiento invierte 12.345 € en jardinería del polígono norte',
      context: '',
      entities: { amountEuros: 12345, referencedEntity: 'polígono norte' },
      confidence: 0.9,
      attributedSource: 'outlet',
      speakerGroup: null,
      accusationSubtype: null,
    }
    const result = verifyClaim({
      claim: claim as never,
      tendersTed: { contracts: [asTenderRow(sampleTed)] },
    })
    expect(result.verdict).toBe('sin-datos')
  })
})
