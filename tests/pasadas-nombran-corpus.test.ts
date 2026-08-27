import { describe, it, expect } from 'vitest'
import { evidenciaSuficiente } from '../src/scraper/verified-merge'
import { corpusDeEvidencia, CORPUS_IDS } from '../src/scraper/claim-verdicts'
import { EVIDENCE_KINDS } from '../src/scraper/claim-verifier'

/**
 * El suelo de evidencia (fase 2) exige que un veredicto fuerte nombre un
 * corpus DE VERDAD. Pero cada pasada escribía SU PROPIO NOMBRE en
 * `checkedAgainst` —`nli-grounding`, `verdict-engine`— en vez de decir contra
 * qué había cotejado.
 *
 * O sea que el suelo, tal y como lo dejé, RECHAZA todas las subidas de NLI: la
 * pasada que hace falta para re-fundamentar las 76 filas de procedencia
 * retirada. Rompí la puerta de salida al poner el suelo, y no lo vi hasta ir a
 * usarla.
 *
 * Esta prueba fija la regla que faltaba: lo que una pasada produce tiene que
 * poder atravesar el suelo que el mismo repositorio impone. Sin ella, cualquier
 * pasada futura puede volver a nacer muerta.
 */
describe('lo que produce una pasada atraviesa el suelo que le imponemos', () => {
  const ev = [{ kind: 'tender' as const, ref: 'r', snippet: 's' }]

  it('corpusDeEvidencia traduce los `kind` a corpus', () => {
    expect(corpusDeEvidencia(ev)).toEqual(['tenders'])
    expect(corpusDeEvidencia([{ kind: 'promise', ref: 'r', snippet: 's' }])).toEqual(['promises'])
    expect(corpusDeEvidencia([])).toEqual([])
  })

  it('no inventa corpus para un kind desconocido', () => {
    expect(corpusDeEvidencia([{ kind: 'cosa-nueva', ref: 'r', snippet: 's' }] as never)).toEqual([])
  })

  it('TODO kind de evidencia tiene su corpus: si no, una pasada nace muerta', () => {
    // La alineación es el punto: `ClaimEvidence.kind` es el registro real de
    // fuentes, y un kind sin corpus produce un veredicto que el suelo rechaza.
    for (const kind of EVIDENCE_KINDS) {
      const c = corpusDeEvidencia([{ kind, ref: 'r', snippet: 's' }] as never)
      expect(c.length, `el kind «${kind}» no traduce a ningún corpus`).toBe(1)
      expect(CORPUS_IDS).toContain(c[0])
    }
  })

  it('una subida con evidencia atraviesa el suelo', () => {
    expect(
      evidenciaSuficiente({
        verdict: 'parcial',
        checkedAgainst: corpusDeEvidencia(ev),
        evidence: ev,
      }),
    ).toBe(true)
  })

  it('y una sin evidencia no, que es lo correcto', () => {
    expect(
      evidenciaSuficiente({
        verdict: 'parcial',
        checkedAgainst: corpusDeEvidencia([]),
        evidence: [],
      }),
    ).toBe(false)
  })
})
