import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// The block fetches each pieza's frozen snapshot through the shared store.
const snapshots = new Map()
vi.mock('../../src/lib/snapshot-store', () => ({
  loadSnapshotOptional: (path) => Promise.resolve(snapshots.get(path) ?? null),
}))
vi.mock('../../src/reportajes', () => ({ REPORTAJE_SLUGS: ['uno', 'dos'] }))

const { ReportajeBlockD, reportajeTopic, SUMMARY_CHARS } =
  await import('../../src/variants/direction-d/blocks/ReportajeBlockD')

const LARGO =
  'El Ayuntamiento celebra una innovadora plataforma que analiza el comportamiento de los ' +
  'visitantes. El expediente de contratación permite reconstruir qué se compró exactamente, ' +
  'a quién, con qué calendario, y qué queda para el municipio cuando los contratos terminan.'

function pieza(over = {}) {
  return {
    meta: {
      slug: 'uno',
      seccion: 'Reportaje · Dinero público',
      titulo: 'Dos millones para el destino inteligente',
      subtitulo: LARGO,
      estado: 'publicado',
      publicadoEl: '15 de julio de 2026',
      ...over,
    },
  }
}

const draw = () =>
  render(
    <MemoryRouter>
      <ReportajeBlockD />
    </MemoryRouter>,
  )

beforeEach(() => snapshots.clear())

describe('ReportajeBlockD — the landing lead', () => {
  it('renders a summary for each pieza, not a bare headline', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza())
    draw()
    await screen.findByText(/Dos millones para el destino inteligente/)
    // The whole point of the redesign: the reader can tell what the pieza found
    // without opening it.
    expect(screen.getByText(/El Ayuntamiento celebra una innovadora plataforma/)).toBeTruthy()
  })

  it('truncates the summary to the teaser budget on a word boundary', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza())
    draw()
    const p = await screen.findByText(/El Ayuntamiento celebra/)
    expect(p.textContent.length).toBeLessThanOrEqual(SUMMARY_CHARS + 1)
    expect(p.textContent.endsWith('…')).toBe(true)
    // A word-boundary cut, so the last visible token is a real word.
    const last = p.textContent.replace('…', '').split(' ').pop()
    expect(LARGO.split(/\s+/)).toContain(last)
  })

  it('leaves a short summary intact, with no ellipsis implying more text', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza({ subtitulo: 'Un resumen breve.' }))
    draw()
    expect(await screen.findByText('Un resumen breve.')).toBeTruthy()
  })

  it('renders every published pieza in registry order', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza({ titulo: 'Primera pieza publicada' }))
    snapshots.set(
      '/data/reportajes/dos.json',
      pieza({ slug: 'dos', titulo: 'Segunda pieza publicada' }),
    )
    const { container } = draw()
    await screen.findByText('Primera pieza publicada')
    expect(screen.getByText('Segunda pieza publicada')).toBeTruthy()
    expect(container.textContent).toContain('2 piezas')
  })

  it('honours the honesty gate: a borrador never lists', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza({ estado: 'borrador' }))
    snapshots.set('/data/reportajes/dos.json', pieza({ slug: 'dos', titulo: 'La única publicada' }))
    draw()
    await screen.findByText('La única publicada')
    expect(screen.queryByText('Dos millones para el destino inteligente')).toBeNull()
    expect(screen.getByText(/1 pieza$/)).toBeTruthy()
  })

  it('renders nothing at all when no pieza is published — never an empty shell', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza({ estado: 'borrador' }))
    const { container } = draw()
    await waitFor(() => expect(container.textContent).not.toContain('Reportajes'))
    expect(container.innerHTML).toBe('')
  })

  it('discloses published corrections on the teaser, not only inside the pieza', async () => {
    snapshots.set(
      '/data/reportajes/uno.json',
      pieza({ correcciones: [{ fecha: '2026-08-02', texto: 'x' }] }),
    )
    draw()
    expect(await screen.findByText(/1 corrección publicada/)).toBeTruthy()
  })

  it('pluralises the corrections disclosure', async () => {
    snapshots.set(
      '/data/reportajes/uno.json',
      pieza({ correcciones: [{ texto: 'a' }, { texto: 'b' }] }),
    )
    draw()
    expect(await screen.findByText(/2 correcciones publicadas/)).toBeTruthy()
  })

  it('says nothing about corrections when there are none', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza())
    const { container } = draw()
    await screen.findByText(/Dos millones/)
    expect(container.textContent).not.toMatch(/correc/i)
  })

  it('normalises the date so an ISO fechaDatos never reaches the reader', async () => {
    snapshots.set(
      '/data/reportajes/uno.json',
      pieza({ publicadoEl: undefined, fechaDatos: '2026-07-06' }),
    )
    const { container } = draw()
    await screen.findByText(/Dos millones/)
    expect(container.textContent).toContain('6 de julio de 2026')
    expect(container.textContent).not.toContain('2026-07-06')
  })

  it('links each pieza to its route and offers the index', async () => {
    snapshots.set('/data/reportajes/uno.json', pieza())
    draw()
    const link = await screen.findByRole('link', { name: /Dos millones/ })
    expect(link.getAttribute('href')).toBe('/reportajes/uno')
    expect(screen.getByRole('link', { name: /Todos los reportajes/ }).getAttribute('href')).toBe(
      '/reportajes',
    )
  })
})

describe('reportajeTopic', () => {
  it('strips the redundant "Reportaje ·" prefix the section header already says', () => {
    expect(reportajeTopic('Reportaje · Dinero público')).toBe('Dinero público')
    expect(reportajeTopic('Reportaje · datos')).toBe('datos')
    expect(reportajeTopic('Reportajes: investigación')).toBe('investigación')
  })

  it('leaves a section that is not prefixed alone', () => {
    expect(reportajeTopic('Análisis de datos')).toBe('Análisis de datos')
  })

  it('is empty for missing input', () => {
    expect(reportajeTopic(undefined)).toBe('')
    expect(reportajeTopic('')).toBe('')
  })
})
