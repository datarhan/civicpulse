import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  magnitudesDe,
  revisarMagnitudes,
  formasDe,
  PALABRAS_DE_EJECUCION,
  PALABRAS_DE_PREVISION,
  VENTANA,
} from '../src/scraper/magnitudes-fiscales'

/**
 * La misma confusión, siete veces el mismo día (5-09-2026): llamar «gastado» a
 * un crédito presupuestario. Dos titulares de /presupuesto, dos textos de
 * /gestion, un reportaje, la tira de la portada y la ficha del propio revisor.
 *
 * Las cifras salen de los snapshots publicados, no de aquí: si el ejercicio
 * cambia, la prueba mide el ejercicio nuevo.
 */
const M = magnitudesDe(
  JSON.parse(readFileSync('public/data/budget.json', 'utf8')),
  JSON.parse(readFileSync('public/data/budget-execution.json', 'utf8')),
)

describe('las magnitudes se derivan de los snapshots', () => {
  it('separa lo autorizado de lo ejecutado, y sólo una es ejecución', () => {
    const ejec = M.filter((m) => m.esEjecucion)
    expect(ejec).toHaveLength(1)
    expect(ejec[0].clave).toBe('reconocido')
    // Y las que no lo son incluyen las cuatro que la prosa confunde.
    const claves = M.map((m) => m.clave)
    for (const c of ['credito-inicial', 'modificaciones', 'credito-actual', 'conprel'])
      expect(claves, c).toContain(c)
  })

  it('mide algo: hay capítulos y todos son crédito', () => {
    const caps = M.filter((m) => m.clave.startsWith('capitulo-'))
    expect(caps.length).toBeGreaterThan(0)
    expect(caps.every((c) => !c.esEjecucion)).toBe(true)
  })
})

describe('formasDe', () => {
  it('reconoce la agrupada y la compacta con su marca', () => {
    const f = formasDe(41578252.26)
    expect(f).toContain('41.578.252')
    expect(f.some((x) => x.includes('41,58 m€'))).toBe(true)
    expect(f.some((x) => x.includes('41,58 millones'))).toBe(true)
  })

  /**
   * Y NO la compacta suelta. «41,6» aparecería por casualidad en cualquier
   * porcentaje, y esta guarda vale lo que valga su tasa de falsos positivos.
   */
  it('no busca un número corto sin marca', () => {
    expect(formasDe(41578252.26)).not.toContain('41,6')
  })
})

describe('las siete frases de aquel día', () => {
  const avisa = (t: string) => revisarMagnitudes(t, M).length > 0

  it('caza las que calificaban un crédito como gasto', () => {
    expect(
      avisa('cuyo gasto liquidado en todo 2025 fue de 41,58 millones—, sino el año completo'),
    ).toBe(true)
    expect(avisa('la publicación del ministerio y da 41,58 M€ de gasto para 2025')).toBe(true)
    expect(
      avisa('En qué se gasta el dinero público — 41.578.252,26 € repartidos en capítulos'),
    ).toBe(true)
  })

  /**
   * EL CONTROL, y es el que decide si esto se queda puesto: las tres frases YA
   * CORREGIDAS pasan limpias. Sin él, todo lo de arriba pasaría con una guarda
   * que avisara siempre — y una guarda así se apaga en una semana.
   */
  it('y calla sobre las mismas frases, ya arregladas', () => {
    expect(avisa('cuyo crédito de gastos para 2025 era de 41,58 millones')).toBe(false)
    expect(avisa('da 41,58 M€ de CRÉDITO de gastos para 2025')).toBe(false)
    expect(avisa('En qué prevé gastarse el dinero público — 41.578.252,26 €')).toBe(false)
  })

  it('calla sobre prosa fiscal correcta', () => {
    // «Presupuesto DE GASTOS» es la expresión estándar: nombrar el gasto no es
    // afirmar que se haya gastado.
    expect(avisa('El presupuesto de gastos del ejercicio asciende a 41.578.252,26 €')).toBe(false)
    // Y de la cifra que SÍ es ejecución se puede decir libremente.
    expect(avisa('las obligaciones reconocidas a 31-12-2025 fueron 18.909.465,12 €')).toBe(false)
    expect(avisa('el gasto reconocido fue de 18.909.465,12 €')).toBe(false)
  })

  it('nombra la cifra y la palabra que la califica', () => {
    const [a] = revisarMagnitudes('cuyo gasto liquidado en todo 2025 fue de 41,58 millones', M)
    expect(a.clave).toBe('conprel')
    expect(a.palabra).toBe('gasto')
    expect(a.fragmento).toContain('liquidado')
  })
})

describe('la ventana es estrecha a propósito', () => {
  /**
   * Con la ventana ancha, la frase del reportaje se escapaba: traía
   * «PRESUPUESTO entero del municipio» ochenta caracteres antes, en otra
   * oración, y desactivaba el aviso de la que sí estaba mal. Lo que importa es
   * qué palabra CALIFICA la cifra, no qué palabras hay en el párrafo.
   */
  it('un término de previsión lejano no absuelve a la frase de al lado', () => {
    const lejos =
      'es el presupuesto entero del municipio, ' +
      'y esto es relleno para alejarlo de la cifra sin cambiar nada del sentido, ' +
      'cuyo gasto liquidado en todo 2025 fue de 41,58 millones'
    expect(lejos.indexOf('presupuesto')).toBeLessThan(lejos.indexOf('41,58') - VENTANA)
    expect(revisarMagnitudes(lejos, M).length).toBe(1)
  })

  it('pero el que sí la califica, sí', () => {
    expect(revisarMagnitudes('gasto presupuestado de 41,58 millones', M).length).toBe(0)
  })

  it('las dos listas se exportan; nadie las recita', () => {
    expect(PALABRAS_DE_EJECUCION).toContain('liquidado')
    expect(PALABRAS_DE_PREVISION).toContain('crédito')
  })
})

/**
 * Y que alguien lo EJECUTE. Una guarda escrita y no invocada es el defecto que
 * este repositorio se encontró tres veces el 12-08-2026; ésta va dentro de
 * `review:surfaces`, que ya renderiza cada ruta, para no pagar un render aparte
 * ni abrir un segundo canal que nadie mire.
 */
describe('el pase determinista está enchufado', () => {
  const src = readFileSync('scripts/review-surfaces.ts', 'utf8')

  it('review:surfaces lo llama sobre el texto renderizado', () => {
    expect(src).toContain('revisarMagnitudes(')
    expect(src).toContain('magnitudesDe(')
    // Y sus avisos entran en la MISMA lista que los del modelo, no en otra.
    expect(src).toContain('findings.push(...avisosDeterministas)')
  })

  it('las magnitudes se derivan de los snapshots, no se escriben a mano', () => {
    const i = src.indexOf('magnitudesDe(')
    expect(i, 'no se encuentra la derivación').toBeGreaterThan(-1)
    // Los dos snapshots, en la misma llamada: nada de cifras a mano.
    const llamada = src.slice(i, i + 140)
    expect(llamada).toContain("read('budget.json')")
    expect(llamada).toContain("read('budget-execution.json')")
  })
})
