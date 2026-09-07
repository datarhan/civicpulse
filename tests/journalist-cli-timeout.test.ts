import { describe, it, expect } from 'vitest'
import {
  JOURNALIST_CLI_TIMEOUT_MS,
  journalistCliTimeoutMs,
} from '../src/scraper/journalist-agent/shared'

/**
 * El vigilante del CLI (`LLM_CLI_TIMEOUT_MS`, 180 s por defecto) mató dos
 * ejecuciones seguidas de la v2 de una biografía el 06-09-2026: con
 * `--output-format json` el CLI no escribe nada hasta terminar, y la síntesis
 * de una biografía con 18 evidencias tarda más de tres minutos. El borrador
 * salía «sin síntesis» y el parte decía «exit 0». La ejecución del agente
 * periodista arranca con un tope propio si nadie ha fijado otro.
 */
describe('journalistCliTimeoutMs', () => {
  it('sin variable de entorno vale el tope del agente, y es de al menos veinte minutos', () => {
    expect(journalistCliTimeoutMs({})).toBe(JOURNALIST_CLI_TIMEOUT_MS)
    expect(JOURNALIST_CLI_TIMEOUT_MS).toBeGreaterThanOrEqual(20 * 60_000)
  })

  it('una variable válida manda', () => {
    expect(journalistCliTimeoutMs({ LLM_CLI_TIMEOUT_MS: '240000' })).toBe(240_000)
  })

  it('una variable vacía o no numérica no cuenta', () => {
    expect(journalistCliTimeoutMs({ LLM_CLI_TIMEOUT_MS: '' })).toBe(JOURNALIST_CLI_TIMEOUT_MS)
    expect(journalistCliTimeoutMs({ LLM_CLI_TIMEOUT_MS: 'pronto' })).toBe(JOURNALIST_CLI_TIMEOUT_MS)
    expect(journalistCliTimeoutMs({ LLM_CLI_TIMEOUT_MS: '0' })).toBe(JOURNALIST_CLI_TIMEOUT_MS)
  })
})
