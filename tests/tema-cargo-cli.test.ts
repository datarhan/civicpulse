/**
 * `npm run tema-cargo` de punta a punta: la única puerta de escritura de
 * `public/data/temas-cargos.json`.
 *
 * Corre el guion de verdad en una caja con una copia de officials.json. Lo que
 * se prueba es la costura: que crea el fichero con su cabecera, que re-valida el
 * fichero ENTERO antes de escribir, que no acepta un área que hoy no tiene nadie
 * —un asunto apuntando a un área inexistente diría «no lo sabemos» desde el
 * primer día—, que retira, y que una opción desconocida no toca nada.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/tema-cargo.ts')
const TSX = resolve('node_modules/.bin/tsx')
vi.setConfig({ testTimeout: 60_000 })

const LISTA = JSON.parse(readFileSync('public/data/officials.json', 'utf8'))
const CEMENTERIO: string = LISTA.officials
  .flatMap((o: any) => o.portfolios ?? [])
  .find((a: string) => /cementerio/i.test(a))

const ENTRADA = {
  tema: 'cementerio',
  palabras: ['cementerio', 'nichos'],
  cargo: CEMENTERIO,
  confianza: 'literal',
  fecha: '2026-10-28',
}

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

function caja() {
  const dir = mkdtempSync(join(tmpdir(), 'tema-cargo-'))
  cajas.push(dir)
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  copyFileSync(resolve('public/data/officials.json'), join(dir, 'public/data/officials.json'))
  return dir
}

function correr(dir: string, args: string[]) {
  const r = spawnSync(TSX, [SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    timeout: 60_000,
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

const borrador = (dir: string, valor: unknown) => {
  const ruta = join(dir, 'borrador.json')
  writeFileSync(ruta, JSON.stringify(valor))
  return ruta
}
const publicado = (dir: string) => join(dir, 'public/data/temas-cargos.json')

describe('npm run tema-cargo', () => {
  it('mide algo: hay un área con «cementerio» en la lista de cargos', () => {
    expect(CEMENTERIO).toBeTruthy()
  })

  it('--add crea el fichero con su cabecera y la fila', () => {
    const dir = caja()
    const r = correr(dir, ['--add', '--from-file', borrador(dir, ENTRADA)])
    expect(r.status, r.stderr).toBe(0)
    const v = JSON.parse(readFileSync(publicado(dir), 'utf8'))
    expect(v.temas).toEqual([ENTRADA])
    expect(v.sinAsignar).toEqual([])
    expect(v.note.length).toBeGreaterThan(40)
    expect(v.fuente.url).toMatch(/^https:\/\//)
    expect(Date.parse(v.generatedAt)).not.toBeNaN()
  })

  it('--add acepta una lista, y un asunto sin área va a sinAsignar', () => {
    const dir = caja()
    const sin = {
      tema: 'padrón',
      palabras: ['padrón', 'empadronarse'],
      motivo: 'Ninguna delegación del decreto de áreas nombra el padrón de habitantes.',
      fecha: '2026-10-28',
    }
    const r = correr(dir, ['--add', '--from-file', borrador(dir, [ENTRADA, sin])])
    expect(r.status, r.stderr).toBe(0)
    const v = JSON.parse(readFileSync(publicado(dir), 'utf8'))
    expect(v.temas.map((t: any) => t.tema)).toEqual(['cementerio'])
    expect(v.sinAsignar.map((t: any) => t.tema)).toEqual(['padrón'])
  })

  it('no acepta un área que hoy no tiene nadie, y no escribe', () => {
    const dir = caja()
    const r = correr(dir, [
      '--add',
      '--from-file',
      borrador(dir, { ...ENTRADA, cargo: 'Un área que no existe' }),
    ])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/Un área que no existe/)
    expect(existsSync(publicado(dir))).toBe(false)
  })

  it('re-valida el fichero entero: una palabra repetida no entra y el fichero queda igual', () => {
    const dir = caja()
    expect(correr(dir, ['--add', '--from-file', borrador(dir, ENTRADA)]).status).toBe(0)
    const antes = readFileSync(publicado(dir), 'utf8')
    const r = correr(dir, [
      '--add',
      '--from-file',
      // Una fila válida por sí sola —editorial, con su razón—: lo único que la
      // tumba es «nichos», que ya lleva a «cementerio».
      borrador(dir, {
        ...ENTRADA,
        tema: 'tumbas',
        palabras: ['tumbas', 'nichos'],
        confianza: 'editorial',
        razon: 'El cargo no nombra las tumbas; se le atribuye por ser el área del cementerio.',
      }),
    ])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/nichos/)
    expect(readFileSync(publicado(dir), 'utf8')).toBe(antes)
  })

  it('a un asunto que existe, --add sólo le añade palabras', () => {
    const dir = caja()
    expect(correr(dir, ['--add', '--from-file', borrador(dir, ENTRADA)]).status).toBe(0)
    const r = correr(dir, [
      '--add',
      '--from-file',
      borrador(dir, { tema: 'cementerio', palabras: ['cementeri', 'nichos'] }),
    ])
    expect(r.status, r.stderr).toBe(0)
    const [fila] = JSON.parse(readFileSync(publicado(dir), 'utf8')).temas
    expect(fila).toEqual({ ...ENTRADA, palabras: ['cementerio', 'nichos', 'cementeri'] })
  })

  it('y no le cambia el área: eso es --retirar y --add', () => {
    const dir = caja()
    expect(correr(dir, ['--add', '--from-file', borrador(dir, ENTRADA)]).status).toBe(0)
    const antes = readFileSync(publicado(dir), 'utf8')
    const r = correr(dir, [
      '--add',
      '--from-file',
      borrador(dir, { tema: 'cementerio', palabras: ['tanatorio'], cargo: 'Otra área' }),
    ])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/--retirar y --add/)
    expect(readFileSync(publicado(dir), 'utf8')).toBe(antes)
  })

  it('--list las enseña y --retirar quita un asunto', () => {
    const dir = caja()
    expect(correr(dir, ['--add', '--from-file', borrador(dir, ENTRADA)]).status).toBe(0)
    const lista = correr(dir, ['--list'])
    expect(lista.status).toBe(0)
    expect(lista.stdout).toContain('cementerio')
    expect(lista.stdout).toContain(CEMENTERIO)
    const r = correr(dir, ['--retirar', 'cementerio'])
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(readFileSync(publicado(dir), 'utf8')).temas).toEqual([])
    expect(correr(dir, ['--retirar', 'cementerio']).status).toBe(1)
  })

  it('una opción desconocida no lee ni escribe nada', () => {
    const dir = caja()
    const r = correr(dir, ['--anadir', '--from-file', borrador(dir, ENTRADA)])
    expect(r.status).toBe(2)
    expect(existsSync(publicado(dir))).toBe(false)
  })
})
