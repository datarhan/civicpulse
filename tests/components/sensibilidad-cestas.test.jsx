import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'

import {
  AvisoCestas,
  ClasificacionSinNota,
  MedicionCestas,
  RankingNoScore,
} from '../../src/components/frontera/SensibilidadCestas'
import { sensibilidadCestas } from '../../src/scraper/dea-sensibilidad'

/**
 * Las cuatro frases que cuentan cuánto mueve la cesta la puntuación de
 * Riba-roja. Decían «media escala» en /metodologia, /nosotros y /about
 * —«across half the scale» en inglés— sobre un dea.json que nunca dio más que
 * 0,43 frente a 0,53. Ahora salen del dato; aquí se prueba que cada forma del
 * dato da una frase cierta, y que sin dato no se afirma ningún movimiento.
 */

const texto = (el) => render(el).container.textContent.replace(/\s+/g, ' ').trim()

/** La forma del snapshot publicado: cuatro cestas, dos con puntuación. */
const HOY = {
  probadas: 4,
  conPuntuacion: 2,
  theta: { min: 0.42648676586998324, max: 0.5277107886707897, cambia: true },
  puestos: { movimiento: 6, de: 24, pares: 1 },
}
const SIN_DATOS = sensibilidadCestas(undefined)
const UNA = { probadas: 4, conPuntuacion: 1, theta: null, puestos: null }

describe('con la forma del snapshot de hoy', () => {
  it('/laboratorio/frontera avisa de qué se mueve, sin adelantar ninguna cifra', () => {
    const t = texto(<AvisoCestas s={HOY} />)
    expect(t).toBe(
      ', y con la misma fuente otra cesta de servicios igual de defendible cambia la puntuación de Riba-roja y su puesto entre los comparables',
    )
    // La regla 1 de la página: ninguna puntuación antes que la medición de la
    // declaración, y esto va encima de ella.
    expect(t).not.toMatch(/\d/)
  })

  it('/metodologia da la medición entera', () => {
    expect(texto(<MedicionCestas s={HOY} />)).toBe(
      'Con la misma fuente probamos cuatro cestas de servicios: dos no llegan a dar puntuación, y entre las dos que sí, la distancia de Riba-roja a la frontera va de 0,43 a 0,53 según la cesta y el municipio se mueve seis puestos en una clasificación de 24.',
    )
  })

  it('/nosotros da cuánto se mueve, nunca dónde está', () => {
    const { container } = render(<ClasificacionSinNota s={HOY} />)
    const t = container.textContent.replace(/\s+/g, ' ')
    expect(t).toContain(
      'basta cambiar qué servicios entran en la comparación para que Riba-roja se mueva seis puestos en una clasificación de 24 municipios',
    )
    // Esta página dice que no publica una nota: ni θ ni la posición.
    expect(t).not.toMatch(/0,\d\d|por debajo|%/)
    expect(container.querySelector('a').getAttribute('href')).toBe('/laboratorio/frontera')
  })

  it('/about, en inglés', () => {
    expect(texto(<RankingNoScore s={HOY} />)).toBe(
      'On the same data, changing which services enter the comparison moves Riba-roja six places in a ranking of 24 municipalities, so a score would say more about our choices than about the town.',
    )
  })
})

describe('sin dato —cargando, error— ninguna frase afirma un movimiento', () => {
  it('la advertencia se queda en la frase que no depende de nada', () => {
    expect(texto(<AvisoCestas s={SIN_DATOS} />)).toBe('')
  })

  it('/metodologia no dice nada que no pueda contar', () => {
    expect(texto(<MedicionCestas s={SIN_DATOS} />)).toBe('')
  })

  it('/nosotros y /about caen a la frase sin cifras, y no dicen «lo hemos medido»', () => {
    const es = texto(<ClasificacionSinNota s={SIN_DATOS} />)
    expect(es).toBe(
      'Una puntuación así depende de decisiones nuestras, como qué servicios entran en la comparación, y en el laboratorio publicamos cuánto.',
    )
    const en = texto(<RankingNoScore s={SIN_DATOS} />)
    expect(en).toBe(
      'Such a score depends on choices we make, such as which services enter the comparison, and our lab publishes by how much.',
    )
    for (const t of [es, en]) expect(t).not.toMatch(/\d|medido|measured/)
  })
})

