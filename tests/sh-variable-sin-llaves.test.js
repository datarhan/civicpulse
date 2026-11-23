/**
 * Una variable de shell pegada a un carácter no ASCII tiene que ir entre llaves.
 *
 * El 23-11-2026 una pasada a mano de `hallazgos-pipeline.sh` murió en
 * `log "recuperando la extracción de $rid…"` con «rid\xe2: unbound variable»:
 * con la locale C, bash lee los bytes de «…» como letras del nombre, y `set -u`
 * aborta. Desde launchd, con locale UTF-8, pasaba. La pasada a mano era la que
 * tenía que recuperar la extracción de 51k7yx, y no llegó a intentarlo.
 * `${rid}…` se lee igual en las dos locales.
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
