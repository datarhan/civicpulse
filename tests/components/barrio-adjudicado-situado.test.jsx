/**
 * La ficha del barrio de la portada rotula lo adjudicado, no «inversión».
 *
 * Decía «Inversión situada» / «Inversió situada» sobre la suma de los contratos
 * cuyo título nombra el barrio, sea obra, servicio o suministro: la zona de
 * `tender-geo.json` no distingue tipos al sumar. Medido el 17-10-2026 en el fichero
 * publicado: casi la mitad de los contratos situados por barrio eran servicios o
 * suministros, en tres de cada cuatro barrios con contratos, y en uno el único
 * contrato era un suministro. Un servicio de mantenimiento no es una inversión; el
 * importe sí es, siempre, el de adjudicación sin IVA, que es lo que /quejas ya
 * rotula «Adjudicado situado» con los mismos euros (`quejas.cruce.col.adjudicado`).
 *
 * La prueba recorre el camino real: dos contratos (un servicio y un suministro)
 * pasan por `matchContractsToZones`, la zona por `aggregateNeighborhood`, y la
 * ficha se pinta en los dos idiomas. Ninguna obra: si el rótulo vuelve a hablar de
 * inversión, lo dice de un barrio que no tiene ninguna.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { LocaleProvider } from '../../src/i18n'
import { matchContractsToZones } from '../../src/scraper/tender-geo'
import { aggregateNeighborhood } from '../../src/lib/neighborhood-aggregate'
import { NeighborhoodPopup } from '../../src/components/LiveCity/popups/NeighborhoodPopup'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const LA_REVA = {
  slug: 'urbanitzacio-la-reva',
  name: 'Urbanització La Reva',
  centroid: /** @type {[number, number]} */ ([39.484, -0.572]),
}
const CONTRATOS = [
  {
    id: 'c1',
    title: 'Servicio de mantenimiento de zonas verdes en la Urbanización La Reva',
    status: 'awarded',
    finalAmount: 20000,
    awardDate: '2024-05-01',
    contractType: 'services',
    categoryTitle: 'services',
  },
  {
    id: 'c2',
    title: 'Suministro de mobiliario urbano para la Urbanización La Reva',
    status: 'awarded',
    finalAmount: 10000,
    awardDate: '2024-06-01',
    contractType: 'supplies',
    categoryTitle: 'supplies',
  },
]
const snap = matchContractsToZones(CONTRATOS, [LA_REVA], {
  generatedAt: '2026-10-17T00:00:00.000Z',
  tendersGeneratedAt: 't',
  geoGeneratedAt: 'g',
})
const agg = aggregateNeighborhood({
  neighborhood: { ...LA_REVA, population: 1200 },
  zones: snap.zones,
})

const pinta = (idioma) => {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <LocaleProvider>
      <NeighborhoodPopup agg={agg} />
    </LocaleProvider>,
  ).container.textContent
}

describe('la ficha del barrio rotula lo adjudicado, no inversión', () => {
  it('el barrio de la prueba suma un servicio y un suministro, y ninguna obra', () => {
    // Sin esto, un cambio del emparejador que dejara la zona vacía pintaría la
    // rama «sin contratos» y la prueba pasaría sin haber leído el rótulo.
    const tipos = snap.assignments
      .filter((a) => a.zones.includes(LA_REVA.slug))
      .map((a) => a.contractType)
    expect(tipos.sort()).toEqual(['services', 'supplies'])
    expect(agg.contractCount).toBe(2)
    expect(agg.amount).toBe(30000)
  })

  it('en castellano', () => {
    const t = pinta('es')
    expect(t).toContain('Adjudicado situado')
    expect(t).not.toMatch(/inversi[oó]n/i)
  })

  it('en valencià', () => {
    const t = pinta('ca')
    expect(t).toContain('Adjudicat situat')
    expect(t).not.toMatch(/inversi[oó]/i)
  })
})
