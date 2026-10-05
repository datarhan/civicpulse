/**
 * Con qué corre el motor de veredictos y a nombre de quién escribe.
 *
 * El 02-08-2026 escribió 457 retractaciones como `verdict-engine:claude-code`
 * que había contestado gpt-4o-mini: claude-code era el primario, openai iba
 * detrás porque el `.env` traía su clave, y el guion rotulaba con
 * `OPENAI_MODEL || LLM_BACKEND`, lo configurado, no lo que contestó. Esa misma
 * línea rotula al revés en cuanto el `.env` trae OPENAI_MODEL: lo que escribe
 * Claude saldría firmado por un modelo de OpenAI.
 */
import { describe, expect, it } from 'vitest'
import { buildBackendChain, loadConfigFromEnv, type ClientConfig } from '../../src/llm/client'
import {
  configDelMotor,
  primarioDelMotor,
  rotuloDelMotor,
} from '../../src/scraper/procedencia-del-motor'

/** Claves de pago presentes, como con el `.env` cargado; `claude` existe en disco. */
const conClaves = (c: Partial<ClientConfig>): ClientConfig => ({
  ...loadConfigFromEnv(),
  claudeCodeBin: process.execPath,
  claudeCodeModel: 'sonnet',
  openaiApiKey: 'sk-de-prueba',
  openaiModel: 'gpt-4o-mini',
  anthropicApiKey: 'sk-ant-de-prueba',
  zeroCostOnly: false,
  ...c,
})

describe('configDelMotor · el motor no cae a un backend de pago', () => {
  it('con claude-code de primario y las claves cargadas, la cadena es sólo claude-code', () => {
    // El control: sin el arreglo, la cadena es la que escribió las 457.
    expect(buildBackendChain(conClaves({ backend: 'claude-code' }))).toEqual([
      'claude-code',
      'openai',
      'anthropic',
    ])
    expect(buildBackendChain(configDelMotor(conClaves({ backend: 'claude-code' })))).toEqual([
      'claude-code',
    ])
  })

  it('un respaldo gratuito sigue en la cadena', () => {
    expect(buildBackendChain(configDelMotor(conClaves({ backend: 'agy' })))).toEqual([
      'agy',
      'claude-code',
    ])
  })
})

describe('primarioDelMotor · el rótulo sale del backend configurado, no de OPENAI_MODEL', () => {
  it('claude-code de primario con OPENAI_MODEL en el entorno se rotula claude-code', () => {
    const p = primarioDelMotor(conClaves({ backend: 'claude-code', openaiModel: 'gpt-5.4-mini' }))
    expect(p).toEqual({
      backend: 'claude-code',
      model: 'claude-code:sonnet',
      rotulo: 'claude-code',
    })
  })

  it('openai de primario se rotula con su modelo, como las 36 de junio', () => {
    const p = primarioDelMotor(conClaves({ backend: 'openai', openaiModel: 'gpt-5.4-mini' }))
    expect(p).toEqual({ backend: 'openai', model: 'gpt-5.4-mini', rotulo: 'gpt-5.4-mini' })
  })
})

describe('rotuloDelMotor · se escribe a nombre de quien contestó, o no se escribe', () => {
  const primario = {
    backend: 'claude-code' as const,
    model: 'claude-code:sonnet',
    rotulo: 'claude-code',
  }
  const claude = { backend: 'claude-code' as const, model: 'claude-code:sonnet' }
  const gpt = { backend: 'openai' as const, model: 'gpt-4o-mini' }

  it('razonar y extraer los contestó el primario: se rotula con él', () => {
    expect(
      rotuloDelMotor({
        primario,
        pasos: [
          { paso: 'razonar', ...claude, deCache: false },
          { paso: 'extraer', ...claude, deCache: true },
        ],
      }),
    ).toEqual({ accion: 'escribir', rotulo: 'claude-code' })
  })

  it('si un paso lo contestó otro backend, no se escribe', () => {
    const r = rotuloDelMotor({
      primario,
      pasos: [
        { paso: 'razonar', ...claude, deCache: false },
        { paso: 'extraer', ...gpt, deCache: false },
      ],
    })
    expect(r).toEqual({ accion: 'dejar', porque: 'otro-backend', quien: 'extraer: gpt-4o-mini' })
  })

  it('sin la procedencia de los dos pasos, no se escribe', () => {
    expect(rotuloDelMotor({ primario, pasos: [] })).toEqual({
      accion: 'dejar',
      porque: 'sin-procedencia',
    })
    expect(
      rotuloDelMotor({ primario, pasos: [{ paso: 'razonar', ...claude, deCache: false }] }),
    ).toEqual({ accion: 'dejar', porque: 'sin-procedencia' })
  })
})
