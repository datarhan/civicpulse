import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { installFetchMock } from './setup/mockFetch'
import { ClaimLedger } from '../src/components/ClaimLedger'
import Declaraciones from '../src/pages/Declaraciones'
import { CATALOGUE } from '../src/i18n'

/**
 * Dos cifras ciertas en la misma tarjeta, y el puente que las cuadra.
 *
 * /plenos/k4olcs, «Declaraciones contrastadas»: la cita k4olcs-019-cit-b9b013
 * («sistema de debate, captura y grabación de vídeo y control del salón de
 * plenos») lleva «81 K €» en la cabecera y «Verificado», y su única fila
 * CONTRATO acaba en «70.158 €». `review:surfaces` lo señaló. Las dos cifras son
 * ciertas, y salen de campos distintos:
 *
 *   · 80.666 € es lo que dijo quien habló, y en `tenders.json` es el
 *     `finalAmount` —adjudicación CON IVA— de la fila de `contracts` del
 *     expediente;
 *   · 70.158 € es lo que el emparejador COMPARÓ: `tenderAmount` de la fila de
 *     `tenders` del mismo expediente —la licitación—, cuyo primer importe es el
 *     `initialAmountNoTaxes`, el presupuesto base SIN IVA.
 *
 * O sea que la fila no imprime otro campo que el que se comparó —medido el
 * 30-09-2026: de las 19 filas CONTRATO servidas bajo una cita con cifra,
 * ninguna—; lo que falta es el puente. Sólo esta tiene hoy, en otra magnitud
 * del mismo expediente, la cifra citada.
 *
 * El puente se publica DERIVADO y CONDICIONAL (skill revisar-superficies,
 * «Cuando las dos cifras son CIERTAS»): se calcula en la página desde el
 * `tenders.json` servido, sale sólo cuando lo impreso no es la cifra y otra
 * magnitud del expediente sí lo es, y desaparece solo el día que eso deje de
 * pasar. La premisa se mide aquí: hoy las dos cifras no cuadran solas.
 */

const DATA = join(__dirname, '..', 'public/data')
const leer = (p) => JSON.parse(readFileSync(join(DATA, p), 'utf8'))
const TENDERS = leer('tenders.json')
const TED = leer('tenders-ted.json')

const trozos = readdirSync(join(DATA, 'pleno-claims'))
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => leer(join('pleno-claims', f)))

const ID = 'k4olcs-019-cit-b9b013'
const trozoK4 = trozos.find((t) => t.plenoId === 'k4olcs')
const fila = trozoK4?.items.find((it) => it.claim.id === ID)

/** El importe que la fila imprime: el último «N €» de su texto, en euros enteros. */
function impreso(snippet) {
  const m = [...String(snippet ?? '').matchAll(/(?<![\d.,])(\d+(?:\.\d{3})*) €/g)]
  return m.length > 0 ? Number(m.at(-1)[1].replace(/\./g, '')) : null
}

/**
 * Las cifras de dinero de un expediente, para el oráculo: toda clave de sus
 * filas que diga importe o valor. Un patrón y no la lista del módulo, para que
 * la prueba no repita lo que comprueba.
 */
function importesDelExpediente(ref, datos = TENDERS) {
  return [...(datos.contracts ?? []), ...(datos.tenders ?? [])]
    .filter((r) => r.permalink && r.permalink === ref)
    .flatMap((r) =>
      Object.entries(r)
        .filter(([k, v]) => /amount|value/i.test(k) && typeof v === 'number' && v > 0)
        .map(([campo, valor]) => ({ campo, valor })),
    )
}

/** ¿Tiene esta fila puente? Lo impreso no es la cifra, y otra magnitud sí. */
function oraculo(cifra, e) {
  const imp = impreso(e.snippet)
  if (e.kind !== 'tender' || typeof cifra !== 'number' || imp == null) return null
  if (Math.abs(imp - cifra) < 1) return null
  return importesDelExpediente(e.ref).find((x) => Math.abs(x.valor - cifra) < 1) ?? null
}

/**
 * Con espacio de no separación ante el «€»: en una línea de 68 caracteres la
 * cifra se quedaba al final de una y su unidad al principio de la siguiente.
 */
const NBSP = '\u00a0'
const euros2 = (v) =>
  `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`

/** Deja que el `tenders.json` servido llegue a los componentes que lo pidieron. */
async function reposa() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
}

async function pintar(items, tenders = TENDERS) {
  const fetchFn = installFetchMock({ '/data/tenders.json': tenders, '/data/tenders-ted.json': TED })
  const r = render(
    <MemoryRouter>
      <ClaimLedger items={items} limit={items.length} showSummary />
    </MemoryRouter>,
  )
  await reposa()
  return { ...r, fetchFn }
}

const tarjetaDe = (container, it) =>
  [...container.querySelectorAll('.cp-card')].find(
    (c) => c.querySelector('blockquote')?.textContent === `«${it.claim.verbatim}»`,
  )
const puentes = (card) => [...card.querySelectorAll('[data-puente-importe]')]
const pidio = (fetchFn, ruta) =>
  fetchFn.mock.calls.some(([u]) => String(u).replace(/^https?:\/\/[^/]+/, '') === ruta)

