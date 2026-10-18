import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ContractCard } from '../src/components/tenders/ContractCard'
import ZoneDrilldown from '../src/components/Presupuesto/ZoneDrilldown'
import { PlacePopup } from '../src/components/LiveCity/popups/PlacePopup'
import { agrupaPorExpediente, infoLote } from '../src/lib/tender-lotes'
import { installFetchMock } from './setup/mockFetch'

/**
 * La tarjeta de contrato —el detalle de una zona en /presupuesto y el globo de
 * un pin del mapa de la portada— dice de qué es su cifra cuando la fila es un
 * lote.
 *
 * #364 lo arregló en el listado de /presupuesto («Accesorios · SATARA SEGURIDAD
 * SL · 46.020 €» enlazando al expediente 23/2020, cuya única cifra visible es
 * «187.000,00 Euros», el presupuesto base de los tres lotes). La tarjeta pinta
 * las mismas filas con el mismo `permalink` y seguía sin decirlo.
 *
 * Se leen las instantáneas publicadas, no una fixture: el defecto es lo que el
 * lector ve con ESTOS datos. Las tarjetas de los dos llamadores se eligen de
 * `tender-geo.json` —un lote que de verdad está situado—, porque las filas del
 * 23/2020 no lo están.
 */
const raiz = join(__dirname, '..', 'public/data')
const d = JSON.parse(readFileSync(join(raiz, 'tenders.json'), 'utf8'))
const geo = JSON.parse(readFileSync(join(raiz, 'tender-geo.json'), 'utf8'))
const ENLACE =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TS56A31zHFOmq21uxhbaVQ%3D%3D'

// Sobre TODOS los contratos, como hacen los llamadores: es lo que da a cada
// lote sus hermanas aunque la lista pintada sólo tenga uno.
const grupos = agrupaPorExpediente(d.contracts)
const porId = new Map(d.contracts.map((c) => [c.id, c]))

/** Un lote situado cuya licitación declara número, total y presupuesto base. */
function loteSituado(cumple) {
  const a = geo.assignments.find((x) => {
    const c = porId.get(x.id)
    const lote = c && infoLote(c, grupos, d.tenders)
    return lote?.numero && lote.total && lote.presupuestoBase && cumple(x)
  })
  return a ? { a, c: porId.get(a.id) } : null
}

// Cada render pinta UNA tarjeta, así que su texto es el del contenedor; el
// enlace con el título prueba que la tarjeta pintó.
function textoDe(titulo) {
  return screen.getByRole('link', { name: titulo }).ownerDocument.body.textContent
}

describe('ContractCard — un lote dice de qué es su cifra', () => {
  const hermanas = d.contracts.filter((c) => c.permalink === ENLACE)
  const accesorios = hermanas.find((c) => c.title === 'Accesorios')

  it('mide algo: el expediente 23/2020 sigue en la instantánea con sus tres lotes', () => {
    expect(hermanas.length, 'se fue el expediente 23/2020 de tenders.json').toBe(3)
    expect(accesorios?.finalAmountNoTaxes).toBe(46020)
    const lic = d.tenders.find((t) => t.permalink === ENLACE)
    expect(lic?.numberOfBatches).toBe(3)
    expect(lic?.initialAmountNoTaxes).toBe(187000)
  })

  it('la tarjeta «Accesorios» nombra su lote, el expediente y el presupuesto base del enlace', () => {
    render(<ContractCard contract={accesorios} grupos={grupos} tenders={d.tenders} />)
    const texto = textoDe('Accesorios')
    expect(texto).toContain('46.020')
    expect(texto).toContain('Lote 2 de 3 (23/2020)')
    expect(texto).toContain('187.000,00')
  })

  it('un contrato de lote único no lleva aviso', () => {
    const suelto = d.contracts.find(
      (c) => c.permalink && grupos.get(c.permalink)?.length === 1 && c.batchNumber === 1,
    )
    expect(suelto, 'no queda ningún contrato suelto con batch_number 1').toBeTruthy()
    render(<ContractCard contract={suelto} grupos={grupos} tenders={d.tenders} />)
    expect(document.querySelector('.cp-lote-nota')).toBeNull()
  })
})

describe('los llamadores de ContractCard le pasan los grupos', () => {
  it('el detalle de una zona en /presupuesto', () => {
    const w = loteSituado((a) => a.zones?.length > 0)
    expect(w, 'ningún lote situado en una zona en tender-geo.json').toBeTruthy()
    const zona = w.a.zones[0]
    installFetchMock({})
    render(
      <MemoryRouter>
        <ZoneDrilldown
          snapshot={{ zones: geo.zones, assignments: [w.a] }}
          zoneSlug={zona}
          contractsById={porId}
          grupos={grupos}
          tenders={d.tenders}
          danaOnly={false}
          onClear={() => {}}
        />
      </MemoryRouter>,
    )
    expect(textoDe(w.c.title)).toContain(`Lote ${w.c.batchNumber} de`)
  })

  it('el globo de un lugar en el mapa de la portada', () => {
    const w = loteSituado((a) => a.point && a.place?.sourceId)
    expect(w, 'ningún lote situado en un lugar en tender-geo.json').toBeTruthy()
    render(
      <PlacePopup
        place={w.a.place}
        assignments={[w.a]}
        contractsById={porId}
        grupos={grupos}
        tenders={d.tenders}
        danaOnly={false}
        obrasOnly={false}
        cpvDict={undefined}
      />,
    )
    expect(textoDe(w.c.title)).toContain(`Lote ${w.c.batchNumber} de`)
  })
})
