import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'

import {
  EspecificacionCard,
  crudaFueraDelIntervalo,
} from '../../src/components/frontera/EspecificacionCard'

/**
 * Dos cifras ciertas que el lector no podía cuadrar.
 *
 * La tarjeta principal de /laboratorio/frontera pone «Distancia a la frontera
 * 0,528» y al lado «Intervalo al 95 % 0,28 – 0,52»: la cifra queda fuera de su
 * propio intervalo. Las dos están bien. El intervalo es el de la distancia
 * CORREGIDA por sesgo (0,453, que sí cae dentro); la cruda sale siempre por
 * arriba, porque una frontera estimada cae por dentro de la verdadera. La
 * tarjeta no lo decía, y el puente se publica ahora derivado y condicional: si
 * un día la cruda cae dentro, la frase desaparece sola.
 */

const DEA = JSON.parse(readFileSync('public/data/dea.json', 'utf8'))

const cesta = ({ theta, corregida, inferior, superior, acota = true }) => ({
  id: 'prueba',
  titulo: 'Cesta de prueba',
  porQue: 'Una cesta para probar cómo se explica el intervalo junto a la cifra cruda.',
  estado: 'publicada',
  motivoEstado: null,
  cobertura: { banda: 56, incluidas: 24, excluidas: {} },
  gradosLibertad: { n: 24, salidas: 3, minimo: 12, cumple: true },
  bootstrap: { replicas: 2000 },
  propia: {
    theta,
    thetaCorregido: corregida,
    ic: { inferior, superior, alfa: 0.05 },
    intervaloAcotaPorAbajo: acota,
    referencias: 3,
    percentil: 16.7,
  },
  distribucion: {
    n: 24,
    eficientes: 9,
    autorreferentes: 0,
    histograma: [{ desde: 0.9, hasta: 1, n: 24 }],
  },
})

const texto = (e) => render(<EspecificacionCard e={e} />).container.textContent.replace(/\s+/g, ' ')

describe('EspecificacionCard · la cifra cruda y su intervalo', () => {
  it('cuando la cruda queda fuera, lo dice con las dos cifras', () => {
    const t = texto(cesta({ theta: 0.5277, corregida: 0.4527, inferior: 0.2832, superior: 0.5238 }))
    expect(t).toContain(
      'El intervalo al 95 % es el de la distancia corregida por sesgo (0,453), así que la cruda, 0,528, queda por encima de él.',
    )
  })

  it('el intervalo dice siempre de qué distancia es', () => {
    const t = texto(cesta({ theta: 0.5, corregida: 0.45, inferior: 0.3, superior: 0.6 }))
    // El número de réplicas va con el formato del ICU de cada máquina (la CI ya
    // escribió cifras de otro modo que el portátil): se ancla la parte fija.
    expect(t).toMatch(/de la distancia corregida · [\d.]+ réplicas/)
  })

  it('cuando la cruda cae dentro, no hay puente que tender', () => {
    const t = texto(cesta({ theta: 0.5, corregida: 0.45, inferior: 0.3, superior: 0.6 }))
    expect(t).not.toContain('queda por encima')
    expect(t).not.toContain('queda por debajo')
  })

  it('se compara lo que se IMPRIME: θ con tres decimales, el intervalo con dos', () => {
    // 0,5236 dentro de [.., 0,5238] en crudo, pero el lector lee «0,524» junto a
    // «0,52»: para él está fuera, y es a él a quien hay que explicárselo.
    expect(
      crudaFueraDelIntervalo({
        theta: 0.5236,
        ic: { inferior: 0.28, superior: 0.5238 },
        intervaloAcotaPorAbajo: true,
      }),
    ).toBe('por encima')
    expect(
      crudaFueraDelIntervalo({
        theta: 0.52,
        ic: { inferior: 0.28, superior: 0.5238 },
        intervaloAcotaPorAbajo: true,
      }),
    ).toBeNull()
    // Sin cota inferior no hay «por debajo» que afirmar.
    expect(
      crudaFueraDelIntervalo({
        theta: 0.1,
        ic: { inferior: 0.28, superior: 0.6 },
        intervaloAcotaPorAbajo: false,
      }),
    ).toBeNull()
  })

  it('el snapshot publicado: la premisa MEDIDA y el puente donde toca', () => {
    const conCifra = DEA.especificaciones.filter((e) => e.estado === 'publicada' && e.propia)
    expect(conCifra.length, 'dea.json no trae cestas con puntuación').toBeGreaterThan(0)
    const fuera = conCifra.filter((e) => crudaFueraDelIntervalo(e.propia))
    // La premisa: hoy la cruda cae fuera de su intervalo en alguna cesta. Si
    // esto deja de cumplirse, el puente ya no se pinta en ninguna: mira la
    // página antes de dar por buena la tarjeta.
    expect(fuera.length, 'ninguna cruda cae hoy fuera de su intervalo').toBeGreaterThan(0)
    for (const e of conCifra) {
      const t = texto(e)
      expect(t.includes('así que la cruda'), e.id).toBe(fuera.includes(e))
    }
  })
})
