import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NarrativeBlock } from '../src/components/journalist/Sections'
import { trozos } from '../src/lib/texto-negrita.js'

/**
 * Los relatos de las biografías se pintaban crudos: «**puesto n.º 6**» con sus
 * asteriscos a la vista en las 21 páginas, el mismo defecto que ya corrigió
 * CorrectionNote en los reportajes. Lo vio un navegador el 06-09-2026.
 */
const REPORTS = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/journalist-reports.json'), 'utf8'),
)

const payload = {
  heading: 'Identidad y cargo municipal',
  bodyMarkdown: 'Figura en el **puesto n.º 6** del grupo.\n\nSegundo párrafo.',
  sourceIds: [],
}

function pinta() {
  return render(
    <MemoryRouter>
      <NarrativeBlock payload={payload} sourceMap={new Map()} />
    </MemoryRouter>,
  )
}

describe('NarrativeBlock: el cuerpo se lee como se escribió', () => {
  it('pinta **negrita** como <strong> y no enseña los asteriscos', () => {
    const { container } = pinta()
    const strong = [...container.querySelectorAll('strong')].map((n) => n.textContent)
    expect(strong).toEqual(['puesto n.º 6'])
    expect(container.textContent).not.toContain('**')
  })

  it('un salto de párrafo es un <p> nuevo, en orden', () => {
    const { container } = pinta()
    const ps = [...container.querySelectorAll('p')].map((p) => p.textContent)
    expect(ps).toHaveLength(2)
    expect(ps[0]).toBe('Figura en el puesto n.º 6 del grupo.')
    expect(ps[1]).toBe('Segundo párrafo.')
  })
})

describe('los relatos publicados pasan por el mismo trozeador', () => {
  const narratives = REPORTS.items.flatMap((r) =>
    r.sections.filter((s) => s.kind === 'narrative').map((s) => ({ id: r.id, ...s.payload })),
  )

  it('hay relatos con negrita, así que el test mide algo', () => {
    expect(narratives.length).toBeGreaterThan(50)
    expect(narratives.filter((n) => n.bodyMarkdown.includes('**')).length).toBeGreaterThan(0)
  })

  it('no pierde texto y no deja ningún marcador en un trozo plano', () => {
    for (const n of narratives) {
      const parrafos = trozos(n.bodyMarkdown)
      const rebuilt = parrafos
        .map((p) => p.map((t) => (t.negrita !== undefined ? `**${t.negrita}**` : t.texto)).join(''))
        .join('\n\n')
      expect(rebuilt, n.id).toBe(n.bodyMarkdown.replace(/\n\n+/g, '\n\n'))
      expect(
        parrafos.flat().some((t) => (t.texto ?? '').includes('**')),
        n.id,
      ).toBe(false)
    }
  })
})
