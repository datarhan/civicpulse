/**
 * Lo que una subida firmada sustituye: quién había escrito la entrada que pisa,
 * cuándo, y los registros firmados que llevaba —las correcciones de rótulo, las
 * enmiendas de su explicación—, sin lo que decía.
 *
 * El 06-10-2026 la PR #254 (`corregir-rotulo-motor`) dejó en 457 retractaciones
 * del motor la corrección de su rótulo (`labelCorrections`). Horas después, la
 * PR #258 subió cinco declaraciones con la firma de una persona, y cuatro eran
 * de ésas: `subirVeredicto` escribió la entrada nueva entera y el registro de la
 * corrección —y el rótulo, el canal y la fecha de la retractación— dejó de
 * servirse. Sólo quedaba en git, en 6bee7650.
 *
 * El fixture es la entrada real de c8kr44-229-cit-1356bf antes (6bee7650) y
 * después (b30d27d7) de la subida.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  recuperarSustituida,
  subirVeredicto,
  type Observado,
  type SubidaPedida,
} from '../src/scraper/subida-firmada'
import {
  mergeVerified,
  validateOverlay,
  type Overlay,
  type OverlayEntry,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import { RESUMEN_SIN_REGISTRO_FIJO } from '../src/scraper/claim-verdicts'

const FX = JSON.parse(
  readFileSync(
    resolve(__dirname, 'fixtures/subida-sobre-rotulo-corregido_2026-10-06.json'),
    'utf8',
  ),
) as { claimId: string; motor: OverlayEntry; subida: OverlayEntry }

const ID = FX.claimId
const PERSONA = 'María de la Fuente Llorens'
const STAMP = '2026-10-11T12:00:00.000Z'
const COMMIT = '6bee76509c3ca7d655571902542b74cef9b614ac'
const conMotor = (motor: OverlayEntry = FX.motor): Overlay => ({
  version: 1,
  generatedAt: motor.appliedAt,
  entries: { [ID]: structuredClone(motor) },
})

const observado = (publicado: 'sin-datos' | 'parcial' = 'sin-datos'): Observado => ({
  tipo: 'cita_obra',
  publicado,
  resumenesDeMaquina: [FX.motor.reason ?? '', RESUMEN_SIN_REGISTRO_FIJO],
})

/** La subida de #258, pedida otra vez por la vía de siempre. */
const pedida = (extra: Partial<SubidaPedida> = {}): SubidaPedida => ({
  claimId: ID,
  veredicto: 'verificado',
  evidencia: structuredClone(FX.subida.verification.evidence),
  resumen: FX.subida.reason ?? '',
  editor: PERSONA,
  ...extra,
})

/** Lo que tendría que quedar de la retractación del motor. */
const IDENTIDAD_DEL_MOTOR = {
  source: 'verdict-engine',
  editor: 'verdict-engine:gpt-4o-mini',
  appliedAt: FX.motor.appliedAt,
  labelCorrections: FX.motor.labelCorrections,
}

