/**
 * Retirar una declaración cuyo literal, escuchada la sesión, no es lo que se dijo.
 *
 * El caso que lo pide (30-09-2026): `19gax3o-132-cit-35c4f5` se publicaba en
 * /plenos/19gax3o y /departamentos/urbanismo con «…se presupuesto en el año
 * 2006…». El dosier de escucha del 29-09 (audio, transcripción vigente y una
 * segunda pasada de Whisper) oyó importes donde el motor sustituido escribió un
 * año. Ninguna vía existente dejaba de publicarlo:
 *
 *   · `downgrade-verdict … sin-datos` lo deja IMPRESO: `ClaimLedger` pinta
 *     también las `toggle` en /plenos/:id y /departamentos/:slug, sólo que al
 *     final de la lista;
 *   · `reanchor-claim` se niega —la cola del literal casa una ventana de ocho
 *     palabras de la vigente, así que «ya consta»— y, aunque no se negara,
 *     cambiaría lo que afirma la declaración y heredaría un veredicto
 *     contrastado sobre otra frase;
 *   · `reclassify-claim` sólo aleja de la acusación, y aquí el tipo está bien.
 *
 * La puerta ya tiene la pregunta —¿se dijo?— y la contesta retirando lo que no
 * consta en ninguna transcripción. Aquí la transcripción sustituida SÍ lo
 * recoge: lo que falla es lo que oyó. Eso sólo lo sabe quien escucha, así que
 * la retirada la firma una persona, y sólo baja.
 *
 * Las huellas de abajo están calculadas a mano (`shasum -a 256` sobre el
 * literal serializado en JSON), no con el código que se prueba.
 */
import { describe, it, expect } from 'vitest'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  mergeVerified,
  retirarDeclaracion,
  validateOverlay,
  type Overlay,
  type OverlayEntry,
  type RetiradaPedida,
  type VerifiedItem,
} from '../../src/scraper/verified-merge'
import { classifyClaimVisibility, gateItemsForPublic } from '../../src/scraper/claim-public-gate'
import { MOTIVOS_DE_RETIRADA, motivoDeRetirada } from '../../src/scraper/declaracion-retirada'
import { buildManifest, groupItemsByPleno } from '../../src/scraper/pleno-claims-chunks'
import { contarRetiradas } from '../../scripts/chunk-pleno-claims'
import type { ClaimEvidence } from '../../src/scraper/claim-verifier'

const ID = 'p1-132-cit-aaaaaa'
const LITERAL =
  'el pabellón se presupuestó en el año 2006 y tuvieron que repararlo dentro de la obra'
const HUELLA = 'literal retirado · sha256:976b23082562'
const MOTIVO =
  'Escuchada la sesión, donde el literal pone un año se oyen importes (audio y transcripción vigente, 6.475–6.486 s): no es lo que se dijo.'
const FIRMA = 'María de la Fuente Llorens'
const BAJADA_EL = '2026-06-24T07:18:12.464Z'
const HOY = '2026-09-30T18:00:00.000Z'

const CONTRATO: ClaimEvidence = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=x',
  snippet: 'Servicio mantenimiento instalaciones en complejo deportivo La Malla.',
}

/** La bajada de junio tal como está: parcial, con evidencia, firmada por una pasada. */
function bajadaDeJunio(): OverlayEntry {
  const motivo =
    'Gold review (ai): La Malla complex confirmed via maintenance tender; budget not verified'
  return {
    verification: {
      claimId: ID,
      verdict: 'parcial',
      summary: motivo,
      evidence: [CONTRATO],
      checkedAgainst: ['curator-downgrade'],
    },
    source: 'curator-downgrade',
    reason: motivo,
    editor: 'ai-gold-review',
    appliedAt: BAJADA_EL,
  }
}

/** La entrada que deja una retirada, escrita a mano: lo que se espera. */
function entradaRetirada(): OverlayEntry {
  return {
    verification: {
      claimId: ID,
      verdict: 'sin-datos',
      summary: MOTIVO,
      evidence: [],
      checkedAgainst: ['curator-downgrade'],
    },
    source: 'curator-downgrade',
    reason: MOTIVO,
    editor: FIRMA,
    appliedAt: HOY,
    retirada: { motivo: 'literal-no-dicho', literal: HUELLA },
  }
}

const overlayCon = (entries: Record<string, OverlayEntry>): Overlay => ({
  version: 1,
  generatedAt: BAJADA_EL,
  entries,
})

