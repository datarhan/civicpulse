/**
 * `extraccion:pendiente` de verdad, en un arenero: su salida es lo que la
 * tubería lee renglón a renglón, así que sólo puede llevar ids. Y falla cerrado
 * si no sabe qué está extraído (sin eso pondría en cola todas las de audio).
 *
 * Las transcripciones son copias de ficheros reales del corpus, elegidas por el
 * propio detector.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { transcriptKind } from '../src/lib/transcript-kind.js'
import { RUTA_EXTRAIDAS_VACIAS, RUTA_PARCIALES } from '../src/scraper/extraccion-pendiente'
import { assessTranscript } from '../src/scraper/transcript-quality'

const TSX = resolve('node_modules/.bin/tsx')
const SCRIPT = resolve('scripts/extraccion-pendiente.ts')
const DIR = 'public/data/pleno-transcripts'
const leer = (id: string) => readFileSync(`${DIR}/${id}.txt`, 'utf8')
const ids = readdirSync(DIR)
  .filter((f) => f.endsWith('.txt'))
  .map((f) => f.slice(0, -4))
const audio = ids.filter(
  (id) => transcriptKind(leer(id)) === 'audio' && assessTranscript(leer(id)).ok,
)
const acta = ids.find((id) => transcriptKind(leer(id)) === 'acta')!

const cajas: string[] = []
afterAll(() => cajas.forEach((c) => rmSync(c, { recursive: true, force: true })))

function correr(opts: {
  sugerencias?: unknown
  vacias?: string[]
  parciales?: string[]
  args?: string[]
}): ReturnType<typeof spawnSync> {
  const caja = mkdtempSync(join(tmpdir(), 'extraccion-pendiente-'))
  cajas.push(caja)
  const data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  // Tres de audio con fechas distintas (a, b, c) y una de acta.
  const [a, b, c] = audio
  const copia = (id: string, como: string) =>
    writeFileSync(join(data, 'pleno-transcripts', `${como}.txt`), leer(id))
  copia(a, 'audio-nueva')
  copia(b, 'audio-vieja')
  copia(c, 'audio-hecha')
  copia(acta, 'acta')
  writeFileSync(
    join(data, 'plenos.json'),
    JSON.stringify({
      items: [
        { id: 'audio-nueva', date: '2026-11-02' },
        { id: 'audio-vieja', date: '2024-09-09' },
        { id: 'audio-hecha', date: '2025-01-01' },
        { id: 'acta', date: '2026-12-01' },
      ],
    }),
  )
  if (opts.sugerencias !== undefined)
    writeFileSync(join(data, 'pleno-claims-suggestions.json'), JSON.stringify(opts.sugerencias))
  if (opts.vacias) {
    mkdirSync(join(caja, dirname(RUTA_EXTRAIDAS_VACIAS)), { recursive: true })
    writeFileSync(join(caja, RUTA_EXTRAIDAS_VACIAS), opts.vacias.join('\n') + '\n')
  }
  if (opts.parciales) {
    mkdirSync(join(caja, dirname(RUTA_PARCIALES)), { recursive: true })
    writeFileSync(join(caja, RUTA_PARCIALES), opts.parciales.join('\n') + '\n')
  }
  return spawnSync(TSX, [SCRIPT, ...(opts.args ?? [])], {
    cwd: caja,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    timeout: 60_000,
  })
}

const HECHA = { items: [{ id: 'x', plenoId: 'audio-hecha' }] }

describe('extraccion:pendiente (el CLI)', () => {
  it('el corpus trae tres de audio aptas y una de acta (si no, esto no prueba nada)', () => {
    expect(audio.length).toBeGreaterThanOrEqual(3)
    expect(acta).toBeTruthy()
  })

  it('stdout son sólo ids, la más reciente primero; ni la de acta ni la extraída', () => {
    const r = correr({ sugerencias: HECHA })
    expect(r.status, String(r.stderr)).toBe(0)
    expect(String(r.stdout)).toBe('audio-nueva\naudio-vieja\n')
  })

  it('una apuntada como extraída vacía no vuelve (la ruta que escribe la tubería)', () => {
    const r = correr({ sugerencias: HECHA, vacias: ['audio-nueva'] })
    expect(String(r.stdout)).toBe('audio-vieja\n')
  })

  it('la tubería escribe esas mismas rutas', () => {
    const sh = readFileSync('scripts/hallazgos-pipeline.sh', 'utf8')
    expect(sh).toContain(`EXTRAIDAS_VACIAS="${RUTA_EXTRAIDAS_VACIAS}"`)
    expect(sh).toContain(`PARCIALES="${RUTA_PARCIALES}"`)
  })

  it('una apuntada como a medias vuelve aunque tenga declaraciones', () => {
    const r = correr({ sugerencias: HECHA, parciales: ['audio-hecha'] })
    expect(String(r.stdout)).toBe('audio-nueva\naudio-hecha\naudio-vieja\n')
  })

  it('--why cuenta las de fuera por stderr, sin ensuciar stdout', () => {
    const r = correr({ sugerencias: HECHA, args: ['--why'] })
    expect(String(r.stdout)).toBe('audio-nueva\naudio-vieja\n')
    expect(String(r.stderr)).toMatch(/4 transcripción\(es\) · 2 pendiente\(s\) · .*acta=1/)
    expect(String(r.stderr)).toMatch(/acta: acta/)
  })

  it('sin pleno-claims-suggestions.json falla, no pone todo en cola', () => {
    const r = correr({})
    expect(r.status).toBe(1)
    expect(String(r.stdout)).toBe('')
  })

  it('con otra forma (sin items[]) también falla', () => {
    const r = correr({ sugerencias: { claims: [] } })
    expect(r.status).toBe(1)
    expect(String(r.stderr)).toMatch(/no trae una lista items/)
    expect(String(r.stdout)).toBe('')
  })
})
