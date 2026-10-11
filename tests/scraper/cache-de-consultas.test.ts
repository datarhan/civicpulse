import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { conCacheDeConsultas } from '../../src/scraper/cache-de-consultas'
import { getShortlist } from '../../src/scraper/claim-verifier'
import { loadCorpus, type Corpus } from '../../src/scraper/semantic-shortlist'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

/**
 * La caché de los vectores de consulta (cache-de-consultas.ts), sobre ficheros
 * de verdad en un directorio temporal. El embedder es una función que apunta
 * cada petición: lo que se prueba es qué le pide el envoltorio y qué devuelve.
 */
const EMBEDDER = 'openai:text-embedding-3-small:3'
// Sin decimal corto: un guardado que redondee (toFixed, Float32) devolvería otro
// número, y el coseno se movería otra vez entre pasadas.
const V1 = [1 / 3, -0.012345678901234567, 2 / 3]
const V2 = [0.5, 0.5, Math.SQRT1_2]

let dir: string
let pedidos: string[]

/** Un embedder que contesta `vectores` por orden (el último se repite). */
function embedder(vectores: number[][]) {
  let i = 0
  return async (texto: string) => {
    pedidos.push(texto)
    return vectores[Math.min(i++, vectores.length - 1)]
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'consultas-'))
  pedidos = []
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('conCacheDeConsultas', () => {
  it('la segunda petición del mismo texto devuelve el vector guardado, sin llamar al embedder', async () => {
    const embed = conCacheDeConsultas(embedder([V1, V2]), { dir, embedder: EMBEDDER, dim: 3 })
    expect(await embed('las obras de la calle Mayor')).toEqual(V1)
    expect(await embed('las obras de la calle Mayor')).toEqual(V1)
    expect(pedidos).toEqual(['las obras de la calle Mayor'])
  })

  it('y lo lee la pasada siguiente, que es otro proceso: el vector vive en el disco', async () => {
    await conCacheDeConsultas(embedder([V1]), { dir, embedder: EMBEDDER, dim: 3 })('texto')
    const siguiente = conCacheDeConsultas(embedder([V2]), { dir, embedder: EMBEDDER, dim: 3 })
    expect(await siguiente('texto')).toEqual(V1)
  })

  it('otro embedder es otra entrada, y no pisa la del primero', async () => {
    await conCacheDeConsultas(embedder([V1]), { dir, embedder: EMBEDDER, dim: 3 })('texto')
    const otro = conCacheDeConsultas(embedder([V2]), {
      dir,
      embedder: 'gemini:gemini-embedding-001:3',
      dim: 3,
    })
    expect(await otro('texto')).toEqual(V2)
    const elPrimero = conCacheDeConsultas(embedder([V2]), { dir, embedder: EMBEDDER, dim: 3 })
    expect(await elPrimero('texto')).toEqual(V1)
  })

  it('otro texto es otra entrada', async () => {
    const embed = conCacheDeConsultas(embedder([V1, V2]), { dir, embedder: EMBEDDER, dim: 3 })
    await embed('uno')
    expect(await embed('dos')).toEqual(V2)
  })

  it('el primero que guarda gana: dos pasadas a la vez acaban con el mismo vector', async () => {
    const a = conCacheDeConsultas(embedder([V1]), { dir, embedder: EMBEDDER, dim: 3 })
    // B no encuentra nada y, mientras espera a su embedder, A guarda el suyo.
    const b = conCacheDeConsultas(
      async (t) => {
        await a(t)
        return V2
      },
      { dir, embedder: EMBEDDER, dim: 3 },
    )
    expect(await b('texto')).toEqual(V1)
    const siguiente = conCacheDeConsultas(embedder([V2]), { dir, embedder: EMBEDDER, dim: 3 })
    expect(await siguiente('texto')).toEqual(V1)
  })

  it('una entrada ilegible se rehace, en vez de dejar la consulta sin guardar para siempre', async () => {
    await conCacheDeConsultas(embedder([V1]), { dir, embedder: EMBEDDER, dim: 3 })('texto')
    const [fichero] = readdirSync(dir)
    writeFileSync(join(dir, fichero), '{"embedder":"openai:text-emb') // una escritura cortada
    const embed = conCacheDeConsultas(embedder([V2, V1]), { dir, embedder: EMBEDDER, dim: 3 })
    expect(await embed('texto')).toEqual(V2)
    expect(await embed('texto')).toEqual(V2)
  })

  it('una entrada que es de otra consulta no se sirve', async () => {
    const embed = conCacheDeConsultas(embedder([V1, V2]), { dir, embedder: EMBEDDER, dim: 3 })
    await embed('uno')
    const [deUno] = readdirSync(dir)
    await embed('dos')
    const deDos = readdirSync(dir).find((f) => f !== deUno)!
    // En el sitio de «dos», la entrada de «uno».
    writeFileSync(join(dir, deDos), readFileSync(join(dir, deUno)))
    const siguiente = conCacheDeConsultas(embedder([V2]), { dir, embedder: EMBEDDER, dim: 3 })
    expect(await siguiente('dos')).toEqual(V2)
  })

  it('un vector que no es del ancho del corpus se devuelve, pero no se guarda', async () => {
    const embed = conCacheDeConsultas(embedder([[0.6, 0.8], V1]), {
      dir,
      embedder: EMBEDDER,
      dim: 3,
    })
    // Quien llama lo rechaza con su propio error (assertQueryDimMatchesCorpus).
    expect(await embed('texto')).toEqual([0.6, 0.8])
    expect(readdirSync(dir)).toEqual([])
    expect(await embed('texto')).toEqual(V1)
  })

  it('si no puede guardar, embebe como antes y lo dice una vez: la caché nunca para al verificador', async () => {
    const avisos = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const noEsDirectorio = join(dir, 'fichero')
    writeFileSync(noEsDirectorio, '')
    const embed = conCacheDeConsultas(embedder([V1, V2]), {
      dir: noEsDirectorio,
      embedder: EMBEDDER,
      dim: 3,
    })
    expect(await embed('texto')).toEqual(V1)
    expect(await embed('texto')).toEqual(V2)
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(String(avisos.mock.calls[0][0])).toContain(noEsDirectorio)
  })
})

