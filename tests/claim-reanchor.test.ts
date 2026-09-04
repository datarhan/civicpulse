import { describe, it, expect } from 'vitest'
import {
  applyReanchorEntries,
  mergeVerified,
  reanchorOutcomes,
  retencionLexica,
  validateReanchors,
  RETENCION_MINIMA,
  type Reanchors,
} from '../src/scraper/verified-merge'
import { buildClaimReanchorQueue, VENTANA_HOLGADA } from '../src/scraper/claim-reanchor'
import { candidatePassages, indexTranscript } from '../src/scraper/quote-reanchor'

/**
 * El cuarto estrato: el literal.
 *
 * `check:claim-provenance` retuvo siete declaraciones publicadas cuyo literal no
 * constaba en ninguna transcripción. Cinco no eran citas inventadas: eran la
 * frase del acta mal recortada («año de feria» perdido) o mal flexionada
 * («aprobó» por «ha aprobado»). Reanclarlas recupera la procedencia; el peligro
 * es que la misma vía sirva para cambiar una cita por otra, y de eso van casi
 * todas estas pruebas.
 */

const claim = (over: Record<string, unknown> = {}) =>
  ({
    id: 'p1-001-afi-aaa',
    plenoId: 'p1',
    type: 'afirmacion_numerica',
    speakerGroup: null,
    verbatim: 'se aprobó unanimidad la urgencia del punto',
    ...over,
  }) as never

const item = (over: Record<string, unknown> = {}) =>
  ({ claim: claim(over), verification: { verdict: 'sin-datos' } }) as never

const vacio = { version: 1, generatedAt: '', entries: {} } as never
const publicado = (verbatim: string, speakerGroup: string | null = null) =>
  new Map([['p1-001-afi-aaa', { verbatim, speakerGroup }]])

const entrada = (over: Record<string, unknown> = {}) =>
  ({
    verbatim: 'se ha aprobado unanimidad la urgencia del punto',
    from: 'se aprobó unanimidad la urgencia del punto',
    fuente: 'superseded/p1.txt',
    reason: 'el extractor flexionó el verbo al citar, se reancla al acta',
    appliedAt: '2026-09-04T00:00:00.000Z',
    ...over,
  }) as never

const sidecar = (e: unknown = entrada()): Reanchors =>
  ({ version: 1, generatedAt: '', entries: { 'p1-001-afi-aaa': e } }) as never

describe('retención léxica', () => {
  /**
   * Las cifras son las medidas sobre el corpus real el 4-09-2026, no un ejemplo
   * inventado: es lo que justifica dónde está el suelo.
   */
  it('mide lo que sobrevive del literal viejo en el nuevo', () => {
    // Palabra añadida: no se pierde nada.
    expect(
      retencionLexica('esa prolongación en el 2023 2024', 'esta prolongación en el 2023 2024'),
    ).toBe(1)
    // Cambio de flexión: «aprobo» y «aprobado» son palabras distintas.
    expect(
      retencionLexica('se aprobó unanimidad la urgencia', 'se ha aprobado unanimidad la urgencia'),
    ).toBeCloseTo(2 / 3, 5)
    // Y un pasaje ajeno de la misma sesión no conserva nada.
    expect(
      retencionLexica(
        'se han solicitado informes a administraciones',
        'presupuesto qué pasa con Benita',
      ),
    ).toBe(0)
  })

  it('el suelo deja pasar los reanclajes reales y para la sustitución gruesa', () => {
    const reales = [1, 1, 2 / 3, 0.75]
    for (const r of reales) expect(r).toBeGreaterThanOrEqual(RETENCION_MINIMA)
    expect(0).toBeLessThan(RETENCION_MINIMA)
  })
})

describe('validateReanchors', () => {
  it('acepta una entrada bien formada', () => {
    expect(() => validateReanchors(sidecar())).not.toThrow()
  })

  it('exige motivo, fuente, from y un literal que no sea el mismo', () => {
    expect(() => validateReanchors(sidecar(entrada({ reason: 'corto' })))).toThrow(/20 chars/)
    expect(() => validateReanchors(sidecar(entrada({ fuente: '' })))).toThrow(/fuente/)
    expect(() => validateReanchors(sidecar(entrada({ from: '' })))).toThrow(/from/)
    expect(() =>
      validateReanchors(
        sidecar(entrada({ verbatim: 'se aprobó unanimidad la urgencia del punto' })),
      ),
    ).toThrow(/nothing is being re-anchored/)
  })

  it('no deja rebajar el mínimo de 20 caracteres del esquema', () => {
    expect(() => validateReanchors(sidecar(entrada({ verbatim: 'muy corto' })))).toThrow(/20 chars/)
  })

  /**
   * LA prueba de este fichero: el sidecar se valida también AL LEER, así que un
   * fichero editado a mano no puede colar una sustitución que el CLI rechazaría.
   */
  it('revienta con una sustitución gruesa metida a mano', () => {
    expect(() =>
      validateReanchors(sidecar(entrada({ verbatim: 'presupuesto qué pasa con Benita y con' }))),
    ).toThrow(/palabras con contenido/)
  })
})

