/**
 * Lo que firmaron otros sobre una retractación del motor no se pierde cuando
 * el motor la vuelve a escribir.
 *
 * `verify:pleno-claims:engine -- --ids` (re-derivar) y `--recortar` escriben
 * con `entradaDelMotor`/`decidirRecorte` una entrada NUEVA, y
 * `applyOverlayEntries` la ponía entera en lugar de la anterior. Así se iban las
 * correcciones de rótulo (`labelCorrections`, `corregir-rotulo-motor`, PR #254):
 * el 12-10-2026 la re-derivación de #301 tuvo que dejar fuera dos filas,
 * 1qi8axv-017-afi-e2b0f0 y 1tgd1h4-264-cit-367c04, porque reescribirlas borraba
 * la suya. El fixture es la entrada real de las dos en 53403ba7.
 *
 * La entrada vieja no se puede quedar con sus correcciones dentro de la nueva:
 * dicen que el rótulo de AQUELLA se corrigió, no el de ésta, y son anteriores a
 * ella. Pasa lo que pasó con la subida firmada (#289/#290): la entrada nueva
 * guarda la que sustituye en `sustituye` —quién la escribió, cuándo y sus
 * registros firmados—, nunca lo que decía, porque el overlay se sirve.
 *
 * Las enmiendas de la explicación (`reasonAmendments`, `--amend-reason`, PR
 * #183) no llegan a perderse por esta vía: una pasada no reescribe lo que firmó
 * una persona, y el overlay se niega (`explicacionFirmadaPor`).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { entradaDelMotor } from '../src/scraper/entrada-de-pasada'
import { decidirRecorte, retractacionesDelMotor } from '../src/scraper/decision-del-motor'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  mergeVerified,
  validateOverlay,
  verificacionDeBajada,
  type EntradaSustituida,
  type Overlay,
  type OverlayEntry,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import { reasonDigest } from '../src/scraper/pleno-finding'
import type { ClaimVerification } from '../src/scraper/claim-verifier'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

const FX = JSON.parse(
  readFileSync(
    resolve(__dirname, 'fixtures/rederivacion-sobre-rotulo-corregido_2026-10-12.json'),
    'utf8',
  ),
) as { entries: Record<string, OverlayEntry> }

const DANA = '1qi8axv-017-afi-e2b0f0'
const COLONIAS = '1tgd1h4-264-cit-367c04'
const STAMP = '2026-10-13T08:00:00.000Z'
const LUEGO = '2026-10-14T08:00:00.000Z'
const PERSONA = 'María de la Fuente Llorens'

const overlay = (): Overlay => ({
  version: 1,
  generatedAt: '2026-10-12T00:00:00.000Z',
  entries: structuredClone(FX.entries),
})

/** Lo que el motor devuelve al re-derivar: `sin-datos`, producido por él. */
const juicio = (claimId: string, summary: string): ClaimVerification => ({
  claimId,
  verdict: 'sin-datos',
  summary,
  evidence: [],
  checkedAgainst: [],
  derivedBy: ['verdict-engine'],
  confidence: 0.2,
})

const NUEVO_DANA =
  'Ningún contrato publicado recoge 143.539 € para las obras del temporal de lluvias; el más ' +
  'cercano es de 141.562,93 €.'

/** `--ids`, por la vía del guion: `entradaDelMotor` y `applyOverlayEntries`. */
const rederivar = (o: Overlay, id: string, summary: string, stamp = STAMP, modelo = 'claude-code') =>
  applyOverlayEntries(
    o,
    [entradaDelMotor({ verification: juicio(id, summary), modelo, tipo: 'rederivacion' })],
    stamp,
  )

/** La entrada de antes tal como la tiene que guardar la nueva. */
const sustituidaDe = (e: OverlayEntry): EntradaSustituida => ({
  source: 'verdict-engine',
  editor: e.editor,
  appliedAt: e.appliedAt,
  labelCorrections: e.labelCorrections,
})

/** Ni su resumen ni su motivo —ni un trozo— vuelven en lo que se sirve. */
function sinLoQueDecia(servido: unknown, antes: OverlayEntry): void {
  const json = JSON.stringify(servido)
  const resumen = antes.verification.summary
  for (let i = 0; i + 40 <= resumen.length; i += 40) {
    expect(json).not.toContain(resumen.slice(i, i + 40))
  }
  expect(json).not.toContain('re-judged parcial')
}

