/**
 * Lo que una subida firmada sustituyó no se pierde cuando la subida se baja.
 *
 * Las PR #289 y #290 (11/12-10-2026) hicieron que la subida guardara en
 * `sustituye` la entrada que pisa, y devolvieron ese registro a 15 de las 18
 * subidas del overlay. Pero tres vías escriben una bajada de curador ENCIMA de
 * una subida y la sustituían entera, `sustituye` incluido:
 *
 *   1. `subir-veredicto --retirar` (`retirarSubida`);
 *   2. `downgrade-verdict` sobre una subida (`applyOverlayEntries`);
 *   3. la retirada de una declaración (`retirarDeclaracion`).
 *
 * Cada una se llevaba la subida —quién la firmó y cuándo— y la cadena que la
 * subida guardaba: la retractación del motor, con su rótulo corregido. La
 * entrada nueva tiene que guardar la subida en su `sustituye`, con la cadena
 * debajo, y nunca su resumen ni su motivo.
 *
 * El fixture es la entrada real de c8kr44-229-cit-1356bf antes y después de la
 * subida de #258, con lo que #290 le devolvió (`recuperada`).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { recuperarSustituida, retirarSubida } from '../src/scraper/subida-firmada'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  retirarDeclaracion,
  validateOverlay,
  verificacionDeBajada,
  type EntradaSustituida,
  type Overlay,
  type OverlayEntry,
} from '../src/scraper/verified-merge'
import type { ClaimVerdict } from '../src/scraper/claim-verifier'

const FX = JSON.parse(
  readFileSync(
    resolve(__dirname, 'fixtures/subida-sobre-rotulo-corregido_2026-10-06.json'),
    'utf8',
  ),
) as { claimId: string; motor: OverlayEntry; subida: OverlayEntry }

const ID = FX.claimId
const PERSONA = 'María de la Fuente Llorens'
const COMMIT = '6bee76509c3ca7d655571902542b74cef9b614ac'
const RECUPERADA_AT = '2026-10-11T12:00:00.000Z'
const STAMP = '2026-10-12T09:00:00.000Z'
const MOTIVO = 'El lote 3 del expediente 111-115/2025 no es el cambio de juegos del que se habló.'
const LITERAL = 'vamos a cambiar los juegos y el suelo del parque Bellavista'

/** La subida de #258 tal como se sirve tras #290: con lo que sustituyó, recuperado. */
const conSubida = (): Overlay =>
  recuperarSustituida(
    { version: 1, generatedAt: FX.subida.appliedAt, entries: { [ID]: structuredClone(FX.subida) } },
    ID,
    FX.motor,
    { commit: COMMIT, editor: 'civicpulse-curator' },
    RECUPERADA_AT,
  )

/** Lo que la entrada nueva tiene que decir de la subida que pisa. */
const LA_SUBIDA: EntradaSustituida = {
  source: 'curator-upgrade',
  editor: FX.subida.editor,
  appliedAt: FX.subida.appliedAt,
  sustituye: {
    source: 'verdict-engine',
    editor: 'verdict-engine:gpt-4o-mini',
    appliedAt: FX.motor.appliedAt,
    labelCorrections: FX.motor.labelCorrections,
    recuperada: { commit: COMMIT, editor: 'civicpulse-curator', recuperadaAt: RECUPERADA_AT },
  },
}

/** `downgrade-verdict` (la orden `bajar`), por la vía que usa la CLI. */
const bajar = (o: Overlay, de: ClaimVerdict, a: ClaimVerdict, stamp = STAMP): Overlay =>
  applyOverlayEntries(
    o,
    [
      {
        claimId: ID,
        verification: verificacionDeBajada(ID, o.entries[ID].verification, a, MOTIVO),
        source: 'curator-downgrade',
        reason: MOTIVO,
        editor: PERSONA,
      },
    ],
    stamp,
    new Map([[ID, de]]),
  )

/** Ni el resumen ni el motivo de la subida —ni el del motor— vuelven en el registro. */
function sinLoQueDecia(s: EntradaSustituida | undefined): void {
  const servido = JSON.stringify(s)
  expect(servido).not.toContain(String(FX.subida.reason).slice(0, 60))
  expect(servido).not.toContain('Parque Bellavista se contrató')
  expect(servido).not.toContain('re-judged')
}