describe('applyReanchorEntries', () => {
  const alta = {
    claimId: 'p1-001-afi-aaa',
    verbatim: 'se ha aprobado unanimidad la urgencia del punto',
    fuente: 'superseded/p1.txt',
    reason: 'el extractor flexionó el verbo al citar, se reancla al acta',
  }

  it('registra el literal publicado en `from`', () => {
    const out = applyReanchorEntries(
      vacio,
      [alta],
      'T',
      publicado('se aprobó unanimidad la urgencia del punto'),
    )
    expect(out.entries['p1-001-afi-aaa'].from).toBe('se aprobó unanimidad la urgencia del punto')
    expect(out.entries['p1-001-afi-aaa'].appliedAt).toBe('T')
  })

  /**
   * La negativa que no es obvia. `speakerGroup` lo resuelve el extractor con
   * `resolveBloc(raw.verbatim)`, o sea sobre las palabras que el reanclaje
   * sustituye: moverlas dejaría un partido colgado de una frase que el mapa de
   * voces nunca emparejó. Con el control al lado, para que la prueba no pase
   * también con la puerta cerrada del todo.
   */
  it('se niega a reanclar una cita con bloc atribuido, y sí una sin él', () => {
    expect(() =>
      applyReanchorEntries(
        vacio,
        [alta],
        'T',
        publicado('se aprobó unanimidad la urgencia del punto', 'PSOE'),
      ),
    ).toThrow(/retract-attribution/)
    expect(() =>
      applyReanchorEntries(
        vacio,
        [alta],
        'T',
        publicado('se aprobó unanimidad la urgencia del punto', null),
      ),
    ).not.toThrow()
  })

  it('no reancla lo que no está publicado', () => {
    expect(() => applyReanchorEntries(vacio, [alta], 'T', new Map())).toThrow(/published corpus/)
  })
})

describe('mergeVerified con reanclajes', () => {
  it('sustituye el literal y deja el id intacto', () => {
    const [out] = mergeVerified([item()], vacio, undefined, sidecar())
    expect(out.claim.verbatim).toBe('se ha aprobado unanimidad la urgencia del punto')
    expect(out.claim.id).toBe('p1-001-afi-aaa')
  })

  it('una entrada cuyo `from` ya no coincide queda OBSOLETA, no se aplica', () => {
    const movido = item({ verbatim: 'la base dice otra cosa desde ayer por su cuenta' })
    const [out] = mergeVerified([movido], vacio, undefined, sidecar())
    expect(out.claim.verbatim).toBe('la base dice otra cosa desde ayer por su cuenta')
    expect(reanchorOutcomes([movido], sidecar()).obsoletas).toEqual(['p1-001-afi-aaa'])
  })

  it('los tres desenlaces se cuentan por separado', () => {
    expect(reanchorOutcomes([item()], sidecar()).aplicadas).toEqual(['p1-001-afi-aaa'])
    expect(reanchorOutcomes([], sidecar()).sinClaim).toEqual(['p1-001-afi-aaa'])
  })

  /**
   * Los dos sidecars tocan campos distintos y se COMPONEN. Escrito como un
   * `else if` —que es como sale a la primera— aplicar el segundo deshace el
   * primero en silencio, y nada más lo miraría.
   */
  it('un claim reclasificado Y reanclado sale con las dos correcciones', () => {
    const acusacion = item({ type: 'acusacion_publica' })
    const reclas = {
      version: 1,
      generatedAt: '',
      entries: {
        'p1-001-afi-aaa': {
          type: 'valoracion_politica',
          from: 'acusacion_publica',
          reason: 'no acusa a nadie, valora una ley estatal y su encaje',
          appliedAt: 'T',
        },
      },
    } as never
    const [out] = mergeVerified([acusacion], vacio, reclas, sidecar())
    expect(out.claim.type).toBe('valoracion_politica')
    expect(out.claim.verbatim).toBe('se ha aprobado unanimidad la urgencia del punto')
  })
})

