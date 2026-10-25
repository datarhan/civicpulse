import { describe, it, expect, afterEach } from 'vitest'
import { fmtDateShort, fmtDateLong, fmtDateCompacta } from '../src/lib/formatters'

/**
 * Un «AAAA-MM-DD» es un DÍA de calendario, no un instante.
 *
 * `new Date('2026-05-27')` es la medianoche UTC del 27, y en Nueva York eso es el
 * 26 por la tarde. Los tres formateadores de fecha lo leían así, de modo que al
 * oeste de Greenwich toda fecha de sólo día salía un día antes: la adjudicación
 * de un contrato, el plazo de una oferta, la fecha de un pleno. En España no se
 * notaba, porque la medianoche UTC ya es ese día en hora peninsular y canaria.
 *
 * Un instante con hora («…T18:20:00.000Z») sigue en la hora del lector.
 */
const ANTES = process.env.TZ
afterEach(() => {
  if (ANTES === undefined) delete process.env.TZ
  else process.env.TZ = ANTES
})

describe('fechas de sólo día, en cualquier huso', () => {
  for (const tz of ['America/New_York', 'Europe/Madrid', 'Pacific/Auckland']) {
    it(`${tz}: el 27 de mayo es el 27`, () => {
      process.env.TZ = tz
      expect(fmtDateLong('2026-05-27')).toBe('27 de mayo de 2026')
      expect(fmtDateShort('2026-05-27')).toMatch(/^27 may/)
      expect(fmtDateCompacta('2026-05-27')).toMatch(/^27 may/)
    })
  }

  it('un instante con hora sigue en la hora del lector', () => {
    process.env.TZ = 'America/New_York'
    // 02:00 UTC del 27 son las 22:00 del 26 en Nueva York.
    expect(fmtDateLong('2026-05-27T02:00:00.000Z')).toBe('26 de mayo de 2026')
  })
})
