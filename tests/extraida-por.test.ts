/**
 * `extraidaPor` — quién extrajo cada declaración.
 *
 * El 09-11-2026 las 5.161 declaraciones publicadas no decían qué modelo las
 * había sacado: por coincidencia de literal con `.llm-cache` salían repartidas
 * entre Sonnet, Gemini Flash y gpt-4o-mini, y más de la mitad sin respuesta en
 * caché que las explicara. Repetir la misma ventana cambia el tema en torno al
 * 13 % de las veces, así que el tema publicado es una tirada de UN modelo, y
 * hay que poder decir de cuál.
 *
 * Se rotula con quien CONTESTÓ, no con lo configurado: el respaldo de la cadena
 * puede contestar por el primario (procedencia-del-motor.ts, las 457 de agosto).
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaimExtraction } from '../src/llm/schemas'
import type { Procedencia } from '../src/llm/client'

// `satisfies` y no una forma suelta: si el esquema de la respuesta o la
// procedencia cambian, `typecheck` lo dice aquí en vez de dejar la prueba
// verde sobre una forma que producción ya no tiene.
const { CLAIM, SONNET, RESPALDO } = vi.hoisted(() => ({
  CLAIM: {
    type: 'afirmacion_numerica',
    speakerSlug: null,
    verbatim: 'Hemos asignado 46 millones al presupuesto del año.',
    context: 'El alcalde explica el cierre presupuestario y cita la cifra consignada.',
    topic: 'fiscal',
    entities: {},
    accusationSubtype: null,
    confidence: 0.9,
    reasoning: 'Cifra concreta atribuible al cierre presupuestario',
  } satisfies PlenoClaimExtraction,
  // Los nombres de modelo son los que la caché de producción tiene escritos.
  SONNET: {
    backend: 'claude-code',
    model: 'claude-code:claude-sonnet-5',
    deCache: false,
  } satisfies Procedencia,
  RESPALDO: { backend: 'openai', model: 'gpt-4o-mini', deCache: false } satisfies Procedencia,
}))

// La ruta de producción no inyecta `caller`: tiene que preguntar a
// `callLLMConProcedencia`. `callLLM` devuelve sólo la respuesta y no sabe quién
// la dio, así que si el extractor volviera a él, esto lo dice.
vi.mock('../src/llm/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/llm/client')>()
  return {
    ...real,
    callLLM: vi.fn(async () => {
      throw new Error('el extractor llamó a callLLM: nadie sabría quién contestó')
    }),
    callLLMConProcedencia: vi.fn(async () => ({
      result: { claims: [CLAIM] },
      procedencia: SONNET,
    })),
  }
})

import { extractClaimsWithLlm, extractClaimsConProcedencia } from '../src/scraper/pleno-claim-llm'
import { callLLMConProcedencia } from '../src/llm/client'
import { PLENO_CLAIM_PROMPT_VERSION } from '../src/llm/prompts'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { buildChunkAndDescriptor } from '../src/scraper/pleno-claims-chunks'

const TRANSCRIPT = `
[10.0 → 35.0] (SPEAKER_00) Buenas tardes, este año hemos asignado 46 millones al presupuesto.
[36.0 → 70.0] (SPEAKER_01) El expediente cuatro fija un plazo de 90 días para la licitación.
[71.0 → 95.0] (SPEAKER_02) Construiremos 500 viviendas sociales antes de que acabe 2027.
`.trim()

const OPTS = {
  plenoId: 'test',
  plenoDate: '2026-04-29',
  currentSeats: [{ bloc: 'PSOE', seats: 11 }],
}

describe('extraidaPor', () => {
  it('sin caller inyectado, pregunta a callLLMConProcedencia y rotula cada declaración', async () => {
    const res = await extractClaimsWithLlm(TRANSCRIPT, { ...OPTS, windowChars: 5000 })
    expect(callLLMConProcedencia).toHaveBeenCalled()
    expect(res.items).toHaveLength(1)
    expect(res.items[0].extraidaPor).toEqual({
      backend: 'claude-code',
      model: 'claude-code:claude-sonnet-5',
      promptVersion: PLENO_CLAIM_PROMPT_VERSION,
    })
    expect(res.stats.contestadasPor).toEqual({ 'claude-code:claude-sonnet-5': 1 })
  })

  it('rotula con quien contestó CADA ventana, también cuando contesta el respaldo', async () => {
    let n = 0
    const res = await extractClaimsConProcedencia(
      TRANSCRIPT,
      { ...OPTS, windowChars: 120 },
      async (): Promise<any> => {
        n += 1
        const respaldo = n % 2 === 0
        return {
          // Literales distintos y sin cifra: ni la clave ni el colapso los juntan.
          result: {
            claims: [
              { ...CLAIM, verbatim: `Declaración número ${n} de la sesión, sin cifra alguna.` },
            ],
          },
          procedencia: respaldo ? RESPALDO : SONNET,
        }
      },
    )
    expect(n).toBeGreaterThan(1)
    expect(res.items).toHaveLength(n)
    for (const it of res.items) {
      const k = Number(/número (\d+)/.exec(it.verbatim)?.[1])
      expect(it.extraidaPor?.model).toBe(
        k % 2 === 0 ? 'gpt-4o-mini' : 'claude-code:claude-sonnet-5',
      )
      expect(it.extraidaPor?.backend).toBe(k % 2 === 0 ? 'openai' : 'claude-code')
    }
    const total = Object.values(res.stats.contestadasPor).reduce((a, b) => a + b, 0)
    expect(total).toBe(res.stats.windowsAnswered)
    expect(res.stats.contestadasPor['gpt-4o-mini']).toBe(Math.floor(n / 2))
  })

  it('un caller inyectado no sabe quién contestó: el campo falta, no se inventa', async () => {
    const res = await extractClaimsWithLlm(
      TRANSCRIPT,
      { ...OPTS, windowChars: 5000 },
      async (): Promise<any> => ({
        claims: [CLAIM],
      }),
    )
    expect(res.items).toHaveLength(1)
    expect('extraidaPor' in res.items[0]).toBe(false)
    expect(res.stats.windowsAnswered).toBe(1)
    expect(res.stats.contestadasPor).toEqual({})
  })

  it('una respuesta sin procedencia no lleva rótulo', async () => {
    const res = await extractClaimsConProcedencia(
      TRANSCRIPT,
      { ...OPTS, windowChars: 5000 },
      async (): Promise<any> => ({
        result: { claims: [CLAIM] },
        procedencia: null,
      }),
    )
    expect(res.items).toHaveLength(1)
    expect('extraidaPor' in res.items[0]).toBe(false)
  })

  it('llega al trozo servido: la puerta pública y el constructor de trozos lo conservan', () => {
    // Una fila REAL publicada, no una forma escrita a mano: lo que se prueba es
    // que ningún paso entre el extractor y el trozo reconstruye la declaración
    // campo a campo y se deja el nuevo por el camino.
    const dir = resolve('public/data/pleno-claims')
    const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as {
      plenos: { plenoId?: string; id?: string }[]
    }
    const plenoId = index.plenos.map((p) => p.plenoId ?? p.id).find(Boolean) as string
    const real = JSON.parse(readFileSync(resolve(dir, `${plenoId}.json`), 'utf8')).items[0]
    expect(real?.claim?.verbatim).toBeTruthy()
    const extraidaPor = {
      backend: 'claude-code',
      model: 'claude-code:claude-sonnet-5',
      promptVersion: PLENO_CLAIM_PROMPT_VERSION,
    }
    const gated = gateItemsForPublic([
      { claim: { ...real.claim, extraidaPor }, verification: real.verification },
    ])
    expect(gated).toHaveLength(1)
    const { chunk } = buildChunkAndDescriptor(plenoId, gated, '2026-11-09T00:00:00.000Z')
    expect(chunk.items[0].claim.extraidaPor).toEqual(extraidaPor)
  })
})
