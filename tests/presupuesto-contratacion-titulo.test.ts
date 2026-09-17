import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../src/i18n'

/**
 * /presupuesto titulaba la contratación «Lo que se adjudica con este dinero», y la
 * entradilla de debajo decía lo contrario: que esos cuatro recuentos no son el reparto
 * del presupuesto de arriba, porque la contratación se acumula a lo largo de varios
 * ejercicios. El lector se quedaba con el título, y la revisión lectora lo señaló el
 * 15-09-2026.
 */
const ATA_AL_PRESUPUESTO = { es: /con este dinero/i, ca: /amb estos diners/i }
const NIEGA_EL_REPARTO = {
  es: /no son el reparto del presupuesto/i,
  ca: /no són el repartiment del pressupost/i,
}

describe('la contratación de /presupuesto no se titula como el reparto que su entradilla niega', () => {
  for (const idioma of ['es', 'ca'] as const) {
    it(idioma, () => {
      const tabla = CATALOGUE[idioma] as unknown as Record<string, string>
      // Mide algo: la entradilla sigue negando que sea el reparto del presupuesto.
      expect(tabla['presupuesto.contra.intro']).toMatch(NIEGA_EL_REPARTO[idioma])
      expect(tabla['presupuesto.contra.title']).not.toMatch(ATA_AL_PRESUPUESTO[idioma])
      expect(tabla['presupuesto.contra.eyebrow']).not.toMatch(ATA_AL_PRESUPUESTO[idioma])
    })
  }
})