describe('getShortlist guarda los vectores de consulta junto al corpus', () => {
  const claim = {
    id: 'p1-001-cit-aaaaaa',
    type: 'cita_obra',
    topic: 'urbanismo',
    speakerGroup: null,
    verbatim: 'las obras de urbanización de la calle Mayor',
    context: 'Hemos terminado las obras de urbanización de la calle Mayor.',
    entities: {},
  } as unknown as PlenoClaim
  const fila = {
    kind: 'tender' as const,
    sourceId: 'https://contratacion/a',
    text: 'Obras de urbanización de la calle Mayor',
    textSha256: 'x',
    embedding: [1, 0, 0],
    snippet: 'Obras de urbanización de la calle Mayor · 482.000 € · formalized',
    ref: 'https://contratacion/a',
  }
  let peticiones: number

  beforeEach(() => {
    writeFileSync(join(dir, 'verifier-corpus.jsonl'), JSON.stringify(fila) + '\n')
    writeFileSync(join(dir, 'verifier-corpus.jsonl.model'), EMBEDDER)
    vi.stubEnv('VERIFIER_SHORTLIST', 'hybrid')
    vi.stubEnv('EMBED_BACKEND', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-de-prueba')
    peticiones = 0
    vi.stubGlobal('fetch', async (url: string) => {
      if (url !== 'https://api.openai.com/v1/embeddings')
        throw new Error(`fetch inesperado: ${url}`)
      peticiones++
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.6, 0.8, 0] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('en <directorio del corpus>/consultas, no en el .embed-cache del directorio de trabajo', async () => {
    const corpus = loadCorpus(join(dir, 'verifier-corpus.jsonl'))
    const lista = await getShortlist({ claim }, 8, { corpus })
    expect(lista.map((c) => c.similarity)).toEqual([0.6])
    expect(readdirSync(join(dir, 'consultas'))).toHaveLength(1)
  })

  it('un corpus armado a mano no guarda nada, aunque diga venir del fichero del checkout', async () => {
    // Las pruebas arman corpus así, con el `sourcePath` del de verdad
    // (semantic-shortlist.test.ts): derivar el directorio de esa ruta escribiría
    // vectores de mentira en la caché del checkout.
    const corpus: Corpus = {
      rows: [fila],
      sourcePath: join(dir, 'verifier-corpus.jsonl'),
      model: EMBEDDER,
    }
    await getShortlist({ claim }, 8, { corpus })
    await getShortlist({ claim }, 8, { corpus })
    expect(peticiones).toBe(2)
    expect(existsSync(join(dir, 'consultas'))).toBe(false)
  })
})
