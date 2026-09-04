/**
 * Encender la capa de inundación no acusaba recibo.
 *
 * Entre el clic y la primera trama pintada no pasa nada visible: el WMS del ICV
 * va por HTTP/1.1 y sin cabeceras de caché —ni `Cache-Control`, ni `ETag`, ni
 * `Expires`— así que cada encendido vuelve a pedirlo todo, y lo que tarde la
 * red del lector se lee como que el botón no funciona.
 *
 * Medido desde aquí, el ida y vuelta es de ~250-400 ms y no se puede reproducir
 * la espera de varios segundos que sí ve el operador; sea cual sea su causa
 * —red, distancia, un mal momento del servicio— lo que la vuelve ilegible es
 * que la tarjeta no dice nada mientras tanto. Eso es lo que se arregla aquí.
 *
 * La leyenda es tonta a propósito: recibe si está cargando, no lo averigua. El
 * dueño del estado es quien monta la capa, que es quien recibe los eventos de
 * Leaflet.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FloodLegend } from '../../src/components/LiveCity/controls/FloodLegend'
import { LocaleProvider } from '../../src/i18n'

const pinta = (props) =>
  render(
    <LocaleProvider>
      <FloodLegend {...props} />
    </LocaleProvider>,
  )

describe('FloodLegend · acuse de recibo', () => {
  it('mientras cargan las tramas lo dice', () => {
    pinta({ cargando: true })
    expect(screen.getByText(/cargando/i)).toBeInTheDocument()
  })

  it('cuando ya están, no deja el aviso puesto', () => {
    pinta({ cargando: false })
    expect(screen.queryByText(/cargando/i)).toBeNull()
  })

  it('la fuente se nombra en los dos estados', () => {
    // El aviso de carga no puede comerse la atribución: es lo que sostiene la
    // afirmación de la capa, y la ODbL/el ICV no dejan de exigirla mientras
    // carga.
    for (const cargando of [true, false]) {
      const { unmount } = pinta({ cargando })
      expect(screen.getByText(/PATRICOVA/)).toBeInTheDocument()
      unmount()
    }
  })
})
