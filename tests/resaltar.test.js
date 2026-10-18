import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { trozosResaltados } from '../src/lib/resaltar'

describe('trozosResaltados', () => {
  it('marca las frases y, unidos, los trozos son la cita exacta', () => {
    const texto = 'una recogida no intrusiva y anonimizada, dice el pliego'
    const t = trozosResaltados(texto, ['no intrusiva y anonimizada'])
    expect(t.map((x) => x.t).join('')).toBe(texto)
    expect(t.filter((x) => x.resalte).map((x) => x.t)).toEqual(['no intrusiva y anonimizada'])
  })

  it('ordena las frases por su sitio, no por el orden en que llegan', () => {
    const t = trozosResaltados('a b c d', ['d', 'b'])
    expect(t).toEqual([
      { t: 'a ', resalte: false },
      { t: 'b', resalte: true },
      { t: ' c ', resalte: false },
      { t: 'd', resalte: true },
    ])
  })

  it('lanza si una frase no está, está dos veces o pisa a otra', () => {
    expect(() => trozosResaltados('abc', ['x'])).toThrow(/no está/)
    expect(() => trozosResaltados('abab', ['ab'])).toThrow(/más de una vez/)
    expect(() => trozosResaltados('abcdef', ['abcd', 'cdef'])).toThrow(/se pisan/)
    expect(() => trozosResaltados('abc', [''])).toThrow(/no está/)
  })
})

describe('los subrayados de «matrículas y móviles»', () => {
  const an = JSON.parse(
    readFileSync('public/data/reportajes/matriculas-y-moviles.json', 'utf8'),
  ).anonimizada

  it('hay subrayados que comprobar en las dos citas', () => {
    expect(an.resaltes.promesa.length).toBeGreaterThan(0)
    expect(an.resaltes.metodo.length).toBeGreaterThan(0)
  })

  it('cada subrayado está, literal y una vez, en su cita', () => {
    // trozosResaltados lanza si no; aquí se comprueba además que no cambia ni
    // un carácter de la cita publicada.
    for (const [cita, clave] of [
      [an.promesa, 'promesa'],
      [an.metodo, 'metodo'],
    ]) {
      const t = trozosResaltados(cita, an.resaltes[clave])
      expect(t.map((x) => x.t).join('')).toBe(cita)
    }
  })
})
