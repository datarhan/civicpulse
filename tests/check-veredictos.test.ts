import { describe, it, expect } from 'vitest'
import { cotejarVeredicto, ESTADOS_VEREDICTO } from '../scripts/check-veredictos'

/**
 * Cinco desenlaces, y el reparto es lo que hace la guarda usable.
 *
 * Con las 76 filas de una pasada retirada y una rotura nueva en el mismo saco,
 * esto saldría rojo todas las noches hasta la fase 6 — y nadie miraría el día
 * que importara. Es la lección de `check:verified-compose`, y antes la de
 * `check:eficiencia-findings`.
 */
const it_ = (verdict: string, checkedAgainst: string[], evidence = 1) => ({
  claim: { id: `c-${verdict}-${checkedAgainst.join('+') || 'vacio'}` },
  verification: {
    verdict,
    checkedAgainst,
    evidence: Array.from({ length: evidence }, () => ({ kind: 'tender', ref: 'r', snippet: 's' })),
  },
})

describe('cotejarVeredicto · qué sostiene un veredicto ya publicado', () => {
  it('un veredicto débil no tiene nada que sostener', () => {
    expect(cotejarVeredicto(it_('sin-datos', [])).estado).toBe('fundado')
  })

  it('fundado: nombra corpus y trae evidencia', () => {
    expect(cotejarVeredicto(it_('verificado', ['tenders'])).estado).toBe('fundado')
  })

  it('curado: lo decidió una persona, y eso pasa', () => {
    const f = cotejarVeredicto(it_('parcial', ['curator-downgrade']))
    expect(f.estado).toBe('curado')
    expect(f.detalle).toMatch(/persona/i)
  })

  it('procedencia-retirada: se apoya en una pasada que ya no corre', () => {
    const f = cotejarVeredicto(it_('parcial', ['llm-second-pass']))
    expect(f.estado).toBe('procedencia-retirada')
    expect(f.detalle).toMatch(/ya no está en la tubería/i)
  })

  it('sin-corpus: pasada VIVA y nada que lo sostenga — esto sí es de hoy', () => {
    expect(cotejarVeredicto(it_('verificado', ['nli-grounding'])).estado).toBe('sin-corpus')
    expect(cotejarVeredicto(it_('parcial', [])).estado).toBe('sin-corpus')
  })

  it('sin evidencia tampoco se sostiene, aunque nombre corpus', () => {
    expect(cotejarVeredicto(it_('verificado', ['tenders'], 0)).estado).toBe('sin-corpus')
  })

  it('el curador manda sobre la pasada retirada cuando están los dos', () => {
    // Si una fila lleva las dos marcas, responde la persona: es la vía
    // sancionada y no debe caer en la cola de re-fundamentación.
    expect(cotejarVeredicto(it_('parcial', ['llm-second-pass', 'curator-downgrade'])).estado).toBe(
      'curado',
    )
  })

  it('el enum se exporta, no se recita', () => {
    expect([...ESTADOS_VEREDICTO].sort()).toEqual(
      ['curado', 'fundado', 'procedencia-retirada', 'sin-corpus', 'sin-publicar'].sort(),
    )
  })
})
