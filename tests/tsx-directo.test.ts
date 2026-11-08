/**
 * `TSX_DIRECTO` es lo mismo que `tsx`, con un Node menos.
 *
 * Las pruebas de CLI lo usan para lanzar guiones «como en la terminal», así que
 * lo que hay que fijar es que no ha dejado de serlo: si una versión de tsx
 * cambiara lo que le pasa a su hijo, esas pruebas estarían midiendo otra orden, y
 * seguirían en verde.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { TSX_DIRECTO } from './setup/tsx-directo'

const CLI = resolve(__dirname, '../node_modules/tsx/dist/cli.mjs')

const dir = mkdtempSync(join(tmpdir(), 'tsx-directo-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// TypeScript de verdad, con un import relativo sin extensión y un tipo que Node
// no sabría leer solo: es lo que hacen los guiones del repositorio.
writeFileSync(join(dir, 'util.ts'), `export const doble = (n: number): number => n * 2\n`)
const GUION = join(dir, 'guion.ts')
writeFileSync(
  GUION,
  `import { doble } from './util'
interface Salida { argv: string[]; doble: number }
const salida: Salida = { argv: process.argv.slice(2), doble: doble(21) }
console.log(JSON.stringify(salida))
console.error('por stderr')
process.exit(7)
`,
)
const ARGV = ['posicional', '--dry-run', '--reason', 'con espacios']

const porLaCli = spawnSync(process.execPath, [CLI, GUION, ...ARGV], { encoding: 'utf8' })
const directo = spawnSync(process.execPath, [...TSX_DIRECTO, GUION, ...ARGV], { encoding: 'utf8' })

describe('TSX_DIRECTO', () => {
  it('el guion corre de verdad: lo comparado no son dos fallos iguales', () => {
    expect(JSON.parse(porLaCli.stdout)).toEqual({ argv: ARGV, doble: 42 })
  })

  it('da lo mismo que la CLI: salida, errores y código', () => {
    expect(directo.stdout).toBe(porLaCli.stdout)
    expect(directo.stderr).toBe(porLaCli.stderr)
    expect(directo.status).toBe(7)
    expect(directo.status).toBe(porLaCli.status)
  })

  it('y se ahorra un Node: el guion es hijo directo de quien lo lanza', () => {
    const padre = join(dir, 'padre.ts')
    writeFileSync(padre, `console.log(process.ppid)\n`)
    const ppid = (args: string[]) =>
      Number(spawnSync(process.execPath, args, { encoding: 'utf8' }).stdout.trim())
    expect(ppid([...TSX_DIRECTO, padre])).toBe(process.pid)
    expect(ppid([CLI, padre]), 'la CLI ya no lanza un Node aparte: sobra esto').not.toBe(
      process.pid,
    )
  })

  it('son las opciones que la CLI de tsx le pasa a su hijo', () => {
    const cli = readFileSync(CLI, 'utf8')
    expect(cli).toContain('"--require",')
    expect(cli).toContain('./preflight.cjs')
    expect(cli).toContain('./loader.mjs')
    expect(TSX_DIRECTO[1]).toMatch(/\/tsx\/dist\/preflight\.cjs$/)
    expect(TSX_DIRECTO[3]).toMatch(/^file:.*\/tsx\/dist\/loader\.mjs$/)
  })
})
