import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
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
