/**
 * Ficheros que viven bajo `public/` y NO deben desplegarse.
 *
 * «Todo lo que está bajo `public/` se publica» es la regla, y estos son los
 * artefactos que la incumplirían: los lee la máquina del curador —las CLIs de
 * `promote-claim`, `auto-curate-findings`, `verify:pleno-claims`— y tienen que
 * seguir donde están, pero un lector no debe poder descargarlos.
 *
 * Mover el corpus fuera de `public/` sería más limpio y toca ~20 guiones y ~12
 * pruebas; hasta que eso se haga, quien garantiza la regla es esta lista más
 * el complemento de `vite.config.js` que la aplica sobre `dist/`.
 *
 * ---
 *
 * Ya existía un control con esta intención y no funcionaba. `.vercelignore`
 * nombraba estos dos mismos ficheros, con un comentario explicando que así el
 * verbatim de acusaciones sin fundar «nunca es accesible desde el sitio vivo».
 * El 2026-09-03 los dos se descargaban de producción: 9,5 MB y 6,5 MB, con
 * 2.255 y 2.256 `acusacion_publica` dentro, de las cuales 172 atribuidas a un
 * grupo de un solo escaño —que, como dice `/metodologia`, señala a esa persona.
 *
 * El fallo es de mecanismo, no de intención: el despliegue hace
 * `vercel build` + `vercel deploy --prebuilt`, así que sube la SALIDA de la
 * compilación, y Vite copia `public/*` dentro de `dist/*`. Los patrones de
 * `.vercelignore` apuntan a `public/…`, que no es lo que se sube. Por eso
 * `pleno-claims-verified-base.json` sí estaba a salvo: lo protegía
 * `.gitignore`, que impide que llegue al checkout, no `.vercelignore`.
 *
 * La lección que fija esta lista: el único denominador honesto es el
 * artefacto construido. `tests/publication-denylist.test.ts` lo comprueba
 * sobre `dist/`.
 *
 * @type {readonly string[]}
 */
export const PUBLICATION_DENYLIST = Object.freeze([
  // Corpus verificado SIN la puerta editorial (`claim-public-gate.ts`). Los
  // trozos que sí se sirven, bajo `public/data/pleno-claims/`, salen de aquí
  // ya filtrados: éste es su entrada, no su salida.
  'public/data/pleno-claims-verified.json',
  // Extracción en crudo, anterior a cualquier verificación. Cada fila lleva
  // `requiresHumanApproval: true` y ninguna ha sido revisada.
  'public/data/pleno-claims-suggestions.json',
])

/**
 * ¿Lleva este fichero filas que esperan la firma de una persona?
 *
 * `requiresHumanApproval: true` es la marca que ya escribe todo el que produce
 * una sugerencia. Se lee del texto en crudo a propósito: un fichero de 9 MB no
 * hace falta parsearlo para saber que la lleva.
 */
export function esBorrador(texto) {
  return /"requiresHumanApproval"\s*:\s*true/.test(texto)
}

/**
 * Las rutas `/data/…` que pide el NAVEGADOR, leídas del código del front.
 *
 * Dos cosas que NO cuentan como pedir, y las dos han costado algo aquí:
 *
 *  · Una mención en prosa. `Metodologia.jsx` escribe
 *    `<code>pleno-claims-verified.json</code>` para explicar la tubería. Tomar
 *    eso por una petición dejaría 9 MB de acusaciones sin puerta editorial
 *    descargándose del sitio. Por eso se exige la comilla y el prefijo `/data/`.
 *  · Una línea de comentario. Es el mismo defecto que `route-graph.ts` ya pagó
 *    —leer prosa como declaración le daba a `padron.json` 34 rutas en vez de 2—
 *    y que el despiece volvió a pagar con `scrape:coste-efectivo`.
 *
 * De una plantilla —`` `/data/pleno-claims/${id}.json` ``— se queda el prefijo
 * hasta la última barra: qué hoja pide no se deriva, el directorio sí.
 */