/**
 * La ventana de `candidatePassages` la fija la cita, y el extractor RECORTA al
 * citar, así que el pasaje verdadero es más largo que lo publicado. Medido sobre
 * `10yl550-265`: con la ventana justa el acierto empata con un pasaje que no
 * tiene nada que ver y pierde por orden de aparición.
 */
describe('la ventana holgada', () => {
  const acta =
    '[10.0 → 20.0] (SPEAKER_1) Corresponden a servicios prestados a finales del pasado año, ' +
    'pero que las facturas han sido registradas durante los meses de enero y febrero de 2026.\n' +
    '[30.0 → 40.0] (SPEAKER_2) Durante este año, en el año 2026, año de feria, hemos comprobado ' +
    'que no es cuestión de agotamiento del personal.\n'
  const cita = 'durante este año, en el año 2026, hemos comprobado que'
  const index = indexTranscript(acta)

  it('con holgura, el pasaje verdadero gana', () => {
    const [mejor] = candidatePassages(cita, index, { windowFactor: VENTANA_HOLGADA })
    expect(mejor.text).toContain('año de feria')
    expect(mejor.contentOverlap).toBe(1)
  })

  /** CONTROL: sin holgura no gana, que es el defecto que la holgura repara. */
  it('sin holgura, no', () => {
    const [mejor] = candidatePassages(cita, index)
    expect(mejor.contentOverlap).toBeLessThan(1)
  })

  it('el defecto por omisión no cambia para la cola de /hallazgos', () => {
    expect(candidatePassages(cita, index)).toEqual(
      candidatePassages(cita, index, { windowFactor: 1 }),
    )
  })
})

describe('la cola de reanclaje de declaraciones', () => {
  const acta =
    '[0.0 → 9.0] (SPEAKER_1) Vale, falta un voto, se ha aprobado unanimidad la urgencia del punto.\n'
  const corpus = new Map([['p1', [{ fuente: 'current', index: indexTranscript(acta) }]]])
  const items = [
    item(),
    item({ id: 'p1-002-afi-bbb', verbatim: 'esta otra sí que consta y no se retiene' }),
  ] as never[]

  it('encola exactamente lo que la puerta retuvo, y nada más', () => {
    const q = buildClaimReanchorQueue(items, new Set(['p1-001-afi-aaa']), corpus, {
      generatedAt: 'T',
    })
    expect(q.rows.map((r) => r.claimId)).toEqual(['p1-001-afi-aaa'])
    expect(q.stats.retenidas).toBe(1)
    expect(q.stats.encoladas).toBe(1)
  })

  /** La garantía de la pantalla: propone, no elige. */
  it('nunca preselecciona, y el comando sale con el hueco sin rellenar', () => {
    const q = buildClaimReanchorQueue(items, new Set(['p1-001-afi-aaa']), corpus, {
      generatedAt: 'T',
    })
    expect(q.rows.every((r) => r.seleccion === null)).toBe(true)
    expect(q.rows[0].correctionCommand).toContain('<el pasaje del acta, copiado tal cual>')
    expect(q.rows[0].correctionCommand).not.toContain('se ha aprobado')
  })

  it('ordena las fuentes por su mejor candidato, no por dónde vive el fichero', () => {
    // La vigente traducida al inglés —el caso real de qz6weg— no puede quedar
    // delante de la sustituida que sí trae la frase.
    const traducida =
      '[0.0 → 9.0] (SPEAKER_1) fine, one vote missing, the urgency was approved unanimously.\n'
    const dos = new Map([
      [
        'p1',
        [
          { fuente: 'current', index: indexTranscript(traducida) },
          { fuente: 'superseded/p1.txt', index: indexTranscript(acta) },
        ],
      ],
    ])
    const q = buildClaimReanchorQueue(items, new Set(['p1-001-afi-aaa']), dos, { generatedAt: 'T' })
    expect(q.rows[0].candidatesPorFuente[0].fuente).toBe('superseded/p1.txt')
  })

  it('una sesión sin transcripción se cuenta aparte de una sin candidatos', () => {
    const q = buildClaimReanchorQueue(items, new Set(['p1-001-afi-aaa']), new Map(), {
      generatedAt: 'T',
    })
    expect(q.stats.sinTranscripcion).toBe(1)
    expect(q.stats.sinCandidatos).toBe(1)
  })
})
