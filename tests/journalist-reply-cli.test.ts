import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { parseArgs } from '../scripts/apply-journalist-response'

/**
 * `journalist-reply`: lo que publica la réplica a un informe.
 *
 * `aludido` —una institución u otra persona que el informe nombra— necesita el
 * nombre con el que firma, y el CLI lo recibe con `--nombre`. Un nombre en una
 * réplica de grupo o del propio sujeto se rechaza: se perdería en silencio.
 */
const QUOTE = 'Reafirmamos lo dicho hace ya varios meses en sede municipal y por escrito.'

describe('journalist-reply · parseArgs', () => {
  it('un grupo, como siempre', () => {
    expect(parseArgs(['r-x', 'PSOE', QUOTE])).toMatchObject({ reportId: 'r-x', from: 'PSOE' })
  })

  it('`aludido` con `--nombre`, antes o después de los posicionales', () => {
    const nombre = 'Ayuntamiento de Riba-roja de Túria'
    for (const argv of [
      ['r-x', 'aludido', QUOTE, '--nombre', nombre],
      ['--nombre', nombre, 'r-x', 'aludido', QUOTE, 'https://www.ribarroja.es/nota'],
    ]) {
      expect(parseArgs(argv)).toMatchObject({ from: 'aludido', fromName: nombre })
    }
  })

  it('`aludido` sin nombre no pasa', () => {
    expect(() => parseArgs(['r-x', 'aludido', QUOTE])).toThrow(/--nombre/)
    expect(() => parseArgs(['r-x', 'aludido', QUOTE, '--nombre', '  '])).toThrow(/--nombre/)
  })

  it('un nombre en una réplica de grupo o del sujeto tampoco', () => {
    expect(() => parseArgs(['r-x', 'PSOE', QUOTE, '--nombre', 'Alguien'])).toThrow(/--nombre/)
    expect(() => parseArgs(['r-x', 'person', QUOTE, '--nombre', 'Alguien'])).toThrow(/--nombre/)
  })

  it('lo demás se sigue rechazando igual', () => {
    expect(() => parseArgs(['r-x', 'Otro', QUOTE])).toThrow(/FROM must be one of/)
    expect(() => parseArgs(['r-x', 'PSOE', 'corta'])).toThrow(/≥20/)
    expect(() => parseArgs(['r-x', 'PSOE', QUOTE, 'ni-url-ni-fecha'])).toThrow(/cannot interpret/)
  })
})

describe('journalist-reply · ejecutado', () => {
  it('importarlo no lo ejecuta, pero lanzarlo sí', () => {
    // Si la guarda de `main()` fallara al ejecutarlo, el workflow no escribiría
    // nada, no habría diff que comitear y cerraría el issue con «Réplica
    // publicada». Lanzado sin argumentos, tiene que protestar.
    const r = spawnSync('npx', ['tsx', 'scripts/apply-journalist-response.ts'], {
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/Usage:/)
  })
})
