import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import {
  rutaIdentificada,
  conservarOverrides,
  transcripcionConNombres,
  huellaDiarizacion,
  type SpeakerAssignment,
} from '../src/scraper/voice-id'

/**
 * A dónde escribe la identificación por voz, y qué conserva al repetirse.
 *
 * EL FALLO, visto el 2026-11-23 (latente: nadie lo había ejecutado con audio):
 * `identify-pleno-speakers --apply` reescribía
 * `public/data/pleno-transcripts/<id>.txt` en su sitio, cambiando
 * `(SPEAKER_NN)` por `(Nombre Apellido)` en el nivel alto y por
 * `(SPEAKER_NN ≈ Nombre?)` en el medio. Ese fichero se sirve tal cual en
 * /plenos/:id, así que la huella vocal habría publicado nombres sin que un
 * curador firmara nada. Y cada pasada escribía el JSON de asignaciones desde
 * cero, borrando las correcciones del curador que su propia cabecera prometía
 * no pisar.
 */

const asignacion = (
  speaker: string,
  extra: Partial<SpeakerAssignment> = {},
): SpeakerAssignment => ({
  speaker,
  durationSec: 30,
  segmentCount: 4,
  match: null,
  topCandidates: [],
  ...extra,
})

const override = (slug: string | null) => ({
  slug,
  name: slug ? 'Nombre' : null,
  party: slug ? 'PSOE' : null,
  setAt: '2026-11-01T00:00:00.000Z',
  reason: 'escuchado',
})

describe('rutaIdentificada', () => {
  it('cae en pleno-speakers/, nunca bajo public/', () => {
    const raiz = '/repo'
    const ruta = rutaIdentificada(raiz, 'abc123')
    expect(relative(raiz, ruta)).toBe('pleno-speakers/abc123.identified.txt')
    expect(relative(raiz, ruta).startsWith('public/')).toBe(false)
  })

  it('rechaza un id que saldría del directorio', () => {
    expect(() => rutaIdentificada('/repo', '../public/data/pleno-transcripts/x')).toThrow()
    expect(() => rutaIdentificada('/repo', '')).toThrow()
  })
})

describe('conservarOverrides', () => {
  it('lleva la corrección del curador a la pasada nueva, por voz', () => {
    const previas = [asignacion('SPEAKER_00', { curatorOverride: override('robert-raga-gadea') })]
    const nuevas = [asignacion('SPEAKER_00'), asignacion('SPEAKER_01')]
    const r = conservarOverrides({ assignments: previas, huellaDiarizacion: 'h1' }, nuevas, 'h1')
    expect(r.huerfanas).toEqual([])
    expect(r.asignaciones[0].curatorOverride?.slug).toBe('robert-raga-gadea')
    expect(r.asignaciones[1].curatorOverride).toBeUndefined()
  })

  it('conserva también un «sin asignar» explícito (slug null)', () => {
    const previas = [asignacion('SPEAKER_03', { curatorOverride: override(null) })]
    const r = conservarOverrides(
      { assignments: previas, huellaDiarizacion: 'h1' },
      [asignacion('SPEAKER_03')],
      'h1',
    )
    expect(r.asignaciones[0].curatorOverride).toEqual(override(null))
  })

  it('una corrección cuya voz ya no existe sale como huérfana, no se pierde callada', () => {
    const previas = [
      asignacion('SPEAKER_07', { curatorOverride: override('teresa-pozuelo-martin') }),
    ]
    const r = conservarOverrides(
      { assignments: previas, huellaDiarizacion: 'h1' },
      [asignacion('SPEAKER_00')],
      'h1',
    )
    expect(r.huerfanas).toEqual(['SPEAKER_07'])
  })

  it('si la transcripción cambió, ninguna corrección se arrastra: la etiqueta es otra voz', () => {
    const previas = [asignacion('SPEAKER_00', { curatorOverride: override('robert-raga-gadea') })]
    const r = conservarOverrides(
      { assignments: previas, huellaDiarizacion: 'vieja' },
      [asignacion('SPEAKER_00')],
      'nueva',
    )
    expect(r.huerfanas).toEqual(['SPEAKER_00'])
    expect(r.asignaciones[0].curatorOverride).toBeUndefined()
  })

  it('una pasada previa sin huella cuenta como transcripción distinta', () => {
    const previas = [asignacion('SPEAKER_00', { curatorOverride: override(null) })]
    const r = conservarOverrides({ assignments: previas }, [asignacion('SPEAKER_00')], 'h1')
    expect(r.huerfanas).toEqual(['SPEAKER_00'])
  })

  it('la huella cambia con quién habla y cuándo, no con el texto', () => {
    const a = [{ start: 1, end: 2, speaker: 'SPEAKER_00', text: 'hola' }]
    const b = [{ start: 1, end: 2, speaker: 'SPEAKER_00', text: 'Hola.' }]
    const c = [{ start: 1, end: 2, speaker: 'SPEAKER_01', text: 'hola' }]
    expect(huellaDiarizacion(a)).toBe(huellaDiarizacion(b))
    expect(huellaDiarizacion(a)).not.toBe(huellaDiarizacion(c))
  })

  it('sin pasada previa no inventa nada', () => {
    const r = conservarOverrides(null, [asignacion('SPEAKER_00')], 'h1')
    expect(r.huerfanas).toEqual([])
    expect(r.asignaciones[0].curatorOverride).toBeUndefined()
  })
})

