/**
 * La lectura vecinal de /cargos (auditoría de las dos lecturas, §3): «¿Cuánto
 * cobran?» y «¿Quién vigila al gobierno?», derivadas del acuerdo de
 * retribuciones (dedicaciones.json) y de la lista de cargos (officials.json)
 * publicados. Las variantes que fuerzan un caso son copias de esas filas con un
 * campo cambiado, nunca una forma escrita a mano.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { quienFiscaliza, sinAreasDelegadas, sueldosEnBreve } from '../src/scraper/en-breve-cargos'

const lee = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const DEDIC = lee('dedicaciones.json')
const LISTA = lee('officials.json')
const IMPORTES: number[] = DEDIC.byOfficial.map((r: any) => r.amountEuros)

describe('sueldosEnBreve', () => {
  it('mide algo: el acuerdo trae puestos con sueldo y concejales sin él', () => {
    expect(DEDIC.byOfficial.length).toBeGreaterThan(0)
    expect(DEDIC.sinDedicacionCount).toBeGreaterThan(0)
    expect(LISTA.count).toBeGreaterThan(0)
  })

  it('con sueldo y sin sueldo suman los escaños del pleno', () => {
    const s = sueldosEnBreve(DEDIC, LISTA.count)!
    expect(s).not.toBeNull()
    expect(s.conSueldo).toBe(DEDIC.byOfficial.length)
    expect(s.sinSueldo).toBe(DEDIC.sinDedicacionCount)
    expect(s.conSueldo + s.sinSueldo).toBe(LISTA.count)
  })

  it('el tramo va del menor al mayor importe del acuerdo, con su fecha', () => {
    const s = sueldosEnBreve(DEDIC, LISTA.count)!
    expect(s.minimo).toBe(Math.min(...IMPORTES))
    expect(s.maximo).toBe(Math.max(...IMPORTES))
    expect(s.fecha).toBe(DEDIC.source.date)
  })

  it('dice la antigüedad personal que lleva dentro el importe mayor, si la fila la trae', () => {
    const s = sueldosEnBreve(DEDIC, LISTA.count)!
    const mayor = DEDIC.byOfficial.find((r: any) => r.amountEuros === s.maximo)
    expect(s.antiguedadDelMaximo).toBe(mayor.antiguedadEuros ?? null)
    // Hoy la trae: 59.195,48 € son 53.734,99 € del cargo y 5.460,49 € de antigüedad.
    expect(s.antiguedadDelMaximo).toBeGreaterThan(0)
    const sinAntiguedad = {
      ...DEDIC,
      byOfficial: DEDIC.byOfficial.map((r: any) => {
        const { antiguedadEuros: _a, antiguedadQuote: _q, ...resto } = r
        return resto
      }),
    }
    expect(sueldosEnBreve(sinAntiguedad, LISTA.count)!.antiguedadDelMaximo).toBeNull()
  })

  it('si no suman los escaños, no hay frase: dos cifras ciertas sin puente', () => {
    expect(sueldosEnBreve(DEDIC, LISTA.count + 1)).toBeNull()
  })

  it('una fila sin importe no cuenta como cero: no hay frase', () => {
    const [primera, ...resto] = DEDIC.byOfficial
    const sinImporte = { ...DEDIC, byOfficial: [{ ...primera, amountEuros: null }, ...resto] }
    expect(sueldosEnBreve(sinImporte, LISTA.count)).toBeNull()
  })

  it('sin acuerdo, o sin el recuento de los que no tienen sueldo, no hay frase', () => {
    expect(sueldosEnBreve(null, LISTA.count)).toBeNull()
    expect(sueldosEnBreve({ ...DEDIC, byOfficial: [] }, LISTA.count)).toBeNull()
    const { sinDedicacionCount: _s, ...sinRecuento } = DEDIC
    expect(sueldosEnBreve(sinRecuento, LISTA.count)).toBeNull()
  })
})

describe('quienFiscaliza', () => {
  it('cuenta a quienes no tienen área delegada, la regla de la página', () => {
    const q = quienFiscaliza(LISTA.officials)!
    const sinAreas = LISTA.officials.filter((o: any) => (o.portfolios ?? []).length === 0)
    expect(sinAreasDelegadas(LISTA.officials)).toEqual(sinAreas)
    expect(q.n).toBe(sinAreas.length)
    expect(q.n).toBeGreaterThan(0)
  })

  it('un partido una vez, de más a menos escaños, y los escaños suman', () => {
    const q = quienFiscaliza(LISTA.officials)!
    const nombres = q.partidos.map((p) => p.partido)
    expect(new Set(nombres).size).toBe(nombres.length)
    expect(q.partidos.reduce((s, p) => s + p.escanos, 0)).toBe(q.n)
    const escanos = q.partidos.map((p) => p.escanos)
    expect(escanos).toEqual([...escanos].sort((a, b) => b - a))
    for (const p of q.partidos) {
      expect(p.escanos).toBe(
        LISTA.officials.filter(
          (o: any) => o.party === p.partido && (o.portfolios ?? []).length === 0,
        ).length,
      )
    }
  })

  it('sin nadie fuera del gobierno, no hay tarjeta', () => {
    const todosGobiernan = LISTA.officials.filter((o: any) => (o.portfolios ?? []).length > 0)
    expect(quienFiscaliza(todosGobiernan)).toBeNull()
    expect(quienFiscaliza([])).toBeNull()
  })
})
