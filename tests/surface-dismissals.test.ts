import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  estaDescartado,
  sinDescartar,
  descartesHuerfanos,
  validarDescartes,
  type RegistroDescartes,
} from '../src/scraper/surface-dismissals'
import type { ReaderFinding } from '../src/scraper/reader-review'

const f = (quote: string): ReaderFinding => ({
  quote,
  inference: 'x'.repeat(12),
  contradictedBy: 'y'.repeat(6),
  severity: 'misleading',
})

const registro: RegistroDescartes = {
  version: 1,
  items: [
    {
      route: '/datos',
      quote: 'Contratos públicos\n805 contratos\nFuente: Gobierto · PLACSP',
      reason: '/datos es un catálogo de snapshots y 805 es el número de filas del fichero',
      editor: 'Sergei Lutchenko',
      at: '2026-08-13',
    },
  ],
}

describe('descartar un señalamiento revisado', () => {
  it('silencia exactamente la frase revisada', () => {
    expect(estaDescartado('/datos', f(registro.items[0].quote), registro)).toBe(true)
    // Espacios y mayúsculas no cuentan: la revisión reformatea saltos de línea.
    expect(
      estaDescartado(
        '/datos',
        f('contratos públicos 805 contratos fuente: gobierto · placsp'),
        registro,
      ),
    ).toBe(true)
  })

  it('NO silencia otra frase de la misma página', () => {
    // El control que importa. Descartar «/datos» entero taparía el defecto que
    // aparezca mañana ahí; un descarte vale para UNA frase.
    expect(estaDescartado('/datos', f('805 contratos adjudicados'), registro)).toBe(false)
    expect(sinDescartar('/datos', [f('otra cosa distinta')], registro)).toHaveLength(1)
  })

  it('NO silencia la misma frase en otra página', () => {
    expect(estaDescartado('/nosotros', f(registro.items[0].quote), registro)).toBe(false)
  })

  it('sin registro no silencia nada', () => {
    const findings = [f('cualquier cosa')]
    expect(sinDescartar('/datos', findings, null)).toEqual(findings)
    expect(sinDescartar('/datos', findings, { version: 1, items: [] })).toEqual(findings)
  })

  it('nombra los descartes que ya no corresponden a nada vivo', () => {
    // Un registro sólo crece si nadie lo mira, y un descarte huérfano queda
    // armado para silenciar esa frase si vuelve por otro motivo.
    const vivos = new Map([['/datos', [f('algo completamente distinto')]]])
    expect(descartesHuerfanos(registro, vivos).map((d) => d.route)).toEqual(['/datos'])

    const vivosConLaFrase = new Map([['/datos', [f(registro.items[0].quote)]]])
    expect(descartesHuerfanos(registro, vivosConLaFrase)).toEqual([])
  })

  it('rechaza un descarte sin motivo, sin editor o con motivo de coartada', () => {
    // Un descarte sin motivo no es un registro, es un silenciador.
    const base = registro.items[0]
    expect(() => validarDescartes({ version: 1, items: [{ ...base, reason: '' }] })).toThrow(
      /reason/,
    )
    expect(() => validarDescartes({ version: 1, items: [{ ...base, editor: '' }] })).toThrow(
      /editor/,
    )
    expect(() => validarDescartes({ version: 1, items: [{ ...base, reason: 'ok' }] })).toThrow(
      /demasiado corto/,
    )
    expect(() => validarDescartes({ items: [] })).not.toThrow()
    expect(validarDescartes(registro).items).toHaveLength(1)
  })
})

describe('el descarte sobrevive a que el modelo recorte distinto', () => {
  it('aplica cuando la cita nueva es un trozo de la descartada', () => {
    // Medido: se descartó «…805 contratos Fuente: Gobierto · PLACSP» y el
    // barrido siguiente citó «…805 contratos» a secas. Mismo defecto, recorte
    // distinto. Con igualdad exacta el descarte no valía nada.
    expect(estaDescartado('/datos', f('Contratos públicos\n805 contratos'), registro)).toBe(true)
  })

  it('aplica también al revés: la nueva contiene a la descartada', () => {
    expect(
      estaDescartado(
        '/datos',
        f('Contratos públicos\n805 contratos\nFuente: Gobierto · PLACSP\nAbrir →'),
        registro,
      ),
    ).toBe(true)
  })

  it('NO aplica a un fragmento demasiado corto', () => {
    // El suelo. Sin él, «805» caería dentro de la cita larga y silenciaría
    // cualquier señalamiento futuro que mencionara ese número.
    expect(estaDescartado('/datos', f('805'), registro)).toBe(false)
    expect(estaDescartado('/datos', f('contratos'), registro)).toBe(false)
  })
})

// ─── Y quién lo aplica ───────────────────────────────────────────────────────
//
// El módulo estaba escrito y probado desde el 13-08-2026, y `check:surfaces` lo
// honraba. `review:surfaces` —el comando que IMPRIME los señalamientos y el que
// lee una persona— no lo leyó nunca, así que un descarte silenciaba el parte de
// salud y no la salida. El falso positivo de `/gestion` iba a reimprimirse
// indefinidamente con el registro delante, sin usar.
//
// Es la lección de `project_wiring_gaps` en su forma pura: comprueba SIEMPRE
// quién ejecuta lo que construyes. Un módulo con tests y sin consumidor está
// tan roto como uno sin tests.

describe('los dos consumidores del registro siguen enchufados', () => {
  const CONSUMIDORES = ['scripts/check-surfaces.ts', 'scripts/review-surfaces.ts'] as const

  it('mide algo: los ficheros existen y se leen', () => {
    for (const c of CONSUMIDORES) {
      expect(readFileSync(resolve(c), 'utf8').length, `${c} está vacío`).toBeGreaterThan(100)
    }
  })

  for (const c of CONSUMIDORES) {
    it(`${c} importa el registro y lo aplica`, () => {
      const src = readFileSync(resolve(c), 'utf8')
      expect(src, `${c} no importa surface-dismissals`).toContain('surface-dismissals')
      expect(src, `${c} no lee review-dismissals.json`).toContain('review-dismissals.json')
      // Importarlo y no llamarlo es el mismo hueco con un import de adorno.
      expect(
        /\bsinDescartar\s*\(|\bestaDescartado\s*\(|\bmedirFrescura\s*\(/.test(src),
        `${c} importa el módulo pero no lo llama`,
      ).toBe(true)
    })
  }
})
