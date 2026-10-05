import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
 * Lo único falso aquí es el modelo: `callLLM` apunta qué entrada de caché pide
 * cada llamada. El shortlist lo arma `getShortlist` de verdad, en modo léxico.
 */
const pedidas: { promptVersion: string; input: unknown }[] = []

vi.mock('../src/llm/client', async (original) => {
  const real = await original<typeof import('../src/llm/client')>()
  return {
    ...real,
    callLLM: async (opts: { promptVersion: string; input: unknown }) => {
      pedidas.push({ promptVersion: opts.promptVersion, input: opts.input })
      return opts.promptVersion.startsWith('engine-reason')
        ? { reasoning: 'El contrato [0] trata de las obras de la calle Mayor citadas.' }
        : { verdict: 'sin-datos', cites: [] }
    },
  }
})

const { makeEngineVerifier, huellaDeCandidatos } = await import('../src/scraper/verifier-runner')

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
async function claves(tenders: unknown[]) {
  pedidas.length = 0
  await makeEngineVerifier({ always: true, consistency: false })(claim, ctx(tenders))
  return {
    razonar: pedidas.find((p) => p.promptVersion.startsWith('engine-reason'))?.input,
    extraer: pedidas.find((p) => p.promptVersion.startsWith('engine-extract'))?.input,
  }
}

beforeEach(() => {
  vi.stubEnv('VERIFIER_SHORTLIST', 'lexical')
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
