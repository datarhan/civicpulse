/**
 * La explicación firmada: una persona reescribe, con su nombre, la explicación
 * de una retractación del motor sin mover el veredicto.
 *
 * El caso: cuatro retractaciones del 02-08-2026 (19gax3o-143, 1sqj7is-081,
 * ma87e0-195 y qz6weg-184) guardan como explicación un parte del modelo sobre su
 * tarea, y la tarjeta dice «Explicación retirada». La lectura del 06-10-2026
 * dejó escrita la explicación de cada una desde los registros, y ninguna vía
 * podía publicarla: `downgrade-verdict` sólo baja, su `--amend-reason` sólo
 * aceptaba bajadas de curador, y `subir-veredicto` sólo sube.
 *
 * La vía es la enmienda de #183, en la entrada del motor: cambia la explicación
 * que se publica y nada de lo que decidió el motor. Las huellas de abajo están
 * calculadas aparte (sha256 del texto serializado en JSON, con node:crypto), no
 * con el código que se prueba.
 */
import { describe, it, expect } from 'vitest'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  mergeVerified,
  retirarDeclaracion,
  validateOverlay,
  type EnmiendaPedida,
  type Overlay,
  type OverlayEntry,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import {
  decidirDevolucion,
  decidirRecorte,
  retractacionesDelMotor,
} from '../src/scraper/decision-del-motor'
import { subirVeredicto } from '../src/scraper/subida-firmada'
import type { ClaimVerification } from '../src/scraper/claim-verifier'

const ID = '19gax3o-143-cit-a3a7a1'
/** Lo que el motor guardó el 02-08-2026, tal cual está en el overlay. */
const DEL_MOTOR =
  'Task completed: provided skeptical fact-check reasoning in Spanish (2-4 sentences) concluding none of the four candidates (bar catering tenders and pool cleaning service tenders) genuinely support the claim about exterior investment addressing reported deficiencies at the C.D. La Mallá sports comple'
const HUELLA_DEL_MOTOR = 'motivo · sha256:61a8088eb03e'
const MOTIVO_DEL_MOTOR = `verdict-engine (claude-code) re-judged parcial→sin-datos: ${DEL_MOTOR}`
/** La de editorial/apartadas-249, escrita desde los registros. */
const EXPLICACION =
  'La transcripción vigente lo dice en futuro: el exterior «va a tener» una inversión de este gobierno, de un millón de euros, este año. Ningún registro cotejado es esa inversión: la pavimentación del paseo Pacadar entre el complejo y el pabellón se adjudicó en 2023 y 2024 (93.023,59 € y 50.260,40 €), y la reforma del edificio La Mallà licitada en 2026 no tiene contrato adjudicado.'
const HUELLA_EXPLICACION = 'motivo · sha256:87920bd5238e'
const EXPLICACION_2 =
  'Lo dicho es un anuncio para este año: el exterior va a tener una inversión de un millón de euros. Los contratos del paseo Pacadar son de 2023 y 2024, y la reforma licitada en 2026 no tiene contrato.'
const PORQUE =
  'La explicación publicada era un parte del modelo sobre su tarea; se escribe desde los registros cotejados, sin mover el veredicto.'
const FIRMA = 'María de la Fuente Llorens'
const RETRACTADA_EL = '2026-08-02T05:38:45.146Z'
const HOY = '2026-10-10T09:00:00.000Z'
const SIN_REGISTRO =
  'No se encontró registro en tenders y tenders-ted que la sostenga. Un «sin datos» no es un desmentido: la afirmación puede ser cierta.'
/** Una explicación del motor que habla de la declaración, como la que #258 dio a 1sqj7is-065. */
const RE_DERIVADA =
  'la afirmación es una valoración política y subjetiva: no contiene cifras, fechas ni sujetos concretos que contrastar.'

/** Una retractación del motor como las del 02-08: su explicación es su razonamiento. */
function retractacion(extra: Partial<OverlayEntry> = {}): OverlayEntry {
  return {
    verification: {
      claimId: ID,
      verdict: 'sin-datos',
      summary: DEL_MOTOR,
      evidence: [],
      checkedAgainst: ['verdict-engine'],
      confidence: 0.2,
    } as ClaimVerification,
    source: 'verdict-engine',
    reason: MOTIVO_DEL_MOTOR,
    editor: 'verdict-engine:claude-code',
    appliedAt: RETRACTADA_EL,
    ...extra,
  }
}

