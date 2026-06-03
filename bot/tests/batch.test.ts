import { describe, expect, it, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { addApoyo, createQueja, setState, type NewQuejaInput } from '../src/db/queries'
import {
  buildBatch,
  registerBatch,
  renderBatchMarkdown,
  renderBatchHtml,
  selectBatch,
} from '../src/services/batch'

function seed(db: Db, overrides: Partial<NewQuejaInput> = {}) {
  return createQueja(db, {
    telegram_user_id: 1,
    category: 'via_publica',
    title: 'Bache sin reparar',
    detail: 'Bache profundo en Av. Primera, 2 meses',
    neighborhood: 'casco',
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  })
}

function verify(db: Db, id: string) {
  // 10 apoyos → auto milestone; then promote state manually (the bot does this).
  for (let u = 200; u < 210; u++) addApoyo(db, id, u)
  setState(db, id, 'apoyada_verificada')
}

describe('batch — selectBatch', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('returns only verified quejas', () => {
    seed(db, { title: 'not-yet-verified' })
    const b = seed(db, { title: 'verified' })
    verify(db, b.id)
    const picked = selectBatch(db)
    expect(picked.length).toBe(1)
    expect(picked[0].queja.title).toBe('verified')
  })

  it('orders by apoyos desc, then age asc', () => {
    const a = seed(db, { title: 'A-fewer-apoyos' })
    verify(db, a.id) // 10 apoyos
    const b = seed(db, { title: 'B-many-apoyos' })
    verify(db, b.id)
    for (let u = 300; u < 305; u++) addApoyo(db, b.id, u) // B has 15
    const picked = selectBatch(db)
    expect(picked[0].queja.title).toBe('B-many-apoyos')
    expect(picked[1].queja.title).toBe('A-fewer-apoyos')
  })

  it('respects the limit', () => {
    for (let i = 0; i < 15; i++) {
      const q = seed(db, { title: 'q' + i })
      verify(db, q.id)
    }
    expect(selectBatch(db, 10).length).toBe(10)
    expect(selectBatch(db, 5).length).toBe(5)
  })

  it('carries legal routing data (plazo, silencio, base) into each item', () => {
    const q = seed(db, { category: 'transparencia', title: 'Acceso contratos' })
    verify(db, q.id)
    const [item] = selectBatch(db)
    expect(item.plazoDias).toBe(30) // Ley 19/2013 art. 20
    expect(item.silencio).toBe('negativo')
    expect(item.baseLegal).toMatch(/19\/2013|LTBG/)
  })
})

describe('batch — renderBatchMarkdown', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('includes every queja ID and the moderator name', () => {
    const a = seed(db, { title: 'Bache A' })
    const b = seed(db, { title: 'Farola B', category: 'alumbrado' })
    verify(db, a.id)
    verify(db, b.id)
    const batch = buildBatch(db, 'María Pérez')
    const md = renderBatchMarkdown(batch)
    expect(md).toMatch(/María Pérez/)
    expect(md).toMatch(a.id)
    expect(md).toMatch(b.id)
    expect(md).toMatch(/Bache A/)
    expect(md).toMatch(/Farola B/)
  })

  it('cites the relevant LPACAP articles', () => {
    const q = seed(db)
    verify(db, q.id)
    const md = renderBatchMarkdown(buildBatch(db, 'Vecino/a'))
    expect(md).toMatch(/art.*16/)
    expect(md).toMatch(/art.*21\.4/)
    expect(md).toMatch(/art.*21\.3/)
    expect(md).toMatch(/Ley 7\/1985/)
    expect(md).toMatch(/Ley 39\/2015/)
  })

  it('quotes the citizen detail verbatim', () => {
    const q = seed(db, { detail: 'El bache tiene 40cm de profundidad y está sin señalizar' })
    verify(db, q.id)
    const md = renderBatchMarkdown(buildBatch(db, 'Vecino/a'))
    expect(md).toMatch(/El bache tiene 40cm/)
  })
})

describe('batch — renderBatchHtml', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('wraps the markdown in a valid HTML document with print styles', () => {
    const q = seed(db)
    verify(db, q.id)
    const html = renderBatchHtml(buildBatch(db, 'Vecino/a'))
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toMatch(/<title>Solicitud CivicPulse/)
    expect(html).toMatch(/@media print/)
    expect(html).toMatch(/<h1>/)
  })
})

describe('batch — registerBatch', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('transitions verified quejas to registrada with the shared entry number + CSV', () => {
    const a = seed(db, { title: 'A' })
    const b = seed(db, { title: 'B' })
    verify(db, a.id)
    verify(db, b.id)
    const r = registerBatch(db, {
      ids: [a.id, b.id],
      entry_number: '2026-RE-0999',
      csv: 'XYZ123',
      moderator_user_id: 42,
    })
    expect(r.registered.length).toBe(2)
    expect(r.failed).toEqual([])
    for (const q of r.registered) {
      expect(q.state).toBe('registrada')
      expect(q.registro_entry_number).toBe('2026-RE-0999')
      expect(q.registro_csv).toBe('XYZ123')
      expect(q.registered_at).toBeTruthy()
    }
  })

  it('rejects quejas not in a registrable state', () => {
    const fresh = seed(db, { title: 'fresh-no-apoyos' })
    const verified = seed(db, { title: 'verified' })
    verify(db, verified.id)
    const r = registerBatch(db, {
      ids: [fresh.id, verified.id, 'Q-DOES-NOT-EXIST'],
      entry_number: '2026-RE-1000',
      csv: 'ABC',
      moderator_user_id: 42,
    })
    expect(r.registered.map((q) => q.id)).toEqual([verified.id])
    expect(r.failed.length).toBe(2)
    expect(r.failed.find((f) => f.id === 'Q-DOES-NOT-EXIST')?.reason).toMatch(/not found/)
    expect(r.failed.find((f) => f.id === fresh.id)?.reason).toMatch(/insufficient/)
  })
})
