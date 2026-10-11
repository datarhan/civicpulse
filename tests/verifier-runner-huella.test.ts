import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * La clave de caché del motor tiene que llevar los candidatos.
 *
 * Razonar iba por `{claimId}` y extraer por `{claimId, reasoning}`: ninguna
 * llevaba el shortlist. Una pasada con otros candidatos —contratos nuevos de la
 * nocturna, el corpus semántico reconstruido (el 05-10-2026 a las 09:44, un día
 * después de la re-derivación de #233)— repetía el razonamiento de antes contra
 * registros distintos, y la extracción traía índices `[i]` que ahora señalan a
 * otro candidato (aparte 3 de #196).
 *
 * Lo único falso aquí es el modelo: cada entrada del cliente apunta qué entrada
 * de caché pide cada llamada. El shortlist lo arma `getShortlist` de verdad, en
 * modo léxico.
 *
 * Las dos entradas, `callLLM` y `callLLMConProcedencia`: cuando #248 cambió el
 * motor a la segunda, una versión de esta prueba que sólo falsificaba la primera
 * llegó a `agy` y a `claude` de verdad en el portátil (05-10-2026, cuatro
 * llamadas). Y por si mañana hay una tercera, el entorno de cada prueba no deja
 * llegar a ningún backend: una llamada que se escape falla, no contesta.
 */
const pedidas: { promptVersion: string; input: unknown }[] = []

vi.mock('../src/llm/client', async (original) => {
  const real = await original<typeof import('../src/llm/client')>()
  const contestar = (opts: { promptVersion: string; input: unknown }) => {
    pedidas.push({ promptVersion: opts.promptVersion, input: opts.input })
    return opts.promptVersion.startsWith('engine-reason')
      ? { reasoning: 'El contrato [0] trata de las obras de la calle Mayor citadas.' }
      : { verdict: 'sin-datos', cites: [] }
  }
  return {
    ...real,
    callLLM: async (opts: { promptVersion: string; input: unknown }) => contestar(opts),
    callLLMConProcedencia: async (opts: { promptVersion: string; input: unknown }) => ({
      result: contestar(opts),
      procedencia: { backend: 'claude-code', model: 'claude-code:sonnet', deCache: false },
    }),
  }
})

const { makeEngineVerifier, huellaDeCandidatos } = await import('../src/scraper/verifier-runner')
const { loadCorpus } = await import('../src/scraper/semantic-shortlist')

const claim = {
  id: 'p1-001-cit-aaaaaa',
  plenoId: 'p1',
  type: 'cita_obra',
  topic: 'urbanismo',
  speakerGroup: null,
  verbatim: 'las obras de urbanización de la calle Mayor',
  context: 'Hemos terminado las obras de urbanización de la calle Mayor.',
  entities: {},
  confidence: 0.9,
} as never

const contrato = (finalAmount: number, permalink = 'https://contratacion/a') => ({
  title: 'Obras de urbanización de la calle Mayor',
  finalAmount,
  status: 'formalized',
  permalink,
})

const ctx = (tenders: unknown[]) =>
  ({
    tenders: { items: tenders },
    tendersTed: null,
    bdns: null,
    budget: null,
    promises: null,
    priorClaims: [],
    corpus: null,
  }) as never

/** Las entradas de caché que pidió una pasada del motor sobre `claim` con `tenders`. */
async function claves(tenders: unknown[], corpus: unknown = null) {
  pedidas.length = 0
  await makeEngineVerifier({ always: true, consistency: false })(claim, {
    ...(ctx(tenders) as object),
    corpus,
  } as never)
  return {
    razonar: pedidas.find((p) => p.promptVersion.startsWith('engine-reason'))?.input,
    extraer: pedidas.find((p) => p.promptVersion.startsWith('engine-extract'))?.input,
  }
}

beforeEach(() => {
  vi.stubEnv('VERIFIER_SHORTLIST', 'lexical')
  // Ningún backend alcanzable si algo se escapa de las falsificaciones de arriba.
  vi.stubEnv('LLM_BACKEND', 'claude-code')
  vi.stubEnv('CLAUDE_CODE_BIN', '/nonexistent/claude-en-una-prueba')
  vi.stubEnv('AGY_BIN', '/nonexistent/agy-en-una-prueba')
  vi.stubEnv('LLM_ZERO_COST_ONLY', '1')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('la clave de caché del motor', () => {
  it('es la misma con el mismo shortlist: una segunda pasada sigue saliendo de la caché', async () => {
    const a = await claves([contrato(482000)])
    const b = await claves([contrato(482000)])
    expect(a.razonar).toBeDefined()
    expect(a.extraer).toBeDefined()
    expect(b).toEqual(a)
  })

  it('cambia si cambia lo que el modelo lee de un candidato: no se repite un razonamiento hecho sobre otro registro', async () => {
    const a = await claves([contrato(482000)])
    const b = await claves([contrato(500000)])
    expect(b.razonar).not.toEqual(a.razonar)
  })

  it('y la extracción tampoco: sus índices señalarían a otro candidato', async () => {
    const a = await claves([contrato(482000)])
    const b = await claves([contrato(500000)])
    // Mismo razonamiento (el modelo falso contesta lo mismo), otro shortlist.
    expect(b.extraer).not.toEqual(a.extraer)
  })

  it('no cambia si sólo cambia el enlace: el modelo no lo lee, y la cita toma el ref del shortlist de hoy', async () => {
    const a = await claves([contrato(482000, 'https://contratacion/a')])
    const b = await claves([contrato(482000, 'https://contratacion/b')])
    expect(b).toEqual(a)
  })

  it('cada declaración sigue teniendo la suya', async () => {
    const a = await claves([contrato(482000)])
    expect(JSON.stringify(a.razonar)).toContain('p1-001-cit-aaaaaa')
  })
})

describe('entre pasadas, con un vector de consulta que no vuelve idéntico', () => {
  // OpenAI no devuelve siempre el mismo vector para el mismo texto: el
  // 11-10-2026, pidiendo seis veces cada consulta del oro, 12 de 59 trajeron más
  // de uno, con cosenos que se movían hasta 9e-4 (cache-de-consultas.ts). Aquí la
  // segunda respuesta lleva el coseno del único candidato de 0,2949 a 0,2951: del
  // «sim=0.29» al «sim=0.30» que lee el modelo.
  let dir: string
  let peticiones: number

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'huella-consultas-'))
    const fila = {
      kind: 'tender',
      sourceId: 'https://contratacion/a',
      text: 'Obras de urbanización de la calle Mayor',
      textSha256: 'x',
      embedding: [1, 0, 0],
      snippet: 'Obras de urbanización de la calle Mayor · 482.000 € · formalized',
      ref: 'https://contratacion/a',
    }
    writeFileSync(join(dir, 'verifier-corpus.jsonl'), JSON.stringify(fila) + '\n')
    writeFileSync(join(dir, 'verifier-corpus.jsonl.model'), 'openai:text-embedding-3-small:3')
    vi.stubEnv('VERIFIER_SHORTLIST', 'hybrid')
    vi.stubEnv('EMBED_BACKEND', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-de-prueba')
    peticiones = 0
    const cosenos = [0.2949, 0.2951]
    vi.stubGlobal('fetch', async (url: string) => {
      if (url !== 'https://api.openai.com/v1/embeddings')
        throw new Error(`fetch inesperado: ${url}`)
      const x = cosenos[Math.min(peticiones++, cosenos.length - 1)]
      return new Response(
        JSON.stringify({ data: [{ index: 0, embedding: [x, Math.sqrt(1 - x * x), 0] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(dir, { recursive: true, force: true })
  })

  it('la segunda pasada pide al modelo la misma entrada de caché que la primera', async () => {
    const corpus = loadCorpus(join(dir, 'verifier-corpus.jsonl'))
    const a = await claves([], corpus)
    const b = await claves([], corpus)
    // Sin contratos, el candidato sólo puede llegar por la mitad semántica.
    expect(a.razonar).toBeDefined()
    expect(b.razonar).toEqual(a.razonar)
    expect(b.extraer).toEqual(a.extraer)
  })

  it('y no vuelve a pedir el vector: la segunda pasada lee el que usó la primera', async () => {
    const corpus = loadCorpus(join(dir, 'verifier-corpus.jsonl'))
    await claves([], corpus)
    await claves([], corpus)
    expect(peticiones).toBe(1)
  })
})

describe('huellaDeCandidatos', () => {
  const c = (titulo: string, similarity = 0.5) => ({
    kind: 'tender' as const,
    ref: `https://contratacion/${titulo}`,
    snippet: `Obras ${titulo} · €1.000 · formalized`,
    similarity,
  })

  it('es estable: el mismo shortlist en objetos nuevos da la misma huella', () => {
    expect(huellaDeCandidatos([c('a'), c('b')])).toBe(huellaDeCandidatos([c('a'), c('b')]))
  })

  it('depende del orden, porque las citas van por índice', () => {
    expect(huellaDeCandidatos([c('a'), c('b')])).not.toBe(huellaDeCandidatos([c('b'), c('a')]))
  })

  it('depende de la similitud, que el prompt enseña al modelo', () => {
    expect(huellaDeCandidatos([c('a', 0.5)])).not.toBe(huellaDeCandidatos([c('a', 0.6)]))
  })
})
