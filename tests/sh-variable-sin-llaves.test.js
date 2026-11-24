/**
 * Una variable de shell pegada a un carácter no ASCII tiene que ir entre llaves.
 *
 * El 23-11-2026 dos pasadas a mano de `hallazgos-pipeline.sh` murieron en
 * `log "recuperando la extracción de $rid…"` con «rid\xe2: unbound variable»:
 * el bash 3.2 de macOS, con una locale UTF-8 (la de un terminal), lee los bytes
 * de «…» como letras del nombre, y `set -u` aborta. Desde launchd, sin locale
 * (C), pasaba. Las pasadas a mano eran las que tenían que recuperar la
 * extracción de 51k7yx, y no llegaron a intentarlo. `${rid}…` se lee igual en
 * las dos locales.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIRS = ['scripts', '.husky']
const PEGADA = /\$[A-Za-z_][A-Za-z0-9_]*[^\p{ASCII}]/u

const guiones = DIRS.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith('.sh') || d === '.husky')
    .map((f) => join(d, f))
    .filter((p) => statSync(p).isFile()),
)

describe('variables de shell junto a un carácter no ASCII', () => {
  it('mide algo: lee los guiones de scripts/', () => {
    expect(guiones.filter((p) => p.startsWith('scripts/')).length).toBeGreaterThan(5)
  })

  it('ninguna va sin llaves', () => {
    const fallos = guiones.flatMap((p) =>
      readFileSync(p, 'utf8')
        .split('\n')
        .map((l, i) => [l, i + 1])
        .filter(([l]) => !/^\s*#/.test(l) && PEGADA.test(l))
        .map(([, n]) => `${p}:${n}`),
    )
    expect(fallos).toEqual([])
  })

  it('el patrón casa con el caso del 23-11 y no con su arreglo', () => {
    expect(PEGADA.test('log "recuperando la extracción de $rid…"')).toBe(true)
    expect(PEGADA.test('log "recuperando la extracción de ${rid}…"')).toBe(false)
  })
})
