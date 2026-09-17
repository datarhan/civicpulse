/**
 * La fecha de las columnas estrechas (`fmtDateCompacta`).
 *
 * En valencià, `fmtDateShort` escribe «24 de maig del 2023» y la columna de fechas
 * del índice de plenos saltaba a dos líneas. La versión compacta quita la
 * preposición; en castellano tiene que escribir lo mismo que antes, byte a byte,
 * porque la tabla castellana no cambia.
 */
import { describe, expect, it } from 'vitest'

import { fmtDateCompacta, fmtDateShort } from '../src/lib/formatters'

/** Un día de cada mes de seis años: el ancho de un mes cambia con la abreviatura. */
const FECHAS = []
for (let anio = 2022; anio <= 2027; anio += 1) {
  for (let mes = 1; mes <= 12; mes += 1) {
    const dia = ((mes * 7) % 28) + 1
    FECHAS.push(`${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`)
  }
}

describe('fmtDateCompacta', () => {
  it('mide algo: una fecha de cada mes', () => {
    expect(FECHAS.length).toBe(72)
  })

  it('en castellano escribe exactamente lo que fmtDateShort', () => {
    expect(FECHAS.filter((f) => fmtDateCompacta(f, 'es') !== fmtDateShort(f, 'es'))).toEqual([])
  })

  it('en valencià no lleva preposiciones y es más corta que fmtDateShort', () => {
    for (const f of FECHAS) {
      const compacta = fmtDateCompacta(f, 'ca')
      expect(compacta, f).not.toMatch(/\bde\b|\bdel\b|d’|d'/)
      expect(compacta.length, f).toBeLessThan(fmtDateShort(f, 'ca').length)
    }
  })

  it('sin fecha no escribe nada', () => {
    expect(fmtDateCompacta(null, 'ca')).toBe('')
    expect(fmtDateCompacta('', 'es')).toBe('')
  })
})
