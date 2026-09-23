import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toda herramienta que el repo lanza con `npx` tiene que estar DECLARADA.
 *
 * `tsx` no lo estaba —ni lo había estado nunca— y la usan 227 de los 249 scripts
 * npm y las tuberías de launchd. En el portátil funcionaba porque la caché de
 * npx ya lo tenía. En CI, `npx` lo instalaba al vuelo, sin versión fija, en cada
 * run; y cuando dos pruebas lo lanzaban a la vez sobre un runner frío, las dos
 * instalaciones se pisaban en `~/.npm/_npx/<hash>`:
 *
 *   npm warn exec The following package was not found and will be installed: tsx@4.23.15
 *   npm warn tar TAR_ENTRY_ERROR ENOENT … /home/runner/.npm/_npx/…/esbuild/…
 *
 * La que perdía salía con código 1 y stdout vacío. Así fallaban juntas, e
 * intermitentes, `check-cron` y `curated-stamps` el 23-09-2026 sin estar rotas.
 * Declarada, `npx` encuentra el binario local y no instala nada — y el portátil,
 * las tuberías y CI corren la misma versión, la del lockfile.
 */
const RAIZ = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'))
const declarados = { ...pkg.dependencies, ...pkg.devDependencies }

// El binario no siempre se llama como el paquete que lo trae.
const PAQUETE_DE = { playwright: '@playwright/test' }

const NPX = /\bnpx\s+(?:-{1,2}[\w-]+\s+)*([@a-z0-9][\w./@-]*)/gi

const ficherosDe = (dir, filtro) =>
  readdirSync(join(RAIZ, dir))
    .filter((f) => filtro(f) && statSync(join(RAIZ, dir, f)).isFile())
    .map((f) => [`${dir}/${f}`, readFileSync(join(RAIZ, dir, f), 'utf8')])

// Donde se lanza: los scripts npm, las tuberías que corre launchd y los ganchos.
const FUENTES = [
  ['package.json › scripts', Object.values(pkg.scripts).join('\n')],
  ...ficherosDe('scripts', (f) => f.endsWith('.sh')),
  ...ficherosDe('.husky', (f) => !f.startsWith('_')),
]

const lanzadas = FUENTES.flatMap(([donde, texto]) =>
  [...texto.matchAll(NPX)].map((m) => ({ donde, herramienta: m[1] })),
)

describe('las herramientas que se lanzan con npx están declaradas', () => {
  it('mide algo: encuentra tsx entre lo que se lanza con npx', () => {
    expect(lanzadas.map((l) => l.herramienta)).toContain('tsx')
  })

  it('cada una está en dependencies o devDependencies', () => {
    const sinDeclarar = [
      ...new Set(
        lanzadas
          .filter(({ herramienta }) => !declarados[PAQUETE_DE[herramienta] ?? herramienta])
          .map(({ donde, herramienta }) => `${herramienta} (${donde})`),
      ),
    ]
    expect(sinDeclarar).toEqual([])
  })
})
