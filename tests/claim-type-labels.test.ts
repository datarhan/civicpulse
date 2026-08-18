import { describe, it, expect } from 'vitest'
import { ALLOWED_CLAIM_TYPES } from '../src/scraper/pleno-claim'
import { CLAIM_TYPE_LABEL, CLAIM_TYPE_TONE } from '../src/hooks/usePlenoClaims'

/**
 * Los mapas de tipo→etiqueta/tono de /declaraciones y ClaimLedger son JS plano
 * sin tipar, y su fallback (`CLAIM_TYPE_LABEL[c.type] ?? c.type`) pinta el valor
 * crudo del enum: un ClaimType nuevo sin entrada no rompe nada — sale
 * «valoracion_politica» en un chip de producción. El enum se importa, nunca se
 * restata (docs/DATA_INTEGRITY.md regla 1), así que ampliar ClaimType sin tocar
 * los mapas pone este test en rojo, que es su único trabajo.
 */
describe('CLAIM_TYPE_LABEL / CLAIM_TYPE_TONE cubren el enum entero', () => {
  const labels: Record<string, string | undefined> = CLAIM_TYPE_LABEL
  const tones: Record<string, string | undefined> = CLAIM_TYPE_TONE

  it('cada ClaimType tiene etiqueta legible y tono', () => {
    for (const t of ALLOWED_CLAIM_TYPES) {
      expect(labels[t], `etiqueta de ${t}`).toBeTruthy()
      expect(labels[t], `la etiqueta de ${t} no puede ser el valor crudo del enum`).not.toBe(t)
      expect(tones[t], `tono de ${t}`).toBeTruthy()
    }
  })

  it('control: los mapas no llevan claves fuera del enum (typos se ven aquí)', () => {
    const allowed = new Set<string>(ALLOWED_CLAIM_TYPES)
    for (const k of [...Object.keys(labels), ...Object.keys(tones)]) {
      expect(allowed.has(k), `clave desconocida ${k}`).toBe(true)
    }
  })
})
