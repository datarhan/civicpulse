import { describe, it, expect } from 'vitest'
import { crearPresupuestoArchivo } from '../src/scraper/pleno-agenda'

/**
 * La fase de archivo de `scrape:pleno-agendas` no tenía tope y se pagaba
 * entera cada noche: regmeet.com bloquea las IP de los runners desde
 * agosto, así que las 26 sesiones sin orden del día caen TODAS en la Wayback
 * Machine, a 30 s de CDX + 60 s de captura cada una, y casi todas vuelven con
 * 0 puntos porque el archivo no las tiene. Medido: 5–6 minutos por noche,
 * desde el 12-09 hasta el 22-09 sin excepción, para no avanzar nada — y ese
 * tiempo salía del mismo presupuesto de 22 minutos que agotó la nocturna
 * cuatro de las nueve últimas noches.
 *
 * El presupuesto se comprueba ANTES de cada consulta, y una sesión que se
 * queda sin consultar se cuenta aparte de una consultada que falló: son dos
 * hechos distintos (regla 2 de DATA_INTEGRITY), y doblar «sin intentar» dentro
 * de «falló» es como una pasada informa de trabajo que no hizo.
 */
describe('pleno-agenda — presupuesto de tiempo para el archivo', () => {
  function reloj() {
    let t = 0
    return { now: () => t, avanzar: (ms: number) => void (t += ms) }
  }

  it('deja consultar mientras queda presupuesto y cuenta lo gastado por consulta', async () => {
    const r = reloj()
    const p = crearPresupuestoArchivo(100, r.now)
    expect(p.puedeIntentar()).toBe(true)
    await p.medir(async () => r.avanzar(60))
    expect(p.gastadoMs).toBe(60)
    expect(p.puedeIntentar()).toBe(true)
    expect(p.noIntentadas).toBe(0)
  })

  it('una consulta en curso termina aunque se pase; la siguiente ya no se intenta', async () => {
    const r = reloj()
    const p = crearPresupuestoArchivo(100, r.now)
    await p.medir(async () => r.avanzar(60))
    await p.medir(async () => r.avanzar(90))
    expect(p.gastadoMs).toBe(150)
    expect(p.puedeIntentar()).toBe(false)
    expect(p.puedeIntentar()).toBe(false)
    expect(p.noIntentadas).toBe(2)
  })

  it('cuenta lo gastado también cuando la consulta falla', async () => {
    const r = reloj()
    const p = crearPresupuestoArchivo(100, r.now)
    await expect(
      p.medir(async () => {
        r.avanzar(120)
        throw new Error('timeout')
      }),
    ).rejects.toThrow('timeout')
    expect(p.gastadoMs).toBe(120)
    expect(p.puedeIntentar()).toBe(false)
  })
})
