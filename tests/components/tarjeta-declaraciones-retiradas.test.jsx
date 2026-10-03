/**
 * La tarjeta de declaraciones de /plenos dice cuántas retiró una persona tras
 * escuchar la sesión, en su propia fila.
 *
 * Una declaración retirada no se sirve, y `totals.retenidas` la cuenta por su
 * tipo junto a las acusaciones que retiene la puerta; la fila de ésas dice
 * «acusaciones públicas sin contrastar». Sin fila propia, la retirada se leería
 * como una acusación más, o no se leería: «una retirada que no se cuenta es
 * indistinguible de una extracción que nunca ocurrió» (/metodologia).
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LOCALES } from '../../src/i18n'
import { TarjetaDeclaraciones } from '../../src/components/plenos/TarjetaDeclaraciones'
import { resumenPlenos } from '../../src/lib/pleno-summary'
import { MOTIVOS_DE_RETIRADA } from '../../src/scraper/declaracion-retirada'

/**
 * El embudo, por el camino real: un manifiesto pasado por `resumenPlenos`.
 *
 * La primera versión lo escribía a mano, y se quedó atrás en cuanto #209 le
 * añadió `noConsta`: la tarjeta pintaba `undefined` y la prueba reventaba por
 * una forma recitada, no por la fila que mide (docs/DATA_INTEGRITY.md, regla 1).
 */
const embudo = (retiradas) =>
  resumenPlenos({
    manifest: {
      plenos: [{ plenoId: 'a' }, { plenoId: 'b' }],
      totals: {
        items: 56,
        byVerdict: { 'sin-datos': 52, parcial: 3, verificado: 1 },
        retenidas: { acusacion_publica: 20, cita_obra: 1, cita_convenio: 1 },
        retenidasSinProcedencia: 1,
        retiradas,
        sinDatosPorque: { sinCorpus: 30, comprobadoSinHallar: 20, noConsta: 2 },
      },
    },
  }).embudo

const monta = (retiradas) =>
  render(
    <MemoryRouter>
      <TarjetaDeclaraciones embudo={embudo(retiradas)} />
    </MemoryRouter>,
  )

describe('la fila de las retiradas tras escuchar', () => {
  it('sale con su cifra cuando hay alguna', () => {
    const { container } = monta({ 'literal-no-dicho': 2 })
    const rotulo = CATALOGUE.es['plenos.indice.decl.retirada.literal-no-dicho']
    const span = [...container.querySelectorAll('span')].find((s) => s.textContent === rotulo)
    expect(span, 'la tarjeta no pinta la fila').toBeTruthy()
    // La cifra va en la misma línea que su rótulo, no en otra fila.
    expect(span.parentElement.textContent).toBe(`${rotulo}2`)
    expect(container.textContent).toContain(
      CATALOGUE.es['plenos.indice.decl.retirada.literal-no-dicho.nota'],
    )
  })

  it('no sale cuando no hay ninguna: no se le explica al lector una categoría vacía', () => {
    for (const retiradas of [{}, undefined, { 'literal-no-dicho': 0 }]) {
      const { container, unmount } = monta(retiradas)
      expect(container.textContent ?? '').not.toContain(
        CATALOGUE.es['plenos.indice.decl.retirada.literal-no-dicho'],
      )
      unmount()
    }
  })

  it('cada motivo del enum tiene rótulo y nota en los dos idiomas', () => {
    // Derivado del enum exportado: un motivo nuevo sin sus cadenas pintaría la
    // clave cruda en la tarjeta.
    for (const m of MOTIVOS_DE_RETIRADA) {
      for (const loc of LOCALES) {
        expect(CATALOGUE[loc][`plenos.indice.decl.retirada.${m}`], `${loc} · ${m}`).toBeTruthy()
        expect(
          CATALOGUE[loc][`plenos.indice.decl.retirada.${m}.nota`],
          `${loc} · ${m}`,
        ).toBeTruthy()
      }
    }
  })
})
