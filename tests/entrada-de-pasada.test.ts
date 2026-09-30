import { describe, it, expect } from 'vitest'
import { verifyClaimWithNli } from '../src/scraper/claim-verifier-nli'
import { verifyClaimWithEngine } from '../src/scraper/claim-verifier-engine'
import {
  applyOverlayEntries,
  mergeVerified,
  validateOverlay,
  type Overlay,
} from '../src/scraper/verified-merge'
import {
  entradaDelMotor,
  sugerenciaDelAnclaje,
  actualizarCola,
  validarCola,
  motivoParaNoProponer,
  COLA_SUGERENCIAS_NLI,
} from '../src/scraper/entrada-de-pasada'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { CandidateShortlist, ClaimVerification } from '../src/scraper/claim-verifier'
import type { NliPair, NliScore } from '../src/scraper/nli-client'

/**
 * Lo que cada runner escribe con lo que le devuelve su verificador.
 *
 * Los dos runners de segunda pasada construían su entrada dentro de `main()` —y
 * por eso ninguna prueba podía importarla— y los dos pisaban el campo que el
 * verificador acababa de rellenar: `{ ...r.verification, checkedAgainst: [marca] }`.
 * Desde la fase 1b (bfaf8b01) `checkedAgainst` dice CONTRA QUÉ se cotejó y
 * `derivedBy` QUÉ PASADA lo produjo; el runner volvía a meter la pasada en el
 * primero. En el de NLI eso además lo dejaba sin poder subir nada: el suelo de
 * evidencia no encuentra corpus y lanza (la corrida de la fase 6 sobre 87 filas
 * acabó con upgraded=0).
 *
 * Y una subida de NLI no se publica sola, aunque llegue al suelo: lo automático
 * sólo baja (docs/DATA_INTEGRITY.md, regla 4). Lo que el anclaje ve respaldado
 * va a la cola humana con `requiresHumanApproval: true`, y lo firma una persona.
 *
 * Las verificaciones salen de los verificadores reales, no se recitan: una
 * forma escrita a mano es cómo una prueba sigue verde mientras el runner hace
 * otra cosa (regla 1).
 */

const STAMP = '2026-09-29T00:00:00.000Z'
const OVERLAY_VACIO: Overlay = { version: 1, generatedAt: STAMP, entries: {} }

/** Una fila real de pleno-claims-verified.json (k4olcs, 20-04-2026), recortada. */
const CLAIM = {
  id: 'k4olcs-019-cit-947479',
  plenoId: 'k4olcs',
  plenoDate: '2026-04-20',
  segmentIndex: 19,
  type: 'cita_obra',
  speakerGroup: null,
  verbatim:
    'cartelería digital por importe de 35.252,87 y la actuación 2, sistema de debate, captura y grabación de vídeo y control del salón de plenos municipales.',
  context:
    'Por una parte sería la actuación 1, cartelería digital por importe de 35.252,87 y la actuación 2, sistema de debate, captura y grabación de vídeo y control del salón de plenos municipales.',
  topic: 'transparencia',
  entities: { amountEuros: 35252.87 },
  confidence: 0.9,
  reasoning: 'Se refiere a una actuación concreta del ayuntamiento con importe asociado.',
  requiresHumanApproval: true,
} as unknown as PlenoClaim

/** Lo que el contraste determinista dejó publicado para esa fila. */
const BASE_SIN_DATOS: ClaimVerification = {
  claimId: CLAIM.id,
  verdict: 'sin-datos',
  summary:
    'No se encontró registro en tenders / BDNS / presupuesto. El claim puede ser cierto pero no está atestiguado por los datos abiertos publicados.',
  evidence: [],
  checkedAgainst: ['tenders', 'tenders-ted', 'bdns', 'budget'],
}

