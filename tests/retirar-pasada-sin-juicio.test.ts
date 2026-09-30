import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mergeVerified, type Overlay } from '../src/scraper/verified-merge'

/**
 * `retirar-pasada -- --sin-juicio` quita del overlay las retractaciones del motor
 * que el modelo nunca vio (src/scraper/retractaciones-sin-juicio.ts) y deja
 * aflorar el veredicto del determinista. Reescribe un fichero curado, así que se
 * prueba de punta a punta sobre una copia: qué quita, qué deja y por qué, y que
 * `--dry-run` no escribe nada.
 *
 * Las cuatro filas son reales (tests/fixtures/retractaciones-sin-juicio_2026-09-29.json).
 * Encima van dos fallos inyectados, uno por cada guarda que no se puede ver en
 * los datos de hoy:
 *   · QUE_SUBIRIA: su base dice `parcial` — devolverla publicaría una subida.
 *   · REDERIVADA: su entrada lleva otra fecha — como si `--ids` la hubiera
 *     re-derivado después de la medición.
 */

const SCRIPT = resolve('scripts/retirar-pasada.ts')
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/retractaciones-sin-juicio_2026-09-29.json'), 'utf8'),
)

const DEVOLVIBLE = 'k4olcs-050-pro-f60a00'
const REDERIVADA = 'k4olcs-016-cit-683445'
const QUE_SUBIRIA = 'k4olcs-076-afi-853250'
const JUZGADA = 'k4olcs-008-afi-843b2a'

vi.setConfig({ testTimeout: 60_000 })

let caja: string
const data = () => join(caja, 'public/data')
const leer = (ruta: string) => JSON.parse(readFileSync(join(data(), ruta), 'utf8'))
const correr = (...args: string[]) =>
  spawnSync(TSX, [SCRIPT, '--sin-juicio', ...args], {
    cwd: caja,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    timeout: 120_000,
  })

beforeAll(() => {
  caja = mkdtempSync(join(tmpdir(), 'retirar-sin-juicio-'))
  mkdirSync(join(data(), 'pleno-claims'), { recursive: true })
  mkdirSync(join(data(), 'pleno-transcripts'), { recursive: true })
  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data(), ruta), JSON.stringify(valor, null, 2) + '\n')

  const overlay: Overlay = structuredClone(FIXTURE.overlay)
  overlay.entries[REDERIVADA].appliedAt = '2026-10-02T09:00:00.000Z'
  const base = structuredClone(FIXTURE.base)
  base.items.find(
    (it: { claim: { id: string } }) => it.claim.id === QUE_SUBIRIA,
  ).verification.verdict = 'parcial'

  escribir('pleno-claims-verified-base.json', base)
  escribir('pleno-claims-overlay.json', overlay)
  escribir('pleno-claims-verified.json', {
    generatedAt: base.generatedAt,
    items: mergeVerified(base.items, overlay),
  })
  for (const [pleno, texto] of Object.entries(FIXTURE.transcripciones)) {
    writeFileSync(join(data(), 'pleno-transcripts', `${pleno}.txt`), texto as string)
  }
})

afterAll(() => rmSync(caja, { recursive: true, force: true }))

describe('retirar-pasada --sin-juicio', () => {
  let seco: ReturnType<typeof spawnSync>
  let antes: string

  beforeAll(() => {
    antes = readFileSync(join(data(), 'pleno-claims-overlay.json'), 'utf8')
    seco = correr('--dry-run')
  })

  it('en seco dice qué haría y no escribe nada', () => {
    expect(seco.status, `${seco.stderr}`).toBe(0)
    expect(seco.stdout).toContain(DEVOLVIBLE)
    expect(readFileSync(join(data(), 'pleno-claims-overlay.json'), 'utf8')).toBe(antes)
  })

  describe('de verdad', () => {
    let res: ReturnType<typeof spawnSync>
    let overlay: Overlay
    let publicado: Map<string, Record<string, unknown>>

    beforeAll(() => {
      res = correr()
      overlay = leer('pleno-claims-overlay.json')
      publicado = new Map(
        leer('pleno-claims-verified.json').items.map(
          (it: { claim: { id: string }; verification: Record<string, unknown> }) => [
            it.claim.id,
            it.verification,
          ],
        ),
      )
    })

    it('termina bien', () => {
      expect(res.status, `${res.stderr}`).toBe(0)
    })

    it('quita la retractación sin juicio, y aflora el sin-datos del determinista', () => {
      expect(overlay.entries[DEVOLVIBLE]).toBeUndefined()
      const v = publicado.get(DEVOLVIBLE)!
      expect(v.verdict).toBe('sin-datos')
      // Sin canal: la tarjeta la rotula por lo que el determinista anotó.
      expect(v.source).toBeUndefined()
    })

    it('no sube nada: si la base dice parcial, la retractación se queda y se nombra', () => {
      expect(overlay.entries[QUE_SUBIRIA].source).toBe('verdict-engine')
      expect(publicado.get(QUE_SUBIRIA)!.verdict).toBe('sin-datos')
      // Nombrada en su línea, con su motivo.
      expect(res.stdout).toMatch(new RegExp(`${QUE_SUBIRIA}[^\\n]*la base subiría`))
    })

    it('no toca una entrada que cambió desde la medición', () => {
      expect(overlay.entries[REDERIVADA].appliedAt).toBe('2026-10-02T09:00:00.000Z')
      expect(res.stdout).toMatch(new RegExp(`${REDERIVADA}[^\\n]*otra entrada`))
    })

    it('ni una que el modelo sí juzgó, que no está en la lista', () => {
      expect(overlay.entries[JUZGADA]).toEqual(FIXTURE.overlay.entries[JUZGADA])
    })

    it('y una segunda pasada ya no tiene nada que devolver', () => {
      const otra = correr()
      expect(otra.status, `${otra.stderr}`).toBe(0)
      expect(leer('pleno-claims-overlay.json')).toEqual(overlay)
      expect(otra.stdout).toMatch(/devueltas 0/)
    })
  })
})
