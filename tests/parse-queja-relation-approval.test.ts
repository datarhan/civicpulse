import { describe, it, expect } from 'vitest'
import {
  validateApprovalsSnapshot,
  appendApproval,
  removeApproval,
} from '../src/scraper/queja-relation-approval'

const base = { generatedAt: '2026-07-05T00:00:00.000Z', approvals: [] }
const ok = {
  quejaId: 'Q-1',
  tenderId: 'T1',
  curator: 'Ana',
  approvedAt: '2026-07-05T00:00:00.000Z',
}

describe('validateApprovalsSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const s = validateApprovalsSnapshot(JSON.stringify({ ...base, approvals: [ok] }))
    expect(s.approvals).toHaveLength(1)
  })
  it('rejects an approval missing a curator', () => {
    const bad = { quejaId: 'Q-1', tenderId: 'T1', approvedAt: base.generatedAt }
    expect(() => validateApprovalsSnapshot(JSON.stringify({ ...base, approvals: [bad] }))).toThrow()
  })
  it('rejects a forbidden requiresHumanApproval field (defence in depth)', () => {
    const bad = { ...ok, requiresHumanApproval: true }
    expect(() => validateApprovalsSnapshot(JSON.stringify({ ...base, approvals: [bad] }))).toThrow()
  })
})

describe('appendApproval / removeApproval', () => {
  it('appends and dedupes by (quejaId, tenderId), last write wins', () => {
    let s = appendApproval(base, ok)
    s = appendApproval(s, { ...ok, curator: 'Bob', approvedAt: '2026-07-06T00:00:00.000Z' })
    expect(s.approvals).toHaveLength(1)
    expect(s.approvals[0].curator).toBe('Bob')
  })
  it('removes a pair', () => {
    let s = appendApproval(base, ok)
    s = removeApproval(s, 'Q-1', 'T1')
    expect(s.approvals).toEqual([])
  })
})