describe('identify-pleno-speakers · lo que escribe', () => {
  const src = readFileSync(resolve('scripts/identify-pleno-speakers.ts'), 'utf8')
  // El código sin comentarios: la cabecera cuenta el fallo y nombra la ruta.
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('no escribe nunca sobre la transcripción publicada', () => {
    // Las escrituras del script, por su primer argumento.
    const destinos = [...codigo.matchAll(/\b(?:writeFileSync|renameSync)\(\s*([^,]+),/g)].map((m) =>
      m[1].trim(),
    )
    // Que miró algo: sin escrituras detectadas la prueba pasaría sin mirar.
    expect(destinos.length).toBeGreaterThan(0)
    for (const d of destinos) {
      expect(d, `escribe en ${d}`).not.toMatch(/transcriptPath|public/)
    }
    // Y la transcripción se lee de public/ sólo por la función que la carga.
    expect(codigo).not.toMatch(/renameSync\([^)]*transcriptPath/)
  })

  it('transcribe-pleno.sh no le pasa --apply', () => {
    const sh = readFileSync(resolve('scripts/transcribe-pleno.sh'), 'utf8')
    const lineas = sh.split('\n').filter((l) => !l.trim().startsWith('#'))
    const llamadas = lineas.filter((l) => l.includes('identify-pleno-speakers'))
    expect(llamadas.length).toBeGreaterThan(0)
    for (const l of llamadas) expect(l).not.toMatch(/--apply/)
  })
})

describe('transcripcionConNombres', () => {
  const nombres = ['Robert Raga Gadea', 'Teresa Pozuelo Martín']

  it('ve una línea reescrita con un nombre, en nivel alto y medio', () => {
    expect(transcripcionConNombres('[1.0 → 2.0] (Robert Raga Gadea) Bon dia.', nombres)).toBe(true)
    expect(
      transcripcionConNombres('[1.0 → 2.0] (SPEAKER_03 ≈ Teresa Pozuelo Martín?) Sí.', nombres),
    ).toBe(true)
  })

  it('no confunde hablantes anónimos ni paréntesis del acta con nombres', () => {
    const anonima = [
      '[1.0 → 2.0] (SPEAKER_03) Passem al següent punt.',
      '[2.0 → 3.0] (UNKNOWN) …',
      '[3.0 → 4.0] (TRLHL) artículo 22.',
      '[4.0 → 5.0] (-) votación',
    ].join('\n')
    expect(transcripcionConNombres(anonima, nombres)).toBe(false)
  })
})

describe('extract-pleno-claims · nombres fuera de lo publicado', () => {
  const codigo = readFileSync(resolve('scripts/extract-pleno-claims.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('no lee las asignaciones de voz: lo que escribe se publica', () => {
    expect(codigo).not.toMatch(/pleno-speakers/)
    expect(codigo).not.toMatch(/allowedSpeakers\s*[:,]/)
  })

  it('se niega a extraer de una transcripción con nombres', () => {
    expect(codigo).toMatch(/transcripcionConNombres\(/)
  })
})
