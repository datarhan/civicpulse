// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import {
  PUBLICATION_DENYLIST,
  copiaServidaDeHallazgos,
  referenciasDelNavegador,
  repartir,
  vitePublicationGuard,
} from '../publication-denylist.js'
import { citaRetenida } from '../src/lib/cita-retenida.js'
import { findPartiesInText } from '../src/lib/party-alias.js'
import { oneSeatBlocsOf } from '../src/scraper/corporation-seats'
import { REDACTION_LABELS, isSpeakerGroupField } from '../src/scraper/pleno-finding'

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

const REPO = resolve(__dirname, '..')
const DIST = join(REPO, 'dist')
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

  /**
   * La prueba de arriba sólo mira lo que ya sabe nombrar, y por eso no vio dos
   * copias del corpus sin puerta servirse desde octubre: acababan en `.bak-1004`
   * y `.bak-pre315`. El denominador son TODAS las hojas del artefacto.
   */
  it('no sirve ningún borrador que ninguna página pida, se llame como se llame', () => {
    const hojas = walk(DIST_DATA)
    // Sin las que no acaban en `.json`, esto volvería a mirar lo de siempre.
    expect(hojas.filter((p) => !p.endsWith('.json')).length).toBeGreaterThan(50)
    const textos = ['src/hooks', 'src/pages', 'src/components', 'src/lib']
      .flatMap((carpeta) => walk(join(REPO, carpeta)))
      .filter((p) => /\.(jsx?|tsx?)$/.test(p))
      .map((p) => readFileSync(p, 'utf8'))
    const { denegar } = repartir({
      hojas: hojas.map((p) => ({ rel: relative(DIST, p), texto: readFileSync(p, 'latin1') })),
      referencias: referenciasDelNavegador(textos),
    })
    expect(
      denegar,
      `el artefacto sirve ${denegar.length} borrador(es) que ninguna página pide.\n` +
        `Si dist/ es de otra rama o anterior a este cambio, reconstruye (\`npm run build\`).`,
    ).toEqual([])
  })
})

/**
 * Lo de arriba juzga el `dist/` que haya, y limpio el repositorio no prueba que
 * la guarda funcione. Aquí se lanza el gancho de verdad sobre un artefacto con
 * lo que no debe salir plantado dentro; no necesita compilar, así que corre
 * también en el trabajo `unidad` de la CI.
 */
