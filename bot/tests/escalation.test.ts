import { describe, expect, it, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { addApoyo, createQueja, setState, type NewQuejaInput } from '../src/db/queries'
import { buildSindicTemplate, renderSindicMarkdown, renderSindicHtml } from '../src/services/sindic'
import { checkSilencio } from '../src/services/cron'
import { routeUsingLocalOfficials } from '../src/services/router'

function seed(db: Db, overrides: Partial<NewQuejaInput> = {}) {
  return createQueja(db, {
    telegram_user_id: 1,
    category: 'via_publica',
    title: 'Bache profundo',
    detail: 'Bache de 40cm en Av. Primera, peligroso y sin señalizar',
    neighborhood: 'casco',
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  })
}

function register(db: Db, id: string, entryNumber = '2026-RE-0001') {
  setState(db, id, 'registrada', { entry_number: entryNumber, csv: 'ABC123' })
}

function fakeChannel() {
  const emitted: Array<{ kind: string; id: string }> = []
  return {
    emitted,
    postNuevaQueja: async () => undefined,
    postApoyoMilestone: async () => undefined,
    postRegistrada: async () => undefined,
    postResuelta: async () => undefined,
    postSilencio: async (q: { id: string }) => {
      emitted.push({ kind: 'silencio', id: q.id })
    },
    postEscaladaSindic: async (q: { id: string }) => {
      emitted.push({ kind: 'escalada', id: q.id })
    },
  }
}

describe('sindic — template renderer', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('includes queja ID, registro entry number, CSV and verbatim detail', () => {
    const q = seed(db)
    register(db, q.id, '2026-RE-0847')
    const updated = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const now = new Date(new Date(updated.registered_at!).getTime() + 120 * 86_400_000)
    const t = buildSindicTemplate(updated, routing, now)
    const md = renderSindicMarkdown(t)
    expect(md).toMatch(q.id)
    expect(md).toMatch('2026-RE-0847')
    expect(md).toMatch(/ABC123/)
    expect(md).toMatch(/Bache de 40cm en Av. Primera/)
    expect(md).toMatch(/Síndic de Greuges/)
    expect(md).toMatch(/Ley 11\/1988/)
  })

  it('cites the LPACAP articles the router provided', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const md = renderSindicMarkdown(buildSindicTemplate(row, routing))
    expect(md).toMatch(/art.*21\.3/)
    expect(md).toMatch(/art.*21\.4/)
    expect(md).toMatch(/art.*24/)
  })

  it('counts días transcurridos from registered_at', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const now = new Date(new Date(row.registered_at!).getTime() + 95 * 86_400_000)
    const t = buildSindicTemplate(row, routing, now)
    expect(t.diasTranscurridos).toBeGreaterThanOrEqual(94)
    expect(t.diasTranscurridos).toBeLessThanOrEqual(96)
  })

  it('renders a valid HTML document', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const html = renderSindicHtml(buildSindicTemplate(row, routing))
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toMatch(/<title>Queja al Síndic · /)
    expect(html).toMatch(/@media print/)
  })
})

describe('cron — checkSilencio', () => {
  let db: Db
  let channel: ReturnType<typeof fakeChannel>
  beforeEach(() => {
    db = openDb(':memory:')
    channel = fakeChannel()
  })

  it('transitions registered quejas past the 90-day deadline', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 95 * 86_400_000)
    const r = checkSilencio(db, channel as never, future)
    expect(r.transitioned.length).toBe(1)
    expect(r.transitioned[0].state).toBe('silencio_negativo')
  })

  it('leaves in-time quejas alone', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const soon = new Date(new Date(row.registered_at).getTime() + 30 * 86_400_000)
    const r = checkSilencio(db, channel as never, soon)
    expect(r.transitioned.length).toBe(0)
  })

  it('applies the transparencia 30-day deadline', () => {
    const q = seed(db, {
      category: 'transparencia',
      title: 'Acceso a contratos',
      detail: 'Solicito copia de los contratos de limpieza viaria de 2024',
    })
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    // 45 days → past transparencia deadline (30) but not past standard (90).
    const t = new Date(new Date(row.registered_at).getTime() + 45 * 86_400_000)
    const r = checkSilencio(db, channel as never, t)
    expect(r.transitioned.length).toBe(1)
  })

  it('does not touch urbanismo licencia (silencio positivo)', () => {
    const q = seed(db, {
      category: 'urbanismo',
      title: 'Licencia de obra menor',
      detail: 'Solicito licencia para reforma de cocina en vivienda unifamiliar',
    })
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 120 * 86_400_000)
    const r = checkSilencio(db, channel as never, future)
    expect(r.transitioned.length).toBe(0)
  })

  it('emits a silencio broadcast per transitioned queja', async () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 95 * 86_400_000)
    checkSilencio(db, channel as never, future)
    // broadcasts are fire-and-forget; let microtasks flush.
    await new Promise((r) => setTimeout(r, 10))
    expect(channel.emitted.filter((e) => e.kind === 'silencio').length).toBe(1)
  })
})
