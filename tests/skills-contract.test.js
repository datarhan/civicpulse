import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CURATED } from '../.claude/hooks/curated-paths.mjs'

/**
 * Lo que las habilidades de .claude/skills/ y los ganchos le dicen a una sesión
 * que ejecute tiene que existir.
 *
 * Revisadas el 27-09-2026, los defectos de las habilidades eran todos de la
 * misma familia: una instrucción que había sido cierta y dejó de serlo sin que
 * nada lo notara. `biografia-concejal` seguía mandando comitear los borradores
 * de `editorial/` —que desde el 25-09 el pre-commit rechaza—, daba por perdida
 * una candidatura de 2023 que `fuentes.md` localizó el 19-09, y remitía a una
 * sección que no era la suya; `revisar-borrador` mandaba a `check:citations
 * --draft` borradores que ese mando no sabe leer. Ninguna prueba podía verlo:
 * las habilidades son texto. Esto mira la parte del texto que sí se comprueba —
 * los mandos y las rutas que nombra— derivándola del propio texto, sin una
 * lista a mano que pueda quedarse atrás a su vez.
 */
const RAIZ = resolve(__dirname, '..')
const SKILLS = join(RAIZ, '.claude', 'skills')
const SCRIPTS = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).scripts

const habilidades = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, 'SKILL.md')))
const ficheros = habilidades.flatMap((d) => {
  const refs = join(SKILLS, d, 'references')
  return [
    join(SKILLS, d, 'SKILL.md'),
    ...(existsSync(refs) ? readdirSync(refs).map((f) => join(refs, f)) : []),
  ]
})
const texto = (f) => readFileSync(f, 'utf8')
const rel = (f) => f.slice(RAIZ.length + 1)

/** `npm run x`, sin la puntuación que lo sigue en la prosa. */
const mandosNpm = (s) =>
  [...s.matchAll(/npm run ([a-z][\w:.-]*)/g)].map((m) => m[1].replace(/[.:]+$/, ''))

describe('skills: la forma que Claude Code lee', () => {
  it('mide algo: hay habilidades que mirar', () => {
    expect(habilidades.length).toBeGreaterThanOrEqual(4)
  })

  it.each(habilidades)('%s: se llama como su carpeta y dice cuándo usarla', (d) => {
    const s = texto(join(SKILLS, d, 'SKILL.md'))
    const cabecera = /^---\n([\s\S]*?)\n---\n/.exec(s)?.[1] ?? ''
    expect(/^name:\s*(.+)$/m.exec(cabecera)?.[1]?.trim()).toBe(d)
    const descripcion = /^description:\s*(.+)$/m.exec(cabecera)?.[1] ?? ''
    expect(descripcion.length, 'sin description').toBeGreaterThan(40)
    // Claude Code corta description + when_to_use a 1.536 caracteres en el listado.
    expect(descripcion.length).toBeLessThanOrEqual(1536)
  })

  /**
   * `$0`, `$1`… es la abreviatura de `$ARGUMENTS[N]`: se sustituye por el
   * argumento con que se invoca la habilidad, y entonces Claude Code deja de
   * añadir el `ARGUMENTS:` final. `revisar-superficies` decía «plan Max: $0
   * facturado», así que `/revisar-superficies /eficiencia` convertía la ruta
   * pedida en «plan Max: /eficiencia facturado» y la ruta no llegaba como
   * entrada. Se escribe `\$0` o se dice de otra manera.
   */
  it.each(habilidades)('%s: ningún $N suelto se come los argumentos', (d) => {
    const sueltos = texto(join(SKILLS, d, 'SKILL.md')).match(/(?<!\\)\$\d/g) ?? []
    expect(sueltos).toEqual([])
  })
})

describe('skills: lo que mandan ejecutar existe', () => {
  const nombrados = ficheros.flatMap((f) => mandosNpm(texto(f)).map((n) => ({ n, f: rel(f) })))

  it('mide algo: las habilidades nombran mandos', () => {
    expect(new Set(nombrados.map((x) => x.n)).size).toBeGreaterThan(15)
  })

  it('cada `npm run` que nombran es un script de package.json', () => {
    const faltan = nombrados.filter(({ n }) => !SCRIPTS[n]).map(({ n, f }) => `${n} (${f})`)
    expect(faltan).toEqual([])
  })

  it('cada ruta del repositorio que citan existe', () => {
    const citadas = ficheros.flatMap((f) =>
      [
        ...texto(f).matchAll(
          /`((?:scripts|src|tests|docs|\.husky|\.claude|public\/data|bot)\/[^`\s]+)`/g,
        ),
      ]
        .map((m) => m[1].replace(/[.,;:)]+$/, ''))
        // plantillas y comodines no son rutas
        .filter((p) => !/[<*…${]/.test(p))
        .map((p) => ({ p, f: rel(f) })),
    )
    expect(citadas.length).toBeGreaterThanOrEqual(10)
    const faltan = citadas
      .filter(({ p }) => !existsSync(join(RAIZ, p)))
      .map(({ p, f }) => `${p} (${f})`)
    expect(faltan).toEqual([])
  })

  it('cada enlace relativo entre sus ficheros resuelve', () => {
    const enlaces = ficheros.flatMap((f) =>
      [...texto(f).matchAll(/\]\(([^)#\s]+\.md)\)/g)]
        .filter((m) => !/^https?:/.test(m[1]))
        .map((m) => ({ destino: resolve(dirname(f), m[1]), f: rel(f) })),
    )
    const rotos = enlaces
      .filter(({ destino }) => !existsSync(destino))
      .map(({ destino, f }) => `${rel(destino)} (${f})`)
    expect(rotos).toEqual([])
  })
})

describe('ganchos: el mando que nombra un rechazo existe', () => {
  /**
   * `curated-paths.mjs` deniega la escritura de un curado y dice «usa en su
   * lugar: npm run …». Si ese mando no existe, el rechazo manda a la sesión a
   * una puerta que no hay, y la sesión busca otra.
   */
  it('cada CLI de CURATED es un script de package.json', () => {
    const nombrados = Object.values(CURATED).flatMap((cli) =>
      (cli.match(/npm run (.*)/)?.[1] ?? '')
        .split('/')
        .map((parte) =>
          parte
            .trim()
            .split(/\s+/)[0]
            .replace(/[).,;:]+$/, ''),
        )
        .filter(Boolean),
    )
    expect(nombrados.length).toBeGreaterThan(15)
    expect(nombrados.filter((n) => !SCRIPTS[n])).toEqual([])
  })
})
