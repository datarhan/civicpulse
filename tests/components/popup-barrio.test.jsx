import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { NeighborhoodPopup } from '../../src/components/LiveCity/popups/NeighborhoodPopup'
import { aggregateNeighborhood } from '../../src/lib/neighborhood-aggregate'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'

/**
 * La tarjeta que se abre al pinchar un barrio en el mapa de la portada.
 *
 * Contaba ✓ resueltas · ⏳ pendientes · ⚠ silencios aunque ninguna queja del
 * barrio hubiera llegado al registro del ayuntamiento, que es desde donde corre
 * el plazo de la LPACAP. Con la única queja publicada —capturada, sin registrar—
 * la tarjeta decía «1 · ✓0 ⏳1»: una deuda que el ayuntamiento no tiene, y un
 * «⚠ ninguno» implícito que nadie se ha ganado. Es el mismo defecto que se
 * arregló por cargo en `SlaPanel`, vivo todavía por barrio.
 *
 * Los tres casos comparten barrio; lo único que cambia es si la queja tiene fecha
 * de registro. El primero es el defecto, los otros dos su control.
 *
 * Esta tarjeta no tenía NINGUNA prueba de unidad —ninguna de las seis superficies
 * de barrio la tenía—, y así es como un error de sintaxis en este mismo fichero
 * pasó por delante de 6.209 pruebas en verde mientras escribía este arreglo. Lo
 * cazó la build. El e2e sí abre la tarjeta, pero sólo comprueba que aparezca
 * «Población»: del recuento de quejas no dice nada.
 */

const BARRIO = { slug: 'la-reva', name: 'La Reva', centroid: [39.5, -0.5], population: 1200 }
const REGISTRADA = '2026-07-10T09:00:00.000Z'

const queja = (over = {}) => ({
  service_request_id: 'Q-1',
  status: 'capturada',
  address_string: 'la-reva',
  registered_at: null,
  ...over,
})

/** La tarjeta se monta con el mismo `agg` que le pasa `NeighborhoodsLayer`. */
function monta(items) {
  const instantanea = { stats: { total: items.length }, items }
  const agg = aggregateNeighborhood({ neighborhood: BARRIO, zones: [], instantanea })
  render(
    <LocaleProvider>
      <NeighborhoodPopup agg={agg} />
    </LocaleProvider>,
  )
  return agg
}

/** Todo el texto de la tarjeta, para poder afirmar sobre lo que NO está. */
const textoTarjeta = () =>
  screen.getByText(/Quejas ciudadanas/i).closest('div').parentElement.textContent

describe('la tarjeta de barrio cuenta las respuestas desde el registro', () => {
  it('EL DEFECTO: sin ninguna queja registrada no publica ✓ ⏳ ⚠, y dice por qué', () => {
    const agg = monta([queja()])
    expect(agg.quejas.medible, 'el agregado tiene que declararlo no medible').toBe(false)
    expect(agg.quejas.motivo).toBe('sinRegistro')

    // El total sí: cuántas quejas pusieron los vecinos es un hecho del canal.
    expect(screen.getByText(/Quejas ciudadanas/i)).toBeInTheDocument()
    expect(textoTarjeta()).toContain('1')

    // Y el motivo, con el texto del catálogo en vez de uno escrito aquí.
    expect(textoTarjeta()).toContain(CATALOGUE.es['quejas.reloj.sinRegistro.corto'])

    // Lo que importa: ninguna de las tres cifras. Se comprueba por la FORMA
    // «símbolo + dígito» —igual que cargos.spec.ts— para que no puedan volver
    // por otro camino que el literal que este arreglo quitó.
    expect(textoTarjeta()).not.toMatch(/[✓⏳⚠]\s*\d/)

    // Y sin cifras tampoco se pinta la pastilla de salud: etiquetar el barrio
    // «en curso» es la misma afirmación por otra vía.
    expect(
      screen.queryByText(/en curso|silencio alto|silencio moderado|mayoría resueltas/i),
    ).toBeNull()
  })

  it('CONTROL: con una queja del barrio registrada, las tres cifras salen', () => {
    const agg = monta([
      queja({ registered_at: REGISTRADA, status: 'resuelta' }),
      queja({ service_request_id: 'Q-2', registered_at: REGISTRADA, status: 'silencio_negativo' }),
    ])
    expect(agg.quejas.medible).toBe(true)
    const texto = textoTarjeta()
    expect(texto).toMatch(/✓\s*1/)
    expect(texto).toMatch(/⚠\s*1/)
    // 1 de 2 en silencio = 50 % → la pastilla sí aparece, y con su tono.
    expect(screen.getByText(/silencio alto/i)).toBeInTheDocument()
  })

  it('CONTROL: un barrio sin quejas no dice «registradas» ni inventa un motivo', () => {
    const agg = monta([queja({ address_string: 'otro-barrio', registered_at: REGISTRADA })])
    expect(agg.quejas.total).toBe(0)
    // «sin quejas registradas» era inexacto: `total` cuenta las que pusieron los
    // vecinos, registradas o no.
    expect(screen.getByText(/sin quejas de vecinos/i)).toBeInTheDocument()
    expect(textoTarjeta()).not.toMatch(/[✓⏳⚠]\s*\d/)
  })
})
