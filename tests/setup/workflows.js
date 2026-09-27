/**
 * Leer los workflows de `.github/workflows/` como los leen las pruebas que los
 * vigilan.
 *
 * Nació dentro de `tests/deploy-triggers.test.js` —¿se despliega todo lo que
 * empuja a main?— y vive aquí desde que otra prueba necesitó la misma pregunta
 * («¿qué workflows publican en main?») para exigirles una aprobación humana.
 * Copiar el detector habría sido mantener dos veces la misma forma de mirar, y
 * la primera vez que una copia se afinara la otra seguiría contestando lo viejo.
 *
 * No es una prueba (vitest sólo recoge `*.test.*`): lo importan las pruebas.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const WF = join(__dirname, '..', '..', '.github', 'workflows')

export const ficheros = () => readdirSync(WF).filter((f) => /\.ya?ml$/.test(f))
export const leer = (f) => readFileSync(join(WF, f), 'utf8')
export const nombreDe = (texto) => (texto.match(/^name:\s*(.+)$/m) ?? [])[1]?.trim()

/** El texto sin comentarios de línea: dentro de uno hay `git push` de mentira. */
export const sinComentarios = (texto) =>
  texto
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')

/** Los argumentos de cada `git push` del workflow, uno por invocación. */
export const empujones = (texto) =>
  [...sinComentarios(texto).matchAll(/\bgit push\b([^\n|;&]*)/g)].map((m) => m[1].trim())

/**
 * ¿Este empujón va a la rama por defecto?
 *
 * `git push` a secas y `git push origin HEAD` suben lo que esté puesto, que en
 * estos workflows es main: ésos SÍ tienen que disparar despliegue. Nombrar otra
 * rama —`git push origin "$RAMA"`, como hace `cesel-entrega.yml` para abrir su
 * PR— no publica nada: lo que despliega es la fusión posterior, y ésa ya entra
 * por el `push: branches: [main]` de deploy-vercel.
 *
 * La distinción se afina aquí a propósito y no se esquiva en el workflow. Un
 * workflow redactado para no decir «git push» pasaría este control sin dejar de
 * empujar a main, que es el fallo que el control persigue.
 */
export const empujonAMain = (args) => {
  const pos = args.split(/\s+/).filter((a) => a && !a.startsWith('-'))
  const destino = pos[1] // pos[0] es el remoto
  if (!destino) return true // `git push` a secas
  return /^(HEAD|main)(:(refs\/heads\/)?main)?$/.test(destino.replace(/["']/g, ''))
}

/** ¿Este workflow empuja commits a la rama por defecto? */
export const empujaAMain = (texto) => empujones(texto).some(empujonAMain)

/*
 * ¿Corre un paso los TIPOS o las PRUEBAS del bot?
 *
 * Nació en `bot-tests-cubiertos.test.js` y se copió en `bot-despliegue.test.js`
 * cuando el despliegue pasó a esperar a las pruebas (2026-09-27). Vive aquí por
 * lo mismo que lo de arriba: dos copias de un detector son dos detectores, y la
 * primera vez que se afina uno el otro sigue contestando lo viejo.
 */

/** Ejecuta los tipos: el script del paquete o `tsc` a pelo. */
export const TIPA = /\bnpm\s+(?:--prefix[= ]\S+\s+)?run\s+typecheck\b|\btsc\b/

/** Ejecuta la suite: `npm test`, `npm run test` o vitest. */
export const PRUEBA = /\bnpm\s+(?:--prefix[= ]\S+\s+)?(?:run\s+)?test\b|\bvitest\b/

/** Se traga su propio fallo en la línea: `|| true`, `|| :`, `|| exit 0`. */
export const TRAGA = /\|\|\s*(?:true|:|exit\s+0)(?![\w-])/

/** ¿Corre DENTRO de bot/? Por su directorio, el del trabajo, o un `cd`/`--prefix`. */
export function enElBot(doc, trabajo, paso) {
  const dir =
    paso['working-directory'] ??
    trabajo?.defaults?.run?.['working-directory'] ??
    doc?.defaults?.run?.['working-directory'] ??
    '.'
  return (
    /^\.?\/?bot\/?$/.test(String(dir).trim()) ||
    /\bcd\s+\.?\/?bot\/?\s*&&/.test(paso.run) ||
    /--prefix[= ]\.?\/?bot\b/.test(paso.run)
  )
}