/** Un contrato real de tenders.json (32/2024), como lo arma la lista corta. */
const CANDIDATO: CandidateShortlist = {
  kind: 'tender',
  ref: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=qDjb9WdwTN3jHF5qKI4aaw%3D%3D',
  snippet:
    'Contrato mixto suministro y servicio implantación de un sistema de debate, voto electrónico, captura, distribución, grabación de video y control para el salón de plenos del ayuntamiento de Riba-roja de Turia · Ayuntamiento de Riba-roja de Túria · services',
  similarity: 0.58,
}

/** Puntuador NLI de mentira: el mismo entailment para todo par. */
function puntuador(entailment: number, contradiction = 0.05) {
  return async (pares: NliPair[]) =>
    new Map<string, NliScore>(
      pares.map((p) => [
        p.id,
        {
          id: p.id,
          entailment,
          neutral: Math.max(0, 1 - entailment - contradiction),
          contradiction,
          label: 'entailment',
        },
      ]),
    )
}

/** Una subida real del anclaje NLI (0,93: por encima del umbral de `verificado`). */
async function subida(entailment = 0.93, contradiction = 0.05) {
  const r = await verifyClaimWithNli(
    { claim: CLAIM, candidates: [CANDIDATO] },
    puntuador(entailment, contradiction),
  )
  expect(r?.upgraded, 'el anclaje no subió: la prueba no mediría nada').toBe(true)
  return r
}

describe('la sugerencia del anclaje NLI', () => {
  it('conserva los corpus de su evidencia en checkedAgainst y su pasada en derivedBy', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(), desde: 'sin-datos' })
    expect(s).not.toBeNull()
    expect(s!.verification.checkedAgainst).toEqual(['tenders'])
    expect(s!.verification.derivedBy).toEqual(['nli-grounding'])
    expect(s!.verification.verdict).toBe('verificado')
    expect(s!.verification.evidence.map((e) => e.ref)).toEqual([CANDIDATO.ref])
  })

  it('se escribe sólo como fila de la cola humana', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(0.7), desde: 'sin-datos' })
    expect(s).toMatchObject({
      claimId: CLAIM.id,
      source: 'nli',
      desde: 'sin-datos',
      requiresHumanApproval: true,
    })
    expect(s!.verification.verdict).toBe('parcial')
  })

  it('lleva la contradicción fuerte que vio el modelo, para quien firme', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(0.93, 0.92), desde: 'sin-datos' })
    expect(s!.contradiccionNli).toBe(true)
  })

  it('sin subida no hay sugerencia', async () => {
    const r = await verifyClaimWithNli({ claim: CLAIM, candidates: [CANDIDATO] }, puntuador(0.2))
    expect(r?.upgraded, 'aquí el anclaje no debía subir').toBe(false)
    expect(sugerenciaDelAnclaje({ r, desde: 'sin-datos' })).toBeNull()
    expect(sugerenciaDelAnclaje({ r: null, desde: 'sin-datos' })).toBeNull()
  })

  it('no propone lo que no llega al suelo de evidencia', async () => {
    // La forma que escribía el runner: la marca de la pasada en lugar del corpus.
    const r = await subida()
    const pisada = {
      ...r!,
      verification: { ...r!.verification, checkedAgainst: ['nli-grounding'] },
    }
    expect(() => sugerenciaDelAnclaje({ r: pisada, desde: 'sin-datos' })).toThrow(/suelo/)
  })
})

describe('una subida de NLI no llega a lo publicado sin una persona', () => {
  it('el overlay rechaza la sugerencia tal cual', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(), desde: 'sin-datos' })!
    expect(() => applyOverlayEntries(OVERLAY_VACIO, [s], STAMP)).toThrow(/requiresHumanApproval/)
  })

  it('y quitándole la marca, también: el anclaje sólo propone', async () => {
    const r = await subida()
    // Llega al suelo —nombra `tenders` y trae evidencia—: lo que la para es la
    // firma que le falta, no la falta de corpus.
    expect(() =>
      applyOverlayEntries(
        OVERLAY_VACIO,
        [{ claimId: CLAIM.id, verification: r!.verification, source: 'nli' }],
        STAMP,
      ),
    ).toThrow(/firma/)
  })

  it('pegada a mano en el overlay, la lectura la rechaza', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(), desde: 'sin-datos' })!
    const pegada = {
      ...OVERLAY_VACIO,
      entries: { [CLAIM.id]: { ...s, appliedAt: STAMP } },
    } as unknown as Overlay
    expect(() => validateOverlay(pegada)).toThrow(/requiresHumanApproval/)
  })
})