/** La misma, rotulada de nuevo por #254: contestó otro modelo que el configurado. */
function rotulada(): OverlayEntry {
  return retractacion({
    editor: 'verdict-engine:claude-code+gpt-4o-mini',
    reason: `verdict-engine (claude-code+gpt-4o-mini) re-judged parcial→sin-datos: ${DEL_MOTOR}`,
    labelCorrections: [
      {
        previous: 'verdict-engine:claude-code',
        reason:
          'Razonó claude-code y decidió gpt-4o-mini, según la caché del motor; causa cerrada en la PR #248.',
        editor: 'civicpulse-curator',
        correctedAt: '2026-10-06T05:41:47.602Z',
      },
    ],
  })
}

const overlayCon = (entries: Record<string, OverlayEntry>): Overlay => ({
  version: 1,
  generatedAt: RETRACTADA_EL,
  entries,
})

const pedida = (extra: Partial<EnmiendaPedida> = {}): EnmiendaPedida => ({
  claimId: ID,
  veredicto: 'sin-datos',
  motivo: EXPLICACION,
  porque: PORQUE,
  editor: FIRMA,
  ...extra,
})

describe('enmendarMotivoDeBajada · la explicación de una retractación del motor', () => {
  it('sustituye la explicación publicada y deja lo que decidió el motor: veredicto, motivo, rótulo y fecha', () => {
    const { overlay, previous } = enmendarMotivoDeBajada(
      overlayCon({ [ID]: retractacion() }),
      pedida(),
      HOY,
    )
    expect(previous).toBe(HUELLA_DEL_MOTOR)
    const e = overlay.entries[ID]
    expect(e.verification).toEqual({
      claimId: ID,
      verdict: 'sin-datos',
      summary: EXPLICACION,
      evidence: [],
      checkedAgainst: ['verdict-engine'],
      confidence: 0.2,
    })
    expect(e.source).toBe('verdict-engine')
    expect(e.reason).toBe(MOTIVO_DEL_MOTOR)
    expect(e.editor).toBe('verdict-engine:claude-code')
    expect(e.appliedAt).toBe(RETRACTADA_EL)
    expect(e.reasonAmendments).toEqual([
      { previous: HUELLA_DEL_MOTOR, reason: PORQUE, editor: FIRMA, amendedAt: HOY },
    ])
  })

  it('conserva las correcciones de rótulo, y las claves de la entrada no cambian de orden', () => {
    const antes = rotulada()
    const { overlay } = enmendarMotivoDeBajada(overlayCon({ [ID]: antes }), pedida(), HOY)
    const e = overlay.entries[ID]
    expect(e.labelCorrections).toEqual(antes.labelCorrections)
    expect(e.editor).toBe('verdict-engine:claude-code+gpt-4o-mini')
    // Sin esto, cada enmienda reordenaría la entrada en el overlay comiteado.
    expect(Object.keys(e)).toEqual([
      'verification',
      'source',
      'reason',
      'editor',
      'appliedAt',
      'labelCorrections',
      'reasonAmendments',
    ])
  })

  it('una segunda explicación guarda la huella de la primera', () => {
    const una = enmendarMotivoDeBajada(overlayCon({ [ID]: retractacion() }), pedida(), HOY)
    const dos = enmendarMotivoDeBajada(
      una.overlay,
      pedida({ motivo: EXPLICACION_2 }),
      '2026-10-11T09:00:00.000Z',
    )
    expect(dos.previous).toBe(HUELLA_EXPLICACION)
    expect(dos.overlay.entries[ID].verification.summary).toBe(EXPLICACION_2)
    expect(dos.overlay.entries[ID].reasonAmendments?.map((a) => a.previous)).toEqual([
      HUELLA_DEL_MOTOR,
      HUELLA_EXPLICACION,
    ])
  })

  describe('se niega, y no toca nada, cuando…', () => {
    const casos: Array<
      [string, () => { overlay: Overlay; extra?: Partial<EnmiendaPedida> }, RegExp]
    > = [
      [
        'la explicación nueva es la del motor, entera dentro de otra',
        () => ({
          overlay: overlayCon({
            [ID]: retractacion({
              verification: { ...retractacion().verification, summary: RE_DERIVADA },
              reason: `verdict-engine (claude-code) re-derivó la retractación (sigue sin-datos): ${RE_DERIVADA}`,
            }),
          }),
          extra: { motivo: `Como dice el verificador, ${RE_DERIVADA}` },
        }),
        /máquina/,
      ],
      [
        'es el «no se encontró registro» del verificador',
        () => ({
          overlay: overlayCon({ [ID]: retractacion() }),
          extra: { motivo: SIN_REGISTRO },
        }),
        /máquina/,
      ],
      [
        'es un texto de máquina que pasa quien llama: la base o la propuesta de NLI',
        () => ({
          overlay: overlayCon({ [ID]: retractacion() }),
          extra: {
            motivo:
              'El contrato del paseo Pacadar respalda la inversión en el exterior del complejo.',
            resumenesDeMaquina: [
              'El contrato del paseo Pacadar respalda la inversión en el exterior del complejo.',
            ],
          },
        }),
        /máquina/,
      ],
      [
        'habla de la tarea de un modelo',
        () => ({
          overlay: overlayCon({ [ID]: retractacion() }),
          extra: {
            motivo:
              'Task completed: provided the requested reasoning in Spanish about the claim and its candidates.',
          },
        }),
        /tarea/,
      ],
      [
        'la entrada es de la pasada LLM retirada, que publica un veredicto fuerte',
        () => ({
          overlay: overlayCon({
            [ID]: retractacion({
              source: 'llm',
              editor: 'llm-second-pass',
              verification: { ...retractacion().verification, verdict: 'parcial' },
            }),
          }),
          extra: { veredicto: 'parcial' },
        }),
        /retractación del motor/,
      ],
      [
        'la entrada es una subida firmada',
        () => ({
          overlay: overlayCon({
            [ID]: retractacion({
              source: 'curator-upgrade',
              editor: FIRMA,
              verification: { ...retractacion().verification, verdict: 'parcial' },
            }),
          }),
          extra: { veredicto: 'parcial' },
        }),
        /retractación del motor/,
      ],
      [
        'una retractación del motor que no está en sin-datos, escrita a mano',
        () => ({
          overlay: overlayCon({
            [ID]: retractacion({
              verification: { ...retractacion().verification, verdict: 'parcial' },
            }),
          }),
          extra: { veredicto: 'parcial' },
        }),
        /sin-datos/,
      ],
      [
        'la firma el propio motor',
        () => ({
          overlay: overlayCon({ [ID]: retractacion() }),
          extra: { editor: 'verdict-engine:claude-code' },
        }),
        /persona/,
      ],
      [
        'la firma el marcador de una orden preparada',
        () => ({
          overlay: overlayCon({ [ID]: retractacion() }),
          extra: { editor: '<nombre y apellidos>' },
        }),
        /persona/,
      ],
    ]

    it.each(casos)('%s', (_, montar, error) => {
      const { overlay, extra } = montar()
      const copia = structuredClone(overlay)
      expect(() => enmendarMotivoDeBajada(overlay, pedida(extra), HOY)).toThrow(error)
      expect(overlay).toEqual(copia)
    })
  })
})

