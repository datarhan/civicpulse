/**
 * La categoría de un contrato, por su rótulo, en cada tarjeta de declaración.
 *
 * `claim-verifier.ts` compone el snippet de un contrato con su `categoryTitle` tal
 * cual lo publica Gobierto, en inglés: «… · INSDAGAR S.L. · construction · estado:
 * awarded». La #308 y la #309 quitaron la cola «estado:» en el registro de
 * declaraciones (/plenos/:id, /departamentos/:slug) y en /declaraciones, y la
 * categoría siguió saliendo cruda: el 12-10-2026, «· architecture ·» en
 * /departamentos/urbanismo. /hallazgos ya la cambiaba por su rótulo
 * (`snippetParaLeer`, #316); las otras dos no pasaban por ahí.
 *
 * Se pintan filas SERVIDAS —las de public/data/pleno-claims— y la prueba exige
 * haber encontrado alguna con una categoría en el snippet, o no mide nada. Lo que
 * se lee es lo pintado: ni la palabra inglesa del registro entre « · », ni el
 * snippet tal como se pintaba, y sí su rótulo en el idioma de quien lee.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ClaimLedger } from '../../src/components/ClaimLedger'
import Declaraciones from '../../src/pages/Declaraciones'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { gateForDisplay } from '../../src/lib/claim-ledger'
import { evidenciaSegunFuentes } from '../../src/lib/claim-provenance.js'
import { snippetWithoutStatus } from '../../src/lib/crosschecked-status.js'
import { CATEGORIAS_DE_CONTRATO } from '../../src/scraper/tenders'
import { installFetchMock } from '../setup/mockFetch'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const MANIFIESTO = lee('pleno-claims/index.json')
const CORPUS = MANIFIESTO.plenos.flatMap((p) => lee(p.chunkPath).items ?? [])

const CATEGORIAS = new Set(CATEGORIAS_DE_CONTRATO)

/** Las categorías que un snippet trae entre « · », sin contar el título. */
const categoriasDe = (snippet) =>
  snippetWithoutStatus(snippet)
    .split(' · ')
    .slice(1)
    .filter((trozo) => CATEGORIAS.has(trozo))

const conCategoria = (e) => e?.kind === 'tender' && categoriasDe(e.snippet).length > 0

/** Lo que cada superficie pinta de una declaración: todas sus filas, o las dos primeras. */
const filasDe = (it, tope = Infinity) => evidenciaSegunFuentes(it.verification).slice(0, tope)

const CON_EVIDENCIA = new Set(['verificado', 'parcial', 'contradicho'])

/** El registro: las publicadas tras la puerta, con alguna fila de contrato con categoría. */
const DEL_REGISTRO = gateForDisplay(CORPUS).filter((it) => filasDe(it).some(conCategoria))
/** /declaraciones: las que su filtro por defecto («con evidencia») enseña, y sólo dos filas. */
const DE_DECLARACIONES = CORPUS.filter(
  (it) => CON_EVIDENCIA.has(it.verification?.verdict) && filasDe(it, 2).some(conCategoria),
)

/** Una categoría cruda pintada en el texto: « · construction» seguido de otro trozo o del final. */
const crudas = (texto) => {
  const hallado = []
  for (const c of CATEGORIAS) {
    const re = new RegExp(`· ${c}(?= ·|$|\\n)`, 'm')
    if (re.test(texto)) hallado.push(c)
  }
  return hallado
}

/**
 * Lo pintado, pieza a pieza, sin pegar el snippet con el chip que le sigue: el texto
 * de cada elemento sin hijos elemento («[tender]» son tres nodos de texto en un
 * mismo `span`), y cada nodo de texto suelto junto a otros elementos (el snippet de
 * /declaraciones va así, entre la fuente y el puente de importe).
 */
const textos = (container) => {
  const out = []
  for (const el of container.querySelectorAll('*')) {
    if (el.children.length === 0) out.push(el.textContent.trim())
    else
      for (const n of el.childNodes)
        if (n.nodeType === Node.TEXT_NODE) out.push(n.textContent.trim())
  }
  return out.filter(Boolean)
}

