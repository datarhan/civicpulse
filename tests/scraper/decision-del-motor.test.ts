import { describe, it, expect } from 'vitest'
import {
  decidirRederivacion,
  decidirRetractacion,
  anotarEnElParte,
} from '../../src/scraper/decision-del-motor'
import { startRun, NO_LLM_STATS } from '../../src/scraper/run-manifest'

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

/**
 * La pasada normal (y `--base`): retractar a `sin-datos` lo que el modelo juzga
 * sin respaldo. El 24-06-2026 se escribieron como «verdict-engine re-judged»
 * declaraciones que el modelo nunca vio: sin candidatos, el verificador devuelve
 * el veredicto del determinista, que para ellas es `sin-datos`, y la rama de
 * retractar lo leía antes de mirar si hubo juicio (DATA_INTEGRITY, regla 2).
 */
describe('decidirRetractacion', () => {
  it('sin juicio no se retracta, aunque lo que vuelve sea el sin-datos del determinista', () => {
    for (const salto of [
      'sin-candidatos',
      'fuera-de-la-politica',
      'decidio-el-determinista',
    ] as const) {
      for (const publicado of ['verificado', 'parcial'] as const) {
        expect(decidirRetractacion({ salto, veredicto: 'sin-datos', publicado })).toEqual({
          accion: 'dejar',
          porque: salto,
        })
      }
    }
  })

  it('retracta cuando el modelo juzgó sin-datos lo que se publica como verificado o parcial', () => {
    for (const publicado of ['verificado', 'parcial'] as const) {
      expect(decidirRetractacion({ salto: undefined, veredicto: 'sin-datos', publicado })).toEqual({
        accion: 'retractar',
      })
    }
  })

  it('mantiene lo que el modelo sí ve respaldado: esta vía nunca sube ni confirma', () => {
    for (const veredicto of ['verificado', 'parcial'] as const) {
      expect(decidirRetractacion({ salto: undefined, veredicto, publicado: 'verificado' })).toEqual(
        { accion: 'mantener' },
      )
    }
  })

  it('no hay nada que retractar en lo que ya se publica como sin-datos', () => {
    expect(
      decidirRetractacion({ salto: undefined, veredicto: 'sin-datos', publicado: 'sin-datos' }),
    ).toEqual({ accion: 'mantener' })
  })
})

/**
 * El parte de la pasada: intentadas / juzgadas / nunca intentadas / saltadas con
 * motivo, cada declaración en un solo cubo. «Nunca se le preguntó» sumado a
 * «juzgada» es lo que dejó publicar como retractaciones del modelo las que no
 * había visto; sumado a «sin cambios», lo que ocultó el no-op de 1.017.
 */
describe('anotarEnElParte', () => {
  it('juzgadas, nunca intentadas y saltadas por su motivo, sin que sobre ni falte ninguna', () => {
    const run = startRun('prueba-motor', {
      getStats: () => NO_LLM_STATS,
      now: () => new Date('2026-09-29T12:00:00Z'),
    })
    const saltos = [
      undefined,
      'sin-candidatos',
      undefined,
      'fuera-de-la-politica',
      'sin-candidatos',
      'decidio-el-determinista',
      'sin-candidatos',
    ] as const
    for (const salto of saltos) {
      run.attempt()
      anotarEnElParte(run, salto)
    }
    const { manifest, findings } = run.finish({ write: false })

    expect(manifest.attempted).toBe(7)
    expect(manifest.judged).toBe(2)
    // Sin candidatos es el hueco de la recuperación: nunca se intentó.
    expect(manifest.neverAttempted).toBe(3)
    // Los otros dos no son un hueco, son una decisión, y dicen cuál.
    expect(manifest.skipped).toEqual({
      'fuera de la política del LLM': 1,
      'el determinista ya decidió': 1,
    })
    expect(findings.map((f) => f.code)).not.toContain('unaccounted-items')
  })
})
