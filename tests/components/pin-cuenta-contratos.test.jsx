/**
 * Las chinchetas de la portada y la ficha del barrio cuentan contratos, no «obras».
 *
 * La capa de dinero sitúa todo contrato cuyo título nombra un lugar, sea obra,
 * servicio o suministro; el filtro «Solo obras» nace apagado. Aun así, el rótulo de
 * la chincheta, su ficha y la del barrio decían «3 obras». Medido el 17-10-2026 en
 * tender-geo.json: de las asignaciones con chincheta, una de cada tres no era obra,
 * y una de cada cinco chinchetas no tenía ninguna. /presupuesto arregló lo mismo el
 * 17-09-2026 (tests/components/zona-cuenta-contratos.test.jsx); esta es la portada.
 *
 * Aquí el lugar y el barrio sólo tienen un servicio y un suministro: ninguna obra.
 * Si el recuento vuelve a llamarse «obras», lo dice de un sitio que no tiene ninguna.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import { LocaleProvider } from '../../src/i18n'
import { PinDineroTooltip } from '../../src/components/LiveCity/popups/Tooltips'
import { PlacePopup } from '../../src/components/LiveCity/popups/PlacePopup'
import { NeighborhoodPopup } from '../../src/components/LiveCity/popups/NeighborhoodPopup'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const LUGAR = { sourceId: 'carrer-tabalet', name: 'Carrer Tabalet', kind: 'street' }
const ASIGNACIONES = [
  {
    id: 'c1',
    place: { sourceId: LUGAR.sourceId },
    point: [39.5, -0.5],
    amount: 20000,
    amountKind: 'final',
    date: '2024-05-01',
    contractType: 'services',
    dana: false,
  },
  {
    id: 'c2',
    place: { sourceId: LUGAR.sourceId },
    point: [39.5, -0.5],
    amount: 10000,
    amountKind: 'final',
    date: '2024-06-01',
    contractType: 'supplies',
    dana: false,
  },
]
const CONTRATOS = new Map(
  ASIGNACIONES.map((a) => [
    a.id,
    {
      id: a.id,
      title: `Contrato ${a.id}`,
      permalink: `https://contrataciondelestado.es/${a.id}`,
      contractType: a.contractType,
      status: 'awarded',
    },
  ]),
)
const barrio = (contractCount) => ({
  name: 'La Reva',
  population: 1200,
  contractCount,
  amount: contractCount ? 30000 : 0,
  danaAmount: 0,
  quejas: { total: 0 },
  health: { level: 'sin-datos' },
})

// textContent pega cada nodo al siguiente («2 contratosCalle»), así que el
// recuento no se cierra con `\b`.
const pinta = (idioma, nodo) => {
  localStorage.setItem('cp:lang', idioma)
  return render(<LocaleProvider>{nodo}</LocaleProvider>).container.textContent
}

const SUPERFICIES = [
  [
    'el rótulo de la chincheta',
    () => <PinDineroTooltip lugar={{ ...LUGAR, amount: 30000, count: 2 }} />,
  ],
  [
    'la ficha del lugar',
    () => (
      <PlacePopup
        place={LUGAR}
        assignments={ASIGNACIONES}
        contractsById={CONTRATOS}
        danaOnly={false}
        obrasOnly={false}
        cpvDict={undefined}
      />
    ),
  ],
  ['la ficha del barrio', () => <NeighborhoodPopup agg={barrio(2)} />],
]

describe('lo situado en la portada se cuenta en contratos', () => {
  it.each(SUPERFICIES)('%s, en castellano', (_, nodo) => {
    const t = pinta('es', nodo())
    expect(t).toMatch(/\b2\s+contratos/)
    expect(t).not.toMatch(/\bobras?\b/i)
  })
  it.each(SUPERFICIES)('%s, en valencià', (_, nodo) => {
    const t = pinta('ca', nodo())
    expect(t).toMatch(/\b2\s+contractes/)
    expect(t).not.toMatch(/\bobres?\b/i)
  })
  it('una chincheta con un solo contrato lo dice en singular', () => {
    const lugar = { ...LUGAR, amount: 20000, count: 1 }
    expect(pinta('es', <PinDineroTooltip lugar={lugar} />)).toMatch(/\b1\s+contrato(?!s)/)
    cleanup()
    expect(pinta('ca', <PinDineroTooltip lugar={lugar} />)).toMatch(/\b1\s+contracte(?!s)/)
  })
  it('un barrio sin nada situado no dice «sin obras»: no tiene ningún contrato', () => {
    expect(pinta('es', <NeighborhoodPopup agg={barrio(0)} />)).not.toMatch(/\bobras?\b/i)
    cleanup()
    expect(pinta('ca', <NeighborhoodPopup agg={barrio(0)} />)).not.toMatch(/\bobres?\b/i)
  })
})
