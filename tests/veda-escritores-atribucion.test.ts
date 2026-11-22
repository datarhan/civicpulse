/**
 * Todo script que escribe a qué grupo se atribuye una cita —o el mapa de voces
 * del que sale— mira antes si hay veda electoral. Decisión 4.4 del plan de
 * plenos (22-11-2026): hasta entonces sólo tres lo miraban, y uno con su propia
 * copia de la regla.
 *
 * La lista no se mantiene a mano en un solo sentido: se detecta qué scripts
 * escriben algo y nombran `speakerGroup`, `speakerSlug` o `pleno-speaker-map`, y
 * cada uno tiene que estar en CON_VEDA (y llamar de verdad a la veda) o en
 * EXENTOS con el motivo. Un script nuevo que no esté en ninguna rompe la prueba.
 * Y al revés: un exento que ya no existe o ya no escribe también la rompe, para
 * que la lista no se quede vieja.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { vedaActiva } from '../scripts/lib/veda'

const NOMBRA = /speakerGroup|speakerSlug|pleno-speaker-map/
const ESCRIBE = /\b(writeFileSync|renameSync|appendFileSync|execFileSync|spawnSync)\(/
const MIRA_LA_VEDA = /\bvedaActiva\(|\bisFrozen\(/

/** Escriben atribución o el mapa del que sale: tienen que mirar la veda. */
const CON_VEDA = [
  'scripts/extract-pleno-claims.ts',
  'scripts/extract-speaker-map.ts',
  'scripts/extract-speaker-map-texto.ts',
  'scripts/carry-attribution.ts',
  'scripts/reconcile-attribution.ts',
  'scripts/relabel-attribution.ts',
  'scripts/auto-curate-findings.ts',
  'scripts/identify-pleno-speakers.ts',
]

/** Nombran la atribución y escriben algo, pero no la deciden. Cada uno, con el porqué. */
const EXENTOS: Record<string, string> = {
  'scripts/promote-claim.ts': 'CLI de curador: una persona promueve declaraciones por id',
  'scripts/reanchor-claim.ts': 'CLI de curador: corrige el literal, no el grupo',
  'scripts/repoint-finding-claims.ts': 'CLI de curador: re-engancha ids; el grupo no cambia',
  'scripts/retract-claim-attribution.ts':
    'CLI de curador: sólo RETIRA atribuciones, por id; nunca pone un grupo',
  'scripts/retract-guessed-attributions.ts':
    'migración a mano que sólo retira (pone null); nunca pone un grupo',
  'scripts/retire-otro-sentinel.ts': 'migración a mano: el centinela «Otro» pasa a null',
  'scripts/verified-rebuild.ts':
    'recompone lo publicado desde base y capas; copia grupos, no decide ninguno',
  'scripts/refresh-curate-queue.ts': 'escribe la cola del curador, no lo publicado',
  'scripts/voice-id-ab.ts': 'medida: escribe un informe en scripts/logs/',
  'scripts/fetch-pleno-actas.ts': 'escribe transcripciones de actas sin etiquetas de grupo',
  'scripts/check-secrets.ts':
    'busca claves en lo que se va a comitear, mapas incluidos; no escribe atribución',
}

function scriptsQueNombranYEscriben(): string[] {
  const out: string[] = []
  for (const dir of ['scripts', 'scripts/lib']) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      const ruta = `${dir}/${f}`
      const src = readFileSync(ruta, 'utf8')
      if (NOMBRA.test(src) && ESCRIBE.test(src)) out.push(ruta)
    }
  }
  return out.sort()
}

describe('la veda electoral en cada escritor de atribución', () => {
  const detectados = scriptsQueNombranYEscriben()

  it('la detección encuentra escritores (si no, no comprueba nada)', () => {
    expect(detectados).toContain('scripts/extract-pleno-claims.ts')
    expect(detectados.length).toBeGreaterThanOrEqual(CON_VEDA.length)
  })

  it('cada script detectado está en CON_VEDA o en EXENTOS', () => {
    const sinClasificar = detectados.filter((f) => !CON_VEDA.includes(f) && !(f in EXENTOS))
    expect(sinClasificar).toEqual([])
  })

  it.each(CON_VEDA)('%s mira la veda', (f) => {
    expect(readFileSync(f, 'utf8')).toMatch(MIRA_LA_VEDA)
  })

  it('ningún exento ha quedado viejo', () => {
    const viejos = Object.keys(EXENTOS).filter((f) => !detectados.includes(f))
    expect(viejos).toEqual([])
  })

  it('nadie lleva su propia copia de isFrozen', () => {
    const copias = detectados.filter((f) =>
      /function\s+isFrozen\s*\(/.test(readFileSync(f, 'utf8')),
    )
    expect(copias).toEqual([])
  })

  it('la tubería nocturna pregunta por la veda antes del mapa de voces', () => {
    const sh = readFileSync('scripts/hallazgos-pipeline.sh', 'utf8')
    const veda = sh.indexOf('npm run --silent veda:activa')
    const mapa = sh.indexOf('npm run extract:speaker-map')
    expect(veda).toBeGreaterThan(0)
    expect(veda).toBeLessThan(mapa)
  })
})

describe('vedaActiva', () => {
  const dir = mkdtempSync(join(tmpdir(), 'veda-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const con = (contenido: string) => {
    const p = join(dir, `p-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(p, contenido)
    return p
  }
  const ahora = new Date('2027-05-01T12:00:00Z')

  it('devuelve la fecha mientras dura', () => {
    expect(vedaActiva(con('{"frozenUntil":"2027-05-24"}'), ahora)).toBe('2027-05-24')
  })
  it('null cuando ya pasó o no hay', () => {
    expect(vedaActiva(con('{"frozenUntil":"2027-04-01"}'), ahora)).toBeNull()
    expect(vedaActiva(con('{"frozenUntil":null}'), ahora)).toBeNull()
    expect(vedaActiva(con('{}'), ahora)).toBeNull()
  })
  it('lanza si no puede leer el fichero: «no lo sé» no es «no hay veda»', () => {
    expect(() => vedaActiva(join(dir, 'no-existe.json'), ahora)).toThrow(/veda/)
    expect(() => vedaActiva(con('{roto'), ahora)).toThrow(/veda/)
  })
})
