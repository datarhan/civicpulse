/**
 * En veda electoral, `extract-pleno-claims` no re-extrae una sesión que ya lleva
 * grupos: saldría todo con `speakerGroup: null` y quitaría atribuciones ya
 * publicadas sin una persona (decisión 4.4, 22-11-2026). La conserva tal cual,
 * la apunta como saltada —no como intentada— y sale 0.
 *
 * Corre el CLI de verdad en un arenero. No llega a ningún modelo: la negativa va
 * antes de la extracción, y el arenero no tiene backend.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TSX = resolve('node_modules/.bin/tsx')
const SCRIPT = resolve('scripts/extract-pleno-claims.ts')

const DECLARACION = {
  id: 'c1',
  plenoId: 'px',
  plenoDate: '2026-01-01',
  segmentIndex: 0,
  type: 'promesa',
  speakerGroup: 'PP',
  verbatim: 'una frase',
  context: '',
  topic: 'otros',
  entities: [],
  confidence: 0.9,
  reasoning: '',
  requiresHumanApproval: true,
}

describe('extract-pleno-claims en veda, sobre una sesión que ya lleva grupos', () => {
  let caja: string
  let res: ReturnType<typeof spawnSync>
  let antes: string
  let despues: string

  beforeAll(() => {
    caja = mkdtempSync(join(tmpdir(), 'extract-veda-'))
    const data = join(caja, 'public/data')
    mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
    const escribir = (ruta: string, valor: unknown) =>
      writeFileSync(join(data, ruta), JSON.stringify(valor) + '\n')
    escribir('promises.json', { frozenUntil: '2999-01-01', items: [] })
    escribir('pleno-claims-suggestions.json', { items: [DECLARACION] })
    escribir('plenos.json', { items: [{ id: 'px', date: '2026-01-01' }] })
    writeFileSync(join(data, 'pleno-transcripts/px.txt'), '[0.0 → 1.0] (SPEAKER_00) hola\n')
    copyFileSync(resolve('public/data/officials.json'), join(data, 'officials.json'))
    antes = readFileSync(join(data, 'pleno-claims-suggestions.json'), 'utf8')
    res = spawnSync(TSX, [SCRIPT, 'px'], {
      cwd: caja,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
      timeout: 120_000,
    })
    despues = readFileSync(join(data, 'pleno-claims-suggestions.json'), 'utf8')
  }, 150_000)
  afterAll(() => rmSync(caja, { recursive: true, force: true }))

  it('sale 0 y dice por qué la conserva', () => {
    expect(res.status, `${res.stdout}${res.stderr}`).toBe(0)
    expect(String(res.stderr)).toMatch(/px CONSERVADA — veda electoral hasta 2999-01-01/)
  })

  it('el grupo publicado sigue ahí', () => {
    const items = JSON.parse(despues).items
    expect(items).toHaveLength(1)
    expect(items[0].speakerGroup).toBe('PP')
    expect(JSON.parse(despues).items).toEqual(JSON.parse(antes).items)
  })

  it('el manifiesto la cuenta como saltada, no como intentada', () => {
    const out = `${res.stdout}${res.stderr}`
    expect(out).toMatch(/attempted 0 · .*skipped loreg-freeze — atribución conservada=1/)
    expect(out).not.toMatch(/ERROR \[no-work\]/)
  })
})
