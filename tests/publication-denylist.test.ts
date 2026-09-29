import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PUBLICATION_DENYLIST } from '../publication-denylist.js'
import { retenerLiterales } from '../src/scraper/literales-retenidos'
import { citaRetenida } from '../src/lib/cita-retenida.js'

/**
 * Lo que se publica es `dist/`, no `public/`.
 *
 * Había un control para esto y no medía nada. `.vercelignore` listaba
 * `pleno-claims-verified.json` y `pleno-claims-suggestions.json` con cinco
 * líneas de comentario explicando que así el verbatim de acusaciones sin
 * fundar «nunca es accesible desde el sitio vivo», y `useLabHealth.js` repetía
 * la afirmación. Las dos eran falsas: el 2026-09-03 los dos ficheros se
 * descargaban de producción, 9,5 MB y 6,5 MB, con 2.255 y 2.256 acusaciones
 * dentro.
 *
 * El motivo es mecánico. El despliegue hace `vercel build` y luego
 * `vercel deploy --prebuilt`, así que lo que sube es la salida de la
 * compilación; y Vite copia `public/*` a `dist/*`. Los patrones de
 * `.vercelignore` apuntan a `public/…`, que no es lo que se sube nunca. Los
 * dos ficheros que SÍ estaban protegidos —`-base.json`,
 * `-regrounding-flags.json`— lo estaban por `.gitignore`, no por
 * `.vercelignore`: no llegan al checkout, así que Vite no tiene qué copiar.
 *
 * De ahí la forma de esta prueba. El denominador es **el artefacto
 * construido**, porque es lo único que describe lo que un lector puede
 * descargar. Comprobar `git ls-files` o `public/` volvería a comprobar el
 * lado equivocado del mismo fallo.
 */

const DIST = resolve(__dirname, '..', 'dist')
const DIST_DATA = join(DIST, 'data')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

describe('lista de no publicación', () => {
  it('nombra rutas relativas dentro de public/', () => {
    expect(PUBLICATION_DENYLIST.length).toBeGreaterThan(0)
    for (const rel of PUBLICATION_DENYLIST) {
      expect(rel, `«${rel}» debe ser relativa`).not.toMatch(/^[/.]/)
      expect(rel, `«${rel}» debe vivir bajo public/`).toMatch(/^public\//)
    }
  })
})

// Un clon sin compilar no puede juzgar el artefacto. Se DECLARA saltada y
// dice cómo generarlo: una guarda que contesta «todo en orden» sin haber
// mirado nada es el defecto que este repositorio ya pagó dos veces.
const SIN_DIST = !existsSync(DIST_DATA)
if (SIN_DIST) {
  console.warn(
    '[publication-denylist] dist/data ausente — no se ha juzgado el artefacto publicado. ' +
      'Se genera con `npm run build`.',
  )
}

describe.skipIf(SIN_DIST)('el artefacto publicado', () => {
  it('ha copiado datos, así que la comprobación mira algo', () => {
    // Sin esto, un `dist/data` vacío haría pasar la prueba de abajo sin
    // haber examinado un solo fichero.
    expect(walk(DIST_DATA).length).toBeGreaterThan(50)
  })

  it('no incluye ningún fichero de la lista de no publicación', () => {
    const publicados = PUBLICATION_DENYLIST.filter((rel) =>
      existsSync(join(DIST, rel.replace(/^public\//, ''))),
    )
    // El `dist/` de al lado puede ser de OTRA rama o de antes de este cambio,
    // y entonces esto es un rojo falso. Se dice en el propio mensaje porque un
    // rojo que no explica cómo descartarse es un rojo que se acaba ignorando,
    // y esta prueba tiene que seguir doliendo cuando sea de verdad.
    expect(
      publicados,
      `estos ficheros están dentro del artefacto construido: ${publicados.join(', ')}\n` +
        `Si dist/ es de otra rama o anterior a este cambio, reconstruye (\`npm run build\`) y ` +
        `vuelve a mirar; si persiste, el complemento de vite.config.js no está aplicando la lista.`,
    ).toEqual([])
  })
})

/**
 * Lo mismo, un nivel más abajo: un fichero que las páginas necesitan no se
 * puede quitar entero, pero un CAMPO suyo sí puede estar publicándose.
 *
 * `/hallazgos` pinta el hueco «Literal retenido» donde la puerta editorial
 * retiene una cita, y hasta el 28-09-2026 `dist/data/pleno-findings.json`
 * llevaba el texto entero de las 37 retenidas: «no se imprime» era cierto de la
 * página y falso del JSON que la página descarga. El repositorio conserva el
 * literal —lo necesitan la CLI de correcciones y las comprobaciones, y es
 * público—; lo que se juzga aquí es la copia servida.
 */
describe.skipIf(SIN_DIST)('pleno-findings.json servido', () => {
  const leerDist = (rel: string) => JSON.parse(readFileSync(join(DIST_DATA, rel), 'utf8'))
  const fuente = () =>
    JSON.parse(readFileSync(resolve(__dirname, '..', 'public/data/pleno-findings.json'), 'utf8'))

  it('lleva citas que la puerta retiene, así que la comprobación mira algo', () => {
    // La procedencia SERVIDA: es la que lee la página para decidir el hueco.
    const prov = leerDist('finding-quote-provenance.json')
    const retenidas = Object.values(prov.quotes ?? {}).flat() as Array<{ gate?: string } | null>
    expect(retenidas.filter((e) => citaRetenida(e)).length).toBeGreaterThan(0)
  })

  it('no lleva el texto de ninguna cita que la puerta retiene', () => {
    const servido = leerDist('pleno-findings.json')
    const prov = leerDist('finding-quote-provenance.json')
    const conTexto: string[] = []
    let juzgadas = 0
    for (const f of servido.items) {
      ;(f.quotes ?? []).forEach((q: { text?: string }, i: number) => {
        if (!citaRetenida(prov.quotes?.[f.id]?.[i], q)) return
        juzgadas += 1
        if (q.text != null) conTexto.push(`${f.id}#${i}`)
      })
    }
    expect(
      juzgadas,
      'ninguna cita retenida en el artefacto: no se ha juzgado nada',
    ).toBeGreaterThan(0)
    expect(
      conTexto,
      `dist/data/pleno-findings.json sirve el literal de ${conTexto.length} cita(s) retenida(s).\n` +
        `Si dist/ es de otra rama o anterior a este cambio, reconstruye (\`npm run build\`); si ` +
        `persiste, el complemento de vite.config.js no está reteniendo los literales.`,
    ).toEqual([])
  })

  it('es exactamente la copia del repositorio con los literales retenidos, nada más', () => {
    // Igualdad entera, no un muestreo: prueba que la compilación aplicó ESTA
    // transformación y que no se tocó ningún otro campo por el camino.
    const esperado = retenerLiterales(fuente(), leerDist('finding-quote-provenance.json')).snapshot
    expect(
      leerDist('pleno-findings.json'),
      'dist/ no coincide con el repositorio: si public/data cambió después de compilar, reconstruye',
    ).toEqual(esperado)
  })
})
