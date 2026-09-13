/**
 * El tiempo, el aire y el metro de la cabecera de la portada: tres chips que
 * abren un detalle. El detalle EXISTÍA y no se veía nunca.
 *
 * La causa no era el z-index. El panel se anclaba a la propia tira, y la tira
 * lleva `overflow-x: auto` para poder deslizarse en estrecho: una caja con
 * overflow distinto de visible recorta a todo descendiente cuyo bloque
 * contenedor esté dentro de ella (CSS 2.1 §11.1.1), así que el panel quedaba
 * cortado a la altura de la fila. Y un panel recortado conserva su rectángulo,
 * de modo que medirlo con getBoundingClientRect no lo delata: lo delata mirar
 * quién contiene a quién, que es lo que fija esta prueba. La otra mitad —que en
 * la página haya píxeles ahí— la mide el e2e con elementFromPoint.
 *
 * El patrón es el mismo desplegable de la APG que la barra de secciones:
 * aria-expanded + aria-controls, el panel en el DOM aunque esté oculto, y
 * Escape devuelve el foco al chip que lo abrió.
 *
 * Cada chip se espera POR SU NOMBRE. `findAllByRole` se conforma con un solo
 * elemento, y el chip del metro se pinta sin red —su horario es cálculo puro—,
 * así que contar lo que haya devuelve 1 antes de que Open-Meteo conteste.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Vivo } from '../../src/variants/direction-d/Vivo'
import { CATALOGUE } from '../../src/i18n'

/** Open-Meteo y el horario del metro, servidos por URL y no por ruta exacta:
 *  las dos primeras llevan query, y fijarla aquí ataría la prueba a los
 *  parámetros que el hook pida hoy. */
function sirveLoVivo() {
  const clima = {
    current: {
      temperature_2m: 21.4,
      apparent_temperature: 20.8,
      weather_code: 2,
      relative_humidity_2m: 54,
      wind_speed_10m: 12.2,
    },
    daily: {
      temperature_2m_min: [14.1, 13.2],
      temperature_2m_max: [26.3, 25.1],
      precipitation_probability_max: [10],
      sunrise: ['2026-09-13T07:41'],
      sunset: ['2026-09-13T20:29'],
    },
  }
  const aire = {
    current: { european_aqi: 24, pm2_5: 7.1, pm10: 12.4, nitrogen_dioxide: 8.2, ozone: 61.3 },
    hourly: { pm2_5: Array.from({ length: 30 }, (_, i) => 5 + (i % 4)) },
  }
  const horario = {
    generatedAt: '2026-09-13T00:00:00.000Z',
    source: { feed: 'prueba' },
    validThrough: '2026-12-31',
    stops: {},
  }
  return vi.fn(async (input) => {
    const url = String(input)
    const cuerpo = url.includes('air-quality')
      ? aire
      : url.includes('open-meteo')
        ? clima
        : url.includes('metro-schedule')
          ? horario
          : {}
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

const panelDe = (boton) => document.getElementById(boton.getAttribute('aria-controls'))
/** La tira que se desliza: la que recorta si algo cuelga de ella. */
const tira = () => document.querySelector('[data-vivo-tira]')
const chip = (clave) => screen.findByRole('button', { name: CATALOGUE.es[clave] })

describe('Vivo — el detalle de la cabecera', () => {
  beforeEach(() => {
    globalThis.fetch = sirveLoVivo()
  })

  it('los tres chips están cerrados y cada uno dice qué panel abre', async () => {
    render(<Vivo />)
    const chips = [
      await chip('vivo.clima.aria'),
      await chip('vivo.aire.aria'),
      await chip('vivo.metro.aria'),
    ]
    for (const c of chips) {
      expect(c).toHaveAttribute('aria-expanded', 'false')
      // Cada botón controla un panel que EXISTE: un aria-controls colgante es
      // un botón que no dice qué abre.
      expect(panelDe(c), `el panel de ${c.getAttribute('aria-label')}`).not.toBeNull()
      expect(panelDe(c)).not.toBeVisible()
    }
  })

  it('el panel NO cuelga de la tira que se desliza', async () => {
    // La prueba de que el recorte no puede volver: si el panel vuelve a estar
    // dentro de la tira, esto se cae aunque en pantalla parezca correcto.
    render(<Vivo />)
    const clima = await chip('vivo.clima.aria')
    fireEvent.click(clima)
    const panel = panelDe(clima)
    expect(panel).toBeVisible()
    expect(tira(), 'la tira deslizante').not.toBeNull()
    expect(tira().contains(panel), 'el panel cuelga de la tira: volvería a recortarse').toBe(false)
  })

  it('abrir uno cierra el anterior', async () => {
    render(<Vivo />)
    const clima = await chip('vivo.clima.aria')
    const aire = await chip('vivo.aire.aria')
    fireEvent.click(clima)
    expect(clima).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(aire)
    expect(clima).toHaveAttribute('aria-expanded', 'false')
    expect(aire).toHaveAttribute('aria-expanded', 'true')
  })

  it('Escape cierra y devuelve el foco al chip', async () => {
    render(<Vivo />)
    const clima = await chip('vivo.clima.aria')
    fireEvent.click(clima)
    fireEvent.keyDown(panelDe(clima), { key: 'Escape' })
    expect(clima).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(clima)
  })

  it('el detalle del aire trae su serie de PM₂.₅', async () => {
    render(<Vivo />)
    const aire = await chip('vivo.aire.aria')
    fireEvent.click(aire)
    const panel = panelDe(aire)
    expect(panel.textContent).toContain('PM₂.₅')
    // La chispa de las últimas 24 h es contenido publicado, no adorno: si se
    // cae al mover la tira de sitio, esto lo dice.
    expect(panel.querySelector('svg path'), 'la serie de PM₂.₅').not.toBeNull()
  })

  it('sin datos de una fuente, su chip no se pinta en vez de decir «0°»', async () => {
    // Los hooks devuelven data: null ante cualquier fallo, y la cabecera no
    // publica un cero que parezca una medición.
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 }))
    render(<Vivo />)
    await chip('vivo.metro.aria')
    expect(screen.queryByText(/0°/)).toBeNull()
    expect(screen.queryByRole('button', { name: CATALOGUE.es['vivo.clima.aria'] })).toBeNull()
  })
})