describe('re-derivar una retractación con el rótulo corregido', () => {
  it('el fixture parte de dos retractaciones del motor con su corrección de rótulo', () => {
    for (const id of [DANA, COLONIAS]) {
      const e = FX.entries[id]
      expect(e.source).toBe('verdict-engine')
      expect(e.labelCorrections?.length).toBe(1)
      expect(e.reasonAmendments).toBeUndefined()
    }
    // Las dos son de las que `--ids` re-deriva.
    expect(retractacionesDelMotor([DANA, COLONIAS], overlay()).targets).toEqual([DANA, COLONIAS])
  })

  it('la entrada nueva guarda la anterior y su corrección en `sustituye`', () => {
    const antes = FX.entries[DANA]
    const o = rederivar(overlay(), DANA, NUEVO_DANA)
    const e = o.entries[DANA]
    expect(e.source).toBe('verdict-engine')
    expect(e.editor).toBe('verdict-engine:claude-code')
    expect(e.verification.summary).toBe(NUEVO_DANA)
    expect(e.appliedAt).toBe(STAMP)
    // La corrección no se queda en la entrada nueva: es de la anterior.
    expect(e.labelCorrections).toBeUndefined()
    expect(e.sustituye).toEqual(sustituidaDe(antes))
    expect(() => validateOverlay(o)).not.toThrow()
  })

  it('el registro no vuelve a servir el resumen ni el motivo sustituidos', () => {
    const antes = FX.entries[DANA]
    const o = rederivar(overlay(), DANA, NUEVO_DANA)
    // El overlay entero se sirve: la entrada nueva no lleva nada de la vieja.
    sinLoQueDecia(o.entries[DANA], antes)
    // Y lo que publica la composición, tampoco.
    const base: VerifiedItem[] = [
      {
        claim: { id: DANA } as unknown as PlenoClaim,
        verification: { ...juicio(DANA, 'resumen de la base'), verdict: 'parcial' },
      },
    ]
    const [publicada] = mergeVerified(base, o).map((i) => i.verification)
    expect(publicada.summary).toBe(NUEVO_DANA)
    sinLoQueDecia(publicada, antes)
  })

  it('re-derivarla otra vez guarda la cadena entera', () => {
    const una = rederivar(overlay(), DANA, NUEVO_DANA)
    const primera = una.entries[DANA]
    const otra = rederivar(una, DANA, `${NUEVO_DANA} Sin otro registro.`, LUEGO)
    expect(otra.entries[DANA].sustituye).toEqual({
      source: 'verdict-engine',
      editor: primera.editor,
      appliedAt: STAMP,
      sustituye: sustituidaDe(FX.entries[DANA]),
    })
    expect(() => validateOverlay(otra)).not.toThrow()
  })

  it('las dos filas de #301 se re-derivan juntas sin perder nada', () => {
    const o = applyOverlayEntries(
      overlay(),
      [
        entradaDelMotor({
          verification: juicio(DANA, NUEVO_DANA),
          modelo: 'claude-code',
          tipo: 'rederivacion',
        }),
        entradaDelMotor({
          verification: juicio(
            COLONIAS,
            'El mantenimiento de viales y espacios públicos no dice dónde se ubican las colonias felinas.',
          ),
          modelo: 'claude-code',
          tipo: 'rederivacion',
        }),
      ],
      STAMP,
    )
    for (const id of [DANA, COLONIAS]) {
      expect(o.entries[id].sustituye).toEqual(sustituidaDe(FX.entries[id]))
    }
  })

  it('una re-derivación sin registros que guardar no escribe `sustituye`', () => {
    const { labelCorrections: _fuera, ...limpia } = structuredClone(FX.entries[DANA])
    const o = rederivar(
      { version: 1, generatedAt: STAMP, entries: { [DANA]: limpia } },
      DANA,
      NUEVO_DANA,
    )
    expect('sustituye' in o.entries[DANA]).toBe(false)
  })
})

describe('recortar una retractación con el rótulo corregido', () => {
  // De las dos filas de #301 ninguna está cortada por `slice(0, 300)`; ésta sí,
  // y también lleva su corrección de rótulo (c8kr44-229-cit-1356bf en 6bee7650).
  const RECORTE = JSON.parse(
    readFileSync(
      resolve(__dirname, 'fixtures/subida-sobre-rotulo-corregido_2026-10-06.json'),
      'utf8',
    ),
  ) as { claimId: string; motor: OverlayEntry }

  it('guarda la corrección de rótulo en `sustituye`', () => {
    const id = RECORTE.claimId
    const antes = RECORTE.motor
    // El razonamiento entero que el recorte lee de la caché: lo publicado son
    // sus 300 primeros caracteres.
    const razonamiento = `${antes.verification.summary}que se citó en el pleno.`
    const r = decidirRecorte({ claimId: id, entrada: antes, razonamientos: [razonamiento] })
    expect(r.accion).toBe('recortar')
    if (r.accion !== 'recortar') return
    const o = applyOverlayEntries(
      { version: 1, generatedAt: antes.appliedAt, entries: { [id]: structuredClone(antes) } },
      [r.entrada],
      STAMP,
    )
    const e = o.entries[id]
    expect(e.editor).toBe(antes.editor)
    expect(e.verification.summary).toBe(r.resumen)
    expect(e.sustituye).toEqual(sustituidaDe(antes))
    expect(() => validateOverlay(o)).not.toThrow()
  })
})