describe('subirVeredicto · lo que sustituye se queda en `sustituye`', () => {
  it('sobre una retractación con el rótulo corregido: su canal, su rótulo, su fecha y sus correcciones', () => {
    expect(FX.motor.labelCorrections).toHaveLength(1)
    const o = subirVeredicto(conMotor(), pedida(), observado(), STAMP)
    const e = o.entries[ID]
    expect(e.source).toBe('curator-upgrade')
    expect(e.sustituye).toEqual(IDENTIDAD_DEL_MOTOR)
  })

  it('sin lo que decía: ni el motivo del motor ni su verificación se vuelven a servir', () => {
    const e = subirVeredicto(conMotor(), pedida(), observado(), STAMP).entries[ID]
    expect(Object.keys(e.sustituye ?? {}).sort()).toEqual(
      ['appliedAt', 'editor', 'labelCorrections', 'source'].sort(),
    )
    const servido = JSON.stringify(e)
    // El motivo del motor, en cualquiera de sus trozos largos.
    expect(servido).not.toContain('re-judged parcial→sin-datos')
    expect(servido).not.toContain(String(FX.motor.reason).slice(60, 140))
  })

  it('la subida sigue diciendo lo de siempre: `desde`, firma, resumen y verificación', () => {
    const e = subirVeredicto(conMotor(), pedida(), observado(), STAMP).entries[ID]
    expect(e.desde).toBe('sin-datos')
    expect(e.editor).toBe(PERSONA)
    expect(e.reason).toBe(FX.subida.reason)
    expect(e.verification).toEqual(FX.subida.verification)
    // Las correcciones son del motor: no pasan a la subida.
    expect(e).not.toHaveProperty('labelCorrections')
  })

  it('sobre una explicación firmada: guarda sus enmiendas, no la explicación', () => {
    const enmienda = {
      previous: 'motivo · sha256:0123456789ab',
      reason: 'La explicación del motor citaba el número de un candidato de la lista.',
      editor: 'Ana Pérez Soler',
      amendedAt: '2026-10-10T20:00:00.000Z',
    }
    const firmada: OverlayEntry = {
      ...structuredClone(FX.motor),
      verification: {
        ...FX.motor.verification,
        summary: 'Ningún contrato del corpus nombra el Parque Bellavista con estas palabras.',
      },
      reasonAmendments: [enmienda],
    }
    const e = subirVeredicto(conMotor(firmada), pedida(), observado(), STAMP).entries[ID]
    expect(e.sustituye?.reasonAmendments).toEqual([enmienda])
    expect(JSON.stringify(e)).not.toContain('Ningún contrato del corpus nombra')
  })

  it('sobre otra subida: la encadena, con lo que ésa sustituía', () => {
    const parcial = subirVeredicto(
      conMotor(),
      pedida({ veredicto: 'parcial' }),
      observado(),
      '2026-10-07T00:00:00.000Z',
    )
    const e = subirVeredicto(parcial, pedida(), observado('parcial'), STAMP).entries[ID]
    expect(e.sustituye).toEqual({
      source: 'curator-upgrade',
      editor: PERSONA,
      appliedAt: '2026-10-07T00:00:00.000Z',
      sustituye: IDENTIDAD_DEL_MOTOR,
    })
  })

  it('sin entrada que sustituir (lo publicado es la base), no hay `sustituye`', () => {
    const vacio: Overlay = { version: 1, generatedAt: STAMP, entries: {} }
    const e = subirVeredicto(vacio, pedida(), observado(), STAMP).entries[ID]
    expect(e).not.toHaveProperty('sustituye')
  })

  it('no viaja a lo publicado: la verificación compuesta no la lleva', () => {
    const o = subirVeredicto(conMotor(), pedida(), observado(), STAMP)
    const base = [
      {
        claim: { id: ID, type: 'cita_obra', verbatim: 'x' },
        verification: {
          claimId: ID,
          verdict: 'sin-datos',
          summary: RESUMEN_SIN_REGISTRO_FIJO,
          evidence: [],
          checkedAgainst: ['tenders'],
        },
      },
    ] as unknown as VerifiedItem[]
    const [it] = mergeVerified(base, o)
    expect(JSON.stringify(it)).not.toContain('sustituye')
    expect(JSON.stringify(it)).not.toContain('labelCorrections')
    expect(JSON.stringify(it)).not.toContain('gpt-4o-mini')
  })
})

describe('validateOverlay · `sustituye` sólo con su molde, y sólo en una subida firmada', () => {
  const subida = (): Overlay => subirVeredicto(conMotor(), pedida(), observado(), STAMP)
  const con = (cambia: (e: OverlayEntry) => void): Overlay => {
    const o = structuredClone(subida())
    cambia(o.entries[ID])
    return o
  }

  it('la que escribe la vía valida', () => {
    expect(() => validateOverlay(subida())).not.toThrow()
  })

  it('en una entrada que no es una subida firmada revienta', () => {
    const o = structuredClone(conMotor())
    o.entries[ID].sustituye = { ...IDENTIDAD_DEL_MOTOR } as OverlayEntry['sustituye']
    expect(() => validateOverlay(o)).toThrow(/sustituye/)
  })

  it('con lo que decía la entrada —motivo, resumen, verificación— revienta', () => {
    for (const campo of ['reason', 'summary', 'verification', 'desde']) {
      const o = con((e) => {
        ;(e.sustituye as unknown as Record<string, unknown>)[campo] = FX.motor.reason
      })
      expect(() => validateOverlay(o), campo).toThrow(/sustituye/)
    }
  })

  it('sin canal válido, sin fecha, o posterior a la subida, revienta', () => {
    expect(() =>
      validateOverlay(con((e) => ((e.sustituye as { source: string }).source = 'otro'))),
    ).toThrow(/sustituye/)
    expect(() =>
      validateOverlay(con((e) => delete (e.sustituye as { appliedAt?: string }).appliedAt)),
    ).toThrow(/sustituye/)
    expect(() =>
      validateOverlay(
        con((e) => ((e.sustituye as { appliedAt: string }).appliedAt = '2027-01-01T00:00:00.000Z')),
      ),
    ).toThrow(/sustituye/)
  })

  it('unas correcciones de rótulo mal formadas revientan, como en la entrada del motor', () => {
    const o = con((e) => {
      e.sustituye!.labelCorrections![0].previous = 'claude-code'
    })
    expect(() => validateOverlay(o)).toThrow(/sustituye.*labelCorrections\[0\]\.previous/)
    const vacia = con((e) => {
      e.sustituye!.labelCorrections = []
    })
    expect(() => validateOverlay(vacia)).toThrow(/labelCorrections/)
    const sinCambio = con((e) => {
      e.sustituye!.labelCorrections![0].previous = 'verdict-engine:gpt-4o-mini'
    })
    expect(() => validateOverlay(sinCambio)).toThrow(/no cambió nada/)
  })

  it('correcciones de rótulo en lo que no era del motor revientan', () => {
    const o = con((e) => {
      e.sustituye!.source = 'curator-downgrade'
      e.sustituye!.editor = 'Ana Pérez Soler'
    })
    expect(() => validateOverlay(o)).toThrow(/labelCorrections/)
  })
})

