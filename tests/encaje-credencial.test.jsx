import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EncajeCard } from '../src/components/EncajeDeclarado'
import {
  fitRowsForSlug,
  isPartialRelation,
  relatedAreaNames,
  relatedCredentials,
} from '../src/hooks/useAreaFit'
import { installFetchMock } from './setup/mockFetch'

/**
 * The defect this file pins: «Formación» and «Experiencia» both printed the
 * ÁREA list, so on 4 of the 11 published cards the two lines rendered
 * character-for-character the same text — under a portfolio list the card had
 * already shown twice. Two labels over one fact reads as two findings about a
 * named person.
 *
 * Run against the PUBLISHED snapshot, not a hand-written stub. The rule under
 * test is «these two lines differ», and a stub authored to differ cannot fail
 * it — the same green-but-vacuous shape DATA_INTEGRITY warns about. Every
 * assertion below therefore first proves the data it rides on is the shape the
 * assertion needs (rows exist, a relation is partial, a truncation happened),
 * so a snapshot that stopped exercising a branch goes red instead of quiet.
 */

const FIT = JSON.parse(readFileSync(resolve(__dirname, '../public/data/area-fit.json'), 'utf8'))
const OFFICIALS = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/officials.json'), 'utf8'),
)

/** Relates in ALL four of her áreas, on both axes — the no-qualifier branch. */
const POZUELO = 'teresa-pozuelo-martin'
/** Relates in 4 of 7 (formación) and 5 of 7 (experiencia) — the «solo en» branch. */
const CARRIZOSA = 'jose-angel-hernandez-carrizosa'
/** Nothing relates on either axis — the Pill branch, which must not change. */
const RAMOS = 'jose-luis-ramos-march'

const rowsFor = (slug) => fitRowsForSlug(FIT, slug)
const officialFor = (slug) => OFFICIALS.officials.find((o) => o.slug === slug)

/** Evidence shorts in the order the rows and the CV list them, duplicates kept. */
function rawShorts(rows, field) {
  return rows
    .filter((r) => r[field]?.value === 'relacionada')
    .flatMap((r) => r[field].evidence.map((e) => e.short))
}

function mount(slug) {
  installFetchMock({
    '/data/area-fit.json': FIT,
    '/data/promises.json': { generatedAt: '2026-08-04T00:00:00Z', frozenUntil: null, items: [] },
  })
  return render(
    <MemoryRouter>
      <EncajeCard official={officialFor(slug)} />
    </MemoryRouter>,
  )
}

/** The whole flex row for one axis: its label plus whatever it prints. */
async function axisLine(field) {
  const label = await screen.findByText(field, {}, { timeout: 4000 })
  return label.parentElement.textContent.replace(field, '').trim()
}

describe('relatedCredentials — cada eje nombra lo suyo, en el orden del CV', () => {
  it('devuelve los títulos declarados, sin repetir el mismo en cada área', () => {
    const rows = rowsFor(CARRIZOSA)
    const raw = rawShorts(rows, 'experiencia')
    const creds = relatedCredentials(rows, 'experiencia')
    // The dedupe is EXERCISED, not merely satisfied: the same post is cited on
    // every área it relates to, so the raw list is longer than the printed one.
    // Without this the assertion below would pass on data with no duplicates.
    expect(raw.length).toBeGreaterThan(creds.length)
    expect(creds.length).toBeGreaterThan(0)
    expect(new Set(creds).size).toBe(creds.length)
    // Every printed credential is one the snapshot actually cites — the card
    // must not be able to name a qualification nobody declared.
    for (const c of creds) expect(raw).toContain(c)
  })

  it('no reordena: el orden es el del CV, nunca el alfabético ni por peso', () => {
    // «Auxiliar administrativo» antes que «Administrativo» — el CV lo pone así.
    // Ordenar esto sería juzgar qué puesto de una carrera pesa más, y ninguna
    // fuente de aquí sostiene ese juicio.
    const creds = relatedCredentials(rowsFor(CARRIZOSA), 'experiencia')
    const raw = rawShorts(rowsFor(CARRIZOSA), 'experiencia')
    expect(creds).toEqual([...new Set(raw)])
    // Y la comprobación muerde: este eje NO está alfabetizado en origen, así que
    // un `sort()` colado en el helper cambiaría el resultado.
    expect(creds).not.toEqual([...creds].sort())
  })

  it('cae al label largo cuando una evidencia no trae short', () => {
    // A snapshot written before `short` existed must degrade to the long form,
    // never to a blank line beside a person's name. Built by stripping the field
    // off a REAL row rather than by inventing one, so the fallback is tested
    // against the shape production actually publishes.
    const [row, ...rest] = rowsFor(POZUELO)
    const stripped = {
      ...row,
      formacion: {
        ...row.formacion,
        evidence: row.formacion.evidence.map(({ short, ...ev }) => ev),
      },
    }
    const creds = relatedCredentials([stripped, ...rest], 'formacion')
    expect(creds.length).toBeGreaterThan(0)
    expect(creds).toContain(row.formacion.evidence[0].label)
  })

  it('no devuelve nada del eje que no relaciona en ningún área', () => {
    expect(relatedCredentials(rowsFor(RAMOS), 'formacion')).toEqual([])
  })
})

