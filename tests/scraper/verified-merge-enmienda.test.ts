/**
 * Enmendar el motivo de una bajada de curador sin mover el veredicto.
 *
 * El caso que lo pide: 40 bajadas del 24-06-2026 (`editor: ai-gold-review`)
 * guardan su motivo en inglés y con jerga —«Gold review (ai): false
 * contradicho: …»—, y `ClaimLedger` lo imprime bajo la cita en /plenos/:id y
 * /departamentos/:slug: 21 de ellas se sirven. `downgrade-verdict` es el único
 * escritor sancionado de esas entradas, pero sólo sabe BAJAR: volver a emitir
 * la misma bajada con otro motivo es `sin-datos → sin-datos`, e `isDowngrade`
 * lo rechaza. Y aunque lo aceptara, reescribiría la entrada entera con la firma
 * y la fecha de hoy: la bajada de junio constaría decidida por quien sólo
 * cambió su redacción.
 *
 * La vía es la de #183 para las correcciones de /hallazgos: la enmienda vive en
 * la entrada que enmienda, con la huella del motivo anterior (nunca su texto),
 * el porqué, la firma de una persona y la fecha. Las huellas de abajo están
 * calculadas a mano (`shasum -a 256` sobre el texto serializado en JSON), no
 * con el código que se prueba.
 */
import { describe, it, expect } from 'vitest'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  mergeVerified,
  validateOverlay,
  type EnmiendaPedida,
  type Overlay,
  type OverlayEntry,
  type VerifiedItem,
} from '../../src/scraper/verified-merge'
import type { ClaimEvidence, ClaimVerdict } from '../../src/scraper/claim-verifier'

const ID = '19gax3o-019-afi-0a4414'
const MOTIVO_EN =
  'Gold review (ai): false contradicho: garbled conditional; the cited contracts are unrelated to the claim'
const HUELLA_EN = 'motivo · sha256:fc34a953749a'
const MOTIVO_ES =
  'Se retiró el «Contradicho» que figuraba antes: la frase es un condicional mal transcrito, y los contratos que se citaban no tratan de lo que dice.'
const HUELLA_ES = 'motivo · sha256:36016a289a22'
const MOTIVO_ES_2 =
  'Se retiró el «Contradicho» anterior: la frase es un condicional mal transcrito y los contratos citados no tratan de lo que dice.'
const PORQUE =
  'El motivo se publicó en inglés y con jerga de revisión; se reescribe en castellano sin cambiar lo que afirma ni el veredicto.'
const FIRMA = 'María de la Fuente Llorens'
const BAJADA_EL = '2026-06-24T07:41:17.000Z'
const HOY = '2026-09-29T18:00:00.000Z'

const CONTRATO: ClaimEvidence = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
  snippet: 'Servicio mantenimiento instalaciones en complejo deportivo La Malla.',
}

/** Una bajada como las del 24-06: su motivo es también el resumen que se publica. */
function bajada(
  motivo = MOTIVO_EN,
  verdict: ClaimVerdict = 'sin-datos',
  evidence: ClaimEvidence[] = [],
): OverlayEntry {
  return {
    verification: {
      claimId: ID,
      verdict,
      summary: motivo,
      evidence,
      checkedAgainst: ['curator-downgrade'],
    },
    source: 'curator-downgrade',
    reason: motivo,
    editor: 'ai-gold-review',
    appliedAt: BAJADA_EL,
  }
}

const overlayCon = (entries: Record<string, OverlayEntry>): Overlay => ({
  version: 1,
  generatedAt: BAJADA_EL,
  entries,
})

const pedida = (extra: Partial<EnmiendaPedida> = {}): EnmiendaPedida => ({
  claimId: ID,
  veredicto: 'sin-datos',
  motivo: MOTIVO_ES,
  porque: PORQUE,
  editor: FIRMA,
  ...extra,
})