describe('otras formas del dato', () => {
  it('una sola cesta con puntuación: no hay recorrido que contar', () => {
    expect(texto(<MedicionCestas s={UNA} />)).toBe(
      'Con la misma fuente probamos cuatro cestas de servicios y sólo una llega a dar puntuación, así que no hay dos que comparar.',
    )
    expect(texto(<AvisoCestas s={UNA} />)).toBe('')
    expect(texto(<ClasificacionSinNota s={UNA} />)).toMatch(/^Una puntuación así depende/)
    expect(texto(<RankingNoScore s={UNA} />)).toMatch(/^Such a score depends/)
  })

  it('ninguna con puntuación', () => {
    expect(texto(<MedicionCestas s={{ ...UNA, conPuntuacion: 0 }} />)).toBe(
      'Con la misma fuente probamos cuatro cestas de servicios y ninguna llega a dar puntuación, así que no hay dos que comparar.',
    )
  })

  it('todas con puntuación, sin clasificación común', () => {
    const s = { ...HOY, conPuntuacion: 4, puestos: null }
    expect(texto(<MedicionCestas s={s} />)).toBe(
      'Con la misma fuente probamos cuatro cestas de servicios, y todas dan puntuación: entre ellas la distancia de Riba-roja a la frontera va de 0,43 a 0,53 según la cesta.',
    )
    // Sin clasificación común no hay puestos que dar, y /nosotros no inventa
    // un movimiento: dice que depende y remite al laboratorio.
    expect(texto(<ClasificacionSinNota s={s} />)).toMatch(/^Una puntuación así depende/)
    expect(texto(<AvisoCestas s={s} />)).toMatch(/cambia la puntuación de Riba-roja$/)
  })

  it('la misma θ impresa en las dos: no se anuncia un cambio que no se ve', () => {
    const s = { ...HOY, theta: { min: 0.5298, max: 0.5301, cambia: false } }
    expect(texto(<MedicionCestas s={s} />)).toBe(
      'Con la misma fuente probamos cuatro cestas de servicios: dos no llegan a dar puntuación, y entre las dos que sí, la distancia de Riba-roja a la frontera es 0,53 en las dos y el municipio se mueve seis puestos en una clasificación de 24.',
    )
    expect(texto(<AvisoCestas s={s} />)).toMatch(
      /cambia el puesto de Riba-roja entre los comparables$/,
    )
  })

  it('un puesto, en singular; y «hasta» cuando hay más de una pareja comparable', () => {
    const uno = { ...HOY, puestos: { movimiento: 1, de: 24, pares: 1 } }
    expect(texto(<ClasificacionSinNota s={uno} />)).toContain('se mueva un puesto en')
    expect(texto(<RankingNoScore s={uno} />)).toContain('moves Riba-roja one place in')
    const varias = { ...HOY, puestos: { movimiento: 12, de: 24, pares: 3 } }
    expect(texto(<ClasificacionSinNota s={varias} />)).toContain('se mueva hasta 12 puestos en')
    expect(texto(<RankingNoScore s={varias} />)).toContain('moves Riba-roja up to 12 places in')
  })
})

describe('las páginas ya no escriben la cifra a mano', () => {
  // Quitando comentarios: los que explican el defecto lo citan.
  const sinComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const PAGINAS = [
    'src/pages/Metodologia.jsx',
    'src/pages/Nosotros.jsx',
    'src/pages/About.jsx',
    'src/pages/Frontera.jsx',
  ]

  it.each(PAGINAS)('%s no afirma a mano cuánto mueve la cesta', (ruta) => {
    const src = sinComentarios(readFileSync(ruta, 'utf8'))
    expect(src).not.toMatch(/media escala|half the scale|punta de la escala|cuatro resultados/i)
  })

  it.each(PAGINAS)('%s pinta la frase derivada', (ruta) => {
    const src = sinComentarios(readFileSync(ruta, 'utf8'))
    expect(src).toMatch(/<(AvisoCestas|MedicionCestas|ClasificacionSinNota|RankingNoScore)\b/)
  })
})