describe('una bajada sobre una subida firmada guarda la subida y su cadena en `sustituye`', () => {
  it('el fixture parte de una subida que ya dice lo que sustituyó', () => {
    const e = conSubida().entries[ID]
    expect(e.source).toBe('curator-upgrade')
    expect(e.sustituye?.recuperada?.commit).toBe(COMMIT)
  })

  it('1 · subir-veredicto --retirar', () => {
    const o = retirarSubida(conSubida(), { claimId: ID, motivo: MOTIVO, editor: PERSONA }, STAMP)
    const e = o.entries[ID]
    expect(e.source).toBe('curator-downgrade')
    expect(e.verification.verdict).toBe('sin-datos')
    expect(e.sustituye).toEqual(LA_SUBIDA)
    sinLoQueDecia(e.sustituye)
    expect(() => validateOverlay(o)).not.toThrow()
  })

  it('2 · downgrade-verdict sobre la subida', () => {
    const o = bajar(conSubida(), 'verificado', 'parcial')
    const e = o.entries[ID]
    expect(e.source).toBe('curator-downgrade')
    expect(e.verification.verdict).toBe('parcial')
    expect(e.sustituye).toEqual(LA_SUBIDA)
    sinLoQueDecia(e.sustituye)
    expect(() => validateOverlay(o)).not.toThrow()
  })

  it('3 · la retirada de una declaración que lleva una subida', () => {
    const o = retirarDeclaracion(
      conSubida(),
      { claimId: ID, literal: LITERAL, motivo: MOTIVO, editor: PERSONA },
      STAMP,
    )
    const e = o.entries[ID]
    expect(e.retirada?.motivo).toBe('literal-no-dicho')
    expect(e.sustituye).toEqual(LA_SUBIDA)
    sinLoQueDecia(e.sustituye)
    expect(() => validateOverlay(o)).not.toThrow()
  })

  it('la subida sin `sustituye` (sobre la base) también queda registrada', () => {
    const sola: Overlay = {
      version: 1,
      generatedAt: FX.subida.appliedAt,
      entries: { [ID]: structuredClone(FX.subida) },
    }
    const e = retirarSubida(sola, { claimId: ID, motivo: MOTIVO, editor: PERSONA }, STAMP).entries[
      ID
    ]
    expect(e.sustituye).toEqual({
      source: 'curator-upgrade',
      editor: FX.subida.editor,
      appliedAt: FX.subida.appliedAt,
    })
  })

  it('una bajada sobre lo que no lleva ninguna subida sigue sin `sustituye`', () => {
    const motor: Overlay = {
      version: 1,
      generatedAt: FX.motor.appliedAt,
      entries: { [ID]: structuredClone(FX.motor) },
    }
    const o = retirarDeclaracion(
      motor,
      { claimId: ID, literal: LITERAL, motivo: MOTIVO, editor: PERSONA },
      STAMP,
    )
    expect(o.entries[ID]).not.toHaveProperty('sustituye')
  })
})

describe('y la cadena sigue en lo que venga después', () => {
  const bajada = () => bajar(conSubida(), 'verificado', 'parcial', '2026-10-12T08:00:00.000Z')
  const LA_BAJADA: EntradaSustituida = {
    source: 'curator-downgrade',
    editor: PERSONA,
    appliedAt: '2026-10-12T08:00:00.000Z',
    sustituye: LA_SUBIDA,
  }

  it('otra bajada encima guarda la bajada, con la subida debajo', () => {
    const o = bajar(bajada(), 'parcial', 'sin-datos')
    expect(o.entries[ID].sustituye).toEqual(LA_BAJADA)
    expect(JSON.stringify(o.entries[ID].sustituye)).not.toContain(MOTIVO)
    expect(() => validateOverlay(o)).not.toThrow()
  })

  it('una retirada encima, igual', () => {
    const o = retirarDeclaracion(
      bajada(),
      { claimId: ID, literal: LITERAL, motivo: MOTIVO + ' Escuchada la sesión.', editor: PERSONA },
      STAMP,
    )
    expect(o.entries[ID].sustituye).toEqual(LA_BAJADA)
  })

  it('enmendar el motivo de esa bajada no se lleva su `sustituye`', () => {
    const { overlay } = enmendarMotivoDeBajada(
      bajada(),
      {
        claimId: ID,
        veredicto: 'parcial',
        motivo: 'El contrato es de juegos infantiles, pero de otro parque y de otro año.',
        porque: 'El motivo nombraba el lote equivocado del mismo expediente.',
        editor: PERSONA,
      },
      STAMP,
    )
    expect(overlay.entries[ID].sustituye).toEqual(LA_SUBIDA)
    expect(() => validateOverlay(overlay)).not.toThrow()
  })
})

describe('validateOverlay · `sustituye` fuera de una subida, sólo si la cadena llega a una', () => {
  const bajadaCon = (s: EntradaSustituida): Overlay => {
    const o = structuredClone(bajar(conSubida(), 'verificado', 'parcial'))
    o.entries[ID].sustituye = s
    return o
  }

  it('en una bajada cuya cadena no llega a ninguna subida revienta', () => {
    const { sustituye: delMotor } = LA_SUBIDA
    expect(() => validateOverlay(bajadaCon(structuredClone(delMotor!)))).toThrow(/sustituye/)
  })

  it('en una retractación del motor revienta aunque llegue a una subida', () => {
    const { labelCorrections: _l, ...motor } = structuredClone(FX.motor)
    const o: Overlay = {
      version: 1,
      generatedAt: STAMP,
      entries: { [ID]: { ...motor, appliedAt: STAMP, sustituye: LA_SUBIDA } },
    }
    expect(() => validateOverlay(o)).toThrow(/sustituye.*verdict-engine/)
  })

  it('con el resumen de la subida dentro revienta', () => {
    const o = bajadaCon({
      ...structuredClone(LA_SUBIDA),
      reason: FX.subida.reason,
    } as EntradaSustituida)
    expect(() => validateOverlay(o)).toThrow(/sustituye/)
  })

  it('la subida registrada, posterior a la bajada, revienta', () => {
    const o = bajadaCon({ ...structuredClone(LA_SUBIDA), appliedAt: '2027-01-01T00:00:00.000Z' })
    expect(() => validateOverlay(o)).toThrow(/posterior/)
  })
})
