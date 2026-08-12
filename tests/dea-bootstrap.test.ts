/**
 * El bootstrap es lo que impide que la página publique «Riba-roja está al
 * 78 %» como si fuera una medición. θ̂ está sesgado hacia arriba por
 * construcción —la frontera estimada cae por dentro de la verdadera, así que
 * todo el mundo parece mejor de lo que es— y sin intervalo no hay forma de que
 * un lector sepa si 0,78 y 0,84 son dos números distintos.
 */
import { describe, it, expect } from 'vitest'
import { bootstrapDea, anchoBanda, RAZON_SESGO_MINIMA } from '../src/scraper/dea-bootstrap'
import { resolverDea, type Dmu } from '../src/scraper/dea'
import { crearPrng } from '../src/scraper/prng'

/** Veinte unidades con una entrada y dos salidas, generadas con semilla fija. */
function muestra(): Dmu[] {
  const p = crearPrng('muestra-bootstrap')
  return Array.from({ length: 20 }, (_, i) => {
    const escala = 1 + p.siguiente() * 3
    // Ineficiencia multiplicativa: cada unidad gasta entre 1,0 y 1,6 veces lo
    // que le haría falta, así que la frontera verdadera existe y es conocida.
    const derroche = 1 + p.siguiente() * 0.6
    return {
      id: `u${String(i).padStart(2, '0')}`,
      entradas: [100 * escala * derroche],
      salidas: [
        50 * escala * (0.8 + p.siguiente() * 0.4),
        30 * escala * (0.8 + p.siguiente() * 0.4),
      ],
    }
  })
}

const DMUS = muestra()
const OPTS = { replicas: 200, semilla: 'prueba' } as const