describe('enmendarMotivoDeBajada', () => {
  it('sustituye el motivo y el resumen publicado, y deja la enmienda en la entrada', () => {
    const antes = overlayCon({ [ID]: bajada() })
    const { overlay, previous } = enmendarMotivoDeBajada(antes, pedida(), HOY)

    expect(previous).toBe(HUELLA_EN)
    // La bajada sigue siendo de quien la decidió y de cuando la decidió; la
    // enmienda lleva su propia firma y su propia fecha.
    expect(overlay.entries[ID]).toEqual({
      verification: {
        claimId: ID,
        verdict: 'sin-datos',
        summary: MOTIVO_ES,
        evidence: [],
        checkedAgainst: ['curator-downgrade'],
      },
      source: 'curator-downgrade',
      reason: MOTIVO_ES,
      editor: 'ai-gold-review',
      appliedAt: BAJADA_EL,
      reasonAmendments: [{ previous: HUELLA_EN, reason: PORQUE, editor: FIRMA, amendedAt: HOY }],
    })
    expect(overlay.generatedAt).toBe(HOY)
    // Puro: lo que entra no cambia.
    expect(antes.entries[ID]).toEqual(bajada())
    expect(antes.generatedAt).toBe(BAJADA_EL)
  })

  it('una bajada a parcial conserva su evidencia: la enmienda sólo toca el motivo', () => {
    const { overlay } = enmendarMotivoDeBajada(
      overlayCon({ [ID]: bajada(MOTIVO_EN, 'parcial', [CONTRATO]) }),
      pedida({ veredicto: 'parcial' }),
      HOY,
    )
    expect(overlay.entries[ID].verification.verdict).toBe('parcial')
    expect(overlay.entries[ID].verification.evidence).toEqual([CONTRATO])
    expect(overlay.entries[ID].verification.checkedAgainst).toEqual(['curator-downgrade'])
  })

  it('la tarjeta imprime el motivo nuevo: el merge publica el resumen enmendado con el mismo veredicto', () => {
    const base: VerifiedItem[] = [
      {
        claim: { id: ID } as VerifiedItem['claim'],
        verification: {
          claimId: ID,
          verdict: 'contradicho',
          summary: 'lo que dijo la pasada anterior',
          evidence: [CONTRATO],
          checkedAgainst: ['llm-second-pass'],
        },
      },
    ]
    const { overlay } = enmendarMotivoDeBajada(overlayCon({ [ID]: bajada() }), pedida(), HOY)
    const [publicado] = mergeVerified(base, overlay)
    expect(publicado.verification.summary).toBe(MOTIVO_ES)
    expect(publicado.verification.verdict).toBe('sin-datos')
    expect(publicado.verification.evidence).toEqual([])
    expect(publicado.verification.source).toBe('curator-downgrade')
  })

  it('las enmiendas se encadenan: la segunda guarda la huella del motivo que dejó la primera', () => {
    const primera = enmendarMotivoDeBajada(overlayCon({ [ID]: bajada() }), pedida(), HOY)
    const LUEGO = '2026-10-02T09:00:00.000Z'
    const segunda = enmendarMotivoDeBajada(
      primera.overlay,
      pedida({
        motivo: MOTIVO_ES_2,
        porque: 'Se acorta la frase para que quepa en una línea de la tarjeta.',
      }),
      LUEGO,
    )
    expect(segunda.previous).toBe(HUELLA_ES)
    expect(segunda.overlay.entries[ID].reason).toBe(MOTIVO_ES_2)
    expect(segunda.overlay.entries[ID].reasonAmendments).toEqual([
      { previous: HUELLA_EN, reason: PORQUE, editor: FIRMA, amendedAt: HOY },
      {
        previous: HUELLA_ES,
        reason: 'Se acorta la frase para que quepa en una línea de la tarjeta.',
        editor: FIRMA,
        amendedAt: LUEGO,
      },
    ])
  })

  it('recorta el motivo, el porqué y la firma, como cualquier motivo', () => {
    const { overlay } = enmendarMotivoDeBajada(
      overlayCon({ [ID]: bajada() }),
      pedida({
        motivo: `  ${MOTIVO_ES}\n`,
        porque: ` ${PORQUE} `,
        editor: ' María  de la Fuente Llorens ',
      }),
      HOY,
    )
    expect(overlay.entries[ID].reason).toBe(MOTIVO_ES)
    expect(overlay.entries[ID].verification.summary).toBe(MOTIVO_ES)
    expect(overlay.entries[ID].reasonAmendments?.[0]).toEqual({
      previous: HUELLA_EN,
      reason: PORQUE,
      editor: FIRMA,
      amendedAt: HOY,
    })
  })

  describe('se niega, y no toca nada, cuando…', () => {
    const casos: Array<
      [string, () => { overlay: Overlay; extra?: Partial<EnmiendaPedida>; stamp?: string }, RegExp]
    > = [
      ['no hay bajada que enmendar', () => ({ overlay: overlayCon({}) }), /no hay ninguna bajada/],
      [
        // Desde el 10-10-2026 una retractación del motor sí admite la explicación
        // firmada de una persona (tests/explicacion-firmada.test.ts); el veredicto
        // fuerte de una pasada, no.
        'la entrada es de una pasada que publica un veredicto fuerte, no una bajada ni una retractación',
        () => ({
          overlay: overlayCon({
            [ID]: { ...bajada(MOTIVO_EN, 'parcial'), source: 'llm', editor: 'llm-second-pass' },
          }),
          extra: { veredicto: 'parcial' },
        }),
        /bajada de curador/,
      ],
      [
        'el veredicto no es el que la orden espera: se preparó para otro estado',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), extra: { veredicto: 'parcial' } }),
        /publica sin-datos, no parcial/,
      ],
      [
        'firma el proceso que hizo la bajada',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), extra: { editor: 'ai-gold-review' } }),
        /persona/,
      ],
      [
        'firma la cuenta por defecto de la CLI',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), extra: { editor: 'curator' } }),
        /persona/,
      ],
      [
        'firma el marcador de la orden preparada',
        () => ({
          overlay: overlayCon({ [ID]: bajada() }),
          extra: { editor: '<nombre y apellidos>' },
        }),
        /persona/,
      ],
      [
        'el motivo nuevo no llega a 20 caracteres',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), extra: { motivo: 'no consta' } }),
        /20/,
      ],
      [
        'el motivo nuevo es el vigente',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), extra: { motivo: ` ${MOTIVO_EN} ` } }),
        /no cambia nada/,
      ],
      [
        'el motivo nuevo habla de la tarea del modelo',
        () => ({
          overlay: overlayCon({ [ID]: bajada() }),
          extra: {
            motivo: 'Task completed: reasoned in Spanish about candidate support for the claim.',
          },
        }),
        /tarea/,
      ],
      [
        'el porqué no llega a 20 caracteres',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), extra: { porque: 'en inglés' } }),
        /porqué/,
      ],
      [
        'la fecha no es ISO',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), stamp: 'ayer por la tarde' }),
        /ISO/,
      ],
      [
        'la fecha es anterior a la bajada que enmienda',
        () => ({ overlay: overlayCon({ [ID]: bajada() }), stamp: '2026-06-01T00:00:00.000Z' }),
        /anterior a la bajada/,
      ],
      [
        'la fecha es anterior a la última enmienda',
        () => ({
          overlay: enmendarMotivoDeBajada(overlayCon({ [ID]: bajada() }), pedida(), HOY).overlay,
          extra: { motivo: MOTIVO_ES_2 },
          stamp: '2026-09-01T00:00:00.000Z',
        }),
        /anterior a la última enmienda/,
      ],
      [
        'la bajada publica un resumen distinto de su motivo: no se sabría cuál se enmienda',
        () => ({
          overlay: overlayCon({
            [ID]: {
              ...bajada(),
              verification: {
                ...bajada().verification,
                summary: 'otro texto que la tarjeta imprime',
              },
            },
          }),
        }),
        /resumen distinto de su motivo/,
      ],
    ]

    it.each(casos)('%s', (_, preparar, error) => {
      const { overlay, extra, stamp } = preparar()
      const copia = JSON.parse(JSON.stringify(overlay))
      expect(() => enmendarMotivoDeBajada(overlay, pedida(extra), stamp ?? HOY)).toThrow(error)
      expect(overlay).toEqual(copia)
    })
  })
})

