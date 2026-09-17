import { describe, expect, it } from 'vitest'
import { ESTADOS_SOLICITUD, tituloSolicitudes } from '../src/scraper/solicitud-acceso'

/**
 * /laboratorio/cobertura titulaba «Lo que hemos pedido, y lo que han contestado»
 * encima de una tabla en la que todas las filas decían «Todavía no lo hemos pedido».
 * El registro de solicitudes estaba vacío: el título afirmaba unas peticiones que no
 * existían. La revisión lectora lo señaló el 15-09-2026. El título sale ahora de los
 * mismos estados que pinta la tabla.
 */
describe('tituloSolicitudes · el título dice lo que dice la tabla', () => {
  it('sin ninguna solicitud presentada, no dice que hayamos pedido nada', () => {
    const titulo = tituloSolicitudes([
      'sin-solicitar',
      'sin-solicitar',
      'sin-solicitar',
      'sin-solicitar',
    ])
    expect(titulo).not.toMatch(/hemos pedido/i)
    expect(titulo).toMatch(/habría que pedir/i)
  })

  it('EL CONTROL: con alguna presentada, el título de siempre', () => {
    expect(tituloSolicitudes(['sin-solicitar', 'en-plazo'])).toBe(
      'Lo que hemos pedido, y lo que han contestado',
    )
  })

  it('cualquier estado distinto de «sin-solicitar» cuenta como pedido', () => {
    const pedidos = ESTADOS_SOLICITUD.filter((e) => e !== 'sin-solicitar')
    expect(pedidos.length, 'el enum no trae estados de una solicitud presentada').toBeGreaterThan(0)
    for (const estado of pedidos) {
      expect(tituloSolicitudes([estado]), estado).toMatch(/hemos pedido/i)
    }
  })

  it('sin filas, tampoco inventa peticiones', () => {
    expect(tituloSolicitudes([])).not.toMatch(/hemos pedido/i)
  })
})
