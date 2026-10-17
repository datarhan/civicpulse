import { describe, expect, it } from 'vitest'
import { nombreDeBarrio } from '../src/lib/formatters'

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