describe('la cola de sugerencias', () => {
  it('vive en editorial/, que no se publica', () => {
    expect(COLA_SUGERENCIAS_NLI.startsWith('editorial/')).toBe(true)
  })

  it('una corrida añade lo que sube, quita lo que re-escaneó sin subir y deja lo demás', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(), desde: 'sin-datos' })!
    const otra = { ...s, claimId: 'otra', verification: { ...s.verification, claimId: 'otra' } }
    const vieja = { ...s, claimId: 'vieja', verification: { ...s.verification, claimId: 'vieja' } }
    const antes = actualizarCola(null, [], [otra, vieja], '2026-09-01T00:00:00.000Z')

    const despues = actualizarCola(antes, [CLAIM.id, 'vieja'], [s], STAMP)

    expect(Object.keys(despues.entries).sort()).toEqual([CLAIM.id, 'otra'].sort())
    expect(despues.entries[CLAIM.id].propuestaEn).toBe(STAMP)
    // La que esta corrida no miró conserva su sello: no se re-propuso hoy.
    expect(despues.entries.otra.propuestaEn).toBe('2026-09-01T00:00:00.000Z')
    expect(despues.generatedAt).toBe(STAMP)
    // Pura: la cola de entrada no cambia.
    expect(Object.keys(antes.entries).sort()).toEqual(['otra', 'vieja'])
  })

  it('rechaza una fila sin la marca de la firma pendiente', async () => {
    const s = sugerenciaDelAnclaje({ r: await subida(), desde: 'sin-datos' })!
    const cola = actualizarCola(null, [], [s], STAMP)
    const { requiresHumanApproval: _fuera, ...sinMarca } = cola.entries[CLAIM.id]
    expect(() =>
      validarCola({ ...cola, entries: { [CLAIM.id]: sinMarca } } as unknown as typeof cola),
    ).toThrow(/requiresHumanApproval/)
  })
})

