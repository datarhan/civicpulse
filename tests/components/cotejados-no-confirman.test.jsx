/**
 * Bajo «Documentos cotejados», la ficha dice lo que esa lista no dice.
 *
 * La revisión lectora del 27-10-2026 leyó en /plenos/c8kr44 y /plenos/k4olcs,
 * pestaña Hallazgos, «DOCUMENTOS COTEJADOS · FICHA 70A34F» encima de un contrato
 * de patrocinio del Club de Básquet Riba-roja Camp de Túria, colgado de una cita
 * sobre la limpieza de los colegios por las palabras «Camp de Túria», en una
 * ficha cuya propia nota dice que nada confirma ni desmiente sus citas. El
 * rótulo es el neutro desde que dejó de llamarse «Corrobora» (PlenoFindings.jsx),
 * y aun así encabeza la lista como lo que respalda la ficha. La lista es todo lo
 * que el verificador cotejó para sus citas, confirme o no (auto-curate.ts): la
 * frase de debajo lo dice donde se lee la lista. El texto firmado de la ficha
 * no se toca.
 *
 * Se pinta la banda de verdad —`ListaDeCotejos`, la que comparten /plenos/:id y
 * /hallazgos— con las fichas publicadas, en los dos idiomas, y se lee aplanada
 * como la lee la revisión: la frase va en la línea siguiente al rótulo.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ListaDeCotejos, codigoDeFicha } from '../../src/components/PlenoFindings'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'

const ROOT = join(__dirname, '..', '..')
const FINDINGS = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const ficha = (id) => {
  const f = FINDINGS.items.find((x) => x.id === id)
  expect(f, id).toBeDefined()
  return f
}

afterEach(() => {
  cleanup()
  localStorage.removeItem('cp:lang')
})

/** La banda de una ficha, pintada en `idioma` y leída en líneas, como `innerText`. */
function lineas(f, idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({})
  const { container } = render(
    <MemoryRouter>
      <LocaleProvider>
        <ListaDeCotejos
          crossChecked={f.crossChecked}
          contradiction={f.contradiction}
          plenoDate={f.plenoDate}
          ficha={codigoDeFicha(f.id)}
        />
      </LocaleProvider>
    </MemoryRouter>,
  )
  // Una línea por caja de bloque: el rótulo, la frase y cada documento son
  // `div` o enlaces en bloque.
  return [...container.querySelectorAll('div, a')]
    .filter((el) => el.children.length === 0 || el.tagName === 'A')
    .map((el) => el.textContent.trim())
    .filter(Boolean)
}

const SEÑALADAS = [
  // c8kr44: el patrocinio de baloncesto bajo la limpieza de los colegios.
  'f-2025-09-08-acu-70a34f',
  // k4olcs: contratos de eficiencia energética y de educación ambiental bajo el pla Edificant.
  'f-2026-04-20-cit-25e6ea',
]

describe('«Documentos cotejados» va con la frase que dice que no los confirma', () => {
  for (const id of SEÑALADAS) {
    for (const idioma of ['es', 'ca']) {
      it(`${id} (${idioma}): la frase va justo bajo el rótulo de su ficha`, () => {
        const f = ficha(id)
        // La premisa: la ficha publica documentos cotejados que no son el vídeo.
        expect(f.crossChecked.filter((r) => r.kind !== 'pleno-video').length).toBeGreaterThan(0)
        const ls = lineas(f, idioma)
        const rotulo = `${CATALOGUE[idioma]['findings.refs.crossChecked']} · ${CATALOGUE[idioma][
          'findings.refs.ficha'
        ].replace('{ficha}', codigoDeFicha(id))}`
        const i = ls.indexOf(rotulo)
        expect(i, ls.join('\n')).toBeGreaterThanOrEqual(0)
        expect(ls[i + 1]).toBe(CATALOGUE[idioma]['findings.refs.crossChecked.nota'])
      })
    }
  }

  it('la frase dice que estar en la lista no confirma, en los dos idiomas', () => {
    expect(CATALOGUE.es['findings.refs.crossChecked.nota']).toMatch(/no dice que las confirmen/)
    expect(CATALOGUE.ca['findings.refs.crossChecked.nota']).toMatch(/no diu que les confirmen/)
  })

  it('la procedencia de las citas —el vídeo del pleno— no la lleva: no es un cotejo', () => {
    const f = ficha('f-2025-09-08-acu-70a34f')
    const soloVideo = { ...f, crossChecked: f.crossChecked.filter((r) => r.kind === 'pleno-video') }
    // Lo positivo primero: la banda de procedencia se pinta.
    const ls = lineas(soloVideo, 'es')
    expect(ls.some((l) => l.startsWith(CATALOGUE.es['findings.refs.provenance']))).toBe(true)
    expect(ls).not.toContain(CATALOGUE.es['findings.refs.crossChecked.nota'])
  })
})