describe('validateOverlay — enmiendas de motivo', () => {
  /** Escrita a mano, como la dejaría la CLI: el validador no puede fiarse de ella. */
  const enmendada = (cambios: Partial<OverlayEntry> = {}): OverlayEntry => ({
    ...bajada(MOTIVO_ES),
    reasonAmendments: [{ previous: HUELLA_EN, reason: PORQUE, editor: FIRMA, amendedAt: HOY }],
    ...cambios,
  })
  const con = (e: OverlayEntry) => overlayCon({ [ID]: e })

  it('acepta una entrada enmendada bien formada, y las de siempre siguen validando', () => {
    expect(() => validateOverlay(con(enmendada()))).not.toThrow()
    expect(() => validateOverlay(con(bajada()))).not.toThrow()
  })

  const otra = { previous: HUELLA_ES, reason: PORQUE, editor: FIRMA, amendedAt: HOY }
  it.each<[string, OverlayEntry, RegExp]>([
    [
      // Las de una retractación del motor, en tests/explicacion-firmada.test.ts.
      'enmiendas en una entrada que no es de un curador ni del motor',
      enmendada({ source: 'llm', editor: 'llm-second-pass' }),
      /bajada de curador/,
    ],
    ['una lista vacía', enmendada({ reasonAmendments: [] }), /no vacía/],
    [
      'el texto del motivo anterior en vez de su huella',
      enmendada({ reasonAmendments: [{ ...otra, previous: MOTIVO_EN }] }),
      /huella/,
    ],
    [
      'un porqué de menos de 20 caracteres',
      enmendada({ reasonAmendments: [{ ...otra, previous: HUELLA_EN, reason: 'en inglés' }] }),
      /porqué/,
    ],
    [
      'una firma que no es de persona',
      enmendada({ reasonAmendments: [{ ...otra, previous: HUELLA_EN, editor: 'ai-gold-review' }] }),
      /persona/,
    ],
    [
      'una fecha que no es ISO',
      enmendada({ reasonAmendments: [{ ...otra, previous: HUELLA_EN, amendedAt: 'hoy' }] }),
      /ISO/,
    ],
    [
      'una enmienda anterior a la bajada',
      enmendada({
        reasonAmendments: [{ ...otra, previous: HUELLA_EN, amendedAt: '2026-06-01T00:00:00.000Z' }],
      }),
      /anterior a la bajada/,
    ],
    [
      'enmiendas fuera de orden',
      enmendada({
        reason: MOTIVO_ES_2,
        verification: { ...bajada().verification, summary: MOTIVO_ES_2 },
        reasonAmendments: [
          { ...otra, previous: HUELLA_EN, amendedAt: HOY },
          { ...otra, previous: HUELLA_ES, amendedAt: '2026-09-10T00:00:00.000Z' },
        ],
      }),
      /orden/,
    ],
    [
      'una última enmienda que no cambió nada',
      enmendada({ reasonAmendments: [{ ...otra, previous: HUELLA_ES }] }),
      /no cambió nada/,
    ],
    [
      'un resumen publicado distinto del motivo enmendado',
      enmendada({ verification: { ...bajada().verification, summary: MOTIVO_EN } }),
      /resumen/,
    ],
  ])('rechaza %s', (_, entrada, error) => {
    expect(() => validateOverlay(con(entrada))).toThrow(error)
  })
})

