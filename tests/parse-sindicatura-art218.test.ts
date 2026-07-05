import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseControlInternoArt218 } from '../src/scraper/sindicatura-findings'

const FIXTURE = join(__dirname, 'fixtures', 'sindicatura_control_interno_eell_2022_excerpt.txt')

describe('scraper/sindicatura-findings — parseControlInternoArt218', () => {
  it("extracts Riba-roja's Art. 218 rendition row (En plazo / ACR / OFP / AI)", () => {
    const row = parseControlInternoArt218(readFileSync(FIXTURE, 'utf8'))
    expect(row).toEqual({
      fechaRegistro: '2023-04-26',
      enPlazo: true, // rendered within the legal deadline
      acr: true, // communicated having acuerdos contrarios a reparos
      ofp: false, // no omisiones de fiscalización previa
      ai: false, // no anomalías de ingresos
    })
  })

  it('does not confuse Riba-roja with an adjacent municipality row', () => {
    // Riola sits right after Riba-roja in the table (Sí Sí No No too, different date).
    const row = parseControlInternoArt218(readFileSync(FIXTURE, 'utf8'))
    expect(row?.fechaRegistro).toBe('2023-04-26') // Riba-roja's date, not Riola's
  })

  it('returns null when the municipality is not in the table', () => {
    expect(
      parseControlInternoArt218('Ayuntamiento Requena Valencia 02/05/2023 Sí No Sí No'),
    ).toBeNull()
  })
})
