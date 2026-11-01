import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { INJECTIONS } from '../scripts/check-guards'
import { loadSessionTexts } from '../scripts/lib/transcript-corpus'
import { loadVerifiedCorpus } from '../scripts/lib/verified-corpus'
import { acceptedBaseline, citasFueraDeAudioFailure } from '../src/scraper/corpus-baseline'
import {
  buildQuoteProvenance,
  classifyQuoteProvenance,
  origenDeCita,
  origenSanityFailure,
  type SessionTexts,
} from '../src/scraper/quote-provenance'
import { ENV, TSX, aplicarInyeccion, cajaVacia, limpiarCajas } from './check-guards-cajas.ts'

/**
 * `/metodologia#citas-transcripcion` dice que las citas de `/hallazgos` se toman
 * de la transcripción automática, no de un acta. Estas pruebas fijan lo que hace
 * rojo que deje de ser cierto: la decisión pura, y la guarda de verdad con sus
 * inyecciones de verdad hasta `corpus-delta.ts`, que es por donde la nocturna la
 * lee.
 *
 * TODO SINTÉTICO, a propósito: ninguna lee `public/data/`. Una prueba de vitest
 * sobre datos vivos puso roja la nocturna el 01-11-2026, y la regla que se fija
 * aquí es sobre la lógica de la guarda, no sobre el corpus de hoy; el corpus de
 * hoy lo mira la guarda misma, cada noche.
 */

// Varios arranques de tsx por bloque; el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

afterAll(limpiarCajas)

const DICHO_EN_EL_PLENO =
  'el contrato de limpieza se prorroga dos años más sin que nadie haya revisado el servicio'
const AUDIO = [
  `[10.0 → 14.5] ${DICHO_EN_EL_PLENO}`,
  '[14.5 → 19.0] y eso lo vamos a llevar a la comisión informativa del mes que viene',
  '[19.0 → 23.2] porque hasta ahora no se ha presentado ningún informe de seguimiento',
  '[23.2 → 27.9] así que pedimos que conste la posición de nuestro grupo en esta sesión',
].join('\n')

const REDACTADO_POR_SECRETARIA =
  'la secretaria da lectura al dictamen de la comisión informativa de hacienda y el pleno lo aprueba por mayoría absoluta'
const ACTA = [
  '[0.0 → 0.0] ACTA DE LA SESIÓN ORDINARIA CELEBRADA POR EL AYUNTAMIENTO PLENO',
  `[0.0 → 0.0] ${REDACTADO_POR_SECRETARIA}`,
  '[0.0 → 0.0] y no habiendo más asuntos que tratar se levanta la sesión a las veintiuna horas',
].join('\n')

const SIN_MARCAS = `${DICHO_EN_EL_PLENO}\ny aquí acaba este texto suelto, sin una sola marca de tiempo`

const sesion = (current: string | null, superseded: string | null = null): SessionTexts => ({
  current,
  superseded,
  currentBytes: current?.length ?? 0,
  supersededBytes: superseded?.length ?? 0,
})
const origen = (cita: string, s: SessionTexts) => origenDeCita(classifyQuoteProvenance(cita, s), s)

describe('origenDeCita', () => {
  it('una cita de la transcripción vigente sale de audio cuando el fichero es de audio', () => {
    expect(origen(DICHO_EN_EL_PLENO, sesion(AUDIO))).toBe('audio')
  })

  it('una cita del acta vigente sale de un acta', () => {
    expect(origen(REDACTADO_POR_SECRETARIA, sesion(ACTA))).toBe('acta')
  })

  it('juzga el fichero donde está la cita, no la vigente de su sesión', () => {
    // La forma de `19xkzxw`: vigente de audio, sustituida que era el acta. Mirar
    // sólo la vigente daría por audio una cita que sale del acta.
    const s = sesion(AUDIO + '\n'.repeat(400), ACTA)
    const clasificada = classifyQuoteProvenance(REDACTADO_POR_SECRETARIA, s)
    expect(clasificada).toMatchObject({ kind: 'clasificada', status: 'solo-en-sustituida' })
    expect(origen(REDACTADO_POR_SECRETARIA, s)).toBe('acta')
  })

  it('tampoco se pierde cuando la vigente es más corta y la cita queda «sin determinar»', () => {
    const s = sesion(AUDIO.slice(0, 160), ACTA + '\n'.repeat(400))
    const clasificada = classifyQuoteProvenance(REDACTADO_POR_SECRETARIA, s)
    expect(clasificada).toMatchObject({
      kind: 'clasificada',
      status: 'sin-determinar',
      reason: 'transcripcion-actual-mas-corta',
    })
    expect(origen(REDACTADO_POR_SECRETARIA, s)).toBe('acta')
  })

  it('un fichero sin marcas de tiempo no prueba audio', () => {
    expect(origen(DICHO_EN_EL_PLENO, sesion(SIN_MARCAS))).toBe('unknown')
  })

  it('sin transcripción vigente no hay origen que afirmar', () => {
    expect(origen(DICHO_EN_EL_PLENO, sesion(null))).toBe('unknown')
    // Tampoco cuando sólo queda la sustituida: el clasificador no llega a mirarla.
    expect(origen(DICHO_EN_EL_PLENO, sesion(null, AUDIO))).toBe('unknown')
  })

  it('una cita que no está en ningún fichero no sale de audio', () => {
    expect(
      origen('esto no lo ha dicho nadie en ninguna de estas dos sesiones', sesion(AUDIO)),
    ).toBe('unknown')
  })
})

