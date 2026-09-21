/**
 * /empleo publica DOS cifras de «cuántas ofertas son de Riba-roja» y el lector
 * no puede cuadrarlas.
 *
 *   KPI «En Riba-roja»      38 · 60 %
 *   gráfico «Dónde»         Riba-roja de Túria = 26
 *
 * Ninguna está mal, y ése es el problema. Son dos campos distintos:
 *
 *   `inRibaRoja`        sale de la columna LOCALIDAD del listado
 *   `byMunicipio`       agrupa `detail.municipio`, de la ficha de cada oferta
 *
 * Medido el 2026-09-21 sobre la instantánea publicada: 63 ofertas, 38 con la
 * bandera, 26 con municipio Riba-roja, **12 con la bandera y SIN municipio en la
 * ficha** —su localidad dice «Riba-roja de Túria» y la ficha no dice nada— y
 * ninguna al revés. O sea 26 + 12 = 38, exacto.
 *
 * El gráfico ya avisa de que 19 ofertas no traen municipio; eso explica por qué
 * su denominador es 44 y no 63, pero NO deja cuadrar las dos cifras: para pasar
 * de 26 a 38 el lector tiene que adivinar cuántas de esas 19 son de Riba-roja.
 * La respuesta se puede calcular, así que se publica.
 *
 * Es la misma regla que la capa de dinero del mapa —«una vista que enseña una
 * fracción de su dominio tiene que decirlo»— llevada un paso más allá: además
 * de decir cuánto se queda fuera, decir qué parte de lo que se queda fuera
 * pertenece a la cifra de al lado.
 *
 * Y DERIVADO, nunca escrito: el día que la ficha traiga el municipio de las
 * doce, el puente vale cero y la frase desaparece sola.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { computeEmpleoStats } from '../src/lib/empleo'
import { CATALOGUE, LOCALES } from '../src/i18n'

const { items } = JSON.parse(readFileSync('public/data/empleo.json', 'utf8'))

describe('/empleo · las dos cifras de Riba-roja se pueden cuadrar', () => {
  it('premisa: hoy NO cuadran solas, y la diferencia son ofertas sin ficha', () => {
    // Medida, no supuesta. Si algún día todas las ofertas trajeran municipio,
    // las dos cifras coincidirían y esta guarda estaría vigilando un caso que
    // ya no existe: se pondría roja y lo diría.
    const stats = computeEmpleoStats(items)
    const conMunicipioRiba =
      stats.byMunicipio.find((m: { name: string }) => /riba.?roja/i.test(m.name))?.count ?? 0
    expect(stats.inRibaRoja).toBeGreaterThan(conMunicipioRiba)
    expect(
      stats.sinMunicipioEnRiba,
      'ninguna oferta de Riba-roja se queda sin municipio: ya no hay hueco que explicar',
    ).toBeGreaterThan(0)
  })

  it('el puente cuadra las dos: las del gráfico más las que no traen ficha', () => {
    const stats = computeEmpleoStats(items)
    const conMunicipioRiba =
      stats.byMunicipio.find((m: { name: string }) => /riba.?roja/i.test(m.name))?.count ?? 0
    expect(conMunicipioRiba + stats.sinMunicipioEnRiba).toBe(stats.inRibaRoja)
  })

  it('cuenta las que tienen la bandera Y no tienen municipio, ni una cosa ni la otra', () => {
    const oferta = (inRibaRoja: boolean, municipio: string | null) => ({
      inRibaRoja,
      deadline: null,
      publishedAt: '2026-09-01',
      detail: municipio === null ? {} : { municipio },
    })
    const s = computeEmpleoStats([
      oferta(true, null), // cuenta
      oferta(true, 'Riba-roja de Túria'), // no: sí trae municipio
      oferta(false, null), // no: no es de Riba-roja
      oferta(false, 'Paterna'), // no
    ])
    expect(s.sinMunicipioEnRiba).toBe(1)
  })

  it('sin ofertas es cero porque no hay ninguna, no porque no se mire', () => {
    expect(computeEmpleoStats([]).sinMunicipioEnRiba).toBe(0)
  })

  it('la salvedad del gráfico publica el puente, en los dos idiomas', () => {
    for (const locale of LOCALES) {
      const texto = CATALOGUE[locale]?.['empleo.chart.coverage']
      expect(texto, `${locale} · falta la clave`).toBeTruthy()
      expect(texto, `${locale} · no dice cuántas quedan fuera`).toMatch(/\{n\}/)
      expect(texto, `${locale} · no dice cuántas de ésas son de Riba-roja`).toMatch(/\{enRiba\}/)
    }
  })

  it('el panel lo pinta: lee la cifra nueva y no la escribe a mano', () => {
    const fuente = readFileSync('src/components/empleo/EmpleoStats.jsx', 'utf8')
    expect(fuente).toMatch(/sinMunicipioEnRiba/)
    expect(fuente).toMatch(/enRiba/)
  })
})

/**
 * La fecha suelta de la tarjeta se lee como el plazo.
 *
 * La tarjeta pinta `fmtDateShort(o.publishedAt)` en la fila de metadatos, sin
 * rótulo, y justo encima lleva una píldora que dice «Cierra en 3 días». Una
 * fecha desnuda al lado de una cuenta atrás se lee como la fecha a la que
 * apunta la cuenta atrás.
 *
 * Duró porque en 47 de las 63 ofertas la publicación y el plazo caen en el
 * mismo mes o en el siguiente, así que la contradicción no se ve. Se ve en
 * ésta: `ING climatización y frio industrial` se publicó el 2026-05-24 y cierra
 * el 2026-09-24. La tarjeta dice «Cierra en 3 días» y debajo «24 may 2026»,
 * cuatro meses antes.
 *
 * El dato está bien y la palabra que falta es «publicada». La fecha de
 * publicación sirve —dice cuánto lleva la oferta colgada— y el plazo ya está en
 * la píldora, así que lo que hace falta es rotularla, no cambiarla.
 */
describe('/empleo · la fecha de la tarjeta dice de qué fecha habla', () => {
  it('premisa: hay ofertas donde publicación y plazo se separan meses', () => {
    const lejos = items.filter((o: { publishedAt?: string; deadline?: string }) => {
      if (!o.publishedAt || !o.deadline) return false
      const dias = (Date.parse(o.deadline) - Date.parse(o.publishedAt)) / 86_400_000
      return dias > 60
    })
    expect(
      lejos.length,
      'ninguna oferta separa publicación y plazo: la confusión no se puede dar',
    ).toBeGreaterThan(0)
  })

  it('la tarjeta rotula la fecha en vez de dejarla desnuda', () => {
    const fuente = readFileSync('src/pages/Empleo.jsx', 'utf8')
    expect(fuente, 'la fecha sigue sin rótulo').toMatch(/empleo\.card\.publicada/)
  })

  it('el rótulo existe en los dos idiomas y lleva su hueco', () => {
    for (const locale of LOCALES) {
      const texto = CATALOGUE[locale]?.['empleo.card.publicada']
      expect(texto, `${locale} · falta la clave`).toBeTruthy()
      expect(texto, `${locale} · sin hueco para la fecha`).toMatch(/\{fecha\}/)
    }
  })
})
