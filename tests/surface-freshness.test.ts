import { describe, it, expect } from 'vitest'
import { medirFrescura, parteFrescura, DIAS_FRESCURA } from '../src/scraper/surface-freshness'
import type { ReaderFinding } from '../src/scraper/reader-review'

const AHORA = new Date('2026-08-13T09:00:00Z')
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString()
const señalamiento: ReaderFinding = {
  quote: 'La mayoría los redacta un proceso automático',
  inference: 'que una parte apreciable llevó criterio humano',
  contradictedBy: '40 de 41 las firma una máquina',
  severity: 'misleading',
}

describe('frescura de superficies', () => {
  it('una ruta leída hoy y sin señalamientos no dice nada', () => {
    const f = medirFrescura(
      ['/plenos'],
      { '/plenos': { hash: 'a', findings: [], at: haceDias(0) } },
      AHORA,
    )
    expect(f.sinLeer).toEqual([])
    expect(f.rancias).toEqual([])
    expect(parteFrescura(f)).toBeNull()
  })

  it('una caché vacía dice que NO SE HA LEÍDO NADA, nunca que está limpio', () => {
    // La mitad que importa. Si borrar el fichero dejara esto en verde, el
    // control valdría exactamente cero — y es el modo de fallo que este repo
    // ya ha pagado tres veces.
    const f = medirFrescura(['/plenos', '/quejas'], {}, AHORA)
    expect(f.sinLeer).toHaveLength(2)
    expect(parteFrescura(f)).toMatch(/NINGUNA de las 2 rutas se ha revisado nunca/)
  })

  it('el formato viejo sin fecha cuenta como nunca leída', () => {
    // `readCacheEntry` acepta una cadena suelta con el hash, que no trae `at`.
    // Darla por fresca convertiría una caché heredada en un parte de
    // todo-en-orden sobre páginas que nadie ha mirado.
    const f = medirFrescura(['/plenos'], { '/plenos': 'hash-viejo' }, AHORA)
    expect(f.sinLeer).toHaveLength(1)
    expect(f.rutas[0].at).toBeNull()
  })

  it('marca rancia la que pasa del plazo, y no la que no', () => {
    const cache = {
      '/a': { hash: 'x', findings: [], at: haceDias(DIAS_FRESCURA + 1) },
      '/b': { hash: 'y', findings: [], at: haceDias(DIAS_FRESCURA - 1) },
    }
    const f = medirFrescura(['/a', '/b'], cache, AHORA)
    expect(f.rancias.map((e) => e.route)).toEqual(['/a'])
    expect(parteFrescura(f)).toMatch(/1 ruta\(s\) sin leer desde hace más de 3 días/)
  })

  it('un señalamiento vivo se reporta aunque la revisión sea de hoy', () => {
    // Un defecto no caduca porque el reloj corra: la página cambió o no. La
    // caché guarda los señalamientos junto al hash justo para esto.
    const f = medirFrescura(
      ['/hallazgos'],
      { '/hallazgos': { hash: 'a', findings: [señalamiento], at: haceDias(0) } },
      AHORA,
    )
    expect(f.senalamientos).toBe(1)
    expect(parteFrescura(f)).toMatch(/1 señalamiento\(s\) vivo\(s\).*\/hallazgos/)
  })

  it('no se calla cuando no le han pedido nada', () => {
    // Cero rutas y un parte en blanco serían indistinguibles de un sitio sano.
    expect(parteFrescura(medirFrescura([], {}, AHORA))).toMatch(/no se ha medido nada/)
  })

  it('una ruta que no está en la caché no arrastra la de otra', () => {
    // Control de que se mide POR RUTA: sin él, un `medirFrescura` que mirase
    // sólo la primera entrada pasaría casi todo lo de arriba.
    const cache = { '/a': { hash: 'x', findings: [señalamiento], at: haceDias(0) } }
    const f = medirFrescura(['/a', '/b'], cache, AHORA)
    expect(f.conSenalamientos.map((e) => e.route)).toEqual(['/a'])
    expect(f.sinLeer.map((e) => e.route)).toEqual(['/b'])
  })
})
