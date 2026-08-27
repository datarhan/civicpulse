import { describe, it, expect } from 'vitest'
import {
  CLASES_DOCUMENTALES,
  CLASES_PEDIBLES,
  claseDocumentalDe,
  agruparPorClaseDocumental,
} from '../src/scraper/clase-documental'

/**
 * Propiedad LÉXICA, nunca un pronóstico.
 *
 * Esto mide qué documento NOMBRA una frase. No dice si la frase se puede
 * comprobar, ni si el documento existe, ni si el Ayuntamiento lo tiene. La
 * distinción es la misma que `classifyClaimShape` ya sostiene en la cola de
 * apoyo, y es lo único que hace defendible clasificar 4.293 filas sin que un
 * modelo adivine nada.
 *
 * La regla que más importa: una frase que no nombra ningún documento se cuenta
 * APARTE y no se reparte entre las clases. Son el 87 % del corpus sin corpus, y
 * repartirlas haría que cualquier clase pareciera mayor de lo que es — que es
 * exactamente cómo se justifica una petición que no sostiene el material.
 */
describe('claseDocumentalDe · qué documento nombra la frase', () => {
  it('reconoce las clases que se pueden pedir', () => {
    expect(claseDocumentalDe('visto el informe conjunto con la Secretaría')).toContain(
      'informe-tecnico',
    )
    expect(claseDocumentalDe('por acuerdo plenario del 9 de febrero')).toContain('acta')
    expect(claseDocumentalDe('el expediente de la minimización')).toContain('expediente')
    expect(claseDocumentalDe('modificación plan de inversiones')).toContain('plan-interno')
  })

  it('una frase puede nombrar más de un documento', () => {
    const c = claseDocumentalDe('están en el informe y luego en el acuerdo plenario')
    expect(c).toContain('informe-tecnico')
    expect(c).toContain('acta')
  })

  it('la que no nombra ninguno devuelve vacío — no se le adjudica una clase', () => {
    expect(claseDocumentalDe('no está gestionando como toca')).toEqual([])
    expect(claseDocumentalDe('Vox dice que no, que no')).toEqual([])
    expect(claseDocumentalDe('')).toEqual([])
  })

  it('agrupa sin repartir lo que no nombra nada', () => {
    const r = agruparPorClaseDocumental([
      'visto el informe conjunto',
      'el expediente de contratación',
      'no está gestionando como toca',
      'Vox dice que no',
    ])
    expect(r.porClase['informe-tecnico']).toBe(1)
    expect(r.porClase['expediente']).toBe(1)
    // Las dos sin documento van a su propio contador, no a las clases.
    expect(r.sinDocumento).toBe(2)
    const sumaClases = Object.values(r.porClase).reduce((a, n) => a + n, 0)
    expect(sumaClases).toBe(2)
  })

  it('las clases PEDIBLES son un subconjunto declarado de las clases', () => {
    // `contrato` y `presupuesto` se nombran mucho pero YA tenemos corpus de
    // ellos: ahí el hueco es de emparejamiento, no de publicación, y pedirlos
    // sería pedir algo que ya está publicado.
    for (const c of CLASES_PEDIBLES) expect(CLASES_DOCUMENTALES).toContain(c)
    expect(CLASES_PEDIBLES).not.toContain('contrato')
    expect(CLASES_PEDIBLES).not.toContain('presupuesto')
  })

  it('el enum se exporta, no se recita', () => {
    expect([...CLASES_PEDIBLES].sort()).toEqual(
      ['acta', 'expediente', 'informe-tecnico', 'plan-interno'].sort(),
    )
  })
})
