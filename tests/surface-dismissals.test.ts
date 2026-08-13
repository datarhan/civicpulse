import { describe, it, expect } from 'vitest'
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