const pedida = (extra: Partial<RetiradaPedida> = {}): RetiradaPedida => ({
  claimId: ID,
  literal: LITERAL,
  motivo: MOTIVO,
  editor: FIRMA,
  ...extra,
})

/** Un item publicado, con lo que la puerta lee y nada más que haga falta. */
const publicado = (verification: Record<string, unknown>, type = 'cita_obra') =>
  ({
    claim: { id: ID, plenoId: 'p1', type, verbatim: LITERAL },
    verification,
  }) as never

describe('la puerta: una declaración retirada por una persona no se publica', () => {
  const firmada = {
    claimId: ID,
    verdict: 'parcial',
    summary: 'firmada por un curador',
    evidence: [CONTRATO],
    checkedAgainst: ['curator-downgrade'],
    source: 'curator-downgrade',
  }

  it('la oculta, por fundada que esté; sin la retirada, la misma fila se enseña', () => {
    // El par es la prueba: sin el control, una puerta que lo ocultara todo
    // pasaría igual.
    expect(classifyClaimVisibility(publicado(firmada))).toBe('shown')
    expect(
      classifyClaimVisibility(
        publicado({ ...firmada, retirada: { motivo: 'literal-no-dicho', literal: HUELLA } }),
      ),
    ).toBe('hidden')
  })

  it('también la que se enseñaba plegada como «sin datos»', () => {
    const sinDatos = { ...firmada, verdict: 'sin-datos', evidence: [] }
    expect(classifyClaimVisibility(publicado(sinDatos))).toBe('toggle')
    expect(
      classifyClaimVisibility(
        publicado({ ...sinDatos, retirada: { motivo: 'literal-no-dicho', literal: HUELLA } }),
      ),
    ).toBe('hidden')
  })

  it('sólo por el canal de la persona: una pasada que traiga la marca no retira nada', () => {
    const delMotor = {
      claimId: ID,
      verdict: 'sin-datos',
      summary: 'No se encontró registro en tenders.',
      evidence: [],
      checkedAgainst: ['tenders'],
      source: 'verdict-engine',
      retirada: { motivo: 'literal-no-dicho', literal: HUELLA },
    }
    expect(motivoDeRetirada(publicado(delMotor))).toBeNull()
    expect(classifyClaimVisibility(publicado(delMotor))).toBe('toggle')
  })

  it('gateItemsForPublic la deja fuera de los trozos', () => {
    const otra = {
      claim: { id: 'p1-133-cit-bbbbbb', plenoId: 'p1', type: 'cita_obra', verbatim: 'otra' },
      verification: { ...firmada, claimId: 'p1-133-cit-bbbbbb' },
    } as never
    const retirada = publicado({
      ...firmada,
      retirada: { motivo: 'literal-no-dicho', literal: HUELLA },
    })
    expect(gateItemsForPublic([otra, retirada]).map((i) => i.claim.id)).toEqual([
      'p1-133-cit-bbbbbb',
    ])
  })
})

