import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CabeceraPieza from '../src/components/reportajes/CabeceraPieza'
import { kpisReconstruccion } from '../src/pages/reportajes/ReconstruccionDana'
import { problemasDeClaves, CLAVES_MIN, CLAVES_MAX, PALABRAS_MAX } from '../src/lib/claves-pieza'
import { REPORTAJE_SLUGS } from '../src/reportajes'

// «Lo que hemos encontrado» (ClavesPieza.jsx): las claves de cada pieza. La
// forma la comprueba esto; que cada sección exista en la pieza pintada,
// reportajes.spec.ts; que cada frase diga lo que la pieza prueba, quien la
// revisa contra la pieza antes de publicarla.

const pieza = (slug) => JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8'))
const publicadas = REPORTAJE_SLUGS.filter((s) => pieza(s).meta.estado === 'publicado')
const buena = {
  texto: 'El pliego pide cámaras que leen matrículas en tres aparcamientos.',
  seccion: '03',
}

describe('problemasDeClaves: la forma', () => {
  it('tres claves bien hechas no tienen problemas', () => {
    expect(problemasDeClaves([buena, buena, buena])).toEqual([])
  })

  it('cuenta: entre tres y cinco', () => {
    expect(problemasDeClaves([buena, buena])).toEqual([
      `2 claves; van de ${CLAVES_MIN} a ${CLAVES_MAX}`,
    ])
    expect(problemasDeClaves(Array(6).fill(buena))[0]).toMatch(/^6 claves/)
    expect(problemasDeClaves(undefined)).toEqual(['`claves` no es una lista'])
  })

  it('cada una: una frase con punto, sin preguntas, y no más larga de la cuenta', () => {
    const larga = { ...buena, texto: `${'palabra '.repeat(PALABRAS_MAX)}fin.` }
    const casos = [
      [{ ...buena, texto: 'Sin punto final' }, /no acaba en punto/],
      [{ ...buena, texto: 'Una frase. Y otra frase.' }, /más de una frase/],
      [{ ...buena, texto: '¿Quién lo pagó?.' }, /pregunta/],
      [larga, /palabras; como mucho/],
      [{ ...buena, texto: '' }, /sin texto/],
    ]
    for (const [clave, problema] of casos)
      expect(problemasDeClaves([clave, buena, buena]).join(' | '), clave.texto).toMatch(problema)
  })

  it('la sección va con dos cifras, y no admite campos de más', () => {
    expect(problemasDeClaves([{ ...buena, seccion: '3' }, buena, buena])[0]).toMatch(/dos cifras/)
    expect(problemasDeClaves([{ ...buena, persona: 'X' }, buena, buena])[0]).toMatch(
      /campo «persona» de más/,
    )
  })

  it('una cifra con punto de miles o decimales no parte la frase', () => {
    const cifras = { ...buena, texto: 'Adjudicó 87.050 € y 2,75 M€ en 1.5 años.' }
    expect(problemasDeClaves([cifras, buena, buena])).toEqual([])
  })
})

describe('las claves de cada pieza publicada', () => {
  it('mira algo: hay piezas publicadas', () => {
    expect(publicadas.length).toBeGreaterThan(0)
  })

  for (const slug of publicadas) {
    it(`«${slug}»: tiene claves y están bien formadas`, () => {
      expect(problemasDeClaves(pieza(slug).claves)).toEqual([])
    })

    it(`«${slug}»: la cabecera las pinta, cada una con el enlace a su apartado`, () => {
      const p = pieza(slug)
      const html = renderToStaticMarkup(
        <CabeceraPieza
          slug={slug}
          data={p}
          kpis={slug === 'reconstruccion-dana' ? kpisReconstruccion(p.totals) : undefined}
        />,
      )
      expect(html).toContain('Lo que hemos encontrado')
      for (const c of p.claves) expect(html).toContain(`href="#seccion-${c.seccion}"`)
      expect(html.match(/data-clave="/g)).toHaveLength(p.claves.length)
    })
  }
})