describe('isPartialRelation — sólo se acota lo que se queda corto', () => {
  it('es falso cuando la relación alcanza todas las áreas que dirige', () => {
    const rows = rowsFor(POZUELO)
    // The premise is asserted, not assumed: if a promotion ever leaves one of
    // her áreas unrelated this goes red here, where it is a data change, rather
    // than silently turning the render test below into a different test.
    expect(rows.length).toBeGreaterThan(1)
    for (const field of ['formacion', 'experiencia']) {
      expect(rows.every((r) => r[field].value === 'relacionada')).toBe(true)
      expect(isPartialRelation(rows, field)).toBe(false)
    }
  })

  it('es verdadero cuando alcanza algunas y no otras', () => {
    const rows = rowsFor(CARRIZOSA)
    for (const field of ['formacion', 'experiencia']) {
      const related = relatedAreaNames(rows, field).length
      expect(related).toBeGreaterThan(0)
      expect(related).toBeLessThan(rows.length)
      expect(isPartialRelation(rows, field)).toBe(true)
    }
  })

  it('es falso cuando no relaciona en ninguna: ahí no hay nada que acotar', () => {
    const rows = rowsFor(RAMOS)
    expect(rows.length).toBeGreaterThan(0)
    expect(isPartialRelation(rows, 'formacion')).toBe(false)
  })

  it('cuenta TODAS las áreas del cargo, también una que nadie evaluó', () => {
    // An área with no assessment on this axis is not an área the relation was
    // found in. Folding it into "all of them" would drop the «solo en» and widen
    // the claim over ground no curator read.
    const [first, ...rest] = rowsFor(POZUELO)
    const { formacion, ...sinEje } = first
    expect(isPartialRelation([sinEje, ...rest], 'formacion')).toBe(true)
  })
})

describe('la ficha de /cargos — dos ejes, dos frases distintas', () => {
  it('Formación y Experiencia ya no imprimen el mismo texto (Pozuelo)', async () => {
    // THE reported defect, on the card that showed it. Both axes related in all
    // four of her áreas, so both printed the same four área names.
    mount(POZUELO)
    const formacion = await axisLine('Formación')
    const experiencia = await axisLine('Experiencia')
    expect(formacion.length).toBeGreaterThan(0)
    expect(experiencia.length).toBeGreaterThan(0)
    expect(formacion).not.toBe(experiencia)
    // And they differ because each says its own thing, not because one is empty
    // or truncated differently: each line carries its own axis's credential.
    const rows = rowsFor(POZUELO)
    expect(formacion).toContain(relatedCredentials(rows, 'formacion')[0])
    expect(experiencia).toContain(relatedCredentials(rows, 'experiencia')[0])
  })

  it('sin acotación cuando la relación alcanza todas sus áreas (Pozuelo)', async () => {
    mount(POZUELO)
    await waitFor(() => expect(screen.getByText('Encaje declarado')).toBeInTheDocument())
    // Nothing to qualify, so no «solo en» and no área list: it would repeat the
    // portfolios the card already prints above this block.
    expect(screen.queryByText(/solo en/i)).toBeNull()
    const block = screen.getByText('Encaje declarado').parentElement.textContent
    for (const area of officialFor(POZUELO).portfolios) expect(block).not.toContain(area)
  })

  it('acota con «solo en» y NOMBRES cuando no las alcanza todas (Carrizosa)', async () => {
    mount(CARRIZOSA)
    await waitFor(() => expect(screen.getByText('Encaje declarado')).toBeInTheDocument())
    const block = screen.getByText('Encaje declarado').parentElement.textContent
    // Both branches proven reachable: absent above, present here.
    expect(screen.getAllByText(/solo en/i).length).toBe(2)
    // It names the áreas the relation WAS found in…
    expect(block).toContain(relatedAreaNames(rowsFor(CARRIZOSA), 'formacion')[0])
    // …and never one it was not. «Compra Pública» reads sin-relación on both
    // axes; naming it under «solo en» would invert the sentence.
    const unrelated = rowsFor(CARRIZOSA).filter(
      (r) => r.formacion.value !== 'relacionada' && r.experiencia.value !== 'relacionada',
    )
    expect(unrelated.length).toBeGreaterThan(0)
    for (const r of unrelated) expect(block).not.toContain(r.portfolio)
  })

  it('el eje sin relación declarada sigue siendo su etiqueta, intacta (Ramos)', async () => {
    // Only the `relacionada` branch changed. A negative assessment has no
    // credential to name, and the Pill is carrying the whole statement.
    mount(RAMOS)
    await waitFor(() => expect(screen.getByText('Encaje declarado')).toBeInTheDocument())
    expect(screen.getAllByText('sin relación declarada').length).toBe(2)
    expect(screen.queryByText(/solo en/i)).toBeNull()
  })

  it('no imprime ninguna cuenta, en ninguna de las formas que tomaría', async () => {
    mount(CARRIZOSA)
    await waitFor(() => expect(screen.getByText('Encaje declarado')).toBeInTheDocument())
    const block = screen.getByText('Encaje declarado').parentElement.textContent
    // The block is populated, so the negatives below are measuring something.
    expect(block.length).toBeGreaterThan(80)
    expect(block).not.toMatch(/\d+\s*%/)
    expect(block).not.toMatch(/\d+\s+de\s+\d+/i)
    expect(block).not.toMatch(/\d+\s*\/\s*\d+/)
  })
})
