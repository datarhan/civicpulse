import { describe, it, expect } from 'vitest'
import { effectiveStatus } from '../src/hooks/useEmpleo'

const NOW = Date.parse('2026-08-02T00:00:00Z')

describe('empleo — effectiveStatus', () => {
  it('overrides the portal label once the closing date has passed', () => {
    // Real row: portalemp still says "Abierta" for a deadline of 2026-01-15.
    const st = effectiveStatus({ status: 'Abierta', deadline: '2026-01-15' }, NOW)
    expect(st.label).toBe('Cerrada')
    expect(st.overridden).toBe(true)
  })

  it('keeps the portal label while the offer is genuinely open', () => {
    const st = effectiveStatus({ status: 'Abierta', deadline: '2026-09-30' }, NOW)
    expect(st.label).toBe('Abierta')
    expect(st.overridden).toBe(false)
  })

  it('leaves an offer with no deadline alone', () => {
    const st = effectiveStatus({ status: 'Abierta', deadline: null }, NOW)
    expect(st.label).toBe('Abierta')
  })
})