const TENDERS = lee('tenders.json')

afterEach(() => localStorage.removeItem('cp:lang'))

describe('las filas servidas traen la categoría en crudo — si no, esta prueba no mide nada', () => {
  it('hay declaraciones publicadas con una categoría en el snippet de un contrato', () => {
    expect(DEL_REGISTRO.length).toBeGreaterThan(0)
    expect(DE_DECLARACIONES.length).toBeGreaterThan(0)
  })
})

describe.each(['es', 'ca'])(
  'registro de declaraciones (/plenos/:id, /departamentos) · %s',
  (idioma) => {
    it('pinta el rótulo de la categoría, nunca la palabra inglesa del registro', async () => {
      localStorage.setItem('cp:lang', idioma)
      // El puente de importe de cada fila lee tenders.json, como en producción.
      installFetchMock({ '/data/tenders.json': TENDERS })
      const { container } = render(
        <MemoryRouter>
          <LocaleProvider>
            <ClaimLedger items={DEL_REGISTRO} limit={DEL_REGISTRO.length + 5} />
          </LocaleProvider>
        </MemoryRouter>,
      )
      const filas = DEL_REGISTRO.flatMap((it) => filasDe(it)).filter(conCategoria)
      const pintados = textos(container)
      // Midió algo: cada categoría esperada sale por su rótulo en algún snippet.
      const rotulos = filas.flatMap((e) =>
        categoriasDe(e.snippet).map((c) => CATALOGUE[idioma][`contrato.categoria.${c}`]),
      )
      expect(rotulos.length).toBeGreaterThan(0)
      for (const r of rotulos) expect(r, 'una categoría sin rótulo').toBeTruthy()
      expect(pintados.filter((s) => crudas(s).length)).toEqual([])
      for (const e of filas) expect(pintados).not.toContain(snippetWithoutStatus(e.snippet))
      for (const r of new Set(rotulos))
        expect(pintados.some((s) => s.includes(` · ${r}`))).toBe(true)
    })
  },
)

describe.each(['es', 'ca'])('/declaraciones · %s', (idioma) => {
  it('pinta el rótulo de la categoría y el de la fuente de cada fila', async () => {
    localStorage.setItem('cp:lang', idioma)
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'p1', chunkPath: 'pleno-claims/p1.json' }],
        totals: { items: DE_DECLARACIONES.length, byVerdict: {} },
      },
      '/data/pleno-claims/p1.json': { items: DE_DECLARACIONES },
      '/data/plenos.json': { items: [] },
      '/data/officials.json': { composition: {}, officials: [] },
      '/data/tenders.json': TENDERS,
    })
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider>
          <Declaraciones />
        </LocaleProvider>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.getAllByText(`«${DE_DECLARACIONES[0].claim.verbatim}»`).length).toBeGreaterThan(
        0,
      ),
    )
    const filas = DE_DECLARACIONES.flatMap((it) => filasDe(it, 2)).filter(conCategoria)
    const pintados = textos(container)
    const rotulos = filas.flatMap((e) =>
      categoriasDe(e.snippet).map((c) => CATALOGUE[idioma][`contrato.categoria.${c}`]),
    )
    expect(rotulos.length).toBeGreaterThan(0)
    expect(pintados.filter((s) => crudas(s).length)).toEqual([])
    for (const e of filas) expect(pintados).not.toContain(snippetWithoutStatus(e.snippet))
    for (const r of new Set(rotulos)) expect(pintados.some((s) => s.includes(` · ${r}`))).toBe(true)
    // La fuente de la fila: «[tender]» era la clave del enum entre corchetes.
    expect(pintados.filter((s) => /^\[[a-z-]+\]$/.test(s))).toEqual([])
    expect(pintados).toContain(`[${CATALOGUE[idioma]['ledger.evidencia.tender']}]`)
  })
})
