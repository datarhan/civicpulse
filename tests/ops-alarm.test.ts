import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evaluarAlarma,
  LATIDO_DEL_PORTATIL,
  LATIDO_MAX_DIAS,
  NOCTURNA_MAX_HORAS,
  type EntradaAlarma,
} from '../src/scraper/ops-alarm'
import { NIGHTLY_STREAK_ALARM } from '../src/scraper/health-monitor'
import type { FreshnessRow } from '../src/scraper/snapshot-cadence'

const NOW = new Date('2026-09-25T13:23:00.000Z')
const hace = (horas: number) => new Date(NOW.getTime() - horas * 3_600_000)

const fila = (over: Partial<FreshnessRow> = {}): FreshnessRow => ({
  file: 'paro.json',
  cls: 'ci-blocked',
  ageDays: 1,
  status: 'ok',
  note: '',
  ...over,
})

/** Un día sano: todo contestó y todo está en plazo. */
function entrada(over: Partial<EntradaAlarma> = {}): EntradaAlarma {
  return {
    now: NOW,
    cadencia: [fila()],
    ultimoLatido: hace(20),
    nocturnas: [{ conclusion: 'success', createdAt: hace(4).toISOString() }],
    web: { portada: true, datos: true },
    bot: { alcanzable: true, estado: 'ok', degradado: [] },
    ...over,
  }
}

const codigos = (e: EntradaAlarma) =>
  evaluarAlarma(e)
    .map((a) => a.code)
    .sort()

describe('ops:alarm · reglas', () => {
  it('un día sano no avisa de nada', () => {
    expect(evaluarAlarma(entrada())).toEqual([])
  })

  it('un volcado fuera de plazo avisa y lo nombra', () => {
    const avisos = evaluarAlarma(
      entrada({ cadencia: [fila(), fila({ file: 'obras.json', status: 'stale', ageDays: 12 })] }),
    )
    expect(avisos.map((a) => a.code)).toEqual(['integrity:check:cadence'])
    expect(avisos[0].detail).toContain('obras.json')
  })

  it('una cadencia que no se pudo ejecutar es un aviso, no un «todo en plazo»', () => {
    expect(codigos(entrada({ cadencia: null }))).toEqual(['integrity:check:cadence'])
  })

  it(`el portátil sin latido más de ${LATIDO_MAX_DIAS} días avisa; dentro del plazo, no`, () => {
    expect(codigos(entrada({ ultimoLatido: hace(LATIDO_MAX_DIAS * 24 + 1) }))).toEqual([
      'stall:La pasada diaria del portátil',
    ])
    expect(codigos(entrada({ ultimoLatido: hace(LATIDO_MAX_DIAS * 24 - 1) }))).toEqual([])
  })

  it('un latido que no aparece en la historia también avisa', () => {
    expect(codigos(entrada({ ultimoLatido: null }))).toEqual([
      'stall:La pasada diaria del portátil',
    ])
  })

  it(`la nocturna en rojo ${NIGHTLY_STREAK_ALARM} noches seguidas avisa; una menos, no`, () => {
    const roja = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        conclusion: 'failure',
        createdAt: hace(4 + 24 * i).toISOString(),
      }))
    expect(codigos(entrada({ nocturnas: roja(NIGHTLY_STREAK_ALARM) }))).toEqual(['nightly-red'])
    expect(codigos(entrada({ nocturnas: roja(NIGHTLY_STREAK_ALARM - 1) }))).toEqual([])
  })

  it(`si GitHub deja de lanzar la nocturna (${NOCTURNA_MAX_HORAS} h sin ninguna) avisa`, () => {
    const vieja = [{ conclusion: 'success', createdAt: hace(NOCTURNA_MAX_HORAS + 2).toISOString() }]
    expect(codigos(entrada({ nocturnas: vieja }))).toEqual(['stall:La nocturna de GitHub'])
  })

  it('si no se pudo preguntar a GitHub por la nocturna, avisa en vez de contar cero', () => {
    expect(codigos(entrada({ nocturnas: null }))).toEqual(['integrity:ops:alarm'])
  })

  it('la web caída, o un volcado que no se deja leer, avisa', () => {
    expect(codigos(entrada({ web: { portada: false, datos: true } }))).toEqual(['site-down'])
    expect(codigos(entrada({ web: { portada: true, datos: false } }))).toEqual(['site-down'])
  })

  it('el bot: caído, degradado o sin URL a la que preguntar son tres avisos distintos', () => {
    expect(codigos(entrada({ bot: { alcanzable: false } }))).toEqual(['bot-down'])
    const degradado = evaluarAlarma(
      entrada({
        bot: { alcanzable: true, estado: 'degraded', degradado: ['CHANNEL_ID missing'] },
      }),
    )
    expect(degradado.map((a) => a.code)).toEqual(['bot-degraded'])
    expect(degradado[0].detail).toContain('CHANNEL_ID')
    expect(codigos(entrada({ bot: null }))).toEqual(['bot-unconfigured'])
  })
})

describe('ops:alarm · cableado', () => {
  // El latido es el asunto de un commit que escribe OTRO fichero. Si ese
  // fichero cambia su asunto, la alarma buscaría un latido que ya no existe y
  // avisaría todos los días de un portátil que funciona.
  it('scrape-ci-blocked.sh sigue comiteando con el asunto que se busca como latido', () => {
    const script = readFileSync(resolve('scripts/scrape-ci-blocked.sh'), 'utf8')
    expect(script).toContain(`cron_git_commit_pathspec "${LATIDO_DEL_PORTATIL}`)
  })

  // Una guarda que nada invoca es decoración (OPERATIONS.md, check:guards).
  it('el workflow la ejecuta a diario y le pasa la URL del bot', () => {
    const wf = readFileSync(resolve('.github/workflows/ops-alarm.yml'), 'utf8')
    expect(wf).toMatch(/^\s+schedule:\s*$/m)
    expect(wf).toContain('npm run --silent ops:alarm')
    expect(wf).toContain('BOT_EXPORT_URL: ${{ vars.BOT_EXPORT_URL }}')
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    expect(pkg.scripts['ops:alarm']).toContain('scripts/ops-alarm.ts')
  })
})
