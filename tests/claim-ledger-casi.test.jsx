import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import Declaraciones from '../src/pages/Declaraciones'
import { gateForDisplay, sortSignalFirst } from '../src/lib/claim-ledger'
import { corpusReales, resumenSinRegistro } from '../src/scraper/claim-verdicts'
import { CATALOGUE } from '../src/i18n'

/**
 * Una fila CONTRATO no cuelga de una tarjeta que dice no haber consultado
 * contratos, y ninguna tarjeta habla de una cifra que su cita no trae.
 *
 * El verificador enseñaba «el expediente que se parece» también en citas SIN
 * cifra, sobre las que el camino del importe no corre y `tenders` no se anota
 * (tests/claim-verifier-casi-sin-cifra.test.ts). La tarjeta de /plenos/:id lo
 * pintaba así, medido el 30-09-2026 sobre los trozos servidos:
 *
 *     CONTRATO  El objeto del contrato es la elaboración y redacción del Plan
 *               de Movilidad Urbana Sostenible (PMUS) …
 *     «El objeto citado aparece en un expediente municipal, pero ninguna de sus
 *      magnitudes coincide con la cifra del claim. No es que no haya registro:
 *      es que el que hay no dice eso.»
 *     Fuentes comprobadas: ninguna
 *
 * bajo «la Comunidad Valenciana cuenta con una población superior de 5 millones
 * de personas». 61 tarjetas llevaban la frase; 47 sin cifra, 34 de ellas sobre
 * «ninguna» y 13 sobre «promises». /declaraciones enseñaba la misma fila como
 * «1 evidencia · sin verificador anotado» dentro del filtro «Sin corpus que
 * consultar».
 *
 * Esas 47 están publicadas con la frase y la fila guardadas, y seguirán así
 * hasta que se vuelva a verificar, que es una decisión editorial. Mientras,
 * la página las lee con la misma regla que el verificador nuevo: sin contratos
 * cotejados no hay expediente parecido que enseñar. Es una retirada —se deja de
 * PINTAR; el dato sigue en el trozo servido— y la explicación se re-deriva de lo
 * que consta como consultado, como ya hace #191 con el «no se encontró
 * registro».
 *
 * Se pinta cada trozo servido con el componente de verdad, como lo pinta la
 * pestaña de /plenos/:id: los ítems son los servidos, no una forma recortada.
 */

const TROZOS = join(__dirname, '..', 'public/data/pleno-claims')
const trozos = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')))

const ROTULO = 'Fuentes comprobadas:'
/** Procedencia desconocida: una pasada sustituyó la lista. No dice que no se mirara nada. */
const SIN_CONSTANCIA = 'no constan'
/** La etiqueta con la que la tarjeta rotula una fila de `kind: 'tender'`. */
const CONTRATO = 'CONTRATO'

const leyoContratos = (v) =>
  corpusReales(v?.checkedAgainst).some((c) => c === 'tenders' || c === 'tenders-ted')

/**
 * Una tarjeta, leída por partes, como en claim-ledger-explicacion-fuentes: la
 * cabecera con la cita, la explicación, las filas de evidencia si las hay, y
 * la línea de fuentes al final. La forma se comprueba en cada tarjeta.
 */
function leerTarjeta(card) {
  const partes = [...card.children]
  const [cabecera, explicacion] = partes
  const linea = partes.at(-1)
  const fuentes = [...linea.children].find((s) => s.textContent.startsWith(ROTULO))
  expect(cabecera.querySelector('blockquote'), 'la cabecera lleva la cita').not.toBeNull()
  expect(fuentes, 'la última parte es la línea de fuentes').toBeDefined()
  expect(partes.length === 3 || partes.length === 4, 'tres o cuatro partes').toBe(true)
  const bloque = partes.length === 4 ? partes[2] : null
  // Cada fila de evidencia empieza por su rótulo en versalitas.
  const kinds = bloque
    ? [...bloque.querySelectorAll('span.mono')]
        .filter((s) => /^[A-ZÁÉÍÓÚÑ ]+$/.test(s.textContent))
        .map((s) => s.textContent)
    : []
  return {
    cita: cabecera.querySelector('blockquote').textContent,
    explicacion: explicacion.textContent,
    kinds,
    fuentes: fuentes.textContent.slice(ROTULO.length).trim(),
  }
}

function pintarYLeer(items, limit) {
  // La tarjeta pide tenders.json para el puente de importes
  // (src/components/PuenteDeImporte.jsx). Aquí no se mide eso: un 404 lo calla
  // sin salir a la red. Dentro de cada pintado, porque la guarda de red
  // (tests/setup/no-network.ts) se reinstala antes de cada prueba.
  installFetchMock({})
  const { container, unmount } = render(
    <MemoryRouter>
      <ClaimLedger items={items} limit={limit} showSummary />
    </MemoryRouter>,
  )
  const tarjetas = [...container.querySelectorAll('.cp-card')].map(leerTarjeta)
  unmount()
  return tarjetas
}

let leidas = []

beforeAll(() => {
  leidas = trozos.flatMap((trozo) => {
    const filas = sortSignalFirst(gateForDisplay(trozo.items))
    const tarjetas = pintarYLeer(trozo.items, trozo.items.length)
    expect(tarjetas).toHaveLength(filas.length)
    return tarjetas.map((t, i) => {
      expect(t.cita).toBe(`«${filas[i].claim.verbatim}»`)
      return { ...t, fila: filas[i] }
    })
  })
}, 120_000)

