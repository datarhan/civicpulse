/**
 * ¿Se está metiendo en git prosa no revisada sobre una persona viva?
 *
 *   npm run check:editorial -- --staged   → sólo lo estampado (pre-commit)
 *   npm run check:editorial               → todo lo rastreado (auditoría)
 *
 * La tercera hermana de `check:secrets` y `check:privado`, y hace falta aparte
 * por la misma razón que aquéllas hicieron falta la una junto a la otra: cada
 * una pregunta algo que las demás no pueden preguntar.
 *
 *   - `check:secrets` reconoce por la FORMA. Un borrador no tiene forma de nada.
 *   - `check:privado` exige que el sujeto seamos NOSOTROS. Esto va de TERCEROS,
 *     así que queda fuera por diseño, no por fallo.
 *
 * EL FALLO, medido el 2026-09-10: `git ls-files editorial/` devolvía 27
 * ficheros, todos borradores del agente periodista sobre concejales vivos y
 * nombrados, con `legalSensitivity: high|medium`, y los 27 estaban en `main`.
 *
 * `editorial/` está en el `.gitignore` desde agosto — pero **`.gitignore` no
 * desrastrea lo ya rastreado**: sólo impide añadir lo que no está. Entraron con
 * `git add -f` porque la habilidad `biografia-concejal` lo mandaba, y con el
 * repositorio PRIVADO eso era razonable. El 8-sep se abrió el repositorio y esa
 * práctica dejó de ser segura sin que nada la volviera a mirar.
 *
 * **Algo seguro bajo `private` no avisa cuando eso deja de ser cierto.** Ésa es
 * la lección, y por eso la puerta va en el gancho y no en un documento.
 *
 * La línea base son los ficheros que YA estaban dentro cuando se tomó la
 * decisión de dejarlos. Sólo puede encoger. Lo demás se deriva de git.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LINEA_BASE = resolve('tests/fixtures/editorial-rastreado-linea-base.txt')
const soloEstampado = process.argv.includes('--staged')

function git(args: string[]): string[] {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function lineaBase(): Set<string> {
  try {
    return new Set(
      readFileSync(LINEA_BASE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    )
  } catch {
    // Cuarto desenlace: sin línea base NO se puede decidir, y callar sería dar
    // el visto bueno sin haber mirado. Se dice y se falla.
    console.error(
      `[check:editorial] no se puede leer la línea base (${LINEA_BASE}).\n` +
        'Sin ella esta puerta no sabe qué es nuevo, así que no da el visto bueno.',
    )
    process.exit(1)
  }
}

const base = lineaBase()
const candidatos = soloEstampado
  ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
  : git(['ls-files'])

const bajoEditorial = candidatos.filter((f) => f.startsWith('editorial/'))
const nuevos = bajoEditorial.filter((f) => !base.has(f))

if (nuevos.length) {
  console.error(
    `\n[check:editorial] ${nuevos.length} fichero(s) NUEVO(s) bajo editorial/ entrando en git:\n` +
      nuevos.map((f) => `  · ${f}`).join('\n') +
      '\n\n`editorial/` está en el .gitignore: si esto pasa es por un `git add -f`.\n' +
      'Ahí vive prosa automática NO REVISADA sobre personas vivas, y este\n' +
      'repositorio es PÚBLICO desde el 2026-09-08.\n\n' +
      'Un borrador no necesita estar en git: vive en disco y se lee por ruta. Lo\n' +
      'que se publica es la versión revisada, vía `npm run promote-report`.\n\n' +
      'Para sacarlo del índice sin perder el fichero:\n' +
      `  git rm --cached ${nuevos[0]}\n`,
  )
  process.exit(1)
}

// Los cuatro desenlaces por separado, y «no había nada que mirar» es
// información, no un aprobado silencioso.
const ambito = soloEstampado ? 'estampado(s)' : 'rastreado(s)'
if (candidatos.length === 0) {
  // Igual que sus hermanas: un commit vacío no acredita nada, y decir sólo
  // «0 nuevos» lo haría parecer una comprobación superada.
  console.log('[check:editorial] no se examinó ningún fichero: esto NO es un visto bueno')
} else if (bajoEditorial.length === 0) {
  console.log(
    `[check:editorial] ${candidatos.length} fichero(s) ${ambito} · ninguno bajo editorial/`,
  )
} else {
  console.log(
    `[check:editorial] ${candidatos.length} fichero(s) ${ambito} · ` +
      `${bajoEditorial.length} bajo editorial/, todos en la línea base (${base.size}) · 0 nuevos`,
  )
}
