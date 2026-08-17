import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validarPreguntas,
  PANELES_PREGUNTAS,
  type PreguntasSnapshot,
} from '../src/scraper/eficiencia-preguntas'

/**
 * El fichero PUBLICADO es la fixture: un test que validara una copia de
 * laboratorio dejaría el de verdad sin vigilar (fallo nº1 de
 * docs/DATA_INTEGRITY.md). Las inyecciones de fallo van sobre clones.
 */
const RUTA = join(__dirname, '..', 'public/data/eficiencia-preguntas.json')
const real = JSON.parse(readFileSync(RUTA, 'utf8'))
const clon = (): PreguntasSnapshot => JSON.parse(JSON.stringify(real))

describe('eficiencia-preguntas — el fichero publicado valida', () => {
  it('mide algo: hay paneles, bloques y preguntas de verdad', () => {
    const v = validarPreguntas(real)
    const paneles = Object.keys(v.panels)
    expect(paneles.length).toBeGreaterThan(0)
    const items = paneles.flatMap((p) =>
      v.panels[p as (typeof PANELES_PREGUNTAS)[number]]!.bloques.flatMap((b) => b.items),
    )
    expect(items.length).toBeGreaterThan(4)
  })

  it('cada base apunta a una superficie interna cuando lleva href', () => {
    const v = validarPreguntas(real)
    for (const p of Object.values(v.panels)) {
      for (const b of p!.bloques) {
        for (const it of b.items) {
          if (it.href) expect(it.href).toMatch(/^[/#]/)
        }
      }
    }
  })
})

describe('eficiencia-preguntas — inyecciones de fallo', () => {
  it('una «pregunta» sin interrogación no publica: es una afirmación disfrazada', () => {
    const c = clon()
    c.panels['coste-efectivo']!.bloques[0].items[0].q =
      'El ayuntamiento no rindió la entrega de 2020'
    expect(() => validarPreguntas(c)).toThrow(/no termina en «\?»/)
  })

  it('un href externo no publica: la base vive en una superficie propia', () => {
    const c = clon()
    c.panels['coste-efectivo']!.bloques[0].items[0].href = 'https://ejemplo.com/dato'
    expect(() => validarPreguntas(c)).toThrow(/href debe ser interno/)
  })

  it('una pregunta sin base documentada no publica', () => {
    const c = clon()
    c.panels['coste-efectivo']!.bloques[0].items[0].base = ''
    expect(() => validarPreguntas(c)).toThrow(/sin hecho documentado no hay pregunta/)
  })

  it('un panel fuera del enum no publica (importado, no restatado)', () => {
    const c = clon() as unknown as { panels: Record<string, unknown> }
    c.panels['plenos'] = c.panels['coste-efectivo']
    expect(() => validarPreguntas(c)).toThrow(/panel desconocido «plenos»/)
    expect(PANELES_PREGUNTAS).not.toContain('plenos')
  })

  it('los campos del esquema de pleno se rechazan a cualquier profundidad', () => {
    const c = clon() as unknown as {
      panels: Record<string, { bloques: { items: Record<string, unknown>[] }[] }>
    }
    c.panels['coste-efectivo'].bloques[0].items[0].individualSpeaker = 'nombre de alguien'
    expect(() => validarPreguntas(c)).toThrow(/campo prohibido .*individualSpeaker/)
  })

  it('el validador acumula TODAS las violaciones, no sólo la primera', () => {
    const c = clon()
    c.panels['coste-efectivo']!.bloques[0].items[0].q = 'sin interrogación'
    c.panels['coste-efectivo']!.bloques[0].items[1].base = ''
    try {
      validarPreguntas(c)
      expect.unreachable('debió lanzar')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toMatch(/no termina en «\?»/)
      expect(msg).toMatch(/sin hecho documentado/)
    }
  })
})