describe('scraper/dea-bootstrap', () => {
  it('devuelve exactamente lo mismo con la misma semilla', () => {
    const a = bootstrapDea(DMUS, 'vrs', OPTS)
    const b = bootstrapDea(DMUS, 'vrs', OPTS)
    expect(a.puntuaciones.map((p) => p.thetaCorregido)).toEqual(
      b.puntuaciones.map((p) => p.thetaCorregido),
    )
    expect(a.banda).toBe(b.banda)
  })

  it('devuelve algo distinto con otra semilla, o no estaría remuestreando', () => {
    const a = bootstrapDea(DMUS, 'vrs', OPTS)
    const b = bootstrapDea(DMUS, 'vrs', { ...OPTS, semilla: 'otra' })
    expect(a.puntuaciones.map((p) => p.thetaCorregido)).not.toEqual(
      b.puntuaciones.map((p) => p.thetaCorregido),
    )
    // …pero parecido: dos tiradas del mismo estimador, no dos estimadores.
    for (let i = 0; i < a.puntuaciones.length; i++) {
      expect(a.puntuaciones[i].thetaCorregido).toBeCloseTo(b.puntuaciones[i].thetaCorregido, 1)
    }
  })

  it('conserva el θ̂ original junto al corregido', () => {
    const base = resolverDea(DMUS, 'vrs')
    const boot = bootstrapDea(DMUS, 'vrs', OPTS)
    for (const p of boot.puntuaciones) {
      const original = base.puntuaciones.find((x) => x.id === p.id)!
      expect(p.theta).toBeCloseTo(original.theta!, 8)
    }
  })

  it('corrige siempre a la baja: θ̂ sobreestima la eficiencia', () => {
    const boot = bootstrapDea(DMUS, 'vrs', OPTS)
    let comprobadas = 0
    for (const p of boot.puntuaciones) {
      expect(p.sesgo).toBeGreaterThanOrEqual(0)
      expect(p.thetaCorregido).toBeLessThanOrEqual(p.theta + 1e-12)
      expect(p.thetaCorregido).toBeGreaterThan(0)
      comprobadas++
    }
    expect(comprobadas).toBe(DMUS.length)
  })

  it('baja de 1 a las unidades que la frontera muestral daba por insuperables', () => {
    // Es el resultado que más le cuesta creer a quien lee la página: ni siquiera
    // las unidades de la frontera están en la frontera. Con 20 observaciones,
    // ser insuperable en la muestra es sobre todo una propiedad de la muestra.
    const base = resolverDea(DMUS, 'vrs')
    const eficientes = base.puntuaciones.filter((p) => p.theta! >= 1 - 1e-7).map((p) => p.id)
    expect(eficientes.length).toBeGreaterThan(0)
    const boot = bootstrapDea(DMUS, 'vrs', OPTS)
    for (const id of eficientes) {
      const p = boot.puntuaciones.find((x) => x.id === id)!
      expect(p.thetaCorregido).toBeLessThan(1)
    }
  })

  it('da un intervalo ordenado y dentro del rango posible', () => {
    const boot = bootstrapDea(DMUS, 'vrs', OPTS)
    let comprobados = 0
    for (const p of boot.puntuaciones) {
      expect(p.ic.inferior).toBeLessThanOrEqual(p.ic.superior)
      expect(p.ic.inferior).toBeGreaterThan(0)
      expect(p.ic.superior).toBeLessThanOrEqual(1 + 1e-9)
      expect(p.ic.alfa).toBeCloseTo(0.05, 8)
      comprobados++
    }
    expect(comprobados).toBe(DMUS.length)
  })

  it('estrecha el intervalo al subir el nivel de confianza… al revés', () => {
    // α mayor = confianza menor = intervalo más estrecho.
    const estrecho = bootstrapDea(DMUS, 'vrs', { ...OPTS, alfa: 0.2 })
    const ancho = bootstrapDea(DMUS, 'vrs', { ...OPTS, alfa: 0.01 })
    let comparados = 0
    for (let i = 0; i < estrecho.puntuaciones.length; i++) {
      const e = estrecho.puntuaciones[i].ic
      const a = ancho.puntuaciones[i].ic
      expect(e.superior - e.inferior).toBeLessThanOrEqual(a.superior - a.inferior + 1e-9)
      comparados++
    }
    expect(comparados).toBe(DMUS.length)
  })

  it('publica la razón sesgo/error y si la corrección está recomendada', () => {
    const boot = bootstrapDea(DMUS, 'vrs', OPTS)
    for (const p of boot.puntuaciones) {
      expect(p.errorEstandar).toBeGreaterThan(0)
      expect(p.razonSesgo).toBeCloseTo(Math.abs(p.sesgo) / p.errorEstandar, 8)
      expect(p.correccionRecomendada).toBe(p.razonSesgo > RAZON_SESGO_MINIMA)
    }
    expect(RAZON_SESGO_MINIMA).toBeCloseTo(1 / 3, 8)
  })

  it('cuenta las réplicas que no se pudieron resolver en vez de tragárselas', () => {
    const boot = bootstrapDea(DMUS, 'vrs', OPTS)
    expect(boot.replicas).toBe(200)
    expect(boot.replicasResueltas).toBe(200)
    expect(boot.replicasFallidas).toBe(0)
    // Una pasada tiene que demostrar que trabajó: réplicas resueltas × unidades.
    expect(boot.lpsResueltos).toBe(200 * DMUS.length)
  })

  it('calcula el ancho de banda por la regla de Silverman', () => {
    // h = 0,9 · min(σ, IQR/1,349) · n^(−1/5).
    const xs = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.0, 1.0]
    const media = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / (xs.length - 1))
    expect(anchoBanda(xs)).toBeLessThanOrEqual(0.9 * sd * xs.length ** (-1 / 5) + 1e-12)
    expect(anchoBanda(xs)).toBeGreaterThan(0)
  })

  it('no devuelve banda cero cuando todas las unidades son eficientes', () => {
    // σ = 0 e IQR = 0: sin guarda, el suavizado desaparece y el bootstrap
    // devolvería intervalo nulo, que se leería como certeza absoluta.
    expect(anchoBanda([1, 1, 1, 1, 1])).toBeGreaterThan(0)
  })

  it('funciona igual con rendimientos constantes', () => {
    const boot = bootstrapDea(DMUS, 'crs', OPTS)
    expect(boot.puntuaciones).toHaveLength(DMUS.length)
    for (const p of boot.puntuaciones) expect(p.thetaCorregido).toBeLessThanOrEqual(p.theta + 1e-12)
  })
})