describe('validateOverlay — una retractación del motor con su explicación firmada', () => {
  /** Escrita a mano, como la dejaría la CLI: el validador no puede fiarse de ella. */
  const firmada = (cambios: Partial<OverlayEntry> = {}): OverlayEntry => ({
    ...retractacion({
      verification: { ...retractacion().verification, summary: EXPLICACION },
    }),
    reasonAmendments: [
      { previous: HUELLA_DEL_MOTOR, reason: PORQUE, editor: FIRMA, amendedAt: HOY },
    ],
    ...cambios,
  })
  const con = (e: OverlayEntry) => overlayCon({ [ID]: e })

  it('acepta una bien formada, también con sus correcciones de rótulo', () => {
    expect(() => validateOverlay(con(firmada()))).not.toThrow()
    const conRotulo = {
      ...rotulada(),
      verification: { ...rotulada().verification, summary: EXPLICACION },
      reasonAmendments: firmada().reasonAmendments,
    }
    expect(() => validateOverlay(con(conRotulo))).not.toThrow()
  })

  it.each<[string, OverlayEntry, RegExp]>([
    [
      'una última enmienda que no cambió nada: su huella es la de la explicación vigente',
      firmada({
        reasonAmendments: [
          { previous: HUELLA_EXPLICACION, reason: PORQUE, editor: FIRMA, amendedAt: HOY },
        ],
      }),
      /no cambió nada/,
    ],
    [
      'una firma que no es de una persona',
      firmada({
        reasonAmendments: [
          {
            previous: HUELLA_DEL_MOTOR,
            reason: PORQUE,
            editor: 'verdict-engine:claude-code',
            amendedAt: HOY,
          },
        ],
      }),
      /persona/,
    ],
    [
      'una retractación del motor en otro veredicto que sin-datos',
      firmada({
        verification: { ...retractacion().verification, verdict: 'parcial', summary: EXPLICACION },
      }),
      /sin-datos/,
    ],
    [
      'enmiendas en una entrada de la pasada LLM',
      firmada({ source: 'llm', editor: 'llm-second-pass' }),
      /retractación del motor/,
    ],
  ])('rechaza %s', (_, entrada, error) => {
    expect(() => validateOverlay(con(entrada))).toThrow(error)
  })
})

