import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mergeVerified, type Overlay, type OverlayEntry } from '../src/scraper/verified-merge'
import { callLLM, loadConfigFromEnv } from '../src/llm/client'
import { EngineReasoningSchema } from '../src/llm/schemas'
import { esRecorteDe, MOTIVO_SIN_RECORTE_EN_EL_PARTE } from '../src/scraper/decision-del-motor'
import { RESUMEN_MAX } from '../src/scraper/claim-verifier-engine'

/**
 * `verify:pleno-claims:engine -- --ids <fichero> --recortar`, de punta a punta.
 *
 * Recorta explicaciones del motor publicadas a media frase desde el razonamiento
 * que las produjo, guardado en `.llm-cache`, con la promesa de no hacer ninguna
 * llamada a un modelo y de no tocar de cada entrada más que el resumen, el
 * motivo que lo lleva y la fecha. Las dos promesas viven en la costura entre la
 * caché, el bucle del guion, el overlay y lo que el rebuild publica, así que se
 * prueban ahí. Las filas son de verdad (tests/fixtures/recorte-del-motor_2026-10-04.json).
 *
 * La caché se siembra como la sembró la pasada de agosto: con `callLLM` y un
 * backend que contesta el razonamiento guardado, para que la clave la derive el
 * cliente y no esta prueba. Durante la pasada, el único backend posible es un
 * `gemini` que apunta cada llamada y falla: cualquier línea en su registro es
 * una llamada que no debía hacerse.
 *
 * `RUN_MANIFEST_DIR` apunta a la caja de arena: `.run-manifests/` es toda la
 * entrada de `check:runs`, y un parte de prueba allí sería un rojo de verdad.
 */

const SCRIPT = resolve('scripts/verify-pleno-claims-engine.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/recorte-del-motor_2026-10-04.json'), 'utf8'),
)
type Caso = 'frase' | 'elipsis' | 'cifra' | 'charla' | 'huerfana' | 'rederivada'
const ID = F.ids as Record<Caso, string>
const RECORTABLES: Caso[] = ['frase', 'elipsis', 'cifra', 'huerfana']
/** Un id que no tiene entrada del motor: el guion no lo intenta. */
const NO_ES_DEL_MOTOR = 'k4olcs-999-afi-000000'

/** Contesta lo que haya en el fichero de $RESPUESTA: el razonamiento que se siembra. */
const SEMBRADOR = `#!/usr/bin/env node
const { readFileSync } = require('node:fs')
process.stdout.write(JSON.stringify({
  response: readFileSync(process.env.RESPUESTA, 'utf8'),
  stats: { models: { prueba: { tokens: { input: 10, candidates: 10 } } } },
}))
`

/** Apunta cada llamada y falla. */
const DELATOR = `#!/usr/bin/env node
const prompt = (process.argv[3] || '?').slice(0, 80).replace(/\\n/g, ' ')
require('node:fs').appendFileSync(process.env.CALL_LOG, prompt + '\\n')
process.exit(1)
`

// Arranca el guion de verdad dos veces (~3 s cada una con tsx).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

let caja: string
let data: string
let ensayo: ReturnType<typeof spawnSync>
let overlayTrasEnsayo: string
let res: ReturnType<typeof spawnSync>
let sinIds: ReturnType<typeof spawnSync>
let overlay: Overlay
let publicado: {
  generatedAt: string
  composedAt?: string
  items: { claim: { id: string }; verification: { summary: string } }[]
}
let parte: Record<string, any>
let llamadas: string[]

const original = (caso: Caso): OverlayEntry => F.overlay.entries[ID[caso]]
/** El último parte de la carpeta, o `{}` si la pasada no llegó a escribir ninguno. */
const ultimoParte = (dir: string): Record<string, any> => {
  let partes: string[]
  try {
    partes = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return {}
  }
  return partes.length ? JSON.parse(readFileSync(join(dir, partes.sort().at(-1)!), 'utf8')) : {}
}

