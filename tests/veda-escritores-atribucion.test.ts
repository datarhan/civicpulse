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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { vedaActiva } from '../scripts/lib/veda'
import { atribucionesQueCambianEnVeda } from '../scripts/verified-rebuild'

// Lo que decide a quién se atribuye una cita: el campo, el mapa de voces y las
// asignaciones de voice-id (alimentan `speakerSlug`).
const NOMBRA = /speakerGroup|speakerSlug|pleno-speaker-map|pleno-speakers\b/
const ESCRIBE =
  /\b(writeFileSync|writeFile|renameSync|rename|appendFileSync|appendFile|execFileSync|spawnSync|execSync)\(/
const MIRA_LA_VEDA = /\bvedaActiva\(|\bisFrozen\(/

/** El código sin comentarios: un `isFrozen(` dentro de uno no es una puerta. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

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
  'scripts/verified-rebuild.ts',
  // Desde el 2026-11-23 se niega a nombrar a un orador en veda; promover un
  // hallazgo de grupo sigue siendo una decisión del curador.
  'scripts/promote-claim.ts',
]

/** Nombran la atribución y escriben algo, pero no la deciden. Cada uno, con el porqué. */
const EXENTOS: Record<string, string> = {
  'scripts/reanchor-claim.ts': 'CLI de curador: corrige el literal, no el grupo',
  'scripts/repoint-finding-claims.ts': 'CLI de curador: re-engancha ids; el grupo no cambia',
  'scripts/retract-guessed-attributions.ts':
    'migración a mano que sólo retira (pone null); nunca pone un grupo',
  'scripts/retire-otro-sentinel.ts': 'migración a mano: el centinela «Otro» pasa a null',
  'scripts/refresh-curate-queue.ts': 'escribe la cola del curador, no lo publicado',
  'scripts/voice-id-ab.ts': 'medida: escribe un informe en scripts/logs/',
  'scripts/rendimiento-plenos.ts':
    'medida: cuenta los grupos y sólo escribe su comparación en .cache/rendimiento-plenos.json',
  'scripts/correct-pleno-finding.ts':
    'CLI de curador: una persona corrige un hallazgo por id, con motivo y firma',
  'scripts/check-editorial.ts':
    'puerta de commit: nombra pleno-speakers/ para impedir que entre en git; lee git, no escribe',
  'scripts/override-speaker-assignment.ts':
    'CLI de curador: una persona fija a mano la asignación de una voz (pleno-speakers/)',
}

/**
 * Publican atribución sin nombrar el campo, así que la detección no los ve. Cada
 * uno, con por qué no necesita mirar la veda por su cuenta.
 */
const PUBLICAN_SIN_NOMBRAR: Record<string, string> = {
  'scripts/verify-pleno-claims.ts':
    'publica a través de verified-rebuild, que en veda se niega a poner o cambiar un grupo',
}

function scriptsQueNombranYEscriben(): string[] {
  const out: string[] = []
  for (const dir of ['scripts', 'scripts/lib']) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      const ruta = `${dir}/${f}`
      const src = sinComentarios(readFileSync(ruta, 'utf8'))
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

  it.each(CON_VEDA)('%s mira la veda (en código, no en un comentario)', (f) => {
    expect(sinComentarios(readFileSync(f, 'utf8'))).toMatch(MIRA_LA_VEDA)
  })

  it('quitar comentarios no se come el código (control de sinComentarios)', () => {
    expect(sinComentarios("const u = 'https://x' // nota\n/* isFrozen( */ f()")).toBe(
      "const u = 'https://x' \n f()",
    )
  })

  it('los que publican sin nombrar el campo siguen existiendo', () => {
    for (const f of Object.keys(PUBLICAN_SIN_NOMBRAR)) expect(existsSync(f), f).toBe(true)
  })

  it('ningún exento ha quedado viejo', () => {
    const viejos = Object.keys(EXENTOS).filter((f) => !detectados.includes(f))
    expect(viejos).toEqual([])
  })

  it('nadie lleva su propia copia de isFrozen', () => {
    const copias = detectados.filter((f) =>
      /function\s+isFrozen\s*\(|frozenUntil\s*[<>]=?|[<>]=?\s*\w*\.?frozenUntil\b/.test(
        sinComentarios(readFileSync(f, 'utf8')),
      ),
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
  it('una fecha que no se entiende cuenta como veda', () => {
    expect(vedaActiva(con('{"frozenUntil":"24/05/2027"}'), ahora)).toBe('24/05/2027')
    expect(vedaActiva(con('{"frozenUntil":20270524}'), ahora)).toBe('20270524')
  })
  it('lanza si no puede leer el fichero: «no lo sé» no es «no hay veda»', () => {
    expect(() => vedaActiva(join(dir, 'no-existe.json'), ahora)).toThrow(/veda/)
    expect(() => vedaActiva(con('{roto'), ahora)).toThrow(/veda/)
  })
})

describe('atribucionesQueCambianEnVeda (la guarda del rebuild)', () => {
  const it_ = (id: string, speakerGroup: string | null) => ({ claim: { id, speakerGroup } })
  it('señala un grupo nuevo, uno cambiado y una declaración nueva con grupo', () => {
    const publicado = [it_('a', null), it_('b', 'PP'), it_('c', 'PSOE')]
    const nuevos = [it_('a', 'PP'), it_('b', 'VOX'), it_('c', 'PSOE'), it_('d', 'PP')]
    expect(atribucionesQueCambianEnVeda(publicado, nuevos)).toEqual([
      { id: 'a', de: null, a: 'PP' },
      { id: 'b', de: 'PP', a: 'VOX' },
      { id: 'd', de: null, a: 'PP' },
    ])
  })
  it('deja pasar lo que no cambia y lo que se retira (→ null)', () => {
    const publicado = [it_('a', 'PP'), it_('b', 'PSOE')]
    expect(atribucionesQueCambianEnVeda(publicado, [it_('a', 'PP'), it_('b', null)])).toEqual([])
  })
})