describe('después de re-derivarla', () => {
  it('una bajada de curador encima conserva la cadena', () => {
    const o1 = rederivar(overlay(), DANA, NUEVO_DANA)
    const motivo = 'La cifra citada no aparece en ningún contrato publicado del temporal.'
    const o2 = applyOverlayEntries(
      o1,
      [
        {
          claimId: DANA,
          verification: verificacionDeBajada(DANA, o1.entries[DANA].verification, 'sin-datos', motivo),
          source: 'curator-downgrade',
          reason: motivo,
          editor: PERSONA,
        },
      ],
      LUEGO,
      new Map([[DANA, 'parcial' as const]]),
    )
    const e = o2.entries[DANA]
    expect(e.source).toBe('curator-downgrade')
    expect(e.sustituye?.source).toBe('verdict-engine')
    expect(e.sustituye?.sustituye).toEqual(sustituidaDe(FX.entries[DANA]))
    expect(() => validateOverlay(o2)).not.toThrow()
  })

  it('una enmienda de la explicación deja `sustituye` donde estaba', () => {
    const o1 = rederivar(overlay(), DANA, NUEVO_DANA)
    const { overlay: o2 } = enmendarMotivoDeBajada(
      o1,
      {
        claimId: DANA,
        veredicto: 'sin-datos',
        motivo: 'No consta ningún contrato de 143.539 € por el temporal de lluvias.',
        porque: 'La explicación del motor da una cifra cercana como si fuera la citada.',
        editor: PERSONA,
      },
      LUEGO,
    )
    expect(o2.entries[DANA].sustituye).toEqual(sustituidaDe(FX.entries[DANA]))
    expect(() => validateOverlay(o2)).not.toThrow()
  })
})

describe('una explicación enmendada no la reescribe el motor', () => {
  const enmendada = (): Overlay =>
    enmendarMotivoDeBajada(
      overlay(),
      {
        claimId: DANA,
        veredicto: 'sin-datos',
        motivo: 'No consta ningún contrato de 143.539 € por el temporal de lluvias.',
        porque: 'La explicación del motor da una cifra cercana como si fuera la citada.',
        editor: PERSONA,
      },
      STAMP,
    ).overlay

  it('`--ids` la aparta, y el overlay se niega si otro llamante la manda', () => {
    const o = enmendada()
    expect(o.entries[DANA].reasonAmendments?.length).toBe(1)
    expect(retractacionesDelMotor([DANA], o).conExplicacionFirmada).toEqual([DANA])
    expect(() => rederivar(o, DANA, NUEVO_DANA, LUEGO)).toThrow(/explicación que firmó/)
  })
})

describe('el validador de `sustituye` en una retractación del motor', () => {
  const conSustituye = (s: unknown): Overlay => {
    const o = rederivar(overlay(), DANA, NUEVO_DANA)
    ;(o.entries[DANA] as { sustituye: unknown }).sustituye = s
    return o
  }
  const valida = sustituidaDe(FX.entries[DANA])

  it('acepta la que guarda la vía', () => {
    expect(() => validateOverlay(conSustituye(valida))).not.toThrow()
  })

  it('rechaza lo que decía la sustituida: sólo las claves de su molde', () => {
    for (const ajena of [
      { reason: FX.entries[DANA].reason },
      { verification: FX.entries[DANA].verification },
      { summary: FX.entries[DANA].verification.summary },
    ]) {
      expect(() => validateOverlay(conSustituye({ ...valida, ...ajena }))).toThrow(
        /nunca lo que decía/,
      )
    }
  })

  it('el motor sólo guarda una retractación suya, nunca lo que firmó una persona', () => {
    for (const source of ['curator-downgrade', 'curator-upgrade', 'llm', 'nli']) {
      const { labelCorrections: _l, ...sin } = valida
      expect(() => validateOverlay(conSustituye({ ...sin, source }))).toThrow()
    }
  })

  it('sin registros firmados no hay nada que guardar', () => {
    const { labelCorrections: _l, ...sin } = valida
    expect(() => validateOverlay(conSustituye(sin))).toThrow(/registro/)
  })

  it('una corrección guardada sigue mirándose: sin firma, no vale', () => {
    const [c] = valida.labelCorrections ?? []
    expect(() =>
      validateOverlay(conSustituye({ ...valida, labelCorrections: [{ ...c, editor: '' }] })),
    ).toThrow()
  })

  it('la huella de una enmienda guardada no es su texto', () => {
    const enmienda = {
      previous: reasonDigest(FX.entries[DANA].verification.summary),
      reason: 'La explicación del motor da una cifra cercana como si fuera la citada.',
      editor: PERSONA,
      amendedAt: '2026-10-07T00:00:00.000Z',
    }
    expect(() =>
      validateOverlay(conSustituye({ ...valida, reasonAmendments: [enmienda] })),
    ).not.toThrow()
    expect(() =>
      validateOverlay(
        conSustituye({
          ...valida,
          reasonAmendments: [{ ...enmienda, previous: FX.entries[DANA].verification.summary }],
        }),
      ),
    ).toThrow(/huella/)
  })
})
