import { describe, expect, it } from 'vitest'
import { nombreDeBarrio, rotuloDeBarrio } from '../src/lib/formatters'

const barrios = [{ slug: 'urbanitzacio-valencia-la-vella', name: 'Urbanització València la Vella' }]

describe('nombreDeBarrio', () => {
  it('usa el nombre de OSM, con sus acentos', () => {
    expect(nombreDeBarrio('urbanitzacio-valencia-la-vella', barrios)).toBe(
      'Urbanització València la Vella',
    )
  })
  it('un slug desconocido cae en el de siempre', () => {
    expect(nombreDeBarrio('santa-rosa', barrios)).toBe('Santa Rosa')
  })
  it('sin geo cae en el de siempre', () => {
    expect(nombreDeBarrio('santa-rosa', null)).toBe('Santa Rosa')
  })
})

describe('rotuloDeBarrio', () => {
  it('un nombre de OSM se pinta tal cual, sin capitalizar', () => {
    expect(rotuloDeBarrio("el Pou d'Escoto")).toBe("el Pou d'Escoto")
    expect(rotuloDeBarrio("l'Oliveral")).toBe("l'Oliveral")
    expect(rotuloDeBarrio('Urbanització València la Vella')).toBe('Urbanització València la Vella')
    expect(rotuloDeBarrio('Vallesa de Mandor')).toBe('Vallesa de Mandor')
  })
  it('lo que llega con forma de slug sí se capitaliza', () => {
    expect(rotuloDeBarrio('santa-rosa')).toBe('Santa Rosa')
    expect(rotuloDeBarrio('l_oliveral')).toBe('L Oliveral')
  })
  it('vacío se queda vacío', () => {
    expect(rotuloDeBarrio(null)).toBe('')
    expect(rotuloDeBarrio(undefined)).toBe('')
    expect(rotuloDeBarrio('')).toBe('')
  })
})
