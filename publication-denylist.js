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

        const quitados = []
        const ausentes = []
        const fallidos = []
        for (const rel of PUBLICATION_DENYLIST) {
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
          `[publication-guard] ${quitados.length} quitado(s) de dist · ` +
            `${ausentes.length} no estaba(n) · ${fallidos.length} fallido(s)`,
        )
        for (const rel of quitados) console.log(`[publication-guard]   quitado ${rel}`)
        if (fallidos.length) {
          // Que la compilación termine bien dejando dentro un fichero que la
          // lista prohíbe es publicarlo. Se cae aquí.
          throw new Error(
            `[publication-guard] no se pudo retirar de dist/: ${fallidos.join(', ')}`,
          )
        }
      },
    },
  }
}
