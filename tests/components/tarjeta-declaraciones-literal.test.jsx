/**
 * La tarjeta de declaraciones de /plenos dice cuántas retiene la puerta porque
 * su literal no es lo que se dijo —traducido por el motor sustituido, o
 * inventado—, en su propia fila. Sin ella, `totals.retenidas` las contaría
 * bajo «acusaciones públicas sin contrastar».
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LOCALES } from '../../src/i18n'
import { TarjetaDeclaraciones } from '../../src/components/plenos/TarjetaDeclaraciones'
import { resumenPlenos } from '../../src/lib/pleno-summary'
import { MOTIVOS_LITERAL_NO_SERVIBLE } from '../../src/scraper/literal-no-servible'

const monta = (porMotivo) =>
  render(
    <MemoryRouter>
      <TarjetaDeclaraciones
        embudo={
          resumenPlenos({
            manifest: {
              plenos: [{ plenoId: 'a' }],
              totals: {
                items: 56,
                byVerdict: { 'sin-datos': 52, parcial: 3, verificado: 1 },
                retenidas: { acusacion_publica: 20, cita_obra: 3 },
                retenidasSinProcedencia: 0,
                literalNoServible: porMotivo && {
                  porMotivo,
                  evaluadas: 60,
                  sinVigente: 0,
                  sinJuzgar: {},
                },
                sinDatosPorque: { sinCorpus: 30, comprobadoSinHallar: 20, noConsta: 2 },
              },
            },
          }).embudo
        }
      />
    </MemoryRouter>,
  )

describe('la fila de los literales que no son lo que se dijo', () => {
  it('sale con su cifra, y la de retenidas por la puerta deja de contarlas', () => {
    const { container } = monta({ 'literal-traducido': 2, 'literal-alucinado': 1 })
    const spans = [...container.querySelectorAll('span')]
    const fila = (clave) => spans.find((s) => s.textContent === CATALOGUE.es[clave])
    expect(fila('plenos.indice.decl.literal-traducido').parentElement.textContent).toBe(
      `${CATALOGUE.es['plenos.indice.decl.literal-traducido']}2`,
    )
    expect(fila('plenos.indice.decl.literal-alucinado').parentElement.textContent).toBe(
      `${CATALOGUE.es['plenos.indice.decl.literal-alucinado']}1`,
    )
    expect(fila('plenos.indice.decl.retenidas').parentElement.textContent).toBe(
      `${CATALOGUE.es['plenos.indice.decl.retenidas']}20`,
    )
  })

  it('no sale sin ninguna, ni con un manifiesto anterior', () => {
    for (const porMotivo of [undefined, { 'literal-traducido': 0, 'literal-alucinado': 0 }]) {
      const { container, unmount } = monta(porMotivo)
      expect(container.textContent).not.toContain(
        CATALOGUE.es['plenos.indice.decl.literal-traducido'],
      )
      unmount()
    }
  })

  it('cada motivo tiene rótulo y nota en los dos idiomas', () => {
    for (const m of MOTIVOS_LITERAL_NO_SERVIBLE)
      for (const loc of LOCALES) {
        expect(CATALOGUE[loc][`plenos.indice.decl.${m}`], `${loc} · ${m}`).toBeTruthy()
        expect(CATALOGUE[loc][`plenos.indice.decl.${m}.nota`], `${loc} · ${m}`).toBeTruthy()
      }
  })
})
