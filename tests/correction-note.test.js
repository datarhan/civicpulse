import { describe, it, expect } from 'vitest'
import { trozos } from '../src/components/reportajes/CorrectionNote'
import correccionesDana from '../public/data/reportajes/reconstruccion-dana.json'

/**
 * La nota de corrección se pintaba cruda: la del 02-08-2026 llevaba meses
 * publicada enseñando sus propios asteriscos y en un solo párrafo de doce
 * líneas. Lo caza un navegador, no una aserción sobre datos — que es la moraleja
 * que docs/DATA_INTEGRITY.md repite sobre las suites que están verdes sin mirar
 * nada. Estos tests fijan el trozeador para que no vuelva a pasar en silencio.
 */
describe('CorrectionNote — el texto se lee como se escribió', () => {
  it('parte en párrafos por la línea en blanco', () => {
    expect(trozos('uno\n\ndos\n\ntres')).toHaveLength(3)
    expect(trozos('sin saltos')).toHaveLength(1)
  })

  it('convierte **negrita** en un trozo marcado, y deja el resto como texto', () => {
    const [parrafo] = trozos('antes **el medio** después')
    expect(parrafo.filter((t) => t.negrita).map((t) => t.negrita)).toEqual(['el medio'])
    expect(parrafo.map((t) => t.negrita ?? t.texto).join('')).toBe('antes el medio después')
  })

  it('un asterisco suelto se queda como asterisco', () => {
    const [p] = trozos('3 * 4 y un ** huérfano')
    expect(p.every((t) => t.texto !== undefined)).toBe(true)
    expect(p.map((t) => t.texto).join('')).toBe('3 * 4 y un ** huérfano')
  })

  it('no pierde ni un carácter del texto original', () => {
    const original = 'a **b** c\n\nd **e**'
    const reconstruido = trozos(original)
      .map((p) => p.map((t) => (t.negrita ? `**${t.negrita}**` : t.texto)).join(''))
      .join('\n\n')
    expect(reconstruido).toBe(original)
  })

  it('la corrección REAL publicada sale con negrita y en varios párrafos', () => {
    // Contra el fichero de verdad, no contra una cadena inventada: el defecto
    // era que un texto real con `**` se pintaba con los asteriscos a la vista.
    const real = correccionesDana.meta.correcciones.find((c) => c.fecha === '2026-08-13')
    expect(real, 'falta la corrección del 13-08').toBeTruthy()
    const parrafos = trozos(real.texto)
    expect(parrafos.length).toBeGreaterThan(1)
    expect(parrafos.flat().some((t) => t.negrita)).toBe(true)
    // y ningún trozo de texto plano conserva el marcador
    expect(parrafos.flat().some((t) => (t.texto ?? '').includes('**'))).toBe(false)
  })
})