describe('retirarDeclaracion: la entrada que escribe', () => {
  it('rebaja a sin-datos, vacía la evidencia, firma la persona y guarda la huella del literal', () => {
    const antes = overlayCon({ [ID]: bajadaDeJunio() })
    const despues = retirarDeclaracion(antes, pedida(), HOY)
    expect(despues.entries[ID]).toEqual(entradaRetirada())
    expect(despues.generatedAt).toBe(HOY)
    // Puro: lo que entra no cambia.
    expect(antes.entries[ID]).toEqual(bajadaDeJunio())
  })

  it('el overlay se sirve: la entrada lleva la huella del literal, nunca su texto', () => {
    const texto = JSON.stringify(retirarDeclaracion(overlayCon({}), pedida(), HOY))
    expect(texto).not.toContain('presupuestó en el año')
    expect(texto).toContain(HUELLA)
  })

  it('retira también una que ya estaba en sin-datos: no es una bajada de veredicto', () => {
    const delMotor: OverlayEntry = {
      verification: {
        claimId: ID,
        verdict: 'sin-datos',
        summary: 'No se encontró registro en tenders para lo que afirma la declaración.',
        evidence: [],
        checkedAgainst: ['tenders'],
      },
      source: 'verdict-engine',
      reason: 'No se encontró registro en tenders para lo que afirma la declaración.',
      editor: 'verdict-engine:gpt-5.4-mini',
      appliedAt: BAJADA_EL,
    }
    const despues = retirarDeclaracion(overlayCon({ [ID]: delMotor }), pedida(), HOY)
    expect(despues.entries[ID]).toEqual(entradaRetirada())
  })

  it('una declaración sin entrada en el overlay también se retira', () => {
    expect(retirarDeclaracion(overlayCon({}), pedida(), HOY).entries[ID]).toEqual(entradaRetirada())
  })

  it.each<[string, Partial<RetiradaPedida>, RegExp]>([
    ['sin firma de persona', { editor: 'curator' }, /persona/],
    ['firmada por una pasada', { editor: 'ai-gold-review' }, /persona/],
    ['con un motivo corto', { motivo: 'no se dijo así' }, /20/],
    [
      'con un motivo que vuelve a imprimir el literal',
      {
        motivo:
          'El literal «se presupuestó en el año 2006 y tuvieron que repararlo» no es lo que se oye en el audio.',
      },
      /literal/,
    ],
    ['sin literal que retirar', { literal: '  ' }, /literal/],
  ])('se niega %s', (_, extra, error) => {
    expect(() =>
      retirarDeclaracion(overlayCon({ [ID]: bajadaDeJunio() }), pedida(extra), HOY),
    ).toThrow(error)
  })

  it('se niega a retirar dos veces: la retirada ya está firmada', () => {
    const una = retirarDeclaracion(overlayCon({ [ID]: bajadaDeJunio() }), pedida(), HOY)
    expect(() => retirarDeclaracion(una, pedida({ editor: 'Otra Persona Distinta' }), HOY)).toThrow(
      /retirada/,
    )
  })
})

describe('validateOverlay: la retirada sólo la firma una persona, y sólo a sin-datos', () => {
  it('acepta la bien formada', () => {
    expect(() => validateOverlay(overlayCon({ [ID]: entradaRetirada() }))).not.toThrow()
  })

  it.each<[string, (e: OverlayEntry) => OverlayEntry, RegExp]>([
    [
      'en una entrada que no es de curador',
      (e) => ({ ...e, source: 'verdict-engine' }),
      /curador|curator/,
    ],
    [
      'con un veredicto por encima de sin-datos',
      (e) => ({
        ...e,
        verification: { ...e.verification, verdict: 'parcial', evidence: [CONTRATO] },
      }),
      /sin-datos/,
    ],
    ['firmada por una cuenta', (e) => ({ ...e, editor: 'curator' }), /persona/],
    [
      'con el literal en claro en vez de su huella',
      (e) => ({ ...e, retirada: { motivo: 'literal-no-dicho', literal: LITERAL } }),
      /huella/,
    ],
    [
      'con un motivo de retirada que no existe',
      (e) => ({ ...e, retirada: { motivo: 'no-me-gusta', literal: HUELLA } as never }),
      /motivo/,
    ],
  ])('rechaza la retirada %s', (_, mutar, error) => {
    expect(() => validateOverlay(overlayCon({ [ID]: mutar(entradaRetirada()) }))).toThrow(error)
  })
})

describe('lo que ya está retirado no lo vuelve a publicar ninguna escritura', () => {
  it('una pasada del motor no pisa la retirada, aunque escriba el mismo sin-datos', () => {
    // Sin esta guarda, la entrada nueva sustituiría a la firmada, se llevaría
    // la marca y la declaración volvería a publicarse: una subida de
    // visibilidad hecha por una máquina.
    const retirada = overlayCon({ [ID]: entradaRetirada() })
    expect(() =>
      applyOverlayEntries(
        retirada,
        [
          {
            claimId: ID,
            verification: {
              claimId: ID,
              verdict: 'sin-datos',
              summary: 'No se encontró registro en tenders para lo que afirma la declaración.',
              evidence: [],
              checkedAgainst: ['tenders'],
            },
            source: 'verdict-engine',
            reason: 'No se encontró registro en tenders para lo que afirma la declaración.',
            editor: 'verdict-engine:gpt-5.4-mini',
          },
        ],
        HOY,
      ),
    ).toThrow(/retirada/)
  })

  it('enmendar su motivo conserva la retirada', () => {
    const { overlay } = enmendarMotivoDeBajada(
      overlayCon({ [ID]: entradaRetirada() }),
      {
        claimId: ID,
        veredicto: 'sin-datos',
        motivo:
          'Escuchada la sesión, en el audio se oyen importes donde el literal pone un año: no es lo que se dijo.',
        porque: 'Se reescribe el motivo para que se entienda sin la marca de tiempo del vídeo.',
        editor: FIRMA,
      },
      '2026-10-01T09:00:00.000Z',
    )
    expect(overlay.entries[ID].retirada).toEqual({ motivo: 'literal-no-dicho', literal: HUELLA })
  })
})

