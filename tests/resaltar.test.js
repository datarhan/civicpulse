import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { trozosResaltados, trozosEnlazados } from '../src/lib/resaltar'
import { REPORTAJE_SLUGS } from '../src/reportajes'

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

describe('trozosEnlazados', () => {
  const enlaces = [{ texto: 'Otra pieza', a: '/reportajes/otra' }]

  it('enlaza cada aparición y, unidos, los trozos son el texto exacto', () => {
    const texto = 'Lo cuenta «Otra pieza»; y «Otra pieza» lo repite.'
    const t = trozosEnlazados(texto, enlaces)
    expect(t.map((x) => x.t).join('')).toBe(texto)
    expect(t.filter((x) => x.a).map((x) => x.a)).toEqual(['/reportajes/otra', '/reportajes/otra'])
  })

  it('un texto que no nombra ninguna sale entero y sin enlace', () => {
    expect(trozosEnlazados('nada', enlaces)).toEqual([{ t: 'nada' }])
    expect(trozosEnlazados('nada', undefined)).toEqual([{ t: 'nada' }])
  })
})

/* Un enlace a otra pieza se declara con su TÍTULO, y el título es el de esa
   pieza. Si la otra se retitula, el texto de ésta sigue citando el viejo y el
   enlace dejaría de casar en silencio: esto lo pone rojo. */
describe('los enlaces de una pieza a otra', () => {
  const leer = (slug) => JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8'))
  const declarados = REPORTAJE_SLUGS.flatMap((slug) =>
    (leer(slug).enlaces ?? []).map((e) => ({ slug, ...e })),
  )

  it('mide algo: hay enlaces declarados', () => {
    expect(declarados.length).toBeGreaterThan(0)
  })

  it('cada uno lleva a una pieza, con su título literal, y su pieza lo nombra', () => {
    for (const { slug, texto, a } of declarados) {
      const destino = a.replace(/^\/reportajes\//, '')
      expect(REPORTAJE_SLUGS, `${slug} → ${a}`).toContain(destino)
      expect(texto, `${slug} → ${a}`).toBe(leer(destino).meta.titulo)
      // Sin el propio bloque `enlaces`, que lo contiene siempre.
      const { enlaces: _, ...pieza } = leer(slug)
      expect(JSON.stringify(pieza), `${slug} no nombra «${texto}»`).toContain(texto)
    }
  })
})
