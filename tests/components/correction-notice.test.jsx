/**
 * El aviso de correcciones que queda sobre las cifras (CorrectionNote.jsx).
 *
 * Desde el 24-09-2026 el registro completo cierra la pieza y arriba queda una
 * línea: cuántas correcciones y la fecha de la última. Lo que ese aviso no puede
 * hacer es mentir por omisión —decir «la última» de una que no lo es— ni apuntar
 * a un ancla que el registro no tiene. Se comprueba contra los snapshots
 * PUBLICADOS, no contra una lista escrita aquí.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ANCLA_CORRECCIONES,
  CorrectionNote,
  CorrectionNotice,
} from '../../src/components/reportajes/CorrectionNote'
import { REPORTAJE_SLUGS } from '../../src/reportajes'

const meta = (slug) =>
  JSON.parse(readFileSync(join(__dirname, '../../public/data/reportajes', `${slug}.json`), 'utf8'))
    .meta

describe('el aviso de correcciones', () => {
  it('sin correcciones no pinta nada, ni arriba ni al final', () => {
    expect(renderToStaticMarkup(<CorrectionNotice correcciones={[]} />)).toBe('')
    expect(renderToStaticMarkup(<CorrectionNote correcciones={undefined} />)).toBe('')
  })

  it('una sola va en singular y con su fecha', () => {
    const html = renderToStaticMarkup(
      <CorrectionNotice correcciones={[{ fecha: '2026-08-02', texto: 'Algo.' }]} />,
    )
    expect(html).toContain('Esta pieza tiene una corrección')
    expect(html).toContain('del 2026-08-02')
    expect(html).toContain('verla al final')
  })

  it('«la última» es la fecha más reciente aunque el fichero no esté en orden', () => {
    const html = renderToStaticMarkup(
      <CorrectionNotice
        correcciones={[
          { fecha: '2026-08-13', texto: 'B.' },
          { fecha: '2026-08-02', texto: 'A.' },
        ]}
      />,
    )
    expect(html).toContain('Esta pieza tiene 2 correcciones')
    expect(html).toContain('la última, del 2026-08-13')
  })

  // Contra lo publicado: el aviso de cada pieza apunta al registro de esa pieza,
  // y el recuento del aviso es el número de correcciones del registro.
  for (const slug of REPORTAJE_SLUGS) {
    it(`«${slug}»: el aviso cuenta y enlaza el registro del final`, () => {
      const c = meta(slug).correcciones ?? []
      const aviso = renderToStaticMarkup(<CorrectionNotice correcciones={c} />)
      const registro = renderToStaticMarkup(<CorrectionNote correcciones={c} />)
      if (!c.length) {
        expect(aviso).toBe('')
        return
      }
      const masReciente = [...c]
        .map((x) => x.fecha)
        .sort()
        .at(-1)
      expect(aviso).toContain(`href="#${ANCLA_CORRECCIONES}"`)
      expect(aviso).toContain(masReciente)
      expect(aviso).toContain(c.length === 1 ? 'una corrección' : `${c.length} correcciones`)
      expect(registro).toContain(`id="${ANCLA_CORRECCIONES}"`)
      // El registro lleva TODAS: ninguna se queda fuera al moverlo al final.
      expect((registro.match(/<details/g) || []).length).toBe(c.length)
    })
  }
})