const describir = (t) => `${t.fila.claim.id} [${t.fuentes}] ${t.explicacion.slice(0, 80)}`

/** Las filas del defecto, reconocidas en los DATOS por su forma. */
const esSinCotejo = (fila) =>
  fila.verification.verdict === 'sin-datos' &&
  fila.verification.evidence.some((e) => e.kind === 'tender') &&
  !leyoContratos(fila.verification)

/** Las del caso para el que nació el barrido: con cifra y con los contratos leídos. */
const esConCifra = (fila) =>
  fila.verification.verdict === 'sin-datos' &&
  fila.verification.evidence.some((e) => e.kind === 'tender') &&
  leyoContratos(fila.verification) &&
  fila.claim.entities.amountEuros != null &&
  /ninguna de sus magnitudes/.test(fila.verification.summary ?? '')

describe('lo servido: el caso existe, y se lee', () => {
  it('se pintaron tarjetas de las dos familias', () => {
    expect(leidas.filter((t) => esSinCotejo(t.fila)).length).toBeGreaterThan(0)
    expect(leidas.filter((t) => esConCifra(t.fila)).length).toBeGreaterThan(0)
    // Las líneas que el defecto dejaba sin contratos: las dos, medidas.
    expect(leidas.some((t) => esSinCotejo(t.fila) && t.fuentes === 'ninguna')).toBe(true)
    expect(leidas.some((t) => esSinCotejo(t.fila) && t.fuentes === 'promises')).toBe(true)
  })
})

describe('/plenos/:id: una fila CONTRATO va con los contratos anotados', () => {
  it('ninguna tarjeta enseña un contrato sobre una línea que no nombra contratos', () => {
    const malas = leidas
      .filter((t) => t.kinds.includes(CONTRATO))
      .filter((t) => t.fuentes !== SIN_CONSTANCIA && !/\btenders\b/.test(t.fuentes))
      .map(describir)
    expect(malas.slice(0, 5), `${malas.length} tarjetas`).toEqual([])
  })

  it('las que no cotejaron contratos dicen lo que dice su procedencia', () => {
    for (const t of leidas.filter((x) => esSinCotejo(x.fila))) {
      expect(t.kinds, t.fila.claim.id).not.toContain(CONTRATO)
      expect(t.explicacion, t.fila.claim.id).toBe(
        resumenSinRegistro(t.fila.verification.checkedAgainst),
      )
    }
  })

  it('ninguna tarjeta sin cifra habla de una cifra', () => {
    const malas = leidas
      .filter((t) => t.fila.claim.entities?.amountEuros == null)
      .filter((t) => /cifra (del claim|citada)|sus magnitudes/i.test(t.explicacion))
      .map(describir)
    expect(malas.slice(0, 5), `${malas.length} tarjetas`).toEqual([])
  })

  it('ninguna insinúa que el expediente desmiente a quien habla', () => {
    const malas = leidas.filter((t) => /no dice eso/i.test(t.explicacion)).map(describir)
    expect(malas.slice(0, 5), `${malas.length} tarjetas`).toEqual([])
  })

  it('con cifra, el expediente se sigue enseñando y la frase dice por qué no la sostiene', () => {
    for (const t of leidas.filter((x) => esConCifra(x.fila))) {
      expect(t.kinds, t.fila.claim.id).toContain(CONTRATO)
      expect(t.explicacion, t.fila.claim.id).toMatch(/no coincide con la cifra citada/)
      expect(t.explicacion, t.fila.claim.id).toMatch(/no es un desmentido/)
    }
  })
})

describe('/declaraciones: la misma cita, sin la fila', () => {
  function monta(trozo) {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [
          {
            plenoId: trozo.plenoId,
            plenoDate: trozo.plenoDate,
            chunkPath: `pleno-claims/${trozo.plenoId}.json`,
          },
        ],
        totals: { items: trozo.items.length },
      },
      [`/data/pleno-claims/${trozo.plenoId}.json`]: trozo,
      '/data/plenos.json': { items: [] },
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
  }

  /** La tarjeta de /declaraciones que lleva este literal, tras filtrar por él. */
  async function tarjetaDe(fila) {
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp('^' + CATALOGUE.es['declaraciones.filter.todas']),
      }),
    )
    fireEvent.change(
      screen.getByPlaceholderText(CATALOGUE.es['declaraciones.search.placeholder']),
      {
        target: { value: fila.claim.verbatim },
      },
    )
    const literal = await screen.findByText(`«${fila.claim.verbatim}»`)
    return literal.closest('.cp-card')
  }

  it('una cita sin contratos cotejados no enseña «1 evidencia» ni la fila [tender]', async () => {
    const trozo = trozos.find((t) => t.items.some(esSinCotejo))
    const fila = trozo.items.find(esSinCotejo)
    monta(trozo)
    const card = await tarjetaDe(fila)
    expect(card).not.toBeNull()
    expect(within(card).queryByText(/\[tender\]/)).toBeNull()
    expect(card.textContent).not.toMatch(/\d+ evidencias? ·/)
  })

  it('el control: una cita con cifra y contratos cotejados sí la enseña', async () => {
    const trozo = trozos.find((t) => t.items.some(esConCifra))
    const fila = trozo.items.find(esConCifra)
    monta(trozo)
    const card = await tarjetaDe(fila)
    expect(card).not.toBeNull()
    expect(within(card).getByText(/\[tender\]/)).toBeDefined()
  })
})
