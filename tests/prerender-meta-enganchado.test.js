import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ¿Corre ALGUIEN el prerenderizado de metaetiquetas?
 *
 * Es la pregunta de siempre en esta casa, y aquí tiene una respuesta que se
 * puede comprobar: el despliegue de Vercel es `--prebuilt`, o sea que sube lo
 * que haya en `dist/`. Si `prerender:meta` no forma parte de `npm run build`,
 * el `dist` que se sube no lleva las páginas por ruta y **todo vuelve a la
 * misma tarjeta**, sin que falle nada: el sitio funciona, los enlaces abren, y
 * sólo se nota al compartir uno.
 *
 * Verde por no ejecutarse, otra vez. Por eso esto mira el `build`, no el script.
 */
const RAIZ = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'))

describe('el prerenderizado de metaetiquetas lo ejecuta alguien', () => {
  it('existe el script', () => {
    expect(pkg.scripts['prerender:meta']).toBeTruthy()
    expect(existsSync(join(RAIZ, 'scripts/prerender-meta.ts'))).toBe(true)
  })

  // Lo que de verdad importa: que `npm run build` lo llame. Sin esto el script
  // existe, pasa cuando lo corres a mano, y no lo corre nadie.
  it('`npm run build` lo llama', () => {
    expect(
      pkg.scripts.build,
      'sin esto, `vercel build --prebuilt` sube un dist sin páginas por ruta y todas las tarjetas vuelven a ser la misma',
    ).toMatch(/prerender:meta/)
  })

  // Y que la reescritura de Vercel siga siendo la de RESERVA. Vercel mira el
  // sistema de ficheros antes de reescribir, así que un fichero concreto gana;
  // pero si alguien cambiara esto por un `redirect`, o le pusiera prioridad
  // sobre los estáticos, las páginas por ruta dejarían de servirse y volvería
  // el mismo defecto sin tocar una línea de este código.
  it('vercel.json sigue reescribiendo a index.html como RESERVA, no como redirección', () => {
    const v = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8'))
    expect(v.rewrites, 'sin rewrites la SPA no navega en profundidad').toBeTruthy()
    expect(v.redirects ?? [], 'un redirect de /(.*) se aplicaría ANTES que los ficheros').toEqual(
      [],
    )
  })
})
