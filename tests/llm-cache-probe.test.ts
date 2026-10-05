import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import {
  callLLM,
  getRunStats,
  llmCacheGet,
  llmCacheHas,
  loadConfigFromEnv,
  resetRunStats,
} from '../src/llm/client'
import { cabeElFragmento } from '../src/scraper/reader-review'

/**
 * `llmCacheHas` responde «¿contestaría la caché a esto sin salir de disco?», y
 * su único riesgo es derivar la clave por su cuenta: una sonda que dice «sí»
 * sobre algo que no está hace que un fragmento se salte el presupuesto, la
 * llamada se haga igual y el reloj se vaya por donde nadie mira. Estas pruebas
 * comprueban lo único que importa de ella — que ve exactamente lo que `callLLM`
 * escribió, y sólo eso.
 */
const dir = mkdtempSync(join(tmpdir(), 'cache-probe-'))
const cacheDir = join(dir, 'cache')
const bin = join(dir, 'fake-gemini')
// Un backend que contesta al instante, para poder SEMBRAR la caché de verdad en
// vez de escribir un fichero a mano con la clave que yo crea que es — que sería
// volver a derivarla y probar mi copia contra sí misma.
// El sobre que espera el envoltorio de gemini: `{response: "<json>"}`. Con
// cualquier otra cosa la llamada cae al siguiente backend de la cadena, y la
// prueba dejaría de ser hermética sin decirlo — se apoyaría en que la máquina
// que la corre tenga `claude` instalado.
writeFileSync(bin, `#!/bin/sh\ncat <<'EOF'\n{"response":"{\\"ok\\":true}"}\nEOF\n`)
chmodSync(bin, 0o755)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const schema = z.object({ ok: z.boolean() })
// Partiendo de la configuración real y cambiando sólo lo que hace falta: una
// escrita a mano se deja los binarios de los demás backends y `buildBackendChain`
// revienta antes de llegar a la caché, que es lo único que se quiere medir.
const config = {
  ...loadConfigFromEnv(),
  backend: 'gemini',
  geminiBin: bin,
  cacheDir,
  maxRetries: 0,
} as never
const sonda = (input: unknown) => llmCacheHas({ schema, promptVersion: 'probe-v1', input, config })

describe('llmCacheHas', () => {
  it('dice que no antes de que exista la entrada, y que sí después', async () => {
    const input = { k: `probe-${Date.now()}` }
    // El control primero: sin este par, la prueba pasaría con una sonda que
    // devolviera `true` siempre.
    expect(sonda(input)).toBe(false)
    await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      schema,
      promptVersion: 'probe-v1',
      input,
      config,
    })
    expect(sonda(input)).toBe(true)
  }, 30_000)

  it('distingue las tres cosas que forman la clave', async () => {
    const input = { route: '/hallazgos', fragment: 'aaa', facts: 'f1' }
    await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      schema,
      promptVersion: 'probe-v1',
      input,
      config,
    })
    expect(sonda(input)).toBe(true)
    // Otro fragmento de la misma página: la avería que documenta `cacheKey` en
    // review-surfaces.ts —servir la respuesta del fragmento 1 para toda la
    // página— tiene que seguir siendo imposible de ver como acierto.
    expect(sonda({ ...input, fragment: 'bbb' })).toBe(false)
    // Y las CIFRAS: mismo texto con los datos movidos no es la misma pregunta.
    expect(sonda({ ...input, facts: 'f2' })).toBe(false)
    // Y otra versión del prompt tampoco.
    expect(llmCacheHas({ schema, promptVersion: 'probe-v2', input, config })).toBe(false)
  }, 30_000)
})

/**
 * `llmCacheGet` LEE lo que la caché contestaría, y nunca pregunta a nadie.
 *
 * La necesita quien tiene que reutilizar una respuesta ya pagada con la promesa
 * de no hacer ninguna llamada: `verify:pleno-claims:engine -- --recortar`
 * recorta explicaciones publicadas desde el razonamiento que las produjo. Con
 * `callLLM`, un fallo de caché llama al backend, y la promesa dependería de que
 * el entorno lo frenara.
 */