describe('la entrada del motor de veredictos', () => {
  /** Una retractación real del motor; con `cita`, el modelo citó el contrato. */
  async function retractacion({ cita }: { cita: boolean }) {
    const r = await verifyClaimWithEngine(
      { claim: CLAIM, candidates: [CANDIDATO] },
      {
        reasonFn: async () =>
          'El contrato 32/2024 es del sistema de debate, pero no acredita el importe citado.',
        extractFn: async () => ({
          verdict: 'sin-datos',
          cites: cita
            ? [{ candidateIndex: 0, snippet: 'tender[0].title="sistema de debate"' }]
            : [],
        }),
      },
    )
    expect(r?.verification.verdict).toBe('sin-datos')
    return r!.verification
  }

  it('conserva los corpus de su evidencia en checkedAgainst y su pasada en derivedBy', async () => {
    const e = entradaDelMotor({
      verification: await retractacion({ cita: true }),
      modelo: 'prueba',
      tipo: 'retractacion',
      desde: 'parcial',
    })
    expect(e.source).toBe('verdict-engine')
    expect(e.verification.checkedAgainst).toEqual(['tenders'])
    expect(e.verification.derivedBy).toEqual(['verdict-engine'])
    expect(e.editor).toBe('verdict-engine:prueba')
    expect(e.reason).toMatch(/^verdict-engine \(prueba\) re-judged parcial→sin-datos: /)
  })

  it('sin evidencia, checkedAgainst queda vacío: no se rellena con la marca', async () => {
    const e = entradaDelMotor({
      verification: await retractacion({ cita: false }),
      modelo: 'prueba',
      tipo: 'retractacion',
      desde: 'verificado',
    })
    expect(e.verification.checkedAgainst).toEqual([])
    expect(e.verification.derivedBy).toEqual(['verdict-engine'])
  })

  it('la re-derivación deja las mismas anotaciones', async () => {
    const e = entradaDelMotor({
      verification: await retractacion({ cita: true }),
      modelo: 'prueba',
      tipo: 'rederivacion',
    })
    expect(e.verification.checkedAgainst).toEqual(['tenders'])
    expect(e.verification.derivedBy).toEqual(['verdict-engine'])
    expect(e.reason).toMatch(/re-derivó la retractación \(sigue sin-datos\)/)
  })

  it('llega a lo publicado con sus dos campos intactos', async () => {
    const e = entradaDelMotor({
      verification: await retractacion({ cita: true }),
      modelo: 'prueba',
      tipo: 'retractacion',
      desde: 'parcial',
    })
    const base = { ...BASE_SIN_DATOS, verdict: 'parcial' as const }
    const overlay = applyOverlayEntries(OVERLAY_VACIO, [e], STAMP)
    const [publicado] = mergeVerified([{ claim: CLAIM, verification: base }], overlay)
    expect(publicado.verification.verdict).toBe('sin-datos')
    expect(publicado.verification.checkedAgainst).toEqual(['tenders'])
    expect(publicado.verification.derivedBy).toEqual(['verdict-engine'])
    expect(publicado.verification.source).toBe('verdict-engine')
  })

  it('una verificación que el motor no produjo no se escribe como suya', () => {
    // Lo que devuelve `makeEngineVerifier` cuando no llega a preguntar al
    // modelo: el veredicto determinista, sin `derivedBy`. Firmarlo como del
    // motor sería el campo con dos significados otra vez.
    expect(() =>
      entradaDelMotor({
        verification: BASE_SIN_DATOS,
        modelo: 'prueba',
        tipo: 'retractacion',
        desde: 'parcial',
      }),
    ).toThrow(/motor/)
  })
})

