import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { EscaleraCobertura } from '../../src/components/plenos/EscaleraCobertura'

/**
 * La nota de la escalera, con y sin sesiones que rompan el anidamiento.
 *
 * «…pero no están anidados:» iba en la primera frase de la nota y se pintaba
 * siempre. Cuando las sesiones sueltas llegaron a cero —el 24-09-2026 se
 * extrajo el último orden del día que faltaba—, la tarjeta pasó a decir «no
 * están anidados: hoy cada escalón resulta ser un subconjunto del anterior»,
 * que se contradice en la misma línea. Señalado por la verificación del
 * barrido lector del 28-09. Cada mitad va ahora sólo con su caso.
 */
const escalera = [
  { id: 'sesiones', n: 62, de: 62, cuota: 1, tono: 'civic' },
  { id: 'orden', n: 62, de: 62, cuota: 1, tono: 'civic' },
  { id: 'declaraciones', n: 23, de: 62, cuota: 23 / 62, tono: 'intel' },
  { id: 'votaciones', n: 7, de: 62, cuota: 7 / 62, tono: 'warn' },
]

const pinta = (excepciones) =>
  render(<EscaleraCobertura escalera={escalera} excepciones={excepciones} />).container.textContent

describe('EscaleraCobertura — la nota sólo niega el anidamiento cuando lo rompe una sesión', () => {
  it('sin excepciones no dice que los escalones no están anidados', () => {
    const texto = pinta({ declSinOrden: 0, votosSinDecl: 0 })
    // Midió algo: la nota se pintó, con su denominador.
    expect(texto).toMatch(/sobre las mismas 62 sesiones/)
    expect(texto).toMatch(/cada escalón resulta ser un subconjunto del anterior/)
    expect(texto).not.toMatch(/no están anidados/i)
  })

  it('con excepciones lo dice, y nombra cuáles', () => {
    const texto = pinta({ declSinOrden: 2, votosSinDecl: 1 })
    expect(texto).toMatch(/no están anidados/i)
    expect(texto).toMatch(/2 sesiones tienen declaraciones extraídas sin su orden del día/)
    expect(texto).toMatch(/una tiene votaciones sin declaraciones/)
    expect(texto).not.toMatch(/subconjunto del anterior/)
  })
})
