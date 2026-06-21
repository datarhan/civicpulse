import { describe, it, expect } from 'vitest'
import { summarizeSessions } from '../src/lib/pleno-summary'

const input = {
  plenos: [
    { id: 'a', date: '2026-01-10', title: 'Sesión A', kind: 'ordinario', link: 'http://a' },
    { id: 'b', date: '2026-04-20', title: 'Sesión B', kind: 'urgente', link: 'http://b' },
  ],
  manifestPlenos: [{ plenoId: 'b', byVerdict: { verificado: 3, contradicho: 1, 'sin-datos': 9 } }],
  findings: [{ plenoId: 'b' }, { plenoId: 'b' }, { plenoId: 'zz' }],
  agendas: [{ id: 'b', agendaCount: 12 }],
}

describe('summarizeSessions', () => {
  it('joins counts and sorts newest-first', () => {
    const rows = summarizeSessions(input)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']) // newest first
    expect(rows[0]).toMatchObject({ agendaCount: 12, verificado: 3, contradicho: 1, findings: 2 })
  })

  it('yields zero counts for sessions with no claims/agenda/findings', () => {
    const a = summarizeSessions(input).find((r) => r.id === 'a')
    expect(a).toMatchObject({ agendaCount: 0, verificado: 0, contradicho: 0, findings: 0 })
  })

  it('tolerates missing inputs', () => {
    expect(summarizeSessions({ plenos: [] })).toEqual([])
    expect(summarizeSessions({})).toEqual([])
  })
})