describe('applyOverlayEntries — las enmiendas sobreviven a otras escrituras', () => {
  it('escribir la entrada de otra declaración no se lleva las enmiendas de ésta', () => {
    const { overlay } = enmendarMotivoDeBajada(overlayCon({ [ID]: bajada() }), pedida(), HOY)
    const despues = applyOverlayEntries(
      overlay,
      [
        {
          claimId: 'otra-001-cit-000000',
          verification: {
            claimId: 'otra-001-cit-000000',
            verdict: 'sin-datos',
            summary: 'ningún candidato del corpus respalda la afirmación',
            evidence: [],
            checkedAgainst: ['tenders'],
          },
          // Una retractación del motor: el anclaje NLI ya no escribe en el
          // overlay (sólo propone), y lo que importa aquí es que sea OTRA fila.
          source: 'verdict-engine',
          reason: 'verdict-engine re-judged parcial→sin-datos: ningún candidato la respalda',
        },
      ],
      '2026-09-30T00:00:00.000Z',
    )
    expect(despues.entries[ID].reasonAmendments).toEqual([
      { previous: HUELLA_EN, reason: PORQUE, editor: FIRMA, amendedAt: HOY },
    ])
    expect(despues.entries[ID].reason).toBe(MOTIVO_ES)
  })
})
