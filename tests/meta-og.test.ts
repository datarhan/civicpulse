import { describe, it, expect } from 'vitest'
import {
  construirMetas,
  construirRobots,
  construirSitemap,
  inyectarMeta,
  sinUrlPropia,
  type MetaRuta,
} from '../src/scraper/meta-og.ts'

/**
 * La tarjeta que sale al compartir un enlace.
 *
 * El 2026-09-09 se comprobó: `/`, `/presupuesto` y el reportaje recién publicado
 * devolvían los TRES el mismo `<title>` y el mismo `og:title`. No es un fallo de
 * las etiquetas —están bien puestas— sino de dónde viven: en `index.html`, y
 * `vercel.json` reescribe `/(.*)` a ese fichero. Los rastreadores de WhatsApp,
 * Telegram, X o LinkedIn no ejecutan JavaScript, así que ven el HTML servido y
 * nunca llegan a ver lo que la SPA pinta después. Compartir un reportaje daba la
 * ficha del sitio entero.
 *
 * El arreglo es escribir un `index.html` POR RUTA en `dist/`, con sus etiquetas
 * ya dentro. Vercel mira el sistema de ficheros antes de aplicar la reescritura,
 * así que el fichero concreto gana; y como sólo cambian las metaetiquetas, la
 * SPA arranca igual.
 *
 * LA REGLA QUE MÁS IMPORTA, y es la de siempre en esta casa: **no se inventa
 * descripción**. Un reportaje tiene título y subtítulo reales y revisados en su
 * instantánea congelada; una ruta de navegación tiene su etiqueta; y lo que no
 * tiene ninguna de las dos cosas se queda con la del sitio y lo DICE en
 * `origen`, para que se pueda contar cuántas fichas son de verdad y cuántas son
 * relleno.
 */

const BASE = 'https://www.civicpulse.es'
const TITULO_SITIO = 'CivicPulse · Riba-roja de Túria'
// El one-liner de docs/DESCRIPCION.md, que es lo que `prerender-meta` extrae de
// la `og:description` de index.html en producción. Aquí es sólo la entrada del
// caso de prueba —y se compara contra sí misma—, pero citar la frase vieja hacía
// que este fichero afirmara como descripción del sitio un orden que
// DESCRIPCION.md retiró el 2026-09-08.
const DESC_SITIO =
  'CivicPulse enseña quién dirige tu ayuntamiento, qué hace y cuánto cuesta — con una fuente para cada cifra.'

const opciones = (extra = {}) => ({
  rutas: ['/', '/presupuesto', '/reportajes/conteo-visitantes'],
  etiquetas: { '/presupuesto': 'Presupuesto' },
  reportajes: {
    'conteo-visitantes': {
      titulo: 'Contar visitantes en un pueblo que nunca ha contado visitantes',
      subtitulo: 'Riba-roja adjudicó 87.050 € para medir su turismo.',
      estado: 'publicado',
    },
  },
  base: BASE,
  tituloSitio: TITULO_SITIO,
  descripcionSitio: DESC_SITIO,
  ...extra,
})

const porRuta = (metas: MetaRuta[], r: string) => metas.find((m) => m.ruta === r)!

describe('construirMetas', () => {
  it('un reportaje publicado usa SU título y SU subtítulo', () => {
    const m = porRuta(construirMetas(opciones()), '/reportajes/conteo-visitantes')
    expect(m.titulo).toContain('Contar visitantes en un pueblo')
    expect(m.descripcion).toContain('87.050')
    expect(m.origen).toBe('reportaje')
    expect(m.url).toBe(`${BASE}/reportajes/conteo-visitantes`)
  })

  // Un borrador no tiene por qué existir como tarjeta: su prosa no está firmada.
  it('un reportaje NO publicado no genera ficha propia', () => {
    const metas = construirMetas(
      opciones({
        reportajes: {
          'conteo-visitantes': { titulo: 'X', subtitulo: 'Y', estado: 'borrador' },
        },
      }),
    )
    const m = porRuta(metas, '/reportajes/conteo-visitantes')
    expect(m.origen).toBe('defecto')
    expect(m.titulo).toBe(TITULO_SITIO)
  })

  it('una ruta de navegación usa su etiqueta', () => {
    const m = porRuta(construirMetas(opciones()), '/presupuesto')
    expect(m.titulo).toBe(`Presupuesto · ${TITULO_SITIO}`)
    expect(m.origen).toBe('nav')
  })

  // La portada es la ficha del sitio y no se le añade nada.
  it('la portada se queda con el título del sitio, tal cual', () => {
    const m = porRuta(construirMetas(opciones()), '/')
    expect(m.titulo).toBe(TITULO_SITIO)
    expect(m.url).toBe(`${BASE}/`)
  })

  // Sin esto, «no sé qué poner» sería indistinguible de «esto es lo que pone».
  it('lo que no tiene título propio se marca como relleno, no se inventa', () => {
    const m = porRuta(construirMetas(opciones({ etiquetas: {} })), '/presupuesto')
    expect(m.origen).toBe('defecto')
    expect(m.descripcion).toBe(DESC_SITIO)
  })

  // Una ruta con parámetro no es una página: no se puede prerenderizar.
  it('descarta las rutas con parámetro', () => {
    const metas = construirMetas(opciones({ rutas: ['/', '/cargos/:slug'] }))
    expect(metas.map((m) => m.ruta)).toEqual(['/'])
  })
})

