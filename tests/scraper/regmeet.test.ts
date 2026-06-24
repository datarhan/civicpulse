import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseRegmeetOutcomes, normalizeRegmeetLabel, isNonVote } from '../../src/scraper/regmeet'

const html = readFileSync(resolve('tests/fixtures/regmeet_session_sample.html'), 'utf8')

describe('parseRegmeetOutcomes', () => {
  const items = parseRegmeetOutcomes(html)
  const byNum = new Map(items.map((i) => [i.number, i]))

  it('extracts every orden-del-día point with number, title and outcome', () => {
    expect(items.map((i) => i.number)).toEqual([1, 7, 8, 9, 12])
  })

  it('maps the label text to a normalised outcome', () => {
    expect(byNum.get(1)!.outcome).toBe('aprobada')
    expect(byNum.get(7)!.outcome).toBe('aprobada')
    expect(byNum.get(8)!.outcome).toBe('rechazada')
    expect(byNum.get(9)!.outcome).toBe('dar-cuenta') // informational, NOT a vote
    expect(byNum.get(12)!.outcome).toBe('debate')
  })

  it('strips the trailing (HH:MM:SS) timestamp from the title', () => {
    expect(byNum.get(7)!.title).toBe(
      "Expedient: 1562/2018/GEN, Acceptació proposada d'adjudicació concessió aigua",
    )
    expect(byNum.get(7)!.title).not.toMatch(/\d:\d/)
  })

  it('keeps an internal parenthesis in the title (only the timestamp is stripped)', () => {
    expect(byNum.get(9)!.title).toContain('(3t 2025)')
  })

  it('ignores point-like text inside <script> tags', () => {
    expect(byNum.has(0)).toBe(false)
    expect(items.every((i) => i.title !== 'fake')).toBe(true)
  })

  it('flags dar-cuenta / debate as non-votes, aprobada/rechazada as votes', () => {
    expect(isNonVote('dar-cuenta')).toBe(true)
    expect(isNonVote('debate')).toBe(true)
    expect(isNonVote('aprobada')).toBe(false)
    expect(isNonVote('rechazada')).toBe(false)
  })
})

describe('normalizeRegmeetLabel', () => {
  it('handles Spanish + Valencian variants and defaults to otro', () => {
    expect(normalizeRegmeetLabel('Aprovada')).toBe('aprobada')
    expect(normalizeRegmeetLabel('Aprobada')).toBe('aprobada')
    expect(normalizeRegmeetLabel('Rechazada')).toBe('rechazada')
    expect(normalizeRegmeetLabel('Retirada')).toBe('retirada')
    expect(normalizeRegmeetLabel('Donar compte')).toBe('dar-cuenta')
    expect(normalizeRegmeetLabel('Dar cuenta')).toBe('dar-cuenta')
    expect(normalizeRegmeetLabel('Debate')).toBe('debate')
    expect(normalizeRegmeetLabel('Algo raro')).toBe('otro')
  })
})
