import { describe, it, expect } from 'vitest'
import { hechosClave } from '../src/components/journalist/HeroBand'

// La forma de las secciones de un informe publicado (journalist-reports/*.json),
// reducida a lo que leen los chips. Los importes son los de a-teresa-pozuelo-bio
// el 25-10-2026: el sueldo es el del acuerdo de 2023, no el de 2026 que pinta su
// ficha de /cargos.
const informe = {
  sections: [
    {
      kind: 'financial',
      payload: {
        items: [
          { metric: 'salary', year: 2023, amountEuros: 43067.36 },
          { metric: 'declared-assets', year: 2023, amountEuros: 394118.84 },
          { metric: 'business', year: 2023, description: 'Sin actividad empresarial declarada' },
        ],
      },
    },
    {
      kind: 'career-political',
      payload: {
        items: [
          {
            role: 'Concejala · Primera Teniente de Alcalde',
            org: 'Ayuntamiento de Riba-roja de Túria',
            startYear: 2015,
            endYear: 2019,
          },
          {
            role: 'Concejala · Primera Teniente de Alcalde',
            org: 'Ayuntamiento de Riba-roja de Túria',
            startYear: 2019,
            endYear: 2023,
          },
          {
            role: 'Concejala · Primera Teniente de Alcalde',
            org: 'Ayuntamiento de Riba-roja de Túria',
            startYear: 2023,
            endYear: null,
          },
        ],
      },
    },
  ],
}

const porRotulo = (facts) => Object.fromEntries(facts.map((f) => [f.k, f.v]))

describe('biografía — los chips de «lo esencial»', () => {
  it('la retribución dice de qué año es', () => {
    const f = porRotulo(hechosClave(informe))
    expect(f['Retribución 2023']).toBe('43.067 €/año')
    expect(f).not.toHaveProperty('Retribución')
  })

  it('el patrimonio declarado dice de qué año es', () => {
    expect(porRotulo(hechosClave(informe))['Patrimonio declarado 2023']).toMatch(/394\.119 €/)
  })

  it('«desde» se rotula como lo que mide: la cadena de cargos en el Ayuntamiento', () => {
    const f = porRotulo(hechosClave(informe))
    expect(f['En el Ayuntamiento']).toBe('desde 2015')
    expect(f).not.toHaveProperty('En el cargo')
  })

  it('una cifra sin año conserva el rótulo sin inventarle uno', () => {
    const sinAnio = {
      sections: [
        { kind: 'financial', payload: { items: [{ metric: 'salary', amountEuros: 1000 }] } },
      ],
    }
    expect(porRotulo(hechosClave(sinAnio))).toHaveProperty('Retribución')
  })
})
