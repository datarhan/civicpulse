/**
 * La tarjeta de /declaraciones, leída en valencià.
 *
 * El 12-10-2026 la #321 (rótulos de la categoría de contrato) dejó a la vista lo
 * que la tarjeta seguía pintando en un solo idioma o en crudo: el tema como clave
 * del enum («· other», «· medio-ambiente»), «sin atribuir», «evidencia(s)», la
 * píldora de tipo y la de veredicto en castellano, y quién cotejó la cita. Son
 * rótulos de la interfaz; el literal de la cita, no, y no se toca.
 *
 * Se pinta la PÁGINA con declaraciones SERVIDAS —una por tema, una sin grupo, una
 * con una sola fila de evidencia y otra con varias— y la prueba exige haber leído
 * cada tarjeta, o no mide nada. En castellano, lo que se movía al catálogo tiene
 * que salir igual que antes, byte a byte.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Declaraciones from '../../src/pages/Declaraciones'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { rotuloDeTipo } from '../../src/lib/claim-type-label.js'
import { etiquetaVerificador, evidenciaSegunFuentes } from '../../src/lib/claim-provenance.js'
import { ALLOWED_CLAIM_TOPICS } from '../../src/scraper/pleno-claim'
import { installFetchMock } from '../setup/mockFetch'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const MANIFIESTO = lee('pleno-claims/index.json')
const CORPUS = MANIFIESTO.plenos.flatMap((p) => lee(p.chunkPath).items ?? [])

const nEvidencias = (it) => evidenciaSegunFuentes(it.verification).length

/** Una declaración por tema servido, y las que faltan para cubrir cada pieza. */
const MUESTRA = (() => {
  const elegidas = new Map()
  const toma = (it) => it && elegidas.set(it.claim.id, it)
  for (const tema of ALLOWED_CLAIM_TOPICS) toma(CORPUS.find((it) => it.claim.topic === tema))
  toma(CORPUS.find((it) => !it.claim.speakerGroup))
  toma(CORPUS.find((it) => nEvidencias(it) === 1))
  toma(CORPUS.find((it) => nEvidencias(it) > 1))
  return [...elegidas.values()]
})()

const TEMAS = [...new Set(MUESTRA.map((it) => it.claim.topic))]
const traductor = (idioma) => (clave) => CATALOGUE[idioma][clave] ?? CATALOGUE.es[clave] ?? clave

/** El texto de cada elemento sin hijos elemento: una píldora, un chip, el tema. */
const hojas = (container) =>
  [...container.querySelectorAll('*')]
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent.trim())
    .filter(Boolean)

afterEach(() => localStorage.removeItem('cp:lang'))

async function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({
    '/data/pleno-claims/index.json': {
      plenos: [{ plenoId: 'p1', chunkPath: 'pleno-claims/p1.json' }],
      totals: { items: MUESTRA.length, byVerdict: {} },
    },
    '/data/pleno-claims/p1.json': { items: MUESTRA },
    '/data/plenos.json': { items: [] },
    '/data/officials.json': { composition: {}, officials: [] },
    '/data/tenders.json': lee('tenders.json'),
  })
  const utils = render(
    <MemoryRouter>
      <LocaleProvider>
        <Declaraciones />
      </LocaleProvider>
    </MemoryRouter>,
  )
  // «Todas»: el filtro por defecto esconde las «sin datos», y la muestra las trae.
  fireEvent.click(await screen.findByText(CATALOGUE[idioma]['declaraciones.filter.todas']))
  await waitFor(() =>
    expect(screen.getAllByText(/^«.*»$/).length).toBeGreaterThanOrEqual(MUESTRA.length),
  )
  return utils
}

describe('la muestra servida cubre cada pieza — si no, esta prueba no mide nada', () => {
  it('hay temas, una sin grupo, y evidencias en singular y en plural', () => {
    expect(TEMAS.length).toBeGreaterThan(5)
    expect(TEMAS).toContain('other')
    expect(MUESTRA.some((it) => !it.claim.speakerGroup)).toBe(true)
    expect(MUESTRA.some((it) => nEvidencias(it) === 1)).toBe(true)
    expect(MUESTRA.some((it) => nEvidencias(it) > 1)).toBe(true)
  })
})

describe('/declaraciones · ca', () => {
  it('pinta en valencià el tema, el grupo ausente, las evidencias, el tipo y el veredicto', async () => {
    const { container } = await pinta('ca')
    const t = traductor('ca')
    const piezas = hojas(container)
    const texto = container.textContent

    // Leyó cada tarjeta.
    for (const it of MUESTRA) expect(texto).toContain(`«${it.claim.verbatim}»`)

    // El tema, por su rótulo, en la tarjeta; ninguna clave cruda.
    for (const tema of TEMAS) {
      const rotulo = CATALOGUE.ca[`declaraciones.tema.${tema}`]
      expect(rotulo, `sin rótulo: ${tema}`).toBeTruthy()
      expect(piezas).toContain(`· ${rotulo}`)
    }
    const crudos = new Set(ALLOWED_CLAIM_TOPICS)
    expect(piezas.filter((s) => crudos.has(s.replace(/^· /, '')))).toEqual([])

    // Sin grupo.
    expect(piezas).toContain(CATALOGUE.ca['declaraciones.sinAtribuir'])
    expect(piezas).not.toContain(CATALOGUE.es['declaraciones.sinAtribuir'])

    // Las evidencias, en singular y en plural, con quién las cotejó.
    for (const it of MUESTRA.filter((x) => nEvidencias(x) > 0)) {
      const n = nEvidencias(it)
      const palabra = t(n === 1 ? 'declaraciones.evidencia.una' : 'declaraciones.evidencia.varias')
      expect(texto).toContain(`${n} ${palabra} · ${etiquetaVerificador(it.verification, t)}`)
    }
    expect(texto).not.toMatch(/\d evidencias? ·/)

    // El tipo y el veredicto, por su rótulo valenciano.
    for (const it of MUESTRA) {
      expect(piezas).toContain(rotuloDeTipo(it.claim, t).texto)
      expect(piezas).toContain(CATALOGUE.ca[`declaraciones.veredicto.${it.verification.verdict}`])
    }
    const soloCastellano = Object.keys(CATALOGUE.es)
      .filter((k) => /^declaraciones\.(tipo|veredicto)\./.test(k))
      .map((k) => CATALOGUE.es[k])
      .filter((es) => !Object.values(CATALOGUE.ca).includes(es))
    expect(soloCastellano.length).toBeGreaterThan(0)
    expect(piezas.filter((s) => soloCastellano.includes(s))).toEqual([])
  })
})

describe('/declaraciones · es', () => {
  it('lo movido al catálogo sale como antes; el tema, por su rótulo', async () => {
    const { container } = await pinta('es')
    const piezas = hojas(container)
    const texto = container.textContent

    for (const it of MUESTRA) expect(texto).toContain(`«${it.claim.verbatim}»`)
    expect(piezas).toContain('sin atribuir')
    expect(texto).toMatch(/\b1 evidencia · /)
    expect(texto).toMatch(/\b\d+ evidencias · /)
    for (const tema of TEMAS)
      expect(piezas).toContain(`· ${CATALOGUE.es[`declaraciones.tema.${tema}`]}`)
  })
})