describe('mergeVerified: la retirada viaja con la verificación publicada', () => {
  const base: VerifiedItem[] = [
    {
      claim: { id: ID, verbatim: LITERAL } as VerifiedItem['claim'],
      verification: {
        claimId: ID,
        verdict: 'parcial',
        summary: 'Coincidencia parcial: hay datos relacionados pero no idénticos al claim.',
        evidence: [CONTRATO],
        checkedAgainst: ['tenders'],
      },
    },
  ]

  it('la estampa desde la entrada validada, como el canal', () => {
    const [it0] = mergeVerified(base, overlayCon({ [ID]: entradaRetirada() }))
    expect(it0.verification).toMatchObject({
      verdict: 'sin-datos',
      source: 'curator-downgrade',
      retirada: { motivo: 'literal-no-dicho', literal: HUELLA },
    })
    // Y así la ve cualquiera que pregunte a la puerta con el item fusionado:
    // el troceador, el auto-curador, el cotejo de relaciones.
    expect(classifyClaimVisibility(it0)).toBe('hidden')
  })

  it('no la toma de dentro de la verificación: manda la entrada', () => {
    const colada = {
      ...bajadaDeJunio(),
      verification: {
        ...bajadaDeJunio().verification,
        retirada: { motivo: 'literal-no-dicho', literal: HUELLA },
      } as OverlayEntry['verification'],
    }
    const [it0] = mergeVerified(base, overlayCon({ [ID]: colada }))
    expect(it0.verification).not.toHaveProperty('retirada')
    expect(classifyClaimVisibility(it0)).toBe('shown')
  })
})

describe('el recuento: las retiradas se cuentan aparte', () => {
  const retiradaItem = {
    claim: { id: ID, plenoId: 'p1', type: 'cita_obra', verbatim: LITERAL },
    verification: {
      verdict: 'sin-datos',
      source: 'curator-downgrade',
      checkedAgainst: ['curator-downgrade'],
      retirada: { motivo: 'literal-no-dicho', literal: HUELLA },
    },
  }
  const normal = {
    claim: { id: 'p1-133-cit-bbbbbb', plenoId: 'p1', type: 'cita_obra', verbatim: 'otra' },
    verification: { verdict: 'sin-datos', checkedAgainst: ['tenders'] },
  }

  it('por motivo, y una sin procedencia no cuenta dos veces', () => {
    expect(contarRetiradas([retiradaItem, normal] as never, new Set())).toEqual({
      'literal-no-dicho': 1,
    })
    // La que ya retiene la puerta de procedencia se cuenta allí: las filas de
    // la tarjeta de /plenos son una partición de lo extraído.
    expect(contarRetiradas([retiradaItem, normal] as never, new Set([ID]))).toEqual({})
  })

  it('el manifiesto las lleva en sus totales, y no entran en los trozos', () => {
    const servidos = gateItemsForPublic([retiradaItem, normal] as never)
    const { manifest, chunks } = buildManifest(
      groupItemsByPleno(servidos),
      '2026-09-30T18:00:00.000Z',
      { cita_obra: 1 },
      0,
      { 'literal-no-dicho': 1 },
    )
    expect(manifest.totals.retiradas).toEqual({ 'literal-no-dicho': 1 })
    expect(manifest.totals.items).toBe(1)
    expect(chunks.get('p1')!.items.map((i) => i.claim.id)).toEqual(['p1-133-cit-bbbbbb'])
  })

  it('cuenta cualquier motivo del enum exportado, no una lista recitada', () => {
    // Si alguien añade un motivo, el recuento lo ve sin tocar esta prueba.
    for (const m of MOTIVOS_DE_RETIRADA) {
      const item = {
        ...retiradaItem,
        verification: { ...retiradaItem.verification, retirada: { motivo: m, literal: HUELLA } },
      }
      expect(contarRetiradas([item] as never, new Set())).toEqual({ [m]: 1 })
    }
  })
})
