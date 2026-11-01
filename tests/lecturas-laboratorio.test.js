/**
 * Las frases de la lectura vecinal del laboratorio. Las de coste esperado y
 * cobertura se prueban sobre los snapshots publicados: lo que importa es que
 * digan lo que dicen los datos de hoy, y que no dejen de decirlo si cambian.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  fraseLabHealth,
  respuestaCosteEsperado,
  fraseCobertura,
} from '../src/lib/lecturas-laboratorio'

const leer = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))

describe('/lab-health · la frase de arriba', () => {
  const fila = (label, tono, dias) => ({ label, tono, horas: dias * 24 })

  it('sin nada atrasado, lo dice, y nombra la más antigua con su plazo', () => {
    const f = fraseLabHealth([fila('A', 'ok', 1), fila('B', 'civic', 192), fila('C', 'ok', 3)])
    expect(f).toBe(
      'Esta página comprueba, cada vez que se abre, los 3 ficheros de datos del sitio: ninguno está desactualizado. El que lleva más tiempo sin cambiar, «B», es de hace 192 días y sigue dentro de su plazo.',
    )
  })

  it('con atrasados, los cuenta por separado y dice si el más viejo pasó su plazo', () => {
    const f = fraseLabHealth([fila('A', 'warn', 9), fila('B', 'crit', 40), fila('C', 'crit', 35)])
    expect(f).toContain('uno está desactualizado y dos llevan sin refrescar')
    expect(f).toContain('«B», es de hace 40 días y ya ha pasado su plazo')
  })

  it('sin filas no hay frase; sin edades, sólo la primera', () => {
    expect(fraseLabHealth([])).toBeNull()
    expect(fraseLabHealth([{ label: 'A', tono: 'crit', horas: NaN }])).toBe(
      'Esta página comprueba, cada vez que se abre, el único fichero de datos del sitio: uno lleva sin refrescar.',
    )
  })
})

describe('/laboratorio/coste-esperado · la respuesta', () => {
  const { especificaciones } = leer('coste-esperado.json')

  it('cuenta, del snapshot publicado, cuántos caen dentro y cuántos no se pueden comparar', () => {
    const comparables = especificaciones.filter((e) => e.estado === 'publicada' && e.propia)
    const fuera = comparables.filter((e) => !e.propia.dentroDeLoEsperado).length
    const sin = especificaciones.length - comparables.length
    expect(comparables.length).toBeGreaterThan(0)
    const r = respuestaCosteEsperado(especificaciones)
    expect(r).toContain(`${comparables.length} servicios que se pueden comparar`)
    if (fuera === 0) expect(r).toContain('cae dentro de la banda')
    else expect(r).toContain(`En ${fuera} de los`)
    if (sin > 1) expect(r).toContain(`Otros ${sin} no se pueden comparar.`)
  })

  it('con alguno fuera de la banda, lo dice primero, con los de dentro al lado', () => {
    const e = (dentro) => ({ estado: 'publicada', propia: { dentroDeLoEsperado: dentro } })
    expect(
      respuestaCosteEsperado([e(false), e(true), e(true), { estado: 'sin-declaracion-propia' }]),
    ).toBe(
      'En 1 de los 3 servicios que se pueden comparar, el gasto de Riba-roja queda fuera de la banda que el modelo espera para un municipio de su población; en los otros 2, dentro. Otro no se puede comparar.',
    )
    expect(respuestaCosteEsperado([{ estado: 'muestra-insuficiente' }])).toBeNull()
  })

  it('no repite la cifra más citable sin su banda: la frase no lleva «veces lo esperado»', () => {
    expect(respuestaCosteEsperado(especificaciones)).not.toMatch(/×|veces/)
  })
})

describe('/laboratorio/cobertura · la frase', () => {
  it('sale del manifiesto publicado, redondeada como la barra', () => {
    const m = leer('pleno-claims/index.json')
    const filas = Object.values(m.totals.cobertura.porTipo)
    const total = filas.reduce((a, v) => a + v.total, 0)
    const conCorpus = filas.reduce((a, v) => a + v.comprobadoSinHallar, 0)
    expect(total).toBeGreaterThan(0)
    expect(fraseCobertura({ total, conCorpus })).toContain(
      `unas ${Math.round((100 * conCorpus) / total)} se han cotejado`,
    )
  })

  it('sin universo no hay frase, en vez de un cero', () => {
    expect(fraseCobertura(null)).toBeNull()
    expect(fraseCobertura({ total: 0, conCorpus: 0 })).toBeNull()
  })
})
