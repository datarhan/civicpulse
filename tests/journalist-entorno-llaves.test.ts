import { describe, it, expect } from 'vitest'
import { parseLlaves } from '../scripts/journalist-entorno'

/**
 * Una llave es un parentesco DOCUMENTADO: nombre, parentesco y el documento
 * fechado que lo dice. Sin documento no hay llave, y el CLI se niega a cargar
 * el fichero antes que a cruzar un nombre suelto con el BORME.
 */
describe('parseLlaves', () => {
  it('acepta una llave completa y conserva el documento', () => {
    const l = parseLlaves(
      JSON.stringify([
        {
          nombre: 'María Gimeno Calvo',
          parentesco: 'hermana',
          documento: {
            titulo: 'Acta del Pleno de 03-07-2023, punto 5',
            url: 'https://www.ribarroja.es/acta.pdf',
            fecha: '2023-07-03',
            extracto: 'se abstiene por parentesco',
          },
        },
      ]),
    )
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ nombre: 'María Gimeno Calvo', parentesco: 'hermana' })
    expect(l[0].documento.url).toBe('https://www.ribarroja.es/acta.pdf')
  })

  it('sin documento fechado no hay llave', () => {
    expect(() =>
      parseLlaves(JSON.stringify([{ nombre: 'María Gimeno Calvo', parentesco: 'hermana' }])),
    ).toThrow(/documento/)
    expect(() =>
      parseLlaves(
        JSON.stringify([
          {
            nombre: 'María Gimeno Calvo',
            parentesco: 'hermana',
            documento: { titulo: 'x', fecha: '2023' },
          },
        ]),
      ),
    ).toThrow(/fecha/)
  })

  it('un nombre de una sola palabra o un parentesco vacío se rechazan', () => {
    const doc = { titulo: 'Acta', fecha: '2023-07-03' }
    expect(() =>
      parseLlaves(JSON.stringify([{ nombre: 'María', parentesco: 'hermana', documento: doc }])),
    ).toThrow(/nombre y apellidos/)
    expect(() =>
      parseLlaves(JSON.stringify([{ nombre: 'María Gimeno', parentesco: ' ', documento: doc }])),
    ).toThrow(/parentesco/)
  })

  it('no acepta otra cosa que una lista', () => {
    expect(() => parseLlaves('{}')).toThrow(/lista/)
  })
})
