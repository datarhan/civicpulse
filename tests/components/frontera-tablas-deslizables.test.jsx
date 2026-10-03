import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { DeclaracionCongelada } from '../../src/components/frontera/DeclaracionCongelada'
import { SerieFrontera } from '../../src/components/frontera/SerieFrontera'

/**
 * Las dos tablas de /laboratorio/frontera no caben en su tarjeta en un
 * teléfono. La de denominadores sin cambiar medía 307 px en una tarjeta de 228
 * a 320 px de pantalla, y como nada la contenía, la página entera medía 354 y
 * se desplazaba de lado (lo mide `mobile.spec.ts`, «El documento a 320 px»). La
 * serie entrega a entrega ya se deslizaba, pero sin decirlo: la tabla se
 * cortaba en el borde, y quien no usa ratón no tenía cómo recorrerla.
 *
 * Ahora las dos se deslizan DENTRO de su tarjeta, en una región que el teclado
 * alcanza y que se llama como la tabla (WCAG 2.1.1; axe
 * `scrollable-region-focusable`). Eso es lo que se comprueba aquí, porque
 * ninguna medida de anchos lo ve. La sombra del borde es CSS, y se mira en el
 * navegador.
 */
const denominador = {
  programa: 'a1621',
  label: 'Recogida de residuos',
  unidad: '€/t',
  magnitud: 'unidad',
  congelada: true,
  entregas: 10,
  valor: 11059.41,
  repeticionesFinales: 5,
  congeladaDesde: 2019,
  desde: 2014,
  hasta: 2024,
}

describe('las tablas de /laboratorio/frontera se deslizan en una región que el teclado alcanza', () => {
  it('la de denominadores sin cambiar, con el nombre de su rótulo', () => {
    render(
      <DeclaracionCongelada
        declaracion={{
          minEntregas: 4,
          entregas: 10,
          unidadSeries: 282,
          unidadCongeladas: 176,
          costeSeries: 263,
          costeCongeladas: 4,
          propias: [denominador],
        }}
      />,
    )
    const region = screen.getByRole('region', {
      name: 'Riba-roja de Túria · 1 de 1 denominadores sin cambiar',
    })
    expect(region.tabIndex).toBe(0)
    expect(within(region).getByRole('table')).toBeTruthy()
  })

  it('la serie entrega a entrega, con el nombre de su rótulo', () => {
    render(
      <SerieFrontera
        especificacion={{
          titulo: 'Residuos, limpieza viaria y alumbrado',
          serie: [{ anio: 2015, n: 19, estado: 'publicada', theta: 0.6079554544144496 }],
          panel: { miembros: 10, serie: [] },
        }}
      />,
    )
    const region = screen.getByRole('region', {
      name: 'Entrega a entrega · Residuos, limpieza viaria y alumbrado',
    })
    expect(region.tabIndex).toBe(0)
    expect(within(region).getByRole('table')).toBeTruthy()
  })
})
