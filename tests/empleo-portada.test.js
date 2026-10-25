import { describe, it, expect } from 'vitest'
import { ofertasDePortada, fechaDeCierre } from '../src/lib/empleo'

// Domingo 25-10-2026, el día en que la portada enseñaba primero una oferta de
// «Auxiliar Administrativo» cerrada el 15-01-2026 como «cierra 15 ene».
const HOY = Date.parse('2026-10-25T10:00:00Z')

describe('empleo — las ofertas de la portada', () => {
  it('no enseña una oferta cuyo plazo ya pasó, aunque el portal la siga llamando «Abierta»', () => {
    const picks = ofertasDePortada(
      [
        { id: 'a', status: 'Abierta', deadline: '2026-01-15' },
        { id: 'b', status: 'Abierta', deadline: '2026-10-27' },
      ],
      3,
      HOY,
    )
    expect(picks.map((o) => o.id)).toEqual(['b'])
  })

  it('pone primero la que cierra antes', () => {
    const picks = ofertasDePortada(
      [
        { id: 'tarde', deadline: '2026-11-30' },
        { id: 'pronto', deadline: '2026-10-26' },
        { id: 'medio', deadline: '2026-11-02' },
      ],
      3,
      HOY,
    )
    expect(picks.map((o) => o.id)).toEqual(['pronto', 'medio', 'tarde'])
  })

  it('completa con ofertas sin plazo, que no se pueden dar por cerradas', () => {
    const picks = ofertasDePortada(
      [
        { id: 'sin-plazo', deadline: null },
        { id: 'cerrada', deadline: '2026-03-01' },
        { id: 'con-plazo', deadline: '2026-11-02' },
      ],
      3,
      HOY,
    )
    expect(picks.map((o) => o.id)).toEqual(['con-plazo', 'sin-plazo'])
  })

  it('devuelve como mucho n', () => {
    const muchas = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      deadline: `2026-11-0${i + 1}`,
    }))
    expect(ofertasDePortada(muchas, 3, HOY)).toHaveLength(3)
  })
})

describe('empleo — la fecha de cierre en la portada', () => {
  it('omite el año cuando es el de hoy', () => {
    const f = fechaDeCierre('2026-10-27', 'es', HOY)
    expect(f).toMatch(/27/)
    expect(f).not.toMatch(/2026/)
  })

  it('dice el año cuando no es el de hoy, para que «15 ene» no se lea como el próximo enero', () => {
    expect(fechaDeCierre('2027-01-15', 'es', HOY)).toMatch(/2027/)
    expect(fechaDeCierre('2026-01-15', 'es', Date.parse('2027-02-01T10:00:00Z'))).toMatch(/2026/)
  })

  it('un plazo AAAA-MM-DD es un día de calendario: al oeste de Greenwich no sale el anterior', () => {
    // `new Date('2026-10-27')` es la medianoche UTC; en Nueva York eso es el 26
    // por la tarde, y la primera versión pintaba «26 oct». Las 39 ofertas de
    // empleo.json traen el plazo así.
    const antes = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(fechaDeCierre('2026-10-27', 'es', HOY)).toMatch(/^27\b/)
    } finally {
      if (antes === undefined) delete process.env.TZ
      else process.env.TZ = antes
    }
  })
})
