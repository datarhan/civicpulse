import { describe, it, expect, vi } from 'vitest'
import { recuperarTrasDespliegue, CLAVE } from '../src/lib/preload-recovery'

/**
 * Tras un despliegue, la pestaña que pide un trozo de JS que ya no existe se
 * recarga UNA vez; la segunda, el error sigue su curso hasta `ErrorBoundary`.
 * Recargar en bucle sería peor que la página en blanco.
 */

function ventanaFalsa({ almacen = true } = {}) {
  const destino = new EventTarget()
  const datos = new Map()
  return {
    addEventListener: destino.addEventListener.bind(destino),
    disparar() {
      const e = new Event('vite:preloadError', { cancelable: true })
      destino.dispatchEvent(e)
      return e
    },
    sessionStorage: almacen
      ? {
          getItem: (k) => datos.get(k) ?? null,
          setItem: (k, v) => datos.set(k, v),
        }
      : {
          getItem: () => {
            throw new Error('SecurityError')
          },
          setItem: () => {
            throw new Error('SecurityError')
          },
        },
    location: { reload: vi.fn() },
    datos,
  }
}

describe('recuperarTrasDespliegue', () => {
  it('el primer fallo de carga recarga la pestaña y se queda con el evento', () => {
    const v = ventanaFalsa()
    recuperarTrasDespliegue(v, () => 1_000_000)
    const e = v.disparar()
    expect(v.location.reload).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
    expect(v.datos.get(CLAVE)).toBe('1000000')
  })

  it('si vuelve a fallar enseguida no recarga otra vez: el error sigue hasta el límite de error', () => {
    const v = ventanaFalsa()
    let t = 1_000_000
    recuperarTrasDespliegue(v, () => t)
    v.disparar()
    t += 5_000
    const segundo = v.disparar()
    expect(v.location.reload).toHaveBeenCalledTimes(1)
    expect(segundo.defaultPrevented).toBe(false)
  })

  it('pasado el margen, un despliegue posterior vuelve a poder recargar', () => {
    const v = ventanaFalsa()
    let t = 1_000_000
    recuperarTrasDespliegue(v, () => t)
    v.disparar()
    t += 61_000
    v.disparar()
    expect(v.location.reload).toHaveBeenCalledTimes(2)
  })

  it('sin sessionStorage no se arriesga a un bucle: no recarga', () => {
    const v = ventanaFalsa({ almacen: false })
    recuperarTrasDespliegue(v, () => 1_000_000)
    const e = v.disparar()
    expect(v.location.reload).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  })
})
