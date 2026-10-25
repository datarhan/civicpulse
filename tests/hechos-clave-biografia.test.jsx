import { describe, it, expect } from 'vitest'
import { hechosClave } from '../src/components/journalist/HeroBand'

// Filas copiadas de public/data/journalist-reports/a-teresa-pozuelo-bio.json
// (25-10-2026), reducidas a los campos que leen los chips. El sueldo es el del
// acuerdo de 2023, no el de 2026 que pinta su ficha de /cargos; y el cargo
// actual trae `org: 'Ayuntamiento'`, que el subtítulo pinta como «en
// Ayuntamiento · desde 2023».
const informe = {
  sections: [
    {
      kind: 'financial',
      payload: {
        items: [
          { metric: 'salary', year: 2023, amountEuros: 43067.36 },
          { metric: 'declared-assets', year: 2023, amountEuros: 394118.84 },
          {
            metric: 'business',
            year: 2023,
            description:
              'Sin actividad empresarial declarada: la única actividad que recoge su declaración oficial de actividades (toma de posesión 2023) es la concejalía del Ayuntamiento de Riba-roja de Túria, con inicio consignado el 15/06/2019.',
          },
        ],
      },
    },
    {
      kind: 'career-political',
      payload: {
        items: [
          {
            role: 'Regidora — planificación urbanística, urbanismo, cementerios, obras y servicios (según su CV; su declaración estatutaria consigna el inicio el 15/06/2019)',
            org: 'Ayuntamiento de Riba-roja de Túria',
            startYear: 2015,
            endYear: 2023,
          },
          {
            role: 'Concejala · Primera Teniente de Alcalde y portavoz del grupo socialista (mandato 2019-2023)',
            org: 'Ayuntamiento de Riba-roja de Túria',
            startYear: 2019,
            endYear: 2023,
          },
          {
            role: 'Concejala · Primera Teniente de Alcalde — Urbanismo, Vivienda, Obra Pública, Áreas Industriales y Cementerio',
            org: 'Ayuntamiento',
            startYear: 2023,
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

  it('«desde» se rotula como lo que mide: la cadena de cargos en la corporación', () => {
    const f = porRotulo(hechosClave(informe))
    expect(f['En la corporación']).toBe('desde 2015')
    expect(f).not.toHaveProperty('En el cargo')
  })

  it('el rótulo no repite la palabra del subtítulo, que lleva la otra fecha', () => {
    // El subtítulo pinta «… en <org> · desde <startYear>» del cargo actual: aquí,
    // «en Ayuntamiento · desde 2023». Un chip «En el Ayuntamiento · desde 2015»
    // ponía dos fechas ciertas sobre la misma palabra.
    const actual = informe.sections[1].payload.items.at(-1)
    for (const { k } of hechosClave(informe)) {
      expect(k.toLowerCase()).not.toContain(actual.org.toLowerCase())
    }
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
