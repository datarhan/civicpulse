import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import ContractsExplorer from '../src/components/Presupuesto/ContractsExplorer'

/**
 * /presupuesto, pestaña «Explorar»: el enlace de un lote abre la ficha del
 * expediente ENTERO, y la fila tiene que decirlo.
 *
 * Visto en el sitio publicado el 18-10-2026: «Accesorios · SATARA SEGURIDAD SL
 * · 3 mar 2022 · 46.020 €». El enlace abre en PLACSP el expediente 23/2020
 * —«suministro de uniformidad y complementos de Policía Local … -3 lotes-»—,
 * cuya única cifra visible es «Presupuesto base de licitación sin impuestos
 * 187.000,00 Euros». Las dos son ciertas: 46.020 € es la adjudicación del lote
 * 2, sin IVA; 187.000 € es el presupuesto base de los tres lotes juntos. La
 * portada ya lo explicaba desde el 16-09 (`src/lib/tender-lotes.js`); este
 * listado, que pinta las mismas filas, no.
 *
 * Se lee la instantánea publicada, no una fixture: el defecto es lo que el
 * lector ve con ESTOS datos.
 */
const d = JSON.parse(readFileSync(join(__dirname, '..', 'public/data/tenders.json'), 'utf8'))
const ENLACE =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TS56A31zHFOmq21uxhbaVQ%3D%3D'

function fila(titulo) {
  const enlace = screen.getByRole('link', { name: titulo })
  return enlace.closest('.cp-contrato-fila')
}

describe('ContractsExplorer — un lote dice de qué es su cifra', () => {
  const hermanas = d.contracts.filter((c) => c.permalink === ENLACE)

  it('mide algo: el expediente 23/2020 sigue en la instantánea con sus tres lotes', () => {
    expect(hermanas.length, 'se fue el expediente 23/2020 de tenders.json').toBe(3)
    const lic = d.tenders.find((t) => t.permalink === ENLACE)
    expect(lic?.numberOfBatches).toBe(3)
    expect(lic?.initialAmountNoTaxes).toBe(187000)
  })

  it('la fila «Accesorios» nombra su lote, el expediente y el presupuesto base del enlace', () => {
    render(<ContractsExplorer contracts={hermanas} tenders={d.tenders} snapshot={null} />)
    const texto = fila('Accesorios').textContent
    expect(texto).toContain('46.020')
    expect(texto).toContain('Lote 2 de 3 (23/2020)')
    expect(texto).toContain('187.000,00')
  })

  it('el aviso sobrevive al filtro: la hermana fuera de la lista sigue siendo hermana', () => {
    // Agrupar sobre lo FILTRADO borraría el aviso justo cuando el lector busca
    // un lote por su nombre: «Accesorios» sola no tendría hermanas.
    render(<ContractsExplorer contracts={hermanas} tenders={d.tenders} snapshot={null} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Accesorios' } })
    expect(fila('Accesorios').textContent).toContain('Lote 2 de 3 (23/2020)')
  })

  it('un contrato de lote único no lleva aviso', () => {
    const grupos = new Map()
    for (const c of d.contracts) grupos.set(c.permalink, (grupos.get(c.permalink) ?? 0) + 1)
    const suelto = d.contracts.find(
      (c) => c.permalink && grupos.get(c.permalink) === 1 && c.batchNumber === 1,
    )
    expect(suelto, 'no queda ningún contrato suelto con batch_number 1').toBeTruthy()
    render(<ContractsExplorer contracts={[suelto]} tenders={d.tenders} snapshot={null} />)
    expect(document.querySelector('.cp-lote-nota')).toBeNull()
  })
})
