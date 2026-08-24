import { describe, it, expect } from 'vitest'
import { estiloLibro } from '../src/components/eficiencia/libro.css.js'

/**
 * La hoja del libro de servicios llega entera, y lo comprueba alguien.
 *
 * Se escribe como template literal porque lo responsivo no cabe en el prop
 * `style`. La primera versión llevaba un nombre entre acentos invertidos dentro
 * de un comentario CSS: eso CIERRA el literal a media hoja, prettier reformateó
 * el resto como si fuera código, el build pasó y la página murió en el
 * navegador con «ReferenceError: x is not defined». Ninguna prueba de esta casa
 * podía verlo, porque ninguna lee la hoja.
 *
 * Ahora sí. Y como la trampa fue exactamente un acento invertido, se comprueba
 * el acento invertido.
 */
describe('estiloLibro — la hoja llega entera', () => {
  it('mide algo: es una hoja de verdad, no una cadena vacía', () => {
    expect(typeof estiloLibro).toBe('string')
    expect(estiloLibro.length).toBeGreaterThan(1500)
    expect(estiloLibro.split('{').length - 1).toBeGreaterThan(20)
  })

  it('ningún acento invertido dentro: cerraría el literal a media hoja', () => {
    expect(estiloLibro).not.toContain('`')
  })

  it('llega hasta el final: la última regla del fichero está presente', () => {
    expect(estiloLibro).toContain('.cp-libro tr.cp-grupo th')
    expect(estiloLibro.trimEnd().endsWith('}')).toBe(true)
  })

  it('la tabla scrollea en su caja y no en la página, a cualquier ancho', () => {
    const regla = estiloLibro.match(/\.cp-libro-scroll\s*\{[^}]*\}/)
    expect(regla, 'no existe .cp-libro-scroll').toBeTruthy()
    expect(regla[0]).toContain('overflow-x: auto')
    // Fuera de toda media query: el min-width de la tabla empuja el documento
    // en escritorio, que es donde `.cp-scroll-x` de index.css no llega.
    expect(estiloLibro.indexOf('.cp-libro-scroll')).toBeLessThan(estiloLibro.indexOf('@media'))
  })

  it('a 720px la tabla deja de tener ancho mínimo y las filas pasan a bloque', () => {
    const movil = estiloLibro.slice(estiloLibro.indexOf('@media (max-width: 720px)'))
    expect(movil).toContain('min-width: 0')
    expect(movil).toMatch(/\.cp-libro tr[^{]*\{[^}]*display: block/)
  })

  it('las cabeceras siguen anunciándose: thead se oculta a móvil sin display:none', () => {
    const movil = estiloLibro.slice(estiloLibro.indexOf('@media (max-width: 720px)'))
    const thead = movil.match(/\.cp-libro thead\s*\{[^}]*\}/)
    expect(thead).toBeTruthy()
    expect(thead[0]).not.toContain('display: none')
    expect(thead[0]).toContain('clip:')
  })
})
