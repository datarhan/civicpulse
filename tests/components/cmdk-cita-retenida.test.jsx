/**
 * El buscador rápido no imprime el literal que /hallazgos retiene.
 *
 * Desde el 27-08-2026, por decisión del operador (`citaRetenida`, en
 * PlenoFindings.jsx), una cita a la que la puerta editorial da `hidden` se pinta
 * en /hallazgos como el hueco «Literal retenido», y `CONTRAST_MEANING.hidden`
 * —que se sirve en finding-quote-provenance.json— dice que su literal no se
 * imprime en la página, ni en /plenos ni en /hallazgos. Pero CmdK, montado en
 * todas las rutas y también en /hallazgos, rotulaba cada ficha con los 80
 * primeros caracteres de su PRIMERA cita, detrás del grupo al que se atribuye,
 * sin preguntar nunca a la puerta: el buscador imprimía lo que la ficha de al
 * lado retiene. Medido el 28-09-2026, ocho fichas tenían retenida la primera.
 *
 * Qué citas están retenidas se lee de los dos ficheros reales con el mismo
 * predicado que la página —`provenanceFor` y `citaRetenida`, nunca la
 * comparación copiada aquí (docs/DATA_INTEGRITY.md, regla 1)—. Los dos se
 * sirven también al buscador por el fetch simulado, para que la prueba valga
 * igual el día que el buscador consulte la puerta en vez de no imprimir citas.
 *
 * Los fallos nombran la ficha y el índice de la cita, nunca su texto: el
 * repositorio es público y los registros de la CI también, así que un mensaje
 * que citara el literal lo imprimiría en otro sitio más.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CmdK } from '../../src/components/CmdK'
import { citaRetenida } from '../../src/components/PlenoFindings'
import { provenanceFor } from '../../src/hooks/useFindingQuoteProvenance'
import { installFetchMock } from '../setup/mockFetch'

const ROOT = join(__dirname, '..', '..')
const leer = (fichero) => JSON.parse(readFileSync(join(ROOT, 'public/data', fichero), 'utf8'))
const HALLAZGOS = leer('pleno-findings.json')
const PROCEDENCIA = leer('finding-quote-provenance.json')

const DATOS = {
  '/data/officials.json': { generatedAt: 'x', officials: [], formerOfficials: [] },
  '/data/promises.json': { generatedAt: 'x', items: [] },
  '/data/quejas.json': {
    generatedAt: 'x',
    stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
    items: [],
  },
  '/data/pleno-findings.json': HALLAZGOS,
  '/data/finding-quote-provenance.json': PROCEDENCIA,
}

/** Cada cita retenida, con su ficha: lo que el buscador no debe imprimir. */
const RETENIDAS = HALLAZGOS.items.flatMap((ficha) => {
  const prov = provenanceFor(PROCEDENCIA, ficha.id)
  return (ficha.quotes ?? []).flatMap((q, indice) =>
    citaRetenida(prov[indice]) ? [{ ficha, indice, texto: q.text }] : [],
  )
})

/** Las fichas con alguna cita retenida, una vez cada una. */
const FICHAS = [...new Set(RETENIDAS.map((r) => r.ficha))]

/**
 * Tramos de 30 caracteres, solapados a mitad. Un recorte deja el principio de la
 * cita, y el primer tramo lo caza; cualquier otro trozo impreso de 44 caracteres
 * contiene uno entero. Una cita más corta es su propio tramo.
 */
const TRAMO = 30
function tramos(texto) {
  if (texto.length <= TRAMO) return [texto]
  const out = []
  for (let i = 0; i + TRAMO <= texto.length; i += TRAMO / 2) out.push(texto.slice(i, i + TRAMO))
  return out
}

const etiqueta = (r) => `${r.ficha.id} · cita ${r.indice}`

function abrir() {
  installFetchMock(DATOS)
  render(
    <MemoryRouter>
      <CmdK open onOpen={() => {}} onClose={() => {}} />
    </MemoryRouter>,
  )
  return screen.getByPlaceholderText('Saltar a…')
}

describe('CmdK no imprime el literal de una cita retenida', () => {
  it('hay citas retenidas que medir', () => {
    // Sin esto, las dos de abajo pasarían sin mirar nada.
    expect(RETENIDAS.length).toBeGreaterThan(0)
  })

  it('buscada por su título, ninguna ficha deja ver un tramo de sus literales retenidos', async () => {
    const campo = abrir()
    const fugas = new Set()
    for (const ficha of FICHAS) {
      fireEvent.change(campo, { target: { value: ficha.title } })
      // El control: la fila de la ficha está pintada y con su renglón de
      // contexto, que es donde iba la cita (la fecha va en él). Sin fila, «no
      // aparece» lo cumpliría un buscador que no encuentra nada.
      const fila = (await screen.findByText(ficha.title)).closest('button')
      expect(fila?.textContent, `${ficha.id} sin renglón de contexto`).toContain(ficha.plenoDate)
      // No `not.toContain(tramo)`: su mensaje de fallo imprimiría el literal.
      const dialogo = screen.getByRole('dialog').textContent ?? ''
      for (const r of RETENIDAS) {
        if (tramos(r.texto).some((t) => dialogo.includes(t))) fugas.add(etiqueta(r))
      }
    }
    expect([...fugas]).toEqual([])
  })

  it('las palabras de un literal retenido no encuentran su ficha', async () => {
    // El renglón de contexto no sólo se pinta: también es lo que se busca. Un
    // buscador que dejara de imprimir el literal y lo siguiera indexando seguiría
    // contestando qué ficha lo contiene a quien teclee sus palabras.
    const campo = abrir()
    // El control: con el índice cargado, la ficha sí sale por su título.
    fireEvent.change(campo, { target: { value: RETENIDAS[0].ficha.title } })
    await screen.findByText(RETENIDAS[0].ficha.title)
    const señaladas = []
    for (const r of RETENIDAS) {
      fireEvent.change(campo, { target: { value: tramos(r.texto)[0] } })
      if (screen.queryByText(r.ficha.title)) señaladas.push(etiqueta(r))
    }
    expect(señaladas).toEqual([])
  })
})