describe('llmCacheGet', () => {
  const lee = (input: unknown) =>
    llmCacheGet({ schema, promptVersion: 'probe-v1', input, config }) as { ok: boolean } | null

  it('sin la entrada devuelve null, y no la crea preguntando al backend', () => {
    resetRunStats()
    const input = { k: `get-${Date.now()}` }
    expect(lee(input)).toBeNull()
    // El backend falso contesta al instante: si la lectura hubiera llamado, la
    // respuesta estaría ya en la caché y la sonda diría que sí.
    expect(sonda(input)).toBe(false)
    expect(getRunStats().calls).toBe(0)
  })

  it('con la entrada devuelve lo que callLLM guardó, y cuenta el acierto como callLLM', async () => {
    const input = { k: `get-sembrada-${Date.now()}` }
    await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      schema,
      promptVersion: 'probe-v1',
      input,
      config,
    })
    resetRunStats()
    expect(lee(input)).toEqual({ ok: true })
    // El parte de una pasada que juzga desde la caché tiene que decir de dónde
    // salió lo que juzgó: sin el acierto, `judged-without-calls` la daría por falsa.
    expect(getRunStats()).toMatchObject({ cacheHits: 1, calls: 0 })
  }, 30_000)

  it('la clave es la de callLLM: otra versión del prompt no lee la misma entrada', async () => {
    const input = { k: `get-version-${Date.now()}` }
    await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      schema,
      promptVersion: 'probe-v1',
      input,
      config,
    })
    expect(lee(input)).toEqual({ ok: true })
    expect(llmCacheGet({ schema, promptVersion: 'probe-v2', input, config })).toBeNull()
  }, 30_000)
})

/**
 * La regla del presupuesto, aparte del guion que la usa.
 *
 * El defecto que repara no era el reloj: era que la guarda le ponía a TODOS los
 * fragmentos el precio de la llamada más lenta medida, incluidos los que ya
 * estaban contestados en disco. Medido el 4-09-2026 sobre `/declaraciones` con
 * 180 s de presupuesto: el primer fragmento costó 138 s de verdad, y en ese
 * punto la regla vieja rechazaba el segundo —que estaba en caché— porque la
 * estimación pedía otros 138 y quedaban 42.
 */
describe('cabeElFragmento', () => {
  // Las cifras de /declaraciones, en milisegundos: 138 s gastados de 180 s.
  const gastado = { ahora: 138_000, slowestCallMs: 138_000, deadline: 180_000 }

  it('un fragmento en caché cabe aunque el reloj esté agotado', () => {
    expect(cabeElFragmento({ ...gastado, gratis: true })).toBe(true)
  })

  /**
   * EL CONTROL, y sin él la prueba de arriba pasaría con una regla que
   * devolviera `true` siempre: en el MISMO instante, un fragmento que sí cuesta
   * no cabe. Es la mitad que hay que conservar — un presupuesto que deja de
   * frenar el trabajo caro no es un presupuesto.
   */
  it('uno que cuesta, en ese mismo instante, no', () => {
    expect(cabeElFragmento({ ...gastado, gratis: false })).toBe(false)
  })

  it('con reloj de sobra cabe cueste lo que cueste', () => {
    expect(
      cabeElFragmento({ ahora: 0, slowestCallMs: 138_000, deadline: 180_000, gratis: false }),
    ).toBe(true)
  })

  /**
   * El primer fragmento siempre corre: `slowestCallMs` vale 0 hasta que se ha
   * medido algo, y un presupuesto demasiado pequeño para un solo fragmento
   * tiene que revisar uno igualmente. Revisar nada y decirlo es honesto pero
   * inútil.
   */
  it('el primero corre aunque el presupuesto sea ridículo', () => {
    expect(cabeElFragmento({ ahora: 0, slowestCallMs: 0, deadline: 1, gratis: false })).toBe(true)
  })
})
