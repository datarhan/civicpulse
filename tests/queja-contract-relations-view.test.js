import { describe, it, expect } from 'vitest'
import {
  relatedQuejasForContract,
  relationsForTender,
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
