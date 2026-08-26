/**
 * Contrato de `check:stamps`.
 *
 * Lo que vigila la puerta: que un fichero curado no publique una fecha
 * anterior al contenido que sella. Pasó de verdad — `c66cf931` retiró una
 * acusación de `promises.json` el 2 de agosto y dejó `generatedAt` en el 6 de
 * julio— y era invisible porque `check:cadence` mide la EDAD del sello, y un
 * sello que no se mueve simplemente envejece dentro de su plazo.
 */
import { describe, expect, it } from 'vitest'

import { selloEnDiff } from '../scripts/check-curated-stamps'
import { CURATED } from '../.claude/hooks/curated-paths.mjs'

describe('selloEnDiff', () => {
  it('ve el sello cuando el diff lo mueve', () => {
    const diff = [
      '@@ -1,1 +1,1 @@',
      '-  "generatedAt": "2026-07-06T07:00:10.767Z",',
      '+  "generatedAt": "2026-08-02T11:20:00.000Z",',
    ].join('\n')
    expect(selloEnDiff(diff)).toBe(true)
  })

  it('LA TRAMPA: una línea de CONTEXTO no es una línea cambiada', () => {
    // Con el contexto por defecto de `git show`, `generatedAt` sale en casi
    // cualquier diff del principio del fichero — precedido de un ESPACIO, no
    // de `+`/`-`. Si esto contase, la puerta daría verde siempre y sería otra
    // comprobación que informa de cero por no mirar. Por eso el script pide
    // `--unified=0`, y por eso el patrón exige `+`/`-` en la columna cero.
    const diff = [
      '@@ -1,4 +1,4 @@',
      '   "generatedAt": "2026-07-06T07:00:10.767Z",',
      '-  "status": "en-progreso",',
      '+  "status": "documentada",',
    ].join('\n')
    expect(selloEnDiff(diff)).toBe(false)
  })

  it('un cambio de contenido sin sello es exactamente el defecto', () => {
    const diff = ['@@ -12,2 +12,0 @@', '-      "party": "PSOE",', '-      "claim": "…",'].join('\n')
    expect(selloEnDiff(diff)).toBe(false)
  })

  it('un diff vacío no inventa un sello', () => {
    expect(selloEnDiff('')).toBe(false)
  })

  it('no confunde una clave que sólo empieza igual', () => {
    expect(selloEnDiff('+  "generatedAtSource": "x",')).toBe(false)
  })
})

describe('la lista curada', () => {
  it('sale del hook, no de una copia en esta prueba', () => {
    // Regla 1 de docs/DATA_INTEGRITY.md: seis pruebas recitaron una forma y se
    // quedaron verdes mientras producción no casaba nada. Si esto se
    // desincroniza, que falle aquí y no en silencio.
    const nombres = Object.keys(CURATED as Record<string, string>)
    expect(nombres).toContain('promises.json')
    expect(nombres).toContain('competencias.json')
    expect(nombres.length).toBeGreaterThan(15)
  })
})