beforeAll(async () => {
  caja = mkdtempSync(join(tmpdir(), 'motor-recortar-'))
  data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  mkdirSync(join(caja, 'bin'))

  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('pleno-claims-verified-base.json', F.base)
  escribir('pleno-claims-overlay.json', F.overlay)
  // Lo publicado es base ⊕ overlay, como lo compone `rebuildVerified`.
  escribir('pleno-claims-verified.json', {
    generatedAt: F.base.generatedAt,
    items: mergeVerified(F.base.items, F.overlay),
  })
  for (const [pleno, texto] of Object.entries(F.transcripciones)) {
    writeFileSync(join(data, 'pleno-transcripts', `${pleno}.txt`), texto as string)
  }
  writeFileSync(join(caja, 'bin/sembrador'), SEMBRADOR, { mode: 0o755 })
  writeFileSync(join(caja, 'bin/gemini'), DELATOR, { mode: 0o755 })

  // Sembrar: la clave la deriva `callLLM`, con el backend y el modelo con los
  // que correrá el guion. Ningún otro backend en la cadena: si el sembrador
  // fallara, nada de pago ni de cuota contestaría por él.
  const config = {
    ...loadConfigFromEnv(),
    backend: 'gemini',
    geminiBin: join(caja, 'bin/sembrador'),
    geminiModel: 'modelo-de-prueba',
    claudeCodeBin: join(caja, 'bin/no-existe'),
    openaiApiKey: undefined,
    anthropicApiKey: undefined,
    zeroCostOnly: true,
    cacheDir: join(caja, '.llm-cache'),
  } as never
  const respuesta = join(caja, 'respuesta.json')
  process.env.RESPUESTA = respuesta
  for (const [version, porId] of Object.entries(
    F.razonamientos as Record<string, Record<string, string>>,
  )) {
    for (const [claimId, reasoning] of Object.entries(porId)) {
      writeFileSync(respuesta, JSON.stringify({ reasoning }))
      const r = await callLLM({
        systemPrompt: 's',
        userPrompt: 'u',
        promptVersion: version,
        schema: EngineReasoningSchema,
        input: { claimId },
        config,
      })
      if (r?.reasoning !== reasoning) throw new Error(`no se sembró ${version} · ${claimId}`)
    }
  }

  const ids = join(caja, 'ids.txt')
  writeFileSync(ids, ['# recorte', ...Object.values(ID), NO_ES_DEL_MOTOR].join('\n') + '\n')
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LLM_BACKEND: 'gemini',
    GEMINI_BIN: join(caja, 'bin/gemini'),
    GEMINI_MODEL: 'modelo-de-prueba',
    CLAUDE_CODE_BIN: join(caja, 'bin/no-existe'),
    LLM_ZERO_COST_ONLY: '1',
    CALL_LOG: join(caja, 'llamadas.log'),
  }
  const correr = (args: string[], partes: string) =>
    spawnSync(TSX, [SCRIPT, ...args], {
      cwd: caja,
      encoding: 'utf8',
      env: { ...env, RUN_MANIFEST_DIR: join(caja, partes) },
      timeout: 120_000,
    })

  sinIds = correr(['--recortar'], 'partes-sin-ids')
  ensayo = correr(['--ids', ids, '--recortar', '--dry-run'], 'partes-ensayo')
  overlayTrasEnsayo = readFileSync(join(data, 'pleno-claims-overlay.json'), 'utf8')
  res = correr(['--ids', ids, '--recortar'], 'partes')

  overlay = JSON.parse(readFileSync(join(data, 'pleno-claims-overlay.json'), 'utf8'))
  publicado = JSON.parse(readFileSync(join(data, 'pleno-claims-verified.json'), 'utf8'))
  parte = ultimoParte(join(caja, 'partes'))
  try {
    llamadas = readFileSync(join(caja, 'llamadas.log'), 'utf8').trim().split('\n')
  } catch {
    llamadas = []
  }
})

afterAll(() => {
  delete process.env.RESPUESTA
  rmSync(caja, { recursive: true, force: true })
})