describe('inyectarMeta', () => {
  // El HTML real trae etiquetas de UNA línea (og:title) y etiquetas PARTIDAS en
  // varias (og:description). Un reemplazo que sólo entienda las primeras deja la
  // mitad de la ficha con el texto viejo, y eso se ve igual de mal que no hacer
  // nada.
  const HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta
      name="description"
      content="VIEJA descripción del sitio"
    />
    <title>CivicPulse · Riba-roja de Túria</title>
    <meta property="og:title" content="VIEJO og title" />
    <meta
      property="og:description"
      content="VIEJA og description"
    />
    <meta property="og:url" content="https://civicpulse.es/" />
    <meta property="og:image" content="https://civicpulse.es/og.png" />
    <meta property="og:image:type" content="image/png" />
    <meta name="twitter:title" content="VIEJO twitter title" />
    <meta
      name="twitter:description"
      content="VIEJA twitter description"
    />
  </head>
  <body><div id="root"></div></body>
</html>`

  const m: MetaRuta = {
    ruta: '/reportajes/x',
    titulo: 'Título nuevo',
    descripcion: 'Descripción nueva',
    url: 'https://www.civicpulse.es/reportajes/x',
    origen: 'reportaje',
  }

  const out = inyectarMeta(HTML, m)

  it('pone el título nuevo en las cuatro superficies', () => {
    expect(out).toContain('<title>Título nuevo</title>')
    expect(out).toMatch(/property="og:title" content="Título nuevo"/)
    expect(out).toMatch(/name="twitter:title" content="Título nuevo"/)
    expect(out).toMatch(/name="description" content="Descripción nueva"/)
  })

  it('sustituye también las etiquetas partidas en varias líneas', () => {
    expect(out).toMatch(/property="og:description" content="Descripción nueva"/)
    expect(out).toMatch(/name="twitter:description" content="Descripción nueva"/)
  })

  // LO QUE DE VERDAD SE COMPRUEBA: que no quede NADA del texto viejo. Un
  // reemplazo que añade en vez de sustituir deja las dos, y el rastreador se
  // queda con la primera.
  it('no deja rastro del texto viejo', () => {
    expect(out).not.toContain('VIEJO')
    expect(out).not.toContain('VIEJA')
  })

  it('corrige la URL canónica de la página', () => {
    expect(out).toMatch(/property="og:url" content="https:\/\/www\.civicpulse\.es\/reportajes\/x"/)
    expect(out).toContain('<link rel="canonical" href="https://www.civicpulse.es/reportajes/x"')
  })

  // La imagen es del sitio y no se toca; y `og:image:type` no puede confundirse
  // con `og:image`.
  it('deja en paz la imagen y sus variantes', () => {
    expect(out).toContain('<meta property="og:image" content="https://civicpulse.es/og.png" />')
    expect(out).toContain('<meta property="og:image:type" content="image/png" />')
  })

  // Y lo que hace que la página siga siendo la página.
  it('no toca el cuerpo ni el punto de montaje', () => {
    expect(out).toContain('<div id="root"></div>')
  })
})

/**
 * La portada es también el HTML de reserva: Vercel lo sirve para toda ruta sin
 * fichero propio. Con su canónica dentro, `/cargos/:slug` o `/plenos/:id` le
 * decían al buscador que eran un duplicado de la portada.
 */
describe('sinUrlPropia', () => {
  const html = [
    '<head>',
    '  <meta property="og:title" content="CivicPulse" />',
    '  <meta property="og:url" content="https://civicpulse.es/" />',
    '  <link rel="canonical" href="https://www.civicpulse.es/" />',
    '</head>',
  ].join('\n')

  it('quita la canónica y el og:url, y nada más', () => {
    const out = sinUrlPropia(html)
    expect(out).not.toMatch(/rel="canonical"/)
    expect(out).not.toMatch(/og:url/)
    expect(out).toContain('og:title')
  })

  it('aplicado a la ficha inyectada de la portada, no deja URL de la portada', () => {
    const [portada] = construirMetas(opciones({ rutas: ['/'] }))
    const out = sinUrlPropia(inyectarMeta(html, portada))
    expect(out).not.toContain(`href="${BASE}/"`)
    expect(out).not.toMatch(/og:url/)
  })
})

describe('construirSitemap / construirRobots', () => {
  it('lista cada URL una vez, ordenada y escapada', () => {
    const xml = construirSitemap([
      `${BASE}/plenos/1xmr0do`,
      `${BASE}/cargos/a&b`,
      `${BASE}/plenos/1xmr0do`,
    ])
    expect(xml).toMatch(/^<\?xml version="1.0"/)
    expect(xml.match(/<loc>/g)).toHaveLength(2)
    expect(xml).toContain('<loc>https://www.civicpulse.es/cargos/a&amp;b</loc>')
    expect(xml.indexOf('/cargos/')).toBeLessThan(xml.indexOf('/plenos/'))
  })

  it('robots.txt deja leer todo y apunta al mapa', () => {
    const robots = construirRobots(BASE)
    expect(robots).toContain('Allow: /')
    expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`)
  })
})
