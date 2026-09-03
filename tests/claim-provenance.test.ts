import { describe, it, expect } from 'vitest'
import {
  classifyClaimProvenance,
  classifyAttribution,
  tallyProvenance,
  type ProvenanceOutcome,
} from '../src/scraper/claim-provenance'

/**
 * Nadie comprobaba las DECLARACIONES contra su transcripción.
 *
 * `check:finding-quotes` cubre las citas de los hallazgos —la prosa curada— y
 * lo hace bien. Las 4.664 declaraciones publicadas no las miraba nadie, y el
 * 3-sep-2026 la cuenta salió así: **1.564 (33 %) sólo se encuentran en la
 * transcripción SUPERSEDED**, 24 en ninguna de las dos, 291 atribuciones que la
 * evidencia actual ya no sostiene y 4 que nombran el partido EQUIVOCADO.
 *
 * La causa: cuatro sesiones se re-transcribieron después de extraer sus
 * declaraciones, y nada re-derivó ni las citas ni las atribuciones.
 *
 * CUATRO desenlaces, no dos, y el cuarto es el que importa: «no hay
 * transcripción» NO es «no encontré la cita». Doblar el uno dentro del otro es
 * cómo una puerta imprime su propio visto bueno — la regla 2 de
 * DATA_INTEGRITY, y el defecto `r?.findings ?? []` otra vez.
 */

const CUR =
  '[0.0 → 5.0] (SPEAKER_00) el presupuesto de dos mil veintisiete sube un cuatro por ciento\n'
const OLD = '[0.0 → 5.0] (SPEAKER_00) la partida de festes es de vint mil euros enguany\n'

describe('scraper/claim-provenance — classifyClaimProvenance', () => {
  it('la cita está en la transcripción vigente', () => {
    const r = classifyClaimProvenance({
      verbatim: 'el presupuesto de dos mil veintisiete sube un cuatro por ciento',
      current: CUR,
      superseded: OLD,
    })
    expect(r).toBe<ProvenanceOutcome>('vigente')
  })

  it('EL CASO DE LOS 1.564: sólo aparece en la superseded', () => {
    const r = classifyClaimProvenance({
      verbatim: 'la partida de festes es de vint mil euros enguany',
      current: CUR,
      superseded: OLD,
    })
    // No es una cita inventada: la procedencia existe, es la versión anterior.
    // Por eso NO bloquea — pero se cuenta y se dice.
    expect(r).toBe<ProvenanceOutcome>('solo-superseded')
  })

  it('EL CASO DE LOS 24: no está en ninguna de las dos', () => {
    const r = classifyClaimProvenance({
      verbatim: 'esto no lo dijo nadie en ninguna version del acta',
      current: CUR,
      superseded: OLD,
    })
    expect(r).toBe<ProvenanceOutcome>('sin-rastro')
  })

  it('SIN TRANSCRIPCIÓN no es SIN RASTRO — el cuarto desenlace', () => {
    // Si no hay acta que leer, no hemos comprobado nada. Llamar a eso
    // «no encontrada» inventa un hallazgo; llamarlo «vigente» inventa un
    // visto bueno. Es su propia categoría.
    const r = classifyClaimProvenance({
      verbatim: 'cualquier cosa',
      current: null,
      superseded: null,
    })
    expect(r).toBe<ProvenanceOutcome>('sin-transcripcion')
  })

  it('sin superseded, lo que no está en la vigente es sin-rastro', () => {
    const r = classifyClaimProvenance({
      verbatim: 'la partida de festes es de vint mil euros enguany',
      current: CUR,
      superseded: null,
    })
    expect(r).toBe<ProvenanceOutcome>('sin-rastro')
  })

  it('usa el matcher canónico: tolera puntuación y mayúsculas, no reescrituras', () => {
    // `quoteAppearsIn` normaliza — una cita con otra puntuación sigue siendo la
    // misma cita. Lo que NO debe pasar es que una paráfrasis cuele.
    expect(
      classifyClaimProvenance({
        verbatim: '¡El presupuesto de dos mil veintisiete, sube un cuatro por ciento!',
        current: CUR,
        superseded: null,
      }),
    ).toBe<ProvenanceOutcome>('vigente')
    expect(
      classifyClaimProvenance({
        verbatim: 'el presupuesto del ano que viene experimenta un incremento del cuatro',
        current: CUR,
        superseded: null,
      }),
    ).toBe<ProvenanceOutcome>('sin-rastro')
  })
})

