import { describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorrectionLog } from '../src/pages/AgenteReporte'

/**
 * La Bitácora de correcciones pinta el texto original y el corregido tal cual
 * vienen del JSON. Las primeras correcciones con negrita (06-09-2026: cierre de
 * un mandato, un adorno retirado) enseñaron sus asteriscos en las dos páginas —
 * el mismo defecto que PR #104 quitó de los relatos, un componente más abajo.
 */
const corrections = [
  {
    field: 'narrative.Elección y toma de posesión.bodyMarkdown',
    original: 'queda como **n.º 1 y portavoz** (suplente: Soraya Trejo)',
    corrected: 'queda como **n.º 1 y portavoz** (suplente en 2023: Soraya Trejo, que renunció)',
    reason: 'La portavoz suplente nombrada renunció al acta en 2025.',
    editor: 'Sergei Lutchenko',
    correctedAt: '2026-09-06',
  },
]

describe('CorrectionLog: la bitácora se lee como se escribió', () => {
  it('pinta **negrita** como <strong> en el original y en el corregido, sin asteriscos', () => {
    const { container } = render(<CorrectionLog corrections={corrections} />)
    const strongs = [...container.querySelectorAll('strong')].map((n) => n.textContent)
    expect(strongs.filter((s) => s === 'n.º 1 y portavoz')).toHaveLength(2)
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).toContain('suplente en 2023')
    expect(container.textContent).toContain('2026-09-06')
  })

  it('sin correcciones no pinta nada', () => {
    const { container } = render(<CorrectionLog corrections={[]} />)
    expect(container.textContent).toBe('')
  })
})

/**
 * La bitácora enseña una ventana de 200 caracteres de cada versión, y la
 * cortaba ANTES de trocear: una negrita que cruzaba el carácter 200 perdía su
 * cierre y dejaba a la vista el `**` de apertura. Medido el 05-10-2026 en
 * a-alberto-gimeno-bio-v2, donde la versión retirada acababa en «devuelve
 * **0 c». Y los párrafos de la ventana salían pegados («Uno.Dos.»): ninguna
 * fila publicada tiene hoy un salto en sus 200 primeros caracteres, pero el
 * comentario de `Recorte` prometía un espacio.
 */
describe('CorrectionLog: el recorte se hace sobre el texto que se lee', () => {
  const fila = (original, corrected) => ({
    field: 'narrative.Trayectoria.bodyMarkdown',
    original,
    corrected,
    reason: 'Motivo de prueba con la longitud de un motivo de verdad.',
    editor: 'civicpulse-curator',
    correctedAt: '2026-09-06',
  })

  it('una negrita que cruza el corte sigue en <strong>, sin su «**» de apertura', () => {
    const original = `${'a'.repeat(190)} **negrita partida** y después más texto`
    const { container } = render(<CorrectionLog corrections={[fila(original, 'Corregido.')]} />)
    expect(container.textContent).not.toContain('**')
    const tachadas = [...container.querySelectorAll('del strong')].map((n) => n.textContent)
    expect(tachadas).toHaveLength(1)
    expect(tachadas[0].length).toBeGreaterThan(0)
    expect('negrita partida'.startsWith(tachadas[0])).toBe(true)
  })

  it('los párrafos de la ventana se leen separados por un espacio', () => {
    const { container } = render(
      <CorrectionLog corrections={[fila('Uno.\n\nDos.', 'Tres.\n\nCuatro.')]} />,
    )
    expect(container.textContent).toContain('Uno. Dos.')
    expect(container.textContent).toContain('Tres. Cuatro.')
  })

  it('ninguna bitácora de un informe publicado enseña un asterisco de negrita', () => {
    const DIR = join(__dirname, '..', 'public/data/journalist-reports')
    const informes = readdirSync(DIR).map((n) => JSON.parse(readFileSync(join(DIR, n), 'utf8')))
    let filas = 0
    for (const r of informes.filter((x) => x.corrections?.length)) {
      filas += r.corrections.length
      const { container } = render(<CorrectionLog corrections={r.corrections} />)
      expect(container.textContent, r.id).not.toContain('**')
      cleanup()
    }
    expect(filas, 'ningún informe con bitácora: esto no mide nada').toBeGreaterThan(0)
  })
})
