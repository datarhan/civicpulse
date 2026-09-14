import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La barra «Verificación de declaraciones» de la ficha de una concejalía no
 * redondea a «0 %» una proporción que no es cero.
 *
 * La revisión lectora de /departamentos/urbanismo lo señaló el 14-09-2026 con
 * los datos publicados: 2 declaraciones contrastadas de 1.005, y la barra decía
 * «0% con evidencia · 1005 en total», debajo del nombre de quien dirige el área.
 * Un lector concluye que no hay ninguna, y hay dos: `Math.round(0,2)` es 0.
 *
 * El criterio es el de la cobertura del gasto situado del mapa (`MoneyCoverage`):
 * lo que no es cero se publica como «<1 %», y lo que no es el total como
 * «>99 %». Un cero de verdad sigue siendo «0 %» —ése es el control—, porque
 * esconder un cero real sería el defecto del revés.
 */
function monta(byTopicVerdict) {
  installFetchMock({
    '/data/officials.json': { officials: [] },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: [] },
    '/data/quejas.json': { stats: { total: 0 }, items: [] },
    '/data/pleno-claims/index.json': {
      plenos: [],
      totals: { items: 0, byVerdict: {}, byTopicVerdict },
    },
  })
  return render(
    <MemoryRouter initialEntries={['/departamentos/urbanismo']}>
      <Routes>
        <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** El titular de la barra: la cifra grande y su «con evidencia · N en total». */
async function titular() {
  // En la ficha hay DOS textos iguales: el de la barra y el antetítulo de la
  // sección de afirmaciones. El de la barra es un <span>.
  const rotulo = await screen.findByText('Contraste con los datos', { selector: 'span' })
  return rotulo.parentElement
}

/** Un «0%» o un «100%» que no lleva delante «<» ni «>». */
const CERO_ESCRITO = /(^|[^<>\d])0%/
const TOTAL_ESCRITO = /(^|[^<>\d])100%/

describe('/departamentos/:slug · la proporción de declaraciones con evidencia', () => {
  it('2 de 1.005 no es «0 %»: se publica «<1 %»', async () => {
    monta({ urbanismo: { verificado: 1, contradicho: 1, 'sin-datos': 1003 } })
    const t = await titular()
    // Mide algo: la barra ha leído los 1.005 del manifiesto.
    expect(t.textContent).toContain('1005 en total')
    expect(within(t).getByText('<1%')).toBeInTheDocument()
    expect(t.textContent, 'dos declaraciones contrastadas no son ninguna').not.toMatch(CERO_ESCRITO)
  })

  it('1.004 de 1.005 no es «100 %»: se publica «>99 %»', async () => {
    monta({ urbanismo: { verificado: 1004, 'sin-datos': 1 } })
    const t = await titular()
    expect(within(t).getByText('>99%')).toBeInTheDocument()
    expect(t.textContent, 'falta una: no es el total').not.toMatch(TOTAL_ESCRITO)
  })

  it('EL CONTROL: un cero de verdad sigue siendo «0 %»', async () => {
    monta({ urbanismo: { 'sin-datos': 4 } })
    expect(within(await titular()).getByText('0%')).toBeInTheDocument()
  })

  it('y una proporción corriente se redondea como siempre', async () => {
    monta({ urbanismo: { verificado: 1, 'sin-datos': 1 } })
    expect(within(await titular()).getByText('50%')).toBeInTheDocument()
  })
})

/**
 * Las declaraciones de la ficha se agrupan por TEMA (`deptSlugToClaimTopics`), las
 * dijera quien las dijera, y la atribución es de bloque. La barra iba justo debajo
 * del nombre de quien dirige el área y la lista se titulaba «Afirmaciones de esta
 * concejalía en plenos»: se leían como suyas.
 */
describe('/departamentos/:slug · las declaraciones se leen por tema, no por persona', () => {
  const AVISO = 'Las pronunció cualquier grupo municipal, no necesariamente quien dirige el área'

  it('la barra vive en la sección que dice de quién son las palabras, detrás de las quejas', async () => {
    monta({ urbanismo: { parcial: 2, 'sin-datos': 1003 } })
    const rotulo = await titular()
    const seccion = screen.getByText(AVISO, { exact: false }).closest('section')
    expect(seccion, 'el aviso no está dentro de una sección').not.toBeNull()
    expect(seccion.contains(rotulo), 'la barra no está junto al aviso').toBe(true)
    const quejas = screen.getByText('Quejas ciudadanas activas')
    expect(quejas.compareDocumentPosition(rotulo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('y el título ya no dice «de esta concejalía»', async () => {
    const { container } = monta({ urbanismo: { parcial: 2, 'sin-datos': 1003 } })
    await titular()
    expect(container.textContent).not.toMatch(/de esta concejalía en plenos/i)
    expect(container.textContent).toContain('Lo que se dijo en pleno sobre los temas de esta área')
  })
})