describe('verify:pleno-claims:engine --recortar', () => {
  it('sin --ids se niega: recortar es sobre una lista medida, no sobre todo el overlay', () => {
    expect(sinIds.status).toBe(2)
  })

  it('el ensayo no escribe nada', () => {
    expect(ensayo.status, `${ensayo.stderr}`).toBe(0)
    expect(overlayTrasEnsayo).toBe(JSON.stringify(F.overlay, null, 2) + '\n')
    expect(ensayo.stderr).toMatch(/DRY-RUN/)
  })

  it('termina bien sin llamar a ningún modelo, y lo que juzgó salió de la caché', () => {
    expect(res.status, `${res.stderr}`).toBe(0)
    expect(llamadas).toEqual([])
    expect(parte.llm.calls).toBe(0)
    // El control: sin aciertos de caché, todo lo de abajo podría cumplirse con
    // un guion que no leyó nada. Seis razonamientos de v1 y los dos de v2.
    expect(parte.llm.cacheHits).toBe(8)
  })

  it('recorta las cuatro que puede, y de cada una sólo el resumen, el motivo y la fecha', () => {
    for (const caso of RECORTABLES) {
      const antes = original(caso)
      const despues = overlay.entries[ID[caso]]
      const resumen = despues.verification.summary
      expect(resumen, caso).not.toBe(antes.verification.summary)
      expect(esRecorteDe(resumen, antes.verification.summary), caso).toBe(true)
      expect(resumen.length, caso).toBeLessThanOrEqual(RESUMEN_MAX)
      expect(resumen, caso).toMatch(/([.!?]["»”)]*|…)$/)
      expect(despues.verification, caso).toEqual({ ...antes.verification, summary: resumen })
      expect(despues.source, caso).toBe(antes.source)
      expect(despues.editor, caso).toBe(antes.editor)
      const prefijo = antes.reason!.slice(
        0,
        antes.reason!.length - antes.verification.summary.length,
      )
      expect(despues.reason, caso).toBe(prefijo + resumen)
      expect(Date.parse(despues.appliedAt), caso).toBeGreaterThan(Date.parse(antes.appliedAt))
      expect(Object.keys(despues).sort(), caso).toEqual(Object.keys(antes).sort())
    }
  })

  it('el «.» de una cifra no se toma por fin de frase', () => {
    const resumen = overlay.entries[ID.cifra].verification.summary
    expect(resumen).not.toContain('€37')
    expect(resumen.endsWith('…')).toBe(true)
  })

  it('la charla y la re-derivada se quedan como estaban, fecha incluida', () => {
    expect(overlay.entries[ID.charla]).toEqual(original('charla'))
    expect(overlay.entries[ID.rederivada]).toEqual(original('rederivada'))
  })

  it('ninguna otra entrada cambia', () => {
    expect(Object.keys(overlay.entries).sort()).toEqual(Object.keys(F.overlay.entries).sort())
  })

  it('lo publicado sale del overlay nuevo: el rebuild corrió, con el linaje del base', () => {
    const resumenPublicado = (id: string) =>
      publicado.items.find((it) => it.claim.id === id)?.verification.summary
    for (const caso of ['frase', 'elipsis', 'cifra'] as Caso[]) {
      expect(resumenPublicado(ID[caso]), caso).toBe(overlay.entries[ID[caso]].verification.summary)
    }
    // La huérfana no tiene declaración: el overlay la guarda y no se publica.
    expect(resumenPublicado(ID.huerfana)).toBeUndefined()
    expect(resumenPublicado(ID.charla)).toBe(original('charla').verification.summary)
    expect(publicado.generatedAt).toBe(F.base.generatedAt)
    expect(typeof publicado.composedAt).toBe('string')
  })

  it('y los trozos servidos también', () => {
    const trozo = JSON.parse(readFileSync(join(data, 'pleno-claims/c8kr44.json'), 'utf8'))
    const servido = (id: string) =>
      trozo.items.find((it: { claim: { id: string } }) => it.claim.id === id)?.verification.summary
    expect(servido(ID.elipsis)).toBe(overlay.entries[ID.elipsis].verification.summary)
    expect(servido(ID.cifra)).toBe(overlay.entries[ID.cifra].verification.summary)
  })

  it('el parte cuenta cada declaración en un solo cubo, y la charla aparte', () => {
    expect(parte.mode).toBe('recortar')
    expect(parte.attempted).toBe(6)
    expect(parte.judged).toBe(4)
    expect(parte.neverAttempted).toBe(0)
    expect(parte.skipped).toEqual({
      [MOTIVO_SIN_RECORTE_EN_EL_PARTE.charla]: 1,
      [MOTIVO_SIN_RECORTE_EN_EL_PARTE['no-coincide']]: 1,
    })
    expect(parte.outcome).toEqual({ recortada: 4 })
  })

  it('lo que no es una retractación del motor ni se intenta, y lo dice', () => {
    expect(res.stderr).toContain(`${NO_ES_DEL_MOTOR} no es una retractación del motor`)
  })

  it('y la línea final dice cuántas recortó y cuántas dejó', () => {
    expect(res.stderr).toMatch(/--recortar: recortadas 4 · dejadas 2/)
  })
})