describe('una subida nunca sustituye una retractación', () => {
  // `verify:pleno-claims:nli` toma sus candidatas de las filas `sin-datos`
  // PUBLICADAS, y entre ellas están las que un curador o el motor retractaron
  // a propósito. `applyOverlayEntries` sustituye la entrada que hubiera, y la
  // única guarda del rebuild (`acusacionesQueSuben`) mira sólo acusaciones.

  const MOTIVO = 'la evidencia citada no acredita el importe que se afirma'

  /** El overlay con una retractación ya escrita para CLAIM. */
  function conRetractacion(source: 'curator-downgrade' | 'verdict-engine'): Overlay {
    return {
      ...OVERLAY_VACIO,
      entries: {
        [CLAIM.id]: {
          verification: { ...BASE_SIN_DATOS, summary: MOTIVO, checkedAgainst: [] },
          source,
          reason: MOTIVO,
          editor: source === 'curator-downgrade' ? 'Curadora de prueba' : 'verdict-engine:prueba',
          appliedAt: STAMP,
        },
      },
    }
  }

  /** Un `parcial` con corpus y evidencia: llega al suelo de sobra. */
  const PARCIAL: ClaimVerification = {
    claimId: CLAIM.id,
    verdict: 'parcial',
    summary: 'la evidencia sólo acredita una parte de lo que se afirma',
    evidence: [{ ...CANDIDATO, stance: 'checked' }],
    checkedAgainst: ['tenders'],
  }

  for (const retractada of ['curator-downgrade', 'verdict-engine'] as const) {
    it(`una subida de NLI no pisa una retractación de «${retractada}»`, async () => {
      // Ya lo cubre `exigeFirma`: el overlay no acepta nada del anclaje.
      const r = await subida()
      const overlay = conRetractacion(retractada)
      expect(() =>
        applyOverlayEntries(
          overlay,
          [{ claimId: CLAIM.id, verification: r!.verification, source: 'nli' }],
          STAMP,
        ),
      ).toThrow()
      expect(overlay.entries[CLAIM.id].source).toBe(retractada)
    })

    it(`ni una «bajada» de curador que, medida contra la base, sube sobre una de «${retractada}»`, () => {
      // Las CLIs comparan con lo PUBLICADO; el overlay no se fía del mapa que
      // le pasen. Contra la base (`verificado`), `parcial` pasaría por bajada
      // y levantaría la retractación de `sin-datos` a `parcial`.
      expect(() =>
        applyOverlayEntries(
          conRetractacion(retractada),
          [
            {
              claimId: CLAIM.id,
              verification: PARCIAL,
              source: 'curator-downgrade',
              reason: MOTIVO,
            },
          ],
          STAMP,
          new Map([[CLAIM.id, 'verificado' as const]]),
        ),
      ).toThrow(/no sube lo que el overlay ya dice/)
    })
  }

  it('dentro de una misma escritura, tampoco', () => {
    const retractacion = {
      claimId: CLAIM.id,
      verification: { ...BASE_SIN_DATOS, derivedBy: ['verdict-engine'] },
      source: 'verdict-engine' as const,
      reason: MOTIVO,
    }
    expect(() =>
      applyOverlayEntries(
        OVERLAY_VACIO,
        [
          retractacion,
          { claimId: CLAIM.id, verification: PARCIAL, source: 'curator-downgrade', reason: MOTIVO },
        ],
        STAMP,
        new Map([[CLAIM.id, 'verificado' as const]]),
      ),
    ).toThrow(/no sube lo que el overlay ya dice/)
  })

  it('re-derivar una retractación del motor sigue pudiendo reescribirla', () => {
    const rederivada = {
      claimId: CLAIM.id,
      verification: { ...BASE_SIN_DATOS, derivedBy: ['verdict-engine'] },
      source: 'verdict-engine' as const,
      reason: `verdict-engine (prueba) re-derivó la retractación (sigue sin-datos): ${MOTIVO}`,
    }
    expect(() =>
      applyOverlayEntries(conRetractacion('verdict-engine'), [rederivada], STAMP),
    ).not.toThrow()
  })

  it('y bajar más una bajada de curador sigue pudiendo hacerse', () => {
    const conParcial: Overlay = {
      ...OVERLAY_VACIO,
      entries: {
        [CLAIM.id]: {
          verification: PARCIAL,
          source: 'curator-downgrade',
          reason: MOTIVO,
          appliedAt: STAMP,
        },
      },
    }
    expect(() =>
      applyOverlayEntries(
        conParcial,
        [
          {
            claimId: CLAIM.id,
            verification: { ...BASE_SIN_DATOS, summary: MOTIVO },
            source: 'curator-downgrade',
            reason: MOTIVO,
          },
        ],
        STAMP,
        new Map([[CLAIM.id, 'parcial' as const]]),
      ),
    ).not.toThrow()
  })
})

describe('el anclaje no propone volver a subir lo que se retractó', () => {
  it('dice por qué no se propone una fila retractada, y de quién es la retractación', () => {
    expect(motivoParaNoProponer('curator-downgrade')).toMatch(/curador/)
    expect(motivoParaNoProponer('verdict-engine')).toMatch(/motor/)
  })

  it('lo que no viene de una retractación se puede proponer', () => {
    expect(motivoParaNoProponer(undefined)).toBeNull()
    expect(motivoParaNoProponer('nli')).toBeNull()
  })

  it('la sugerencia se niega a partir de una retractación', async () => {
    const r = await subida()
    expect(() => sugerenciaDelAnclaje({ r, desde: 'sin-datos', fuente: 'verdict-engine' })).toThrow(
      /retractada/,
    )
    expect(() =>
      sugerenciaDelAnclaje({ r, desde: 'parcial', fuente: 'curator-downgrade' }),
    ).toThrow(/retractada/)
  })
})
