import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'

import { LocaleProvider } from '../src/i18n'
import { EJEMPLO_PREFERIDO, enBreveEficiencia } from '../src/scraper/en-breve-eficiencia'
import EnBreveEficiencia from '../src/components/eficiencia/EnBreveEficiencia'
import { detectorDeCastellano, loQueSeLee } from './setup/castellano'

/**
 * «En breve» de /eficiencia. Un resumen vale si dice lo mismo que la sección a
 * la que enlaza: se mide contra los mismos cálculos (`LibroServicios`,
 * `EstadoRendicion`) sobre los snapshots publicados.
 */
const leer = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const IND = leer('indicadores.json')
const PREG = leer('eficiencia-preguntas.json')
const R = enBreveEficiencia(IND, PREG)

describe('las cifras', () => {
  it('mide algo: las cuatro respuestas existen con lo publicado', () => {
    expect(R.coste).not.toBeNull()
    expect(R.congelado).not.toBeNull()
    expect(R.entregas).not.toBeNull()
    expect(R.preguntas).not.toBeNull()
  })

  it('el total es el del libro', () => {
    const libro = IND.indicadores
      .filter((i) => i.valor !== null)
      .reduce((s, i) => s + (i.numerador.valor ?? 0), 0)
    expect(R.coste.total).toBeCloseTo(libro, 2)
    expect(R.coste.filas.reduce((s, f) => s + f.coste, 0) + R.coste.resto).toBeCloseTo(libro, 2)
  })

  it('los congelados son los del estado de la rendición', () => {
    const conRatio = IND.indicadores.filter((i) => i.valor !== null)
    const medibles = conRatio.filter((i) => i.declaracion?.denominador)
    const congelados = medibles.filter((i) => i.declaracion.denominador.congelada)
    expect(R.congelado).toMatchObject({ n: congelados.length, de: medibles.length })
  })

  it('el ejemplo es de verdad la MISMA cifra cada año', () => {
    const e = R.congelado.ejemplo
    expect(e).not.toBeNull()
    const ind = IND.indicadores.find((i) => i.id === e.id)
    for (const a of e.anios) expect(ind.serie.find((p) => p.anio === a).denominador).toBe(e.valor)
    if (
      IND.indicadores.find((i) => i.id === EJEMPLO_PREFERIDO)?.declaracion?.denominador?.congelada
    )
      expect(e.id).toBe(EJEMPLO_PREFERIDO)
  })

  it('las entregas y las preguntas', () => {
    const c = IND.cobertura
    expect(R.entregas).toEqual({
      obligatorias: c.entregasPublicadas.length,
      presentadas: c.entregasPublicadas.length - c.entregasNoPresentadas.length,
      faltan: c.entregasNoPresentadas,
    })
    const n = PREG.panels['coste-efectivo'].bloques.reduce((s, b) => s + b.items.length, 0)
    expect(R.preguntas.n).toBe(n)
  })

  it('sin datos, nada se inventa', () => {
    expect(enBreveEficiencia({}, null)).toEqual({
      coste: null,
      congelado: null,
      entregas: null,
      preguntas: null,
    })
  })
})

const pinta = (idioma) => {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <LocaleProvider>
      <EnBreveEficiencia data={IND} preguntas={PREG} />
    </LocaleProvider>,
  ).container
}
afterEach(() => localStorage.clear())

describe('lo que lee el vecino', () => {
  it('cada respuesta enlaza a una sección que existe en /eficiencia', () => {
    const c = pinta('es')
    const fuentes = [
      'src/pages/Eficiencia.jsx',
      'src/components/eficiencia/EntregasBarras.jsx',
      'src/components/eficiencia/PreguntasRegistradas.jsx',
    ]
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const anclas = [...c.querySelectorAll('a[href^="#"]')].map((a) =>
      a.getAttribute('href').slice(1),
    )
    expect(anclas.length).toBeGreaterThanOrEqual(5)
    for (const id of new Set(anclas)) expect(fuentes, id).toMatch(new RegExp(`['"]${id}['"]`))
  })

  it('ningún hueco ni marca del glosario llega al lector, en ningún idioma', () => {
    for (const idioma of ['es', 'ca']) {
      const texto = loQueSeLee(pinta(idioma)).join(' · ')
      expect(texto, idioma).not.toMatch(/\{\w+\}|\[\[|\]\]/)
    }
  })

  it('en valencià no queda castellano fuera de los nombres oficiales de los servicios', () => {
    const datos = IND.indicadores.flatMap((i) => [
      i.etiqueta,
      i.etiqueta.toLowerCase(),
      i.divisor?.plural ?? '',
    ])
    const { castellanoEn } = detectorDeCastellano(
      datos.filter(Boolean).sort((a, b) => b.length - a.length),
    )
    const texto = loQueSeLee(pinta('ca')).join(' · ')
    expect(texto.length).toBeGreaterThan(300)
    expect(castellanoEn(texto)).toEqual([])
  })

  it('«¿Lo hacen bien?» dice que no se puede saber, y por qué', () => {
    const t = pinta('es').querySelector('[data-en-breve="bien"]').textContent
    expect(t).toContain('no se puede saber')
    expect(t).toContain(`${R.congelado.n} de las ${R.congelado.de}`)
  })
})
