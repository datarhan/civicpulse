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
    expect(f['Retribución 2023']).toBe('43.067\u00a0€/año')
    expect(f).not.toHaveProperty('Retribución')
  })

  it('el patrimonio declarado dice de qué año es', () => {
    expect(porRotulo(hechosClave(informe))['Patrimonio declarado 2023']).toMatch(/394\.119\u00a0€/)
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

  // Filas copiadas de a-jose-angel-hernandez-bio.json y a-rfolgado-bio.json
  // (28-10-2026). La etiqueta decía «desde 2015» con la trayectoria de debajo
  // abriendo en 2010, y «desde 2023» a quien fue concejal de 2015 a 2019.
  it('lo anterior al hueco se dice, sin mover el «desde»', () => {
    const AYTO = 'Ayuntamiento de Riba-roja de Túria'
    const conTrayectoria = (items) => ({
      sections: [{ kind: 'career-political', payload: { items } }],
    })
    const hernandez = conTrayectoria([
      {
        role: 'Concejal — consta en el acta del pleno de 10-03-2010 (corporación 2007-2011)',
        org: AYTO,
        startYear: 2010,
        endYear: 2010,
      },
      {
        role: 'Concejal (electo en 2015, puesto 5 de la lista del PSOE)',
        org: AYTO,
        startYear: 2015,
        endYear: 2019,
      },
      {
        role: 'Concejal · Segundo Teniente de Alcalde (mandato 2019-2023)',
        org: AYTO,
        startYear: 2019,
        endYear: 2023,
      },
      { role: 'Concejal · Tercer Teniente de Alcalde', org: AYTO, startYear: 2023 },
    ])
    const folgado = conTrayectoria([
      {
        role: 'Concejal de Compromís (cabeza de lista); con la delegación de Fomento Económico, Empleo, Actividades y Agricultura según su CV',
        org: AYTO,
        startYear: 2015,
        endYear: 2019,
      },
      {
        role: 'Concejal y portavoz del Grupo Municipal Compromís (cabeza de lista)',
        org: AYTO,
        startYear: 2023,
        endYear: null,
      },
    ])
    expect(porRotulo(hechosClave(hernandez))['En la corporación']).toBe(
      'desde 2015 · antes, en 2010',
    )
    expect(porRotulo(hechosClave(folgado))['En la corporación']).toBe(
      'desde 2023 · antes, de 2015 a 2019',
    )
    // Y sin nada anterior, lo de siempre.
    expect(porRotulo(hechosClave(informe))['En la corporación']).toBe('desde 2015')
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
