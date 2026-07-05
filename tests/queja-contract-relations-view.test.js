import { describe, it, expect } from 'vitest'
import {
  relatedQuejasForContract,
  relationsForTender,
  relationsForQueja,
  isApproved,
} from '../src/hooks/useQuejaContractRelations'

const data = {
  links: [
    {
      quejaId: 'Q-1',
      tenderPermalink: 'P',
      relationLabel: 'misma zona y materia',
      requiresHumanApproval: false,
      signals: {},
    },
    // gated Tier-B — must never surface
    {
      quejaId: 'Q-2',
      tenderPermalink: 'P',
      relationLabel: 'misma materia',
      requiresHumanApproval: true,
      signals: {},
    },
    {
      quejaId: 'Q-3',
      tenderPermalink: 'OTHER',
      relationLabel: 'misma zona',
      requiresHumanApproval: false,
      signals: {},
    },
  ],
}
const quejas = [
  { service_request_id: 'Q-1', description: 'Bache en la calle', service_code: 'via_publica' },
]

describe('relationsForTender', () => {
  it('keeps only renderable (non-gated) links for the permalink', () => {
    const rows = relationsForTender(data, 'P')
    expect(rows).toHaveLength(1)
    expect(rows[0].quejaId).toBe('Q-1')
  })
})

describe('relatedQuejasForContract', () => {
  it('joins renderable links to the queja description + category', () => {
    const rows = relatedQuejasForContract(data, quejas, 'P')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      quejaId: 'Q-1',
      relationLabel: 'misma zona y materia',
      description: 'Bache en la calle',
      category: 'via_publica',
    })
  })
  it('returns [] for a contract with no renderable links', () => {
    expect(relatedQuejasForContract(data, quejas, 'NONE')).toEqual([])
  })
})

describe('curator approvals merge', () => {
  const gated = {
    links: [
      {
        quejaId: 'Q-9',
        tenderPermalink: 'P9',
        tenderId: 'T9',
        relationLabel: 'misma materia',
        requiresHumanApproval: true,
        signals: {},
      },
    ],
  }
  it('isApproved matches on (quejaId, tenderId)', () => {
    const approvals = [{ quejaId: 'Q-9', tenderId: 'T9' }]
    expect(isApproved(approvals, 'Q-9', 'T9')).toBe(true)
    expect(isApproved(approvals, 'Q-9', 'OTHER')).toBe(false)
    expect(isApproved([], 'Q-9', 'T9')).toBe(false)
  })
  it('a gated link stays hidden without approval', () => {
    expect(relationsForQueja(gated, 'Q-9')).toEqual([])
  })
  it('a gated link renders once a curator approves the exact pair', () => {
    const approvals = [{ quejaId: 'Q-9', tenderId: 'T9' }]
    expect(relationsForQueja(gated, 'Q-9', approvals)).toHaveLength(1)
    expect(relationsForTender(gated, 'P9', approvals)).toHaveLength(1)
  })
})
