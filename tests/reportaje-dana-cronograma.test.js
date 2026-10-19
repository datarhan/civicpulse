/**
 * La gráfica «Contratos con referencia DANA, por mes» suma lo mismo que los
 * totales de la pieza.
 *
 * La corrección del 02-08-2026 recalculó `totals` (2,24 M€ / 73 → 2,75 M€ /
 * 75) y dejó `timelineFull` con la serie del 06-07: la gráfica sumaba la cifra
 * vieja junto a la nueva, y marzo de 2026 salía a cero aunque el lede cuenta el
 * contrato de 445.313 € adjudicado ese mes (revisión lectora, 18-10-2026). Las
 * dos cifras eran ciertas para su versión, y ninguna guarda las comparaba.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const R = JSON.parse(
  readFileSync(join(__dirname, '..', 'public/data/reportajes/reconstruccion-dana.json'), 'utf8'),
)
const suma = (serie) => Math.round(serie.reduce((s, m) => s + m.amount, 0) * 100) / 100
const cuenta = (serie) => serie.reduce((s, m) => s + m.count, 0)

describe('reconstruccion-dana · la gráfica por mes y los totales', () => {
  it('la premisa medida: la serie publicada antes NO cuadraba con los totales', () => {
    // Sin esto, la prueba de abajo pasaría en verde sobre una serie que nadie
    // ha comparado con nada.
    expect(R.timelinePublicadoOriginal.length).toBeGreaterThan(0)
    expect(suma(R.timelinePublicadoOriginal)).not.toBe(R.totals.danaAmount)
  })

  it('la serie vigente suma los contratos y el importe DANA de los totales', () => {
    expect(suma(R.timelineFull)).toBe(R.totals.danaAmount)
    expect(cuenta(R.timelineFull)).toBe(R.totals.danaContracts)
  })

  it('marzo de 2026 lleva el contrato que cuenta el lede', () => {
    const marzo = R.timelineFull.find((m) => m.month === '2026-03')
    expect(marzo.amount).toBeGreaterThanOrEqual(445313)
  })
})
