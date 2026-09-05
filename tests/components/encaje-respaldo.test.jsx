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
const COMPARADO_SENTENCE = /Lo que se compara es el CV que la propia persona declara/i
const AVISO_LABEL = /Advertencia de la biografía/i
const AVISO_LABEL_FICHA = /Advertencia sobre esta ficha/i

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

  it('but STILL states what it compared — the harshest card is not left bare', async () => {
    // Three published cards read «sin relación declarada» on both axes and cite
    // nothing at all: jose-luis-ramos-march, maria-esther-gomez-laredo and
    // alfredo-pla-gimenez. With no backing sentence and no marks they showed two
    // bare negative labels and no provenance — a verdict no component asserts,
    // and two of them under a warning frame as well.
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', null, null), row('Cultura', null, null)],
    })
    await waitFor(() => expect(screen.getByText(COMPARADO_SENTENCE)).toBeInTheDocument())
    // And it must not smuggle back the claim that was deliberately removed:
    // nothing was cited, so no corroboration was looked for, so none may be
    // denied. An absence is not a finding.
    expect(screen.queryByText(/ninguna fuente independiente/i)).toBeNull()
  })

  it('does not double up: a citing card states its backing and nothing else', async () => {
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', 'autodeclarada', 'autodeclarada')],
    })
    await waitFor(() => expect(screen.getByText(RESPALDO_SENTENCE)).toBeInTheDocument())
    expect(screen.queryByText(COMPARADO_SENTENCE)).toBeNull()
  })

  it('a card where only SOME assessments cite keeps the backing sentence', async () => {
    // `sharedRespaldo` ignores the non-citing ones, so this is not the silent
    // case: «lo que aquí se cita» is true and already scopes itself.
    mount(<EncajeCard official={OFFICIAL} />, {
      rows: [row('Urbanismo', 'autodeclarada', null), row('Cultura', null, null)],
    })
    await waitFor(() => expect(screen.getByText(RESPALDO_SENTENCE)).toBeInTheDocument())
    expect(screen.queryByText(COMPARADO_SENTENCE)).toBeNull()
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
    await waitFor(() =>
      expect(screen.getByText(/juzga un área que lleva hoy/i)).toBeInTheDocument(),
    )
    // ATTRIBUTED TO US, NOT TO THE BIOGRAPHY. This branch prints a fixed
    // CivicPulse sentence and suppresses the verbatim to fit under the chips, so
    // labelling it «Advertencia de la biografía» credited a document that did
    // not write that sentence. The paraphrase is faithful and nothing false was
    // published — but on a page that names living people, who said a sentence is
    // part of what the sentence says. The label follows what is on screen.
    expect(screen.getByText(AVISO_LABEL_FICHA)).toBeInTheDocument()
    expect(screen.queryByText(AVISO_LABEL)).toBeNull()
  })

  it('credits the biography wherever the biography’s own words are shown', async () => {
    // Same aviso, matrix path: the verbatim IS on screen, between « », so the
    // attribution is earned and the label says so.
    mount(<EncajeMatrix official={OFFICIAL} />, {
      rows: [row('Urbanismo', 'autodeclarada', 'autodeclarada')],
      avisos: [AVISO_AREA],
    })
    await waitFor(() => expect(screen.getByText(AVISO_LABEL)).toBeInTheDocument())
    expect(screen.getByText(new RegExp(AVISO_AREA.verbatim.slice(0, 30)))).toBeInTheDocument()
    expect(screen.queryByText(AVISO_LABEL_FICHA)).toBeNull()
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