describe('applyOverlayEntries — lo que firmó una persona no lo reescribe una pasada', () => {
  const firmadaPorEnmienda = () =>
    enmendarMotivoDeBajada(overlayCon({ [ID]: retractacion() }), pedida(), HOY).overlay

  const delMotor = {
    claimId: ID,
    verification: {
      claimId: ID,
      verdict: 'sin-datos' as const,
      summary: 'Ninguno de los candidatos respalda la inversión en el exterior del complejo.',
      evidence: [],
      checkedAgainst: ['verdict-engine'],
    },
    source: 'verdict-engine' as const,
    reason:
      'verdict-engine (claude-code) re-derivó la retractación (sigue sin-datos): Ninguno de los candidatos respalda la inversión en el exterior del complejo.',
    editor: 'verdict-engine:claude-code',
  }

  it('una re-derivación del motor no sustituye una explicación firmada', () => {
    const overlay = firmadaPorEnmienda()
    const copia = structuredClone(overlay)
    expect(() => applyOverlayEntries(overlay, [delMotor], '2026-10-12T00:00:00.000Z')).toThrow(
      /firmó/,
    )
    expect(overlay).toEqual(copia)
  })

  it('tampoco el motivo enmendado de una bajada de curador', () => {
    const bajada: OverlayEntry = {
      verification: {
        claimId: ID,
        verdict: 'sin-datos',
        summary: EXPLICACION,
        evidence: [],
        checkedAgainst: ['curator-downgrade'],
      },
      source: 'curator-downgrade',
      reason: EXPLICACION,
      editor: 'ai-gold-review',
      appliedAt: RETRACTADA_EL,
      reasonAmendments: [
        { previous: HUELLA_DEL_MOTOR, reason: PORQUE, editor: FIRMA, amendedAt: HOY },
      ],
    }
    expect(() =>
      applyOverlayEntries(overlayCon({ [ID]: bajada }), [delMotor], '2026-10-12T00:00:00.000Z'),
    ).toThrow(/firmó/)
  })

  it('una persona sí: una subida firmada o una retirada la sustituyen', () => {
    const subida = subirVeredicto(
      firmadaPorEnmienda(),
      {
        claimId: ID,
        veredicto: 'parcial',
        evidencia: [
          {
            kind: 'tender',
            ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
            snippet: 'Pavimentación del paseo Pacadar · adjudicado el 04-12-2023',
            stance: 'checked',
          },
        ],
        resumen:
          'El paseo Pacadar se pavimentó con dos contratos de 2023 y 2024; es la parte exterior.',
        editor: FIRMA,
      },
      { tipo: 'cita_obra', publicado: 'sin-datos', resumenesDeMaquina: [] },
      '2026-10-12T00:00:00.000Z',
    )
    expect(subida.entries[ID].source).toBe('curator-upgrade')

    const retirada = retirarDeclaracion(
      firmadaPorEnmienda(),
      {
        claimId: ID,
        literal: 'esa piscina, ese complexo esportivo de la Mallá',
        motivo: 'En el vídeo, a 6.884 s, se oye otra frase: el orador habla del año que viene.',
        editor: FIRMA,
      },
      '2026-10-12T00:00:00.000Z',
    )
    expect(retirada.entries[ID].retirada?.motivo).toBe('literal-no-dicho')
  })
})

