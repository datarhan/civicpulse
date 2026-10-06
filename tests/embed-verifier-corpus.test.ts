import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildTenderRows, planDelCorpus } from '../scripts/embed-verifier-corpus'
import type { CorpusRow } from '../src/scraper/semantic-shortlist'

/**
 * Qué hace `embed:verifier-corpus` con una fila que ya está en la caché.
 *
 * La caché se reutiliza por el hash de `text`, que es lo que se embebe; el
 * `snippet` es lo que el modelo LEE, y no entra en el embedding. Hasta el
 * 06-10-2026 una fila con el mismo texto se conservaba entera, snippet viejo
 * incluido: cambiar cómo se compone el snippet no llegaba nunca al corpus de la
 * nocturna (scripts/hallazgos-pipeline.sh lo corre incremental), y el modelo
 * seguía leyendo el recorte de antes. Refrescarlo no cuesta ninguna llamada.
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/snippet-de-contrato_2026-10-06.json'), 'utf8'),
)
const cartelera = (F.contracts as Record<string, unknown>[]).find((r) => r.id === '4415701')

/**
 * El snippet de 4415701 en `.embed-cache/verifier-corpus.jsonl` del checkout
 * principal el 06-10-2026 (embebida el 21-09-2026): 230 caracteres, sin importe.
 */
const SNIPPET_DE_ANTES =
  'Contrato mixto suministro y servicio de implantación de cartelería digital en diversas sedes municipales del ayuntamiento de Riba-roja de Túria, por procedimiento abierto simplificado sumario, mejora relación calidad precio y vari'

function enCache(snippet: string): CorpusRow {
  const [fila] = buildTenderRows({ contracts: [cartelera] })
  return {
    kind: fila.kind,
    sourceId: fila.sourceId,
    text: fila.text,
    textSha256: fila.textSha256,
    embedding: [0.1, 0.2, 0.3],
    snippet,
    ref: fila.ref,
    party: null,
    embeddedAt: '2026-10-05T07:44:00.000Z',
  }
}

describe('una fila del corpus cuyo texto no cambió', () => {
  it('se queda con su embedding y toma el snippet de hoy, sin volver a embeberse', () => {
    const [hoy] = buildTenderRows({ contracts: [cartelera] })
    const vieja = enCache(SNIPPET_DE_ANTES)
    const plan = planDelCorpus([hoy], new Map([[`tender:${hoy.sourceId}`, vieja]]))
    expect(plan.porEmbeber).toEqual([])
    expect(plan.conservadas).toHaveLength(1)
    expect(plan.conservadas[0].embedding).toEqual([0.1, 0.2, 0.3])
    expect(plan.conservadas[0].snippet).toBe(hoy.snippet)
    expect(plan.conservadas[0].snippet).not.toBe(SNIPPET_DE_ANTES)
    expect(plan.refrescadas).toBe(1)
  })

  it('no cuenta como refrescada si su snippet ya era el de hoy', () => {
    const [hoy] = buildTenderRows({ contracts: [cartelera] })
    const plan = planDelCorpus([hoy], new Map([[`tender:${hoy.sourceId}`, enCache(hoy.snippet)]]))
    expect(plan.conservadas).toHaveLength(1)
    expect(plan.refrescadas).toBe(0)
  })
})

describe('una fila cuyo texto cambió, o que no estaba', () => {
  it('se vuelve a embeber, y no se conserva', () => {
    const [hoy] = buildTenderRows({ contracts: [cartelera] })
    const otraVersion = { ...enCache(hoy.snippet), textSha256: 'otro-texto' }
    const plan = planDelCorpus([hoy], new Map([[`tender:${hoy.sourceId}`, otraVersion]]))
    expect(plan.porEmbeber.map((p) => p.sourceId)).toEqual([hoy.sourceId])
    expect(plan.conservadas).toEqual([])
    expect(plan.refrescadas).toBe(0)
  })

  it('una fila nueva va a embeberse', () => {
    const [hoy] = buildTenderRows({ contracts: [cartelera] })
    const plan = planDelCorpus([hoy], new Map())
    expect(plan.porEmbeber.map((p) => p.sourceId)).toEqual([hoy.sourceId])
  })
})
