import { describe, it, expect } from 'vitest'
import { canonicalizeDepartment } from '../src/scraper/departments'

/**
 * The corporation conducts its plenos in Valencian — agenda items arrive as
 * "MEDI AMBIENT, Expedient 4297/2024/GEN – …" — while the rule table was
 * Spanish-only. 2 of 24 real Valencian department names resolved, which is why
 * 328 of 362 agenda items reached no concejalía and 91% of council business was
 * invisible on the department and councillor pages.
 *
 * These are exact department names as the ayuntamiento writes them, not fuzzy
 * inference, so there is no attribution risk in matching them.
 */
describe('departments — Valencian department names', () => {
  const cases: Array<[string, string]> = [
    ['Medi Ambient', 'medio-ambiente'],
    ['MEDI AMBIENT', 'medio-ambiente'],
    ['Urbanisme', 'urbanismo'],
    ['Servicis Socials', 'servicios-sociales'],
    ['Serveis Socials', 'servicios-sociales'],
    ['Joventut', 'juventud'],
    ['Igualtat', 'igualdad'],
    ['Contractació', 'contratacion'],
    ['Intervenció', 'hacienda'],
    ['Hisenda', 'hacienda'],
    ['Benestar Animal', 'bienestar-animal'],
    ['Innovació', 'innovacion'],
    ['Educació', 'educacion'],
    ['Esports', 'deportes'],
    ['Comerç', 'comercio'],
    ['Ocupació', 'empleo-economia'],
    ['Seguretat Ciutadana', 'seguridad'],
    ['Servicis Jurídics', 'servicios-generales'],
    ['Festes', 'fiestas'],
    ['Turisme', 'turismo'],
    ['Habitatge', 'vivienda'],
    ['Participació', 'transparencia'],
    ['Obres Públiques', 'obras-publicas'],
    ['Mobilitat', 'movilidad'],
    ['Majors', 'mayores'],
    ['Comunicació', 'comunicacion'],
  ]

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(canonicalizeDepartment(input)).toBe(expected)
    })
  }

  it('still resolves the Spanish forms', () => {
    expect(canonicalizeDepartment('Medio Ambiente')).toBe('medio-ambiente')
    expect(canonicalizeDepartment('Servicios Sociales')).toBe('servicios-sociales')
    expect(canonicalizeDepartment('Hacienda')).toBe('hacienda')
  })

  it('resolves a real agenda-item prefix', () => {
    expect(canonicalizeDepartment('MEDI AMBIENT, Expedient 4297/2024/GEN')).toBe('medio-ambiente')
  })
})

describe('canonicalizeDepartment — specificity beats table order', () => {
  it('files a treasury payment-period report under hacienda, not comercio', () => {
    // Real agenda item. The Valencian stem `comerc` (comerç) matched "deuda
    // comercial" and, sitting higher in the table under first-match-wins, beat
    // the exact `tesoreria` rule in the very same string.
    expect(
      canonicalizeDepartment(
        'TESORERIA, Expedient: 4929/2023/GEN, Informe sobre el Período Medio de Pago a proveedores y seguimiento de deuda comercial',
      ),
    ).toBe('hacienda')
  })

  it('does not file a squatting motion under empleo y economía', () => {
    // `ocupacio` (Valencian for employment) matched the Spanish "ocupación",
    // which here means squatting.
    expect(
      canonicalizeDepartment(
        'Moción del Grupo Municipal Popular para adherirse a la Red de municipios afectados por la ocupación (Xarxa MAO)',
      ),
    ).not.toBe('empleo-economia')
  })

  it('does not file a contract penalty under recursos humanos', () => {
    // `personal` matched "mitjans personals i materials" — means of
    // performance, not staffing.
    expect(
      canonicalizeDepartment(
        "Penalitat imposada al contractista per incompliment de l'adscripció de mitjans personals i materials",
      ),
    ).not.toBe('recursos-humanos')
  })
})