describe('la premisa, medida sobre lo servido', () => {
  it('la fila imprime 70.158 €, la cita dice 80.666 €, y el expediente trae los 80.666,66 €', () => {
    expect(fila, `no se sirve ${ID}`).toBeDefined()
    const cifra = fila.claim.entities.amountEuros
    const contratos = fila.verification.evidence.filter((e) => e.kind === 'tender')
    expect(contratos).toHaveLength(1)
    expect(fila.verification.verdict).toBe('verificado')
    // Solas no cuadran: sin esto, la guarda de abajo pasaría el día que la
    // fila imprima la cifra sin haber comprobado nada.
    expect(Math.abs(impreso(contratos[0].snippet) - cifra)).toBeGreaterThanOrEqual(1)
    // Y hay puente en los datos: otra magnitud del mismo expediente es la cifra.
    const iguales = importesDelExpediente(contratos[0].ref).filter(
      (x) => Math.abs(x.valor - cifra) < 1,
    )
    expect(iguales.map((x) => x.campo)).toContain('finalAmount')
  })
})

describe('/plenos/k4olcs: la tarjeta dice qué es cada cifra', () => {
  it('pinta el puente bajo la fila CONTRATO', async () => {
    const { container } = await pintar([fila])
    const card = tarjetaDe(container, fila)
    expect(card).toBeDefined()
    const [puente, ...otros] = puentes(card)
    expect(puente, 'la tarjeta no pinta puente').toBeDefined()
    expect(otros).toEqual([])
    expect(puente?.textContent).toContain(
      `70.158${NBSP}€ es el presupuesto base de licitación, sin IVA`,
    )
    expect(puente?.textContent).toContain(`${euros2(80666.66)} con IVA`)
    expect(puente?.textContent).toContain(`la cifra citada (80.666${NBSP}€)`)
    // Ninguna cifra del puente se separa de su unidad.
    expect(puente?.textContent).not.toMatch(/\d €/)
  })

  it('condicional: si el expediente deja de traer la cifra, el puente desaparece', async () => {
    const ref = fila.verification.evidence.find((e) => e.kind === 'tender').ref
    const otra = (r) => (r.permalink === ref ? { ...r, finalAmount: 90_000 } : r)
    const sinCifra = {
      ...TENDERS,
      contracts: TENDERS.contracts.map(otra),
      tenders: TENDERS.tenders.map(otra),
    }
    const { container, fetchFn } = await pintar([fila], sinCifra)
    // Lo positivo primero: la página sí pidió los contratos, y aun así calla.
    expect(pidio(fetchFn, '/data/tenders.json')).toBe(true)
    expect(puentes(tarjetaDe(container, fila))).toEqual([])
  })

  it('condicional: si la fila ya imprime la cifra, ni puente ni descarga', async () => {
    const snippet = fila.verification.evidence.find((e) => e.kind === 'tender').snippet
    const igual = {
      ...fila,
      claim: {
        ...fila.claim,
        entities: { ...fila.claim.entities, amountEuros: impreso(snippet) },
      },
    }
    const { container, fetchFn } = await pintar([igual])
    expect(puentes(tarjetaDe(container, igual))).toEqual([])
    // Sin dos cifras que cuadrar no hay nada que buscar: 1,4 MB que no se piden.
    expect(pidio(fetchFn, '/data/tenders.json')).toBe(false)
  })
})

describe('lo servido: el puente sale donde hay puente, y sólo ahí', () => {
  it('cada fila CONTRATO bajo una cita con cifra lleva puente si y sólo si el expediente trae la cifra', async () => {
    const items = trozos.flatMap((t) =>
      t.items.filter(
        (it) =>
          it.claim.entities?.amountEuros != null &&
          it.verification.evidence.some((e) => e.kind === 'tender'),
      ),
    )
    // Mide algo, y el caso que originó esto está dentro.
    expect(items.length).toBeGreaterThan(1)
    expect(items.some((it) => it.claim.id === ID)).toBe(true)
    const { container } = await pintar(items)
    const malas = []
    let conPuente = 0
    for (const it of items) {
      const card = tarjetaDe(container, it)
      expect(card, it.claim.id).toBeDefined()
      const esperados = it.verification.evidence
        .map((e) => oraculo(it.claim.entities.amountEuros, e))
        .filter(Boolean)
      const pintados = puentes(card).map((p) => p.textContent)
      conPuente += esperados.length
      if (pintados.length !== esperados.length) {
        malas.push(`${it.claim.id}: ${esperados.length} esperados, ${pintados.length} pintados`)
        continue
      }
      esperados.forEach((x, i) => {
        if (!pintados[i].includes(euros2(x.valor)))
          malas.push(`${it.claim.id}: no dice ${euros2(x.valor)}`)
      })
    }
    expect(conPuente).toBeGreaterThan(0)
    expect(malas, `${malas.length} tarjetas`).toEqual([])
  })
})

describe('/declaraciones: la misma cita, con el mismo puente', () => {
  it('pinta el puente bajo su fila [tender]', async () => {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [
          {
            plenoId: trozoK4.plenoId,
            plenoDate: trozoK4.plenoDate,
            chunkPath: 'pleno-claims/k4olcs.json',
          },
        ],
        totals: { items: trozoK4.items.length },
      },
      '/data/pleno-claims/k4olcs.json': trozoK4,
      '/data/plenos.json': { items: [] },
      '/data/tenders.json': TENDERS,
      '/data/tenders-ted.json': TED,
    })
    render(
      <MemoryRouter>
        <Declaraciones />
      </MemoryRouter>,
    )
    fireEvent.change(
      await screen.findByPlaceholderText(CATALOGUE.es['declaraciones.search.placeholder']),
      { target: { value: fila.claim.verbatim } },
    )
    const card = (await screen.findByText(`«${fila.claim.verbatim}»`)).closest('.cp-card')
    await reposa()
    const [puente] = puentes(card)
    expect(puente, 'la tarjeta de /declaraciones no pinta puente').toBeDefined()
    expect(puente?.textContent).toContain(`${euros2(80666.66)} con IVA`)
    expect(puente?.textContent).toContain(`la cifra citada (80.666${NBSP}€)`)
  })
})