describe('recuperarSustituida · lo que se perdió, desde git y con constancia', () => {
  /** La subida de #258 tal como se sirve hoy, sin `sustituye`. */
  const servida = (): Overlay => ({
    version: 1,
    generatedAt: FX.subida.appliedAt,
    entries: { [ID]: structuredClone(FX.subida) },
  })
  const recuperada = { commit: COMMIT, editor: 'civicpulse-curator' }

  it('añade la identidad de la retractación y sus correcciones, con de dónde se recuperó', () => {
    const o = recuperarSustituida(servida(), ID, FX.motor, recuperada, STAMP)
    const e = o.entries[ID]
    expect(e.sustituye).toEqual({
      ...IDENTIDAD_DEL_MOTOR,
      recuperada: { commit: COMMIT, editor: 'civicpulse-curator', recuperadaAt: STAMP },
    })
    expect(() => validateOverlay(o)).not.toThrow()
  })

  it('no toca nada más de la subida: sólo añade `sustituye`', () => {
    const e = recuperarSustituida(servida(), ID, FX.motor, recuperada, STAMP).entries[ID]
    const { sustituye: _s, ...resto } = e
    expect(resto).toEqual(FX.subida)
  })

  it('la entrada de git tiene que publicar lo que la subida dice que subió', () => {
    const otra = { ...FX.motor, verification: { ...FX.motor.verification, verdict: 'parcial' } }
    expect(() =>
      recuperarSustituida(servida(), ID, otra as OverlayEntry, recuperada, STAMP),
    ).toThrow(/desde/)
  })

  it('y ser anterior a la subida', () => {
    const tarde = { ...FX.motor, appliedAt: '2026-10-07T00:00:00.000Z' }
    expect(() => recuperarSustituida(servida(), ID, tarde, recuperada, STAMP)).toThrow(/anterior/)
  })

  it('sólo sobre una subida firmada que aún no lo dice, y con un commit y una firma', () => {
    expect(() => recuperarSustituida(conMotor(), ID, FX.motor, recuperada, STAMP)).toThrow(
      /subida firmada/,
    )
    const ya = recuperarSustituida(servida(), ID, FX.motor, recuperada, STAMP)
    expect(() => recuperarSustituida(ya, ID, FX.motor, recuperada, STAMP)).toThrow(/ya/)
    expect(() =>
      recuperarSustituida(servida(), ID, FX.motor, { ...recuperada, commit: '6bee7650' }, STAMP),
    ).toThrow(/commit/)
    expect(() =>
      recuperarSustituida(servida(), ID, FX.motor, { ...recuperada, editor: '<firma>' }, STAMP),
    ).toThrow(/firma/)
  })

  it('la constancia se valida al leer: un commit mal escrito revienta', () => {
    const o = structuredClone(recuperarSustituida(servida(), ID, FX.motor, recuperada, STAMP))
    o.entries[ID].sustituye!.recuperada!.commit = 'HEAD'
    expect(() => validateOverlay(o)).toThrow(/recuperada/)
  })
})