describe('la guarda juzga cada hoja por lo que lleva, no por cómo se llama', () => {
  const BORRADOR = '[{"id":1,"requiresHumanApproval": true}]\n'

  async function construir(hojas: Record<string, string | Buffer>) {
    const raiz = mkdtempSync(join(tmpdir(), 'cp-hojas-'))
    const ruta = (rel: string) => join(raiz, 'salida', 'data', rel)
    for (const [rel, contenido] of Object.entries(hojas)) {
      mkdirSync(dirname(ruta(rel)), { recursive: true })
      writeFileSync(ruta(rel), contenido)
    }
    const guarda = vitePublicationGuard()
    guarda.configResolved({ root: raiz, build: { outDir: 'salida' } })
    return { raiz, ruta, juzgar: () => guarda.closeBundle.handler() }
  }

  it('quita el borrador sin extensión `.json`, también dentro de un directorio servido', async () => {
    const quitar = [
      'pleno-claims-verified-base.json.bak-1004',
      'sin-extension',
      // `/data/pleno-claims/` lo pide el front, pero lo que pide son `.json`.
      'pleno-claims/1080zow.json.bak-1004',
    ]
    const { raiz, ruta, juzgar } = await construir(
      Object.fromEntries(quitar.map((rel) => [rel, BORRADOR])),
    )
    try {
      await juzgar()
      expect(quitar.filter((rel) => existsSync(ruta(rel)))).toEqual([])
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('deja lo que se sirve a propósito, aunque lleve la marca o no sea texto', async () => {
    // Las rutas salen del código real del front: `/data/souls/${slug}.md`,
    // `/data/pleno-transcripts/${id}.txt`, `/data/empleo-rss.xml`. Una
    // transcripción o un perfil pueden citar la marca: son prosa servida.
    const dejar: Record<string, string | Buffer> = {
      'pleno-claims/1080zow.json': BORRADOR,
      'pleno-transcripts/1080zow.txt': BORRADOR,
      'souls/una-concejala.md': BORRADOR,
      'empleo-rss.xml': BORRADOR,
      'photos/una-concejala.jpg': Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
      'quejas-photos/una.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      'notas-sin-pedir.txt': 'nadie lo pide y no lleva nada\n',
    }
    const { raiz, ruta, juzgar } = await construir(dejar)
    try {
      await juzgar()
      expect(Object.keys(dejar).filter((rel) => !existsSync(ruta(rel)))).toEqual([])
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it.each([
    ['comprimido', 'corpus.json.gz', Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00])],
    ['en UTF-16', 'corpus.utf16', Buffer.from(BORRADOR, 'utf16le')],
  ])('se cae ante un fichero %s: no se sabe qué lleva', async (_forma, rel, bytes) => {
    const { raiz, juzgar } = await construir({ [rel]: bytes })
    try {
      await expect(juzgar()).rejects.toThrow(rel)
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  it('se cae si el artefacto no tiene `data/`: cero hojas no es un artefacto limpio', async () => {
    const { raiz, juzgar } = await construir({})
    try {
      await expect(juzgar()).rejects.toThrow('no se han juzgado: data')
    } finally {
      rmSync(raiz, { recursive: true, force: true })
    }
  })

  // root abre lo que sea, así que ahí la prueba no probaría nada.
  it.skipIf(process.getuid?.() === 0)('se cae ante un directorio que no abre', async () => {
    const { raiz, ruta, juzgar } = await construir({ 'cerrado/corpus.txt': BORRADOR })
    chmodSync(ruta('cerrado'), 0o000)
    try {
      await expect(juzgar()).rejects.toThrow('cerrado')
    } finally {
      chmodSync(ruta('cerrado'), 0o755)
      rmSync(raiz, { recursive: true, force: true })
    }
  })
})

/**
 * El otro lado: que una copia no llegue a comitearse. El cron de /hallazgos hace
 * `git add -- public/data`, y así entraron las dos de octubre. `.gitignore` no
 * desrastrea, por eso se comprueban las dos cosas.
 */
describe('una copia de seguridad bajo public/data', () => {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' })

  it.each([
    'public/data/pleno-claims-verified-base.json.bak-1004',
    'public/data/pleno-findings.json.bak',
    'public/data/pleno-claims/1080zow.json.bak-1004',
  ])('%s la ignora git', (ruta) => {
    expect(git('check-ignore', ruta).trim()).toBe(ruta)
  })

  it('no hay ninguna rastreada', () => {
    const rastreados = git('ls-files', 'public/data').split('\n')
    expect(rastreados.length).toBeGreaterThan(100)
    expect(rastreados.filter((ruta) => /\.bak/.test(ruta))).toEqual([])
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

  /**
   * Y la bitácora de correcciones, que imprimía a qué grupo de un solo escaño
   * se había atribuido algo que una persona retiró después: «Compromís»
   * tachado junto a «sin identificar». Un grupo con un solo concejal nombra a
   * esa persona. El oráculo se escribe aquí, aparte de la transformación: el
   * alcance sale de los campos que exporta el validador, el grupo de la tabla
   * de alias y de la composición SERVIDA.
   */
  it('no nombra en su bitácora a ningún grupo de un solo escaño, ni en lo que retiró ni en lo que puso', () => {
    const servido = leerDist('pleno-findings.json')
    const unEscano = oneSeatBlocsOf(leerDist('officials.json'))
    expect(
      unEscano,
      'officials.json servido no da la composición: no se sabe qué buscar',
    ).not.toBeNull()
    const nombran: string[] = []
    let juzgadas = 0
    for (const f of servido.items) {
      ;(f.corrections ?? []).forEach((c: Record<string, unknown>, i: number) => {
        const campo = String(c.field)
        if (!(isSpeakerGroupField(campo) || campo in REDACTION_LABELS)) return
        juzgadas += 1
        for (const lado of ['original', 'corrected']) {
          const grupos = findPartiesInText(String(c[lado] ?? '')) as string[]
          if (grupos.some((g) => unEscano?.includes(g))) nombran.push(`${f.id}[${i}].${lado}`)
        }
      })
    }
    expect(
      juzgadas,
      'ninguna fila de titular, sumario o grupo: no se ha juzgado nada',
    ).toBeGreaterThan(0)
    expect(
      nombran,
      `dist/data/pleno-findings.json nombra a un grupo de un solo escaño en ${nombran.length} ` +
        `lado(s) de su bitácora.\nSi dist/ es de otra rama o anterior a este cambio, reconstruye ` +
        `(\`npm run build\`); si persiste, el complemento de vite.config.js no los está reteniendo.`,
    ).toEqual([])
  })

  it('es exactamente la copia del repositorio con literales y grupos retenidos, nada más', () => {
    // Igualdad entera, no un muestreo: prueba que la compilación aplicó ESTAS
    // transformaciones y que no se tocó ningún otro campo por el camino.
    const esperado = copiaServidaDeHallazgos(
      fuente(),
      leerDist('finding-quote-provenance.json'),
      leerDist('officials.json'),
    ).snapshot
    expect(
      leerDist('pleno-findings.json'),
      'dist/ no coincide con el repositorio: si public/data cambió después de compilar, reconstruye',
    ).toEqual(esperado)
  })
})