export function referenciasDelNavegador(textos) {
  const out = new Set()
  for (const texto of textos) {
    const vivo = texto
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join('\n')
    // Una plantilla corta sola en `${`, así que `/data/pleno-claims/${id}.json`
    // deja `/data/pleno-claims/` y una ruta plana se queda entera.
    for (const m of vivo.matchAll(/['"`]\/data\/([A-Za-z0-9_./-]*)/g)) {
      const resto = m[1]
      // `/data/` a secas sale de `/data/${p.chunkPath}`, con la ruta entera en
      // el dato. No dice nada de ningún fichero, y metido en el conjunto casa
      // con TODOS: medido construyendo, la guarda quitaba 2 en vez de 6 y daba
      // los otros 4 por servidos.
      if (resto === '') continue
      out.add(`/data/${resto}`)
      // Un fichero nombrado dentro de un directorio deja servido el directorio.
      // `usePlenoClaims` pide `/data/pleno-claims/index.json` y luego las hojas
      // que ese manifiesto liste: sin esto, quitar una línea del hook haría que
      // la guarda borrase los 23 trozos publicados sin que nadie lo pidiera.
      const barra = resto.lastIndexOf('/')
      if (barra > 0) out.add(`/data/${resto.slice(0, barra + 1)}`)
    }
  }
  return out
}

/**
 * El reparto en CUATRO suertes: denegadas, servidas, limpias e ilegibles.
 *
 * La cuarta es la que importa. Un fichero que no se pudo leer no lleva «nada»:
 * lleva algo que no se ha mirado, y es exactamente el que seguiría
 * publicándose. Doblarlo con «limpias» es el `r?.findings ?? []` de siempre.
 */
export function repartir({ hojas, referencias }) {
  const denegar = []
  const servidas = []
  const limpias = []
  const ilegibles = []
  const pide = (rel) => {
    const url = `/${rel}`
    for (const r of referencias) {
      if (r === url) return true
      if (r.endsWith('/') && url.startsWith(r)) return true
    }
    return false
  }
  for (const { rel, texto } of hojas) {
    if (texto === null || texto === undefined) {
      ilegibles.push(rel)
      continue
    }
    if (!esBorrador(texto)) {
      limpias.push(rel)
      continue
    }
    if (pide(rel)) servidas.push(rel)
    else denegar.push(rel)
  }
  return { denegar, servidas, limpias, ilegibles }
}

/**
 * Complemento de Vite que aplica la lista sobre `dist/` al terminar la
 * compilación, que es el momento en que ya se ha copiado `public/` entero.
 *
 * Informa de las tres suertes por separado —quitado / no estaba / no se pudo—
 * en vez de callar. Un fichero que no estaba es lo normal cuando además está
 * en `.gitignore`; un borrado que falla NO puede pasar por «ya no estaba»,
 * porque es exactamente el caso en que el fichero sigue publicándose. Doblar
 * las tres en un silencio es la avería que esta lista existe para cerrar.
 */
export function vitePublicationGuard() {
  return {
    name: 'civicpulse:publication-guard',
    apply: 'build',
    closeBundle: {
      // `sequential` + `order: post`: cualquier otro complemento que escriba
      // en `dist/` lo hace antes que esto, así que nada puede reponer un
      // fichero después de que lo hayamos quitado.
      sequential: true,
      order: 'post',
      async handler() {
        const { rm, stat } = await import('node:fs/promises')
        const { resolve, dirname } = await import('node:path')
        const { fileURLToPath } = await import('node:url')
        const root = dirname(fileURLToPath(import.meta.url))

        const { readdir, readFile } = await import('node:fs/promises')
        const { join, relative } = await import('node:path')

        // Lo que pide el navegador, del código que corre EN el navegador.
        // `src/scraper/` queda fuera a propósito: es código de tubería, se
        // ejecuta en Node y nombrar un fichero ahí no lo hace descargable.
        const textos = []
        for (const carpeta of ['src/hooks', 'src/pages', 'src/components', 'src/lib']) {
          const base = resolve(root, carpeta)
          const anda = async (d) => {
            let entradas
            try {
              entradas = await readdir(d, { withFileTypes: true })
            } catch {
              return
            }
            for (const e of entradas) {
              const p = join(d, e.name)
              if (e.isDirectory()) await anda(p)
              else if (/\.(jsx?|tsx?)$/.test(e.name)) textos.push(await readFile(p, 'utf8'))
            }
          }
          await anda(base)
        }
        const referencias = referenciasDelNavegador(textos)

        // Las hojas del artefacto, que es el único denominador honesto.
        const hojas = []
        const andaDatos = async (d) => {
          let entradas
          try {
            entradas = await readdir(d, { withFileTypes: true })
          } catch {
            return
          }
          for (const e of entradas) {
            const p = join(d, e.name)
            if (e.isDirectory()) await andaDatos(p)
            else if (e.name.endsWith('.json')) {
              const rel = relative(resolve(root, 'dist'), p)
              try {
                hojas.push({ rel, texto: await readFile(p, 'utf8') })
              } catch {
                hojas.push({ rel, texto: null })
              }
            }
          }
        }
        await andaDatos(resolve(root, 'dist', 'data'))

        const reparto = repartir({ hojas, referencias })
        const derivadas = reparto.denegar.map((rel) => `public/${rel}`)
        const todas = [...new Set([...PUBLICATION_DENYLIST, ...derivadas])]

        const quitados = []
        const ausentes = []
        const fallidos = []
        for (const rel of todas) {
          const destino = resolve(root, 'dist', rel.replace(/^public\//, ''))
          try {
            await stat(destino)
          } catch {
            ausentes.push(rel)
            continue
          }
          try {
            await rm(destino, { force: true })
            quitados.push(rel)
          } catch (err) {
            fallidos.push(`${rel} (${err.message})`)
          }
        }

        console.log(
          `[publication-guard] ${hojas.length} hoja(s) juzgada(s) · ` +
            `${quitados.length} quitada(s) · ${ausentes.length} no estaba(n) · ` +
            `${reparto.servidas.length} con firma pendiente que una página SÍ pide · ` +
            `${fallidos.length} fallida(s) · ${reparto.ilegibles.length} ilegible(s)`,
        )
        for (const rel of quitados) console.log(`[publication-guard]   quitado ${rel}`)
        if (reparto.ilegibles.length) {
          // Un fichero que no se pudo leer es justo el que seguiría
          // publicándose. No puede pasar por «no llevaba nada».
          throw new Error(
            `[publication-guard] no se pudieron leer, así que no se han juzgado: ` +
              `${reparto.ilegibles.join(', ')}`,
          )
        }
        if (fallidos.length) {
          // Que la compilación termine bien dejando dentro un fichero que la
          // lista prohíbe es publicarlo. Se cae aquí.
          throw new Error(`[publication-guard] no se pudo retirar de dist/: ${fallidos.join(', ')}`)
        }
      },
    },
  }
}
