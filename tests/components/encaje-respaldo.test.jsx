import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EncajeCard, EncajeMatrix } from '../../src/components/EncajeDeclarado'
import { installFetchMock } from '../setup/mockFetch'

/**
 * The rendering rule this file exists to pin: while every assessment agrees on
 * what its evidence rests on, the block SAYS IT ONCE. A mark repeated identically
 * beside every chip distinguishes nothing — that is how the cargoPublicoPrevio
 * chip died, and the whole point of `sharedRespaldo` returning null on divergence.
 *
 * The aviso cases matter more than they look: no aviso is signed yet, so this is
 * the only place the signed path is exercised at all. A path with no data and no
 * test is indistinguishable from a broken one.
 */

const OFFICIAL = {
  slug: 'ana-ejemplo',
  name: 'Ana Ejemplo',
  portfolios: ['Urbanismo', 'Cultura'],
}

const RESPALDO_SENTENCE = /Lo que aquí se cita procede del CV que publica la propia persona/i
const AVISO_LABEL = /Advertencia de la biografía/i

/** One row, with whatever backing each axis should carry. */
function row(portfolio, formacion, experiencia) {
  const assess = (respaldo) =>
    respaldo
      ? {
          value: 'relacionada',
          evidence: [{ label: `Título de ${portfolio}`, sourceIds: ['src-001'] }],
          respaldo,
        }
      : { value: 'sin-relacion-declarada', evidence: [] }
  return {
    officialSlug: OFFICIAL.slug,
    portfolio,
    departmentSlug: null,
    reportId: 'r-ana-bio',
    formacion: assess(formacion),
    experiencia: assess(experiencia),
    curatedBy: 'Sergei Lutchenko',
    curatedAt: '2026-08-04',
  }
}

function mount(node, { rows, avisos } = {}) {
  installFetchMock({
    '/data/area-fit.json': {
      generatedAt: '2026-08-04T00:00:00Z',
      mandate: '2023-2027',
      rows: rows ?? [],
      ...(avisos ? { avisos } : {}),
    },
    '/data/promises.json': { generatedAt: '2026-08-04T00:00:00Z', frozenUntil: null, items: [] },
  })
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('encaje — the backing is stated once, not once per chip', () => {
  it('states it in a single sentence while every assessment agrees', async () => {
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [
        row('Urbanismo', 'autodeclarada', 'autodeclarada'),
        row('Cultura', 'autodeclarada', 'autodeclarada'),
      ],
    })
    // Exactly one — four agreeing assessments, one sentence.
    await waitFor(() => expect(screen.getAllByText(RESPALDO_SENTENCE)).toHaveLength(1))
    // And NO per-item marks: that is the defect this rule exists to prevent.
    expect(screen.queryAllByText('autodeclarada')).toHaveLength(0)
  })

  it('switches to per-item marks the moment they diverge', async () => {
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [
        row('Urbanismo', 'autodeclarada', 'autodeclarada'),
        row('Cultura', 'corroborada', 'autodeclarada'),
      ],
    })
    // formación disagrees across áreas → no mark for that axis; experiencia
    // agrees → its mark shows. Neither gets the whole-card sentence.
    await waitFor(() => expect(screen.getAllByText('autodeclarada').length).toBeGreaterThan(0))
    expect(screen.queryByText(RESPALDO_SENTENCE)).toBeNull()
  })

  it('says nothing about backing when nothing is cited', async () => {
    // «no consta» and «sin relación declarada» cite nothing, so there is no
    // backing to describe. Printing "autodeclarada" here would assert of a named
    // person that they declared something they did not.
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', null, null), row('Cultura', null, null)],
    })
    await waitFor(() => expect(screen.getByText('Encaje declarado')).toBeInTheDocument())
    expect(screen.queryByText(RESPALDO_SENTENCE)).toBeNull()
    expect(screen.queryAllByText('autodeclarada')).toHaveLength(0)
  })

  it('states it once on the matrix too, not once per área', async () => {
    mount(<EncajeMatrix official={OFFICIAL} />, {
      rows: [
        row('Urbanismo', 'autodeclarada', 'autodeclarada'),
        row('Cultura', 'autodeclarada', 'autodeclarada'),
      ],
    })
    await waitFor(() => expect(screen.getAllByText(RESPALDO_SENTENCE)).toHaveLength(1))
    expect(screen.queryAllByText('autodeclarada')).toHaveLength(0)
  })
})

describe('encaje — signed avisos, and the empty state that is the norm', () => {
  const AVISO_AREA = {
    officialSlug: OFFICIAL.slug,
    reportId: 'r-ana-bio',
    avisoIndex: 1,
    eje: 'area',
    direccion: 'matiza',
    verbatim: 'Las delegaciones han variado durante el mandato.',
    decoratesChip: false,
    curatedBy: 'Sergei Lutchenko',
    curatedAt: '2026-08-04',
  }
  const AVISO_FORMACION = {
    ...AVISO_AREA,
    avisoIndex: 2,
    eje: 'formacion',
    direccion: 'contradice',
    verbatim: 'Su CV y su declaración estatutaria difieren en el año del título.',
    decoratesChip: true,
  }

  it('renders nothing at all when no aviso is signed — the published state', async () => {
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', 'autodeclarada', 'autodeclarada')],
    })
    await waitFor(() => expect(screen.getByText('Encaje declarado')).toBeInTheDocument())
    // An empty warning frame would imply something is missing when nothing is.
    expect(screen.queryByText(AVISO_LABEL)).toBeNull()
  })

  it('renders a signed área aviso above the chips, as a caveat about the row', async () => {
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', 'autodeclarada', 'autodeclarada')],
      avisos: [AVISO_AREA],
    })
    await waitFor(() => expect(screen.getByText(AVISO_LABEL)).toBeInTheDocument())
    expect(screen.getByText(/puede referirse a un área que ya no lleva/i)).toBeInTheDocument()
  })

  it('quotes a chip-bearing aviso in the biography’s own words, on its axis', async () => {
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', 'autodeclarada', 'autodeclarada')],
      avisos: [AVISO_FORMACION],
    })
    // The published text is the report's, never the component's: the verbatim
    // rides the mapping and this is where that has to still be true.
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(AVISO_FORMACION.verbatim.slice(0, 30))),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/contradicción sin resolver/i)).toBeInTheDocument()
  })

  it('shows each aviso once on the matrix, not once per área', async () => {
    mount(<EncajeMatrix official={OFFICIAL} />, {
      rows: [
        row('Urbanismo', 'autodeclarada', 'autodeclarada'),
        row('Cultura', 'autodeclarada', 'autodeclarada'),
      ],
      avisos: [AVISO_AREA, AVISO_FORMACION],
    })
    // Two áreas, two avisos: repeating them per área would turn one warning
    // about a biography into four apparent findings about a person.
    await waitFor(() => expect(screen.getAllByText(AVISO_LABEL)).toHaveLength(2))
  })
})