describe('scraper/claim-provenance — classifyAttribution', () => {
  it('sin mapa de voces no se juzga la atribución', () => {
    expect(classifyAttribution({ stored: null, fresh: null, hasMap: false })).toBe('sin-mapa')
    // Y tampoco con una atribución guardada: sin mapa no hay con qué cotejarla.
    expect(classifyAttribution({ stored: 'PSOE', fresh: null, hasMap: false })).toBe('sin-mapa')
  })

  it('coincide', () => {
    expect(classifyAttribution({ stored: 'PSOE', fresh: 'PSOE', hasMap: true })).toBe('coincide')
    expect(classifyAttribution({ stored: null, fresh: null, hasMap: true })).toBe('coincide')
  })

  it('EL CASO DE LOS 291: publicamos un bloc que la evidencia ya no sostiene', () => {
    expect(classifyAttribution({ stored: 'PSOE', fresh: null, hasMap: true })).toBe('sin-sosten')
  })

  it('la evidencia sostiene uno que no publicamos: aditivo, no un fallo', () => {
    expect(classifyAttribution({ stored: null, fresh: 'VOX', hasMap: true })).toBe('sin-publicar')
  })

  it('EL CASO DE LOS 4: publicamos el partido EQUIVOCADO', () => {
    // El peor de todos y el único que nombra mal a alguien.
    expect(classifyAttribution({ stored: 'PSOE', fresh: 'PP', hasMap: true })).toBe(
      'partido-distinto',
    )
  })
})

describe('scraper/claim-provenance — tallyProvenance', () => {
  // Las dos condiciones bloqueantes van en FILAS DISTINTAS a propósito: una
  // declaración que falla por dos motivos sigue siendo UNA declaración, y
  // contarla dos veces inflaría el número que se le enseña a un curador.
  const rows = [
    { provenance: 'vigente', attribution: 'coincide' },
    { provenance: 'vigente', attribution: 'sin-sosten' },
    { provenance: 'solo-superseded', attribution: 'coincide' },
    { provenance: 'sin-rastro', attribution: 'coincide' },
    { provenance: 'vigente', attribution: 'partido-distinto' },
    { provenance: 'sin-transcripcion', attribution: 'sin-mapa' },
  ] as const

  it('cuenta cada desenlace por separado', () => {
    const t = tallyProvenance(rows)
    expect(t.provenance).toEqual({
      vigente: 3,
      'solo-superseded': 1,
      'sin-rastro': 1,
      'sin-transcripcion': 1,
    })
    expect(t.attribution['sin-sosten']).toBe(1)
    expect(t.attribution['partido-distinto']).toBe(1)
  })

  it('una fila que falla por DOS motivos se cuenta UNA vez', () => {
    const t = tallyProvenance([
      { provenance: 'sin-rastro', attribution: 'partido-distinto' },
    ] as const)
    expect(t.blocking).toBe(1)
  })

  it('sólo bloquean sin-rastro y partido-distinto', () => {
    // `solo-superseded` NO bloquea: la procedencia existe, es la versión
    // anterior, y una puerta que se equivoca de cada tres es una puerta que
    // todo el mundo se salta. Es la misma línea que traza `check:citations`
    // cuando sólo bloquea con `dead`.
    const t = tallyProvenance(rows)
    expect(t.blocking).toBe(2)
    expect(t.ok).toBe(false)
  })

  it('un corpus sano no bloquea', () => {
    const t = tallyProvenance([
      { provenance: 'vigente', attribution: 'coincide' },
      { provenance: 'solo-superseded', attribution: 'sin-publicar' },
      { provenance: 'sin-transcripcion', attribution: 'sin-mapa' },
    ] as const)
    expect(t.blocking).toBe(0)
    expect(t.ok).toBe(true)
  })

  it('cero filas no es un aprobado', () => {
    // Nada comprobado no es nada mal. Sin esto, un corpus que no se carga
    // imprime el visto bueno más limpio del repositorio.
    const t = tallyProvenance([])
    expect(t.total).toBe(0)
    expect(t.ok).toBe(false)
    expect(t.motivo).toMatch(/ninguna declaraci/i)
  })
})
