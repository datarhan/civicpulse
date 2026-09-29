import { describe, it, expect } from 'vitest'
import { decidirRederivacion } from '../../src/scraper/decision-del-motor'

/**
 * `verify:pleno-claims:engine -- --ids <fichero>` vuelve a juzgar retractaciones
 * del motor que ya están publicadas, para cambiar un resumen que no explicaba
 * el veredicto (src/lib/resumenes-retirados.js). Sólo puede reescribir la
 * explicación de una retractación que el modelo sostiene: el veredicto nunca
 * sube por una vía automática (DATA_INTEGRITY, regla 4), y lo que no se juzgó
 * no se escribe (regla 2).
 */
describe('decidirRederivacion', () => {
  it('reescribe cuando el modelo juzgó y sigue sin ver respaldo', () => {
    expect(decidirRederivacion({ juzgada: true, veredicto: 'sin-datos' })).toEqual({
      accion: 'reescribir',
    })
  })

  it('no sube: si ahora ve respaldo, la retractación se queda y la mira un curador', () => {
    for (const veredicto of ['verificado', 'parcial'] as const) {
      expect(decidirRederivacion({ juzgada: true, veredicto })).toEqual({
        accion: 'dejar',
        motivo: 'ya-no-la-retractaria',
      })
    }
  })

  it('sin juicio no hay nada que escribir, diga lo que diga el veredicto que vuelve', () => {
    // Sin candidatos el motor devuelve el veredicto determinista, que para
    // estas filas suele ser `sin-datos`: parecería una retractación sostenida.
    for (const veredicto of ['sin-datos', 'verificado'] as const) {
      expect(decidirRederivacion({ juzgada: false, veredicto })).toEqual({
        accion: 'dejar',
        motivo: 'no-la-juzgo',
      })
    }
  })
})
