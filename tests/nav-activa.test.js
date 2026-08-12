/**
 * La miga de pan decía «Panel» en todas las páginas del sitio.
 *
 * `NAV.find((n) => pathname.startsWith(n.to))` con `/` como primera entrada:
 * toda ruta empieza por `/`, así que la primera coincidencia era siempre la
 * misma. Un rótulo que existe, se lee y es falso, y ninguna suite lo cazaba
 * porque ninguna leía la miga. Este fichero la lee.
 */
import { describe, it, expect } from 'vitest'
import { NAV, NAV_SECONDARY, entradaNavActiva } from '../src/nav'

describe('nav — entradaNavActiva', () => {
  it('NO devuelve el panel para una ruta interior', () => {
    // El reproductor exacto del fallo.
    expect(NAV[0].to).toBe('/')
    for (const ruta of ['/cargos', '/presupuesto', '/quejas', '/laboratorio']) {
      expect(entradaNavActiva(ruta).to).not.toBe('/')
    }
  })

  it('devuelve el panel sólo en la raíz', () => {
    expect(entradaNavActiva('/').to).toBe('/')
  })

  it('elige la coincidencia más específica', () => {
    // Sin esto /laboratorio/frontera diría «Laboratorio»: cierto, y no lo que
    // el lector necesita.
    expect(entradaNavActiva('/laboratorio').to).toBe('/laboratorio')
    expect(entradaNavActiva('/laboratorio/frontera').to).toBe('/laboratorio/frontera')
  })

  it('sube al padre en las rutas con parámetro', () => {
    expect(entradaNavActiva('/cargos/juan-perez').to).toBe('/cargos')
    expect(entradaNavActiva('/plenos/2026-03-27').to).toBe('/plenos')
    expect(entradaNavActiva('/quejas/dashboard').to).toBe('/quejas')
  })

  it('respeta la frontera de segmento', () => {
    // `/cargos` no puede rotular `/cargos-de-otro`.
    expect(entradaNavActiva('/cargos-publicos')).toBeNull()
    expect(entradaNavActiva('/presupuestos')).toBeNull()
  })

  it('rotula también las páginas del contrato editorial', () => {
    expect(entradaNavActiva('/metodologia').to).toBe('/metodologia')
    expect(entradaNavActiva('/aviso-legal').to).toBe('/aviso-legal')
  })

  it('devuelve null en una ruta que no está en la navegación', () => {
    expect(entradaNavActiva('/no-existe')).toBeNull()
  })

  it('cada entrada rotulable trae su clave de traducción', () => {
    let revisadas = 0
    for (const n of [...NAV, ...NAV_SECONDARY]) {
      expect(n.labelKey, `${n.to} necesita labelKey para la miga`).toBeTruthy()
      revisadas++
    }
    expect(revisadas).toBeGreaterThan(15)
  })

  it('resuelve toda entrada de navegación a sí misma', () => {
    // Si una entrada no se resolviese a sí misma, su propia página llevaría el
    // rótulo de otra.
    let comprobadas = 0
    for (const n of [...NAV, ...NAV_SECONDARY]) {
      expect(entradaNavActiva(n.to)?.to, `${n.to} no se rotula a sí misma`).toBe(n.to)
      comprobadas++
    }
    expect(comprobadas).toBeGreaterThan(15)
  })
})

describe('nav — sin campos que no lee nadie', () => {
  it('ninguna entrada arrastra un `shortcut`', () => {
    // El campo estuvo en las 20 entradas sin que un solo módulo de src/ lo
    // leyera, con dos valores duplicados que nadie podía notar porque no hacían
    // nada. Una tabla inerte que aparenta ser funcional es peor que no tenerla:
    // el siguiente que la lea creerá que los atajos existen.
    let revisadas = 0
    for (const n of [...NAV, ...NAV_SECONDARY]) {
      expect(n, `${n.to} no debe declarar atajos que no implementa nadie`).not.toHaveProperty(
        'shortcut',
      )
      revisadas++
    }
    expect(revisadas).toBeGreaterThan(15)
  })
})
