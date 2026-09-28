import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ejecutar } from '../scripts/check-metadatos.ts'
import { sinAutoria } from '../scripts/fixture-sin-autoria.ts'
import { EMPRESA, OTRA, PERSONA, libro } from './metadatos-fabrica.ts'

/**
 * La guarda de verdad es la que corre sobre git: lo ESTAMPADO en el pre-commit,
 * lo rastreado en la CI y en `monitor:health`, y cada versión de la historia en
 * una auditoría. Se prueba contra un repositorio de usar y tirar, porque lo que
 * falla aquí es la fontanería: leer la copia de trabajo en vez del blob que se
 * va a comitear, o dar el visto bueno sin haber abierto nada.
 */

let repo: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
const escribir = (ruta: string, b: Uint8Array) => writeFileSync(join(repo, ruta), b)
const salida = (r: { lineas: string[] }) => r.lineas.join('\n')
const comitear = (ruta: string, b: Uint8Array, mensaje = 'x') => {
  escribir(ruta, b)
  git('add', ruta)
  git('commit', '-qm', mensaje)
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'metadatos-'))
  git('init', '-q')
  git('config', 'user.email', 'prueba@example.invalid')
  git('config', 'user.name', 'Prueba')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', '/dev/null')
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('--staged: lo que se va a comitear, no la copia de trabajo', () => {
  it('señala el blob estampado aunque la copia de trabajo ya esté limpia', () => {
    escribir('a.xlsx', libro('xlsx'))
    git('add', 'a.xlsx')
    escribir('a.xlsx', libro('xlsx', { Title: 't' }))
    const r = ejecutar({ modo: 'estampado', cwd: repo })
    expect(r.codigo).toBe(1)
    expect(salida(r)).toContain('a.xlsx · docProps/core.xml · dc:creator')
  })

  it('no mira lo que no está estampado', () => {
    comitear('a.xlsx', libro('xlsx', { Title: 't' }))
    escribir('a.xlsx', libro('xlsx'))
    expect(ejecutar({ modo: 'estampado', cwd: repo }).codigo).toBe(0)
  })

  it('un fichero con extensión de documento que no se deja leer falla como ilegible', () => {
    escribir('roto.xlsx', libro('xlsx').subarray(0, 300))
    git('add', 'roto.xlsx')
    const r = ejecutar({ modo: 'estampado', cwd: repo })
    expect(r.codigo).toBe(1)
    expect(salida(r)).toMatch(/roto\.xlsx · ilegible/)
  })

  it('lo que no es de un formato que se mira no cuenta; nada que mirar no es un error', () => {
    escribir('a.json', Buffer.from('{}'))
    git('add', 'a.json')
    const r = ejecutar({ modo: 'estampado', cwd: repo })
    expect(r.codigo).toBe(0)
    expect(salida(r)).toContain('1 fichero(s) estampado(s) · 0 de un formato que se mira')
  })
})

describe('la salida no republica lo que encuentra', () => {
  it('ni los nombres ni sus apellidos salen por la salida', () => {
    escribir('a.xls', libro('xls'))
    git('add', 'a.xls')
    const r = ejecutar({ modo: 'estampado', cwd: repo })
    expect(r.codigo).toBe(1)
    for (const v of [PERSONA, OTRA, EMPRESA, 'Ejemplo', 'Muestra', 'Ficticia']) {
      expect(salida(r)).not.toContain(v)
    }
  })

  it('--mostrar los enseña, para quien lo mira en su máquina', () => {
    escribir('a.xls', libro('xls'))
    git('add', 'a.xls')
    expect(salida(ejecutar({ modo: 'estampado', cwd: repo, mostrar: true }))).toContain(PERSONA)
  })
})

describe('el árbol, la historia y los ficheros sueltos', () => {
  it('cero ficheros mirados en una auditoría no es un visto bueno', () => {
    expect(ejecutar({ modo: 'arbol', cwd: repo }).codigo).toBe(1)
    comitear('a.xlsx', libro('xlsx', { Title: 't' }))
    expect(ejecutar({ modo: 'arbol', cwd: repo }).codigo).toBe(0)
  })

  it('la historia encuentra el nombre que la punta ya no lleva', () => {
    comitear('a.xls', libro('xls'), 'con nombre')
    comitear('a.xls', libro('xls', { Title: 't' }), 'sin nombre')
    expect(ejecutar({ modo: 'arbol', cwd: repo }).codigo).toBe(0)
    const r = ejecutar({ modo: 'historia', cwd: repo })
    expect(r.codigo).toBe(1)
    expect(salida(r)).toMatch(/a\.xls @ [0-9a-f]{8} · SummaryInformation · Author/)
  })

  it('un fichero del disco, antes de añadirlo', () => {
    escribir('nuevo.xlsx', libro('xlsx'))
    expect(ejecutar({ modo: 'rutas', cwd: repo, rutas: ['nuevo.xlsx'] }).codigo).toBe(1)
  })
})

describe('fixture:sin-autoria', () => {
  it('vacía el fichero en el disco, y la guarda deja de señalarlo', () => {
    escribir('a.xls', libro('xls'))
    const antes = readFileSync(join(repo, 'a.xls'))
    const r = sinAutoria(['a.xls'], repo)
    expect(r.codigo).toBe(0)
    const despues = readFileSync(join(repo, 'a.xls'))
    expect(despues.length).toBe(antes.length)
    expect(despues.equals(antes)).toBe(false)
    expect(ejecutar({ modo: 'rutas', cwd: repo, rutas: ['a.xls'] }).codigo).toBe(0)
  })

  it('lo que no sabe hacer lo deja como estaba y sale con 1', () => {
    const b = libro('xlsx', { Title: 't' }, { autor: 'Marta Prueba', texto: 'x' })
    escribir('c.xlsx', b)
    const r = sinAutoria(['c.xlsx'], repo)
    expect(r.codigo).toBe(1)
    expect(readFileSync(join(repo, 'c.xlsx')).equals(b)).toBe(true)
  })
})
