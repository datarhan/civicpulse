import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CabeceraPieza from '../src/components/reportajes/CabeceraPieza'
import { cifrasDelEmblema } from '../src/components/reportajes/Emblema'
import { kpisReconstruccion } from '../src/pages/reportajes/ReconstruccionDana'
import { REPORTAJE_SLUGS } from '../src/reportajes'

// La cabecera común de las seis piezas (CabeceraPieza.jsx). Se pinta con la
// instantánea publicada de cada una, no con un objeto inventado: lo que se
// prueba es lo que lee el lector.

const pieza = (slug) => JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8'))
const tarjetas = (slug, p) =>
  slug === 'reconstruccion-dana' ? kpisReconstruccion(p.totals) : (p.kpis ?? [])
const pinta = (slug, p) =>
  renderToStaticMarkup(
    <CabeceraPieza
      slug={slug}
      data={p}
      kpis={slug === 'reconstruccion-dana' ? kpisReconstruccion(p.totals) : undefined}
    />,
  )
const sinEtiquetas = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')

describe('meta.kpisEnTexto: una tarjeta se quita sólo si el texto la da', () => {
  it('mira algo: alguna pieza quita tarjetas por estar en el texto', () => {
    const n = REPORTAJE_SLUGS.flatMap((s) => pieza(s).meta.kpisEnTexto ?? []).length
    expect(n).toBeGreaterThan(0)
  })

  for (const slug of REPORTAJE_SLUGS) {
    it(`«${slug}»: cada entrada es una tarjeta y su frase está, literal, en el subtítulo o la entradilla`, () => {
      const p = pieza(slug)
      const texto = `${p.meta.subtitulo ?? ''}\n${typeof p.entradilla === 'string' ? p.entradilla : ''}`
      for (const k of p.meta.kpisEnTexto ?? []) {
        expect(
          tarjetas(slug, p).filter((t) => t.n === k.n),
          `«${k.n}» no es una tarjeta de la pieza`,
        ).toHaveLength(1)
        expect(
          k.en.length,
          `la frase de «${k.n}» es demasiado corta para probar nada`,
        ).toBeGreaterThan(8)
        expect(texto.includes(k.en), `«${k.en}» no está en el subtítulo ni en la entradilla`).toBe(
          true,
        )
      }
    })
  }
})

describe('CabeceraPieza, con cada instantánea publicada', () => {
  for (const slug of REPORTAJE_SLUGS) {
    it(`«${slug}»: antetítulo, titular, subtítulo y una tarjeta por cifra que no da el texto`, () => {
      const p = pieza(slug)
      const html = pinta(slug, p)
      const texto = sinEtiquetas(html)
      expect(html).toContain(`>${p.meta.seccion}<`)
      expect(html).toMatch(/<h1[^>]*>/)
      expect(texto).toContain(p.meta.titulo)

      const enTexto = (p.meta.kpisEnTexto ?? []).map((k) => k.n)
      const enFigura = cifrasDelEmblema(slug, p)
      for (const k of tarjetas(slug, p)) {
        const aparece = texto.includes(` ${k.n} `)
        if (enTexto.includes(k.n)) {
          // Quitada: no puede quedar como tarjeta (puede seguir en la figura).
          expect(html.includes(`>${k.n}</div>`), `«${k.n}» sigue como tarjeta`).toBe(false)
        } else {
          expect(aparece, `«${k.n}» falta en la cabecera`).toBe(true)
        }
      }
      // La clase que esconde en escritorio sólo la llevan cifras de la figura.
      const conClase = (html.match(/class="cp-kpi-en-figura"/g) ?? []).length
      expect(conClase).toBeLessThanOrEqual(Math.max(1, enFigura.length))
    })
  }

  it('la línea de fechas dice lo que la pieza tiene, y nada si no tiene', () => {
    const base = pieza('matriculas-y-moviles')
    const con = sinEtiquetas(pinta('matriculas-y-moviles', base))
    expect(con).toContain(
      'Publicado el 14 de octubre de 2026 · cifras congeladas a 14 de octubre de 2026',
    )

    // Una fecha ISO se escribe en castellano; sin fecha de publicación, sólo la de las cifras.
    const sinPub = {
      ...base,
      meta: { ...base.meta, publicadoEl: undefined, fechaDatos: '2026-07-06' },
    }
    expect(sinEtiquetas(pinta('matriculas-y-moviles', sinPub))).toContain(
      'Cifras congeladas a 6 de julio de 2026',
    )

    const sinNada = {
      ...base,
      meta: { ...base.meta, publicadoEl: undefined, fechaDatos: undefined },
    }
    expect(sinEtiquetas(pinta('matriculas-y-moviles', sinNada))).not.toMatch(
      /congeladas|Publicado el/,
    )
  })

  it('el aviso de borrador sólo sale sin publicar, con el texto de la pieza', () => {
    const base = pieza('basuras')
    expect(pinta('basuras', base)).not.toContain('Borrador')
    const borrador = { ...base, meta: { ...base.meta, estado: 'borrador' } }
    const html = renderToStaticMarkup(
      <CabeceraPieza
        slug="basuras"
        data={borrador}
        borrador={{ titulo: 'Borrador X.', texto: 'Por Y.' }}
      />,
    )
    expect(sinEtiquetas(html)).toMatch(/Borrador X\.\s+Por Y\./)
  })
})