describe('origenSanityFailure', () => {
  const CORPUS_SANO = { audio: 3, acta: 2, unknown: 0 }

  it('acepta una pasada cuyas cuentas cuadran', () => {
    expect(origenSanityFailure({ audio: 5, acta: 0, unknown: 0 }, 5, CORPUS_SANO)).toBeNull()
  })

  it('no acepta una pasada que no evaluó ninguna cita', () => {
    expect(origenSanityFailure({ audio: 0, acta: 0, unknown: 0 }, 0, CORPUS_SANO)).toMatch(
      /ninguna cita/,
    )
  })

  it('no acepta contadores que no suman las citas', () => {
    expect(origenSanityFailure({ audio: 4, acta: 0, unknown: 0 }, 5, CORPUS_SANO)).toMatch(
      /suman 4/,
    )
  })

  it('no acepta un detector que no reconoce ni un acta: «todo audio» sería su defecto', () => {
    expect(
      origenSanityFailure({ audio: 5, acta: 0, unknown: 0 }, 5, { audio: 5, acta: 0, unknown: 0 }),
    ).toMatch(/ni un acta/)
  })

  it('no acepta un detector que no reconoce ni un audio', () => {
    expect(
      origenSanityFailure({ audio: 0, acta: 5, unknown: 0 }, 5, { audio: 0, acta: 5, unknown: 0 }),
    ).toMatch(/ni un audio/)
  })
})

describe('citasFueraDeAudioFailure', () => {
  it('una pasada limpia no falla', () => {
    expect(citasFueraDeAudioFailure({ fueraDeAudio: [] })).toBeNull()
  })

  it('una cita fuera de audio falla', () => {
    expect(citasFueraDeAudioFailure({ fueraDeAudio: [{ findingId: 'h-1' }] })).toMatch(/1 cita/)
  })

  it('una pasada que no trae el campo no es una pasada limpia', () => {
    // El defecto de `r?.findings ?? []`: un resultado ausente no es «no encontró nada».
    expect(citasFueraDeAudioFailure({})).toMatch(/no dice/)
  })
})

/** El árbol que lee la guarda: hallazgos, transcripciones, monolito y snapshot. */
function caja(): string {
  const raiz = cajaVacia('check-finding-quotes-origen-')
  const data = join(raiz, 'public/data')
  const transcripciones = join(data, 'pleno-transcripts')
  mkdirSync(join(transcripciones, 'superseded'), { recursive: true })
  writeFileSync(join(transcripciones, 'ses-audio.txt'), AUDIO)
  writeFileSync(join(transcripciones, 'ses-acta.txt'), ACTA)
  writeFileSync(join(transcripciones, 'superseded/ses-audio.txt'), SIN_MARCAS)

  const findings = [
    {
      id: 'h-1',
      plenoId: 'ses-audio',
      title: 'Un hallazgo de prueba',
      quotes: [{ text: DICHO_EN_EL_PLENO, sourceClaimId: 'c-1' }],
    },
  ]
  writeFileSync(
    join(data, 'pleno-findings.json'),
    JSON.stringify({ generatedAt: '2026-11-01T00:00:00.000Z', items: findings }, null, 2) + '\n',
  )
  const monolito = join(data, 'pleno-claims-verified.json')
  writeFileSync(
    monolito,
    JSON.stringify({ items: [{ claim: { id: 'c-1' }, verification: { verdict: 'sin-datos' } }] }),
  )

  const snapshot = buildQuoteProvenance(
    findings,
    loadSessionTexts(['ses-audio'], {
      transcriptsDir: transcripciones,
      supersededDir: join(transcripciones, 'superseded'),
    }),
    loadVerifiedCorpus({
      monolithPath: monolito,
      basePath: join(data, 'no-hay-base.json'),
      overlayPath: join(data, 'no-hay-overlay.json'),
    }),
    { generatedAt: '2026-11-01T00:00:00.000Z', findingsGeneratedAt: '2026-11-01T00:00:00.000Z' },
  )
  writeFileSync(join(data, 'finding-quote-provenance.json'), JSON.stringify(snapshot, null, 2))
  return raiz
}

