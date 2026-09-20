import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CitationPills, SOURCE_INDEX } from '../src/components/journalist/Citations'

/**
 * La fila de píldoras de cita de una sección era un `inline-flex` SIN salto de
 * línea. Mientras ninguna sección citó más de ocho fuentes cabía en un móvil;
 * la versión 5 de la biografía del alcalde cita quince en «Elección e
 * investidura», y esa fila —536 px de ancho irrompible— empujó la columna
 * entera: la página medía 600 px en una ventana de 361 (medido en el navegador
 * el 20-09-2026). Ningún test lo veía porque el defecto lo activan los DATOS,
 * no el código: bastaba con que un informe citara mucho.
 *
 * Un test de estilos no mide un layout —eso lo hizo el navegador—, pero sí
 * impide que la propiedad que lo arregla desaparezca en silencio.
 */
const fuentes = Array.from({ length: 15 }, (_, i) => ({
  id: `src-${String(i + 1).padStart(3, '0')}`,
  title: `Fuente ${i + 1}`,
}))

describe('CitationPills — una sección con muchas citas no ensancha la página', () => {
  const html = renderToStaticMarkup(
    <CitationPills ids={fuentes.map((f) => f.id)} sourceMap={SOURCE_INDEX(fuentes)} />,
  )

  it('pinta las quince píldoras (que el test mida algo)', () => {
    expect((html.match(/href="#src-/g) ?? []).length).toBe(15)
  })

  it('la fila de píldoras salta de línea en vez de crecer', () => {
    const envoltorio = html.match(/^<span style="([^"]*)"/)?.[1] ?? ''
    expect(envoltorio).toContain('display:inline-flex')
    expect(envoltorio).toContain('flex-wrap:wrap')
  })
})
