/**
 * La tarjeta que circula fuera del sitio —la que se abre en WhatsApp— es la
 * pieza más vista del proyecto y era la única que ninguna regla gobernaba
 * (brandbook §12). Ahora tiene tres modos de romperse en silencio, y los tres
 * son invisibles desde el sitio porque nada de esto se renderiza en una ruta:
 *
 * 1. El SVG deja de parsear. Un doble guion dentro de un comentario XML
 *    invalida el fichero entero, y el navegador sirve una página de error en
 *    lugar de una imagen. Pasó al escribir esta misma tarjeta: el balance de
 *    etiquetas, la paleta y el guard de marca daban verde y el fichero estaba
 *    roto de arriba abajo.
 * 2. El PNG envejece respecto al SVG. Se edita la fuente, nadie vuelve a
 *    generar, y lo que se comparte es la tarjeta vieja. Se comprueba por
 *    CONTENIDO (sha256 del SVG) y no por fecha: un `git checkout` reescribe las
 *    fechas y una comprobación por mtime afirmaría algo que no midió.
 * 3. index.html vuelve a apuntar al SVG. Facebook, WhatsApp, X y LinkedIn no
 *    renderizan SVG como og:image; declararlo equivale a no tener tarjeta.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const SVG = join(ROOT, 'public/og.svg')
const PNG = join(ROOT, 'public/og.png')
const SHA = join(ROOT, 'public/og.png.sha')
const HTML = join(ROOT, 'index.html')

const svg = readFileSync(SVG, 'utf8')
const html = readFileSync(HTML, 'utf8')

describe('la tarjeta social', () => {
  it('el SVG es XML válido: ningún comentario contiene un doble guion', () => {
    // El fallo que ya ocurrió. `<!-- ... --civic ... -->` rompe el fichero.
    const comentarios = svg.match(/<!--[\s\S]*?-->/g) ?? []
    expect(comentarios.length, 'no se encontró ningún comentario que revisar').toBeGreaterThan(0)
    const rotos = comentarios.filter((c) => c.slice(4, -3).includes('--'))
    expect(rotos.map((c) => c.slice(0, 80))).toEqual([])
  })

  it('el PNG existe, pesa y mide lo que declara index.html', () => {
    expect(existsSync(PNG), 'falta public/og.png — corre `npm run render:og`').toBe(true)
    expect(statSync(PNG).size, 'og.png sospechosamente pequeño').toBeGreaterThan(10_000)
    const png = readFileSync(PNG)
    // Cabecera IHDR: ancho y alto en big-endian a partir del byte 16.
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    const ancho = png.readUInt32BE(16)
    const alto = png.readUInt32BE(20)
    expect(ancho / alto).toBeCloseTo(1200 / 630, 2)
    expect(html).toMatch(/og:image:width"\s+content="1200"/)
    expect(html).toMatch(/og:image:height"\s+content="630"/)
  })

  it('el PNG salió del SVG que hay ahora, no de uno anterior', () => {
    expect(existsSync(SHA), 'falta public/og.png.sha — corre `npm run render:og`').toBe(true)
    const esperado = createHash('sha256').update(svg).digest('hex')
    const registrado = readFileSync(SHA, 'utf8').trim()
    expect(registrado, 'og.svg cambió y og.png no se regeneró: corre `npm run render:og`').toBe(
      esperado,
    )
  })

  it('index.html publica el PNG, nunca el SVG', () => {
    const og = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1]
    const tw = html.match(/name="twitter:image"\s+content="([^"]+)"/)?.[1]
    expect(og, 'no se encontró og:image en index.html').toBeTruthy()
    expect(tw, 'no se encontró twitter:image en index.html').toBeTruthy()
    for (const url of [og, tw]) {
      expect(url.endsWith('.svg'), `${url} es un SVG: esas plataformas no lo pintan`).toBe(false)
      expect(url).toMatch(/\.png$/)
      // Y sobre el dominio publicado, no sobre el subdominio de despliegue: la
      // tarjeta anterior imprimía uno que contradecía al og:url del propio sitio.
      expect(url).toContain('civicpulse.es')
    }
    expect(html).toMatch(/og:image:type"\s+content="image\/png"/)
  })

  it('la tarjeta no cuela una cifra que caduque', () => {
    // §00: ninguna cifra sin su fecha de captura. Este fichero es estático y va
    // en git; nada lo regenera con los datos. Un euro o un porcentaje aquí
    // envejecería en silencio. Las cifras que sí lleva son identificadores
    // fijos: el código INE del municipio y la versión de la licencia.
    const textos = [...svg.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter(Boolean)
    const conCifra = textos.filter((t) => /\d/.test(t) && !/INE 46214|AGPL-3\.0/.test(t))
    expect(conCifra, 'una cifra en la tarjeta estática envejece sin que nadie lo note').toEqual([])
  })
})