const GUARDA = resolve('scripts/check-finding-quotes.ts')
const DELTA = resolve('scripts/corpus-delta.ts')

function correrGuarda(raiz: string, ...args: string[]) {
  const r = spawnSync(TSX, [GUARDA, ...args], { cwd: raiz, env: ENV, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** `corpus-delta.ts` sobre lo que imprimió la guarda, con la línea base vacía. */
function correrDelta(raiz: string, pasada: string, ...args: string[]) {
  const cur = join(raiz, 'pasada.json')
  const base = join(raiz, 'linea-base.json')
  writeFileSync(cur, pasada)
  writeFileSync(base, JSON.stringify(acceptedBaseline([], '2026-11-01T00:00:00.000Z')))
  const r = spawnSync(TSX, [DELTA, cur, base, ...args], { cwd: raiz, env: ENV, encoding: 'utf8' })
  return { status: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const DE_ORIGEN = INJECTIONS.flatMap((inj, i) =>
  inj.guard === 'check:finding-quotes' && inj.espera ? [{ inj, i }] : [],
)

describe('check:finding-quotes, de punta a punta sobre un árbol sintético', () => {
  let limpia: ReturnType<typeof correrGuarda>
  beforeAll(() => {
    limpia = correrGuarda(caja(), '--json')
  })

  it('sin inyectar sale en verde', () => {
    expect(limpia.status, limpia.salida).toBe(0)
  })

  it('demuestra que evaluó: cuenta las citas por origen y los ficheros del corpus', () => {
    const pasada = JSON.parse(limpia.stdout)
    expect(pasada.origen).toEqual({ audio: 1, acta: 0, unknown: 0 })
    expect(pasada.fueraDeAudio).toEqual([])
    // Una vigente de audio, un acta y una sustituida sin marcas: mira los dos directorios.
    expect(pasada.corpusPorTipo).toEqual({ audio: 1, acta: 1, unknown: 1 })
  })

  it('corpus-delta acepta esa pasada', () => {
    const delta = correrDelta(caja(), limpia.stdout)
    expect(delta.status, delta.salida).toBe(0)
  })

  it('hay una inyección para el acta y otra para lo desconocido', () => {
    expect(DE_ORIGEN.map(({ inj }) => String(inj.espera))).toEqual([
      String(/origen: acta/),
      String(/origen: unknown/),
    ])
  })

  it.each(DE_ORIGEN)('$inj.describe: la guarda sale 1 y nombra el origen', ({ inj, i }) => {
    const raiz = caja()
    aplicarInyeccion(raiz, i)
    const r = correrGuarda(raiz)
    expect(r.status, r.salida).toBe(1)
    expect(r.salida).toMatch(inj.espera as RegExp)
  })

  it.each(DE_ORIGEN)('$inj.describe: la nocturna también la ve', ({ i }) => {
    const raiz = caja()
    aplicarInyeccion(raiz, i)
    const pasada = correrGuarda(raiz, '--json')
    expect(pasada.status, pasada.salida).toBe(1)
    const delta = correrDelta(raiz, pasada.stdout)
    expect(delta.status, delta.salida).toBe(1)
  })

  it('--baseline no absuelve: esta regla no tiene línea base', () => {
    const { i } = DE_ORIGEN[0]
    const raiz = caja()
    aplicarInyeccion(raiz, i)
    const delta = correrDelta(raiz, correrGuarda(raiz, '--json').stdout, '--baseline')
    expect(delta.status, delta.salida).toBe(1)
  })

  it('corpus-delta no lee como limpia una pasada sin el campo', () => {
    const pasada = JSON.parse(limpia.stdout)
    delete pasada.fueraDeAudio
    const delta = correrDelta(caja(), JSON.stringify(pasada))
    expect(delta.status, delta.salida).toBe(1)
  })
})
