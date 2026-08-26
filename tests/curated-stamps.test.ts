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

import {
  selloEnDiff,
  selloEsDeDia,
  contenidoCambioTrasElSello,
} from '../scripts/check-curated-stamps'
import { soloCambiaElSello, selloParaFecha } from '../scripts/restamp-curated'
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

// ---------------------------------------------------------------------------
// Un sello con fecha PERO SIN HORA no se puede juzgar por horas.
//
// `competencias.json` sella `2026-08-23T00:00:00.000Z` — medianoche exacta, dos
// revisiones seguidas: su convención es el DÍA, no el instante. Comparado
// contra la hora del commit (20:37 del MISMO día) salía «caduco por 18,6 h», y
// el arreglo habría sido inventarle una hora a un fichero que a propósito no la
// tiene. Un fichero curado a mano no puede prometer una precisión que su propio
// formato no guarda.
// ---------------------------------------------------------------------------
describe('granularidad del sello', () => {
  it('reconoce un sello de día por su medianoche exacta', () => {
    expect(selloEsDeDia('2026-08-23T00:00:00.000Z')).toBe(true)
    expect(selloEsDeDia('2026-08-23T20:37:06.000Z')).toBe(false)
    expect(selloEsDeDia('')).toBe(false)
  })

  it('EL CASO REAL: sello de día y commit esa misma tarde NO es caduco', () => {
    expect(
      contenidoCambioTrasElSello('2026-08-23T00:00:00.000Z', '2026-08-23T20:37:06+02:00'),
    ).toBe(false)
  })

  it('pero un día después sí lo es, aunque el sello sea de día', () => {
    expect(
      contenidoCambioTrasElSello('2026-08-23T00:00:00.000Z', '2026-08-24T07:48:32+02:00'),
    ).toBe(true)
  })

  it('con hora en el sello se compara por instante, no por día', () => {
    // area-fit sella con hora: un cambio esa misma tarde SÍ deja el sello atrás.
    expect(contenidoCambioTrasElSello('2026-08-04T16:23:46.032Z', '2026-08-04T19:00:00Z')).toBe(
      true,
    )
    expect(contenidoCambioTrasElSello('2026-08-04T16:23:46.032Z', '2026-08-04T10:00:00Z')).toBe(
      false,
    )
  })
})

// ---------------------------------------------------------------------------
// El CLI de re-sellado.
//
// Mover un sello a mano lo deniega `guard-curated-writes`, y con razón. Pero
// ninguno de los CLI que sí pueden escribir un curado sabe hacer SÓLO esto, así
// que no había puerta para «este sello quedó atrás». Ésta es esa puerta, y lo
// único que la hace segura es que no pueda colarse nada más por ella.
// ---------------------------------------------------------------------------
describe('restamp — sólo el sello', () => {
  it('acepta mover únicamente generatedAt', () => {
    const a = { generatedAt: '2026-07-06T07:00:10.767Z', items: [1, 2], v: 'x' }
    expect(soloCambiaElSello(a, { ...a, generatedAt: '2026-08-02T12:00:00.000Z' })).toBe(true)
  })

  it('RECHAZA cualquier otro cambio, por pequeño que sea', () => {
    // Si esto pasa a verde, el CLI se convierte en una puerta trasera para
    // editar un curado saltándose su validador — que es justo lo que el gancho
    // de escrituras curadas existe para impedir.
    const a = { generatedAt: '2026-07-06T07:00:10.767Z', items: [1, 2] }
    expect(
      soloCambiaElSello(a, { ...a, generatedAt: '2026-08-02T12:00:00.000Z', items: [1] }),
    ).toBe(false)
    expect(soloCambiaElSello(a, { ...a, nuevo: true })).toBe(false)
  })
})

describe('restamp — conserva la granularidad del fichero', () => {
  it('un sello de día se re-sella al DÍA del contenido, sin inventarle hora', () => {
    expect(selloParaFecha('2026-08-23T00:00:00.000Z', '2026-08-24T07:48:32+02:00')).toBe(
      '2026-08-24T00:00:00.000Z',
    )
  })

  it('un sello con hora se re-sella al INSTANTE del contenido', () => {
    expect(selloParaFecha('2026-08-04T16:23:46.032Z', '2026-08-24T07:48:32+02:00')).toBe(
      '2026-08-24T05:48:32.000Z',
    )
  })

  it('una fecha ilegible no se convierte en un sello inventado', () => {
    expect(() => selloParaFecha('2026-08-04T16:23:46.032Z', 'no es fecha')).toThrow()
  })
})