describe('la composición publica quién firmó la explicación', () => {
  const CLAIM = {
    id: ID,
    plenoId: '19gax3o',
    plenoDate: '2026-01-19',
    segmentIndex: 143,
    type: 'cita_obra',
    speakerGroup: null,
    verbatim: 'esa piscina, ese complexo esportivo de la Mallá',
    context: 'Contexto.',
    topic: 'urbanismo',
    entities: {},
    confidence: 0.9,
    reasoning: 'Prueba.',
    requiresHumanApproval: true,
  }
  const BASE = {
    claimId: ID,
    verdict: 'sin-datos',
    summary: SIN_REGISTRO,
    evidence: [],
    checkedAgainst: ['tenders', 'tenders-ted'],
  }
  const base = () => [{ claim: CLAIM, verification: BASE }] as unknown as VerifiedItem[]

  it('la explicación nueva, con el canal del motor y la firma de quien la escribió', () => {
    const { overlay } = enmendarMotivoDeBajada(overlayCon({ [ID]: retractacion() }), pedida(), HOY)
    const [it0] = mergeVerified(base(), overlay)
    expect(it0.verification).toMatchObject({
      verdict: 'sin-datos',
      summary: EXPLICACION,
      source: 'verdict-engine',
      reasonSignedBy: FIRMA,
    })
  })

  it('una firma colada en la verificación de una retractación sin enmiendas no se publica', () => {
    const colada = retractacion({
      verification: { ...retractacion().verification, reasonSignedBy: FIRMA } as ClaimVerification,
    })
    const [it0] = mergeVerified(base(), overlayCon({ [ID]: colada }))
    expect(it0.verification).not.toHaveProperty('reasonSignedBy')
  })
})

describe('el motor no re-deriva, no recorta y no devuelve una explicación firmada', () => {
  const firmada = () =>
    enmendarMotivoDeBajada(overlayCon({ [ID]: retractacion() }), pedida(), HOY).overlay.entries[ID]

  it('--ids y --recortar la apartan, contada aparte de lo que no es del motor', () => {
    const overlay = overlayCon({
      'a-001-cit-aaaaaa': {
        ...retractacion(),
        verification: { ...retractacion().verification, claimId: 'a-001-cit-aaaaaa' },
      },
      [ID]: firmada(),
      'c-003-cit-cccccc': {
        verification: {
          claimId: 'c-003-cit-cccccc',
          verdict: 'sin-datos',
          summary: 'Bajada de curador con su motivo.',
          evidence: [],
          checkedAgainst: ['curator-downgrade'],
        },
        source: 'curator-downgrade',
        reason: 'Bajada de curador con su motivo.',
        editor: 'curator',
        appliedAt: RETRACTADA_EL,
      },
    })
    expect(
      retractacionesDelMotor(
        ['a-001-cit-aaaaaa', ID, 'c-003-cit-cccccc', 'd-004-cit-dddddd'],
        overlay,
      ),
    ).toEqual({
      pedidos: 4,
      targets: ['a-001-cit-aaaaaa'],
      conExplicacionFirmada: [ID],
      noDelMotor: ['c-003-cit-cccccc', 'd-004-cit-dddddd'],
    })
  })

  it('retirar-pasada --sin-juicio no la devuelve al determinista, aunque sea la entrada medida', () => {
    expect(
      decidirDevolucion({
        medida: { editor: 'verdict-engine:claude-code', appliedAt: RETRACTADA_EL },
        entrada: firmada(),
        veredictoBase: 'sin-datos',
      }),
    ).toEqual({ accion: 'dejar', porque: 'explicacion-firmada' })
  })

  it('el recorte no la toca, ni con el razonamiento entero en la caché', () => {
    expect(
      decidirRecorte({ claimId: ID, entrada: firmada(), razonamientos: [`${DEL_MOTOR}x. Fin.`] }),
    ).toEqual({ accion: 'dejar', porque: 'explicacion-firmada' })
  })
})
