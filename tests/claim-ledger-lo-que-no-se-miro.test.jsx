import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import { gateForDisplay, sortSignalFirst } from '../src/lib/claim-ledger'
import { callaElPresupuesto, corpusReales } from '../src/scraper/claim-verdicts'
import { cifraEnElLiteral } from '../src/scraper/cifra-en-literal'

/**
 * La tarjeta de una declaración no se lee como «nada la sostiene» cuando lo que
 * la sostendría no se miró, ni pinta como de la cita una cifra que la cita no
 * dice.
 *
 * Dos señalamientos de la revisión lectora del 27-10-2026, en tarjetas servidas:
 *
 *   · /plenos/1sqj7is: «en un presupuesto de cuarenta y pico millones», bajo
 *     «No se encontró registro en contratos, contratos anunciados en TED y
 *     subvenciones (BDNS) que la sostenga». Cada palabra es cierta, y el lector
 *     concluye que nada la sostiene, cuando el presupuesto de 2025 abre con un
 *     crédito inicial de gasto de 41.578.252,26 € y el presupuesto no se coteja
 *     (#445 quitó el bloque que decía hacerlo). La tarjeta dice ahora que en el
 *     presupuesto no se buscó (claim-verdicts.ts, `callaElPresupuesto`).
 *   · /plenos/k4olcs: «sistema de debate, captura y grabación de vídeo…», sin
 *     cifra, con «81 K €» en la cabecera: los 80.666 € de la frase siguiente,
 *     que el extractor le anotó (src/scraper/cifra-en-literal.ts).
 *
 * Se pinta cada trozo servido con el componente de verdad, como lo pinta la
 * pestaña de /plenos/:id.
 */

const TROZOS = join(__dirname, '..', 'public/data/pleno-claims')
const trozo = (id) => JSON.parse(readFileSync(join(TROZOS, `${id}.json`), 'utf8'))
const trozos = readdirSync(TROZOS)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => JSON.parse(readFileSync(join(TROZOS, f), 'utf8')))

const AVISO = 'En el presupuesto municipal no se buscó.'

/** Pinta los ítems como la pestaña y devuelve cada tarjeta: su cita, su cabecera y su texto. */
function pintar(items) {
  installFetchMock({})
  const { container, unmount } = render(
    <MemoryRouter>
      <ClaimLedger items={items} limit={items.length} />
    </MemoryRouter>,
  )
  const tarjetas = [...container.querySelectorAll('.cp-card')].map((card) => ({
    cita: card.querySelector('blockquote')?.textContent ?? '',
    cabecera: card.querySelector('.cp-ledger-head')?.textContent ?? '',
    texto: card.textContent,
  }))
  unmount()
  return tarjetas
}

const deLaCita = (tarjetas, verbatim) => {
  const t = tarjetas.find((x) => x.cita === `«${verbatim}»`)
  expect(t, verbatim).toBeDefined()
  return t
}

describe('/plenos/1sqj7is: «cuarenta y pico millones»', () => {
  const item = trozo('1sqj7is').items.find((it) => it.claim.id === '1sqj7is-028-afi-4ee50f')

  it('la premisa: se sirve sin-datos, cotejada con contratos, TED y BDNS, no con el presupuesto', () => {
    expect(item).toBeDefined()
    expect(item.verification.verdict).toBe('sin-datos')
    expect(corpusReales(item.verification.checkedAgainst)).toEqual([
      'tenders',
      'tenders-ted',
      'bdns',
    ])
  })

  it('su tarjeta nombra lo que se miró y dice que en el presupuesto no se buscó', () => {
    const [t] = pintar([item])
    // Lo positivo primero: lo que se miró sigue dicho, con sus nombres.
    expect(t.texto).toContain(
      'No se encontró registro en contratos, contratos anunciados en TED y subvenciones (BDNS) que la sostenga.',
    )
    expect(t.texto).toContain(AVISO)
  })
})

describe('todas las tarjetas servidas', () => {
  /** Cada ítem visible con su tarjeta pintada, emparejados por la cita. */
  let leidas = []
  beforeAll(() => {
    // Emparejadas por el orden de la página, no por la cita: hay citas
    // repetidas con verificaciones distintas. Si no casan, no se sabe qué se lee.
    leidas = trozos.flatMap((tr) => {
      const filas = sortSignalFirst(gateForDisplay(tr.items))
      const tarjetas = pintar(tr.items)
      expect(tarjetas).toHaveLength(filas.length)
      return tarjetas.map((t, i) => {
        expect(t.cita).toBe(`«${filas[i].claim.verbatim}»`)
        return { ...t, item: filas[i] }
      })
    })
    // Pintar los casi cinco mil de lo servido pasa del plazo por defecto de un gancho.
  }, 120_000)

  it('la que dice «no se encontró registro» en el dinero sobre el presupuesto, dice también que no se buscó en él', () => {
    const deberian = leidas.filter(
      (t) =>
        t.item?.verification.verdict === 'sin-datos' &&
        /No se encontró registro en /.test(t.texto) &&
        callaElPresupuesto(corpusReales(t.item.verification.checkedAgainst), t.item.claim.verbatim),
    )
    // Que mida algo: decenas, las del debate de presupuestos y la liquidación.
    expect(deberian.length).toBeGreaterThan(20)
    const sinAviso = deberian.filter((t) => !t.texto.includes(AVISO)).map((t) => t.item.claim.id)
    expect(sinAviso).toEqual([])
  })

  it('y ninguna lo dice sin hablar del presupuesto, ni sobre «ninguna» o «no constan»', () => {
    const conAviso = leidas.filter((t) => t.texto.includes(AVISO))
    expect(conAviso.length).toBeGreaterThan(0)
    const deMas = conAviso
      .filter(
        (t) =>
          !callaElPresupuesto(
            corpusReales(t.item?.verification.checkedAgainst),
            t.item?.claim.verbatim,
          ),
      )
      .map((t) => t.item?.claim.id)
    expect(deMas).toEqual([])
  })

  it('la cabecera sólo pinta la cifra que la cita dice', () => {
    const k4 = deLaCita(
      leidas,
      'sistema de debate, captura y grabación de vídeo y control del salón de plenos municipales.',
    )
    expect(k4.cabecera).not.toMatch(/€/)
    // El control, en la misma sesión: la frase que sí la dice la pinta.
    const conCifra = deLaCita(leidas, 'por importe de 80.666 euros')
    expect(conCifra.cabecera).toMatch(/81 K €/)
    // Y en todas: con € en la cabecera, la cifra está en el literal.
    const malas = leidas
      .filter((t) => t.item && /€/.test(t.cabecera))
      .filter((t) => !cifraEnElLiteral(t.item.claim.verbatim, t.item.claim.entities.amountEuros))
      .map((t) => t.item.claim.id)
    expect(malas).toEqual([])
  })
})
