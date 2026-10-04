import { describe, expect, it } from 'vitest'

import {
  conAtribucionFirmada,
  desenlacesDeAtribucionFirmada,
  escanosDe,
  firmarAtribucion,
  fuenteDelTramo,
  huellaDeLiteralFirmado,
  retirarAtribucionFirmada,
  tieneAtribucionFirmada,
  validarAtribucionesFirmadas,
  type AtribucionesFirmadas,
  type Escanos,
} from '../src/scraper/atribucion-firmada'
import { mergeVerified } from '../src/scraper/verified-merge'

/**
 * El quinto estrato: el grupo de quien habla, firmado por una persona.
 *
 * #218 llevó al registro de declaraciones las correcciones de atribución de
 * /hallazgos, y siete re-etiquetaban con prueba —el segundo de la grabación, la
 * frase con que la presidencia dio la palabra—. `retract-attribution` sólo sabe
 * escribir null, así que las siete quedaron sin grupo. Esto es la vía firmada
 * (docs/superpowers/specs/2026-10-04-atribucion-firmada-design.md), y casi todas
 * estas pruebas van de lo que NO deja escribir.
 */

const ESCANOS: Escanos = {
  unEscano: ['VOX', 'EU-Podem', 'Compromís'],
  variosEscanos: ['PSOE', 'PP'],
}

const LITERAL = 'trabajamos no para un conservatorio para dos conservatorios y lo hicimos'
const ID = 'p1-039-cit-aaaaaa'

const claim = (over: Record<string, unknown> = {}) =>
  ({
    id: ID,
    plenoId: 'p1',
    plenoDate: '2025-12-01',
    segmentIndex: 39,
    type: 'cita_obra',
    speakerGroup: null,
    verbatim: LITERAL,
    context: 'contexto',
    topic: 'educacion',
    entities: {},
    confidence: 0.9,
    reasoning: 'r',
    requiresHumanApproval: true,
    ...over,
  }) as never

const item = (over: Record<string, unknown> = {}) =>
  ({ claim: claim(over), verification: { claimId: ID, verdict: 'sin-datos' } }) as never

const vacio = (): AtribucionesFirmadas => ({ version: 1, generatedAt: '', entries: {} })

const MOTIVO =
  'La intervención es del grupo de gobierno: la presidencia responde al portavoz popular en ese turno (4.016–4.095 s).'

const entrada = (over: Record<string, unknown> = {}) => ({
  speakerGroup: 'PSOE',
  from: null,
  literal: huellaDeLiteralFirmado(LITERAL),
  segundos: { desde: 4016, hasta: 4095 },
  fuente: 'superseded/p1.txt',
  reason: MOTIVO,
  editor: 'María de la Fuente Llorens',
  appliedAt: '2026-10-04T12:00:00.000Z',
  ...over,
})

const doc = (e: unknown = entrada()): AtribucionesFirmadas =>
  ({ version: 1, generatedAt: '', entries: { [ID]: e } }) as never

describe('escanosDe — con qué composición se juzga', () => {
  it('separa los grupos de un escaño de los de varios, y deja fuera los que no tienen ninguno', () => {
    const e = escanosDe({ composition: { PSOE: 11, PP: 7, VOX: 1, 'EU-Podem': 1, Compromís: 1 } })
    expect(e).toEqual({
      unEscano: ['VOX', 'EU-Podem', 'Compromís'],
      variosEscanos: ['PSOE', 'PP'],
    })
  })

  it('sin composición no sabe nada, y lo dice con null en vez de con listas vacías', () => {
    expect(escanosDe(null)).toBeNull()
    expect(escanosDe({})).toBeNull()
  })
})

describe('huellaDeLiteralFirmado', () => {
  it('guarda la huella del literal, nunca el texto', () => {
    const h = huellaDeLiteralFirmado(LITERAL)
    expect(h).toMatch(/^literal firmado · sha256:[0-9a-f]{12}$/)
    expect(h).not.toContain('conservatorio')
    expect(huellaDeLiteralFirmado(LITERAL + ' y más')).not.toBe(h)
  })
})

describe('validarAtribucionesFirmadas — al leer, no se fía de nadie', () => {
  it('acepta una entrada bien formada', () => {
    expect(() => validarAtribucionesFirmadas(doc(), ESCANOS)).not.toThrow()
  })

  it.each(['civicpulse-curator', '<nombre y apellidos>', 'claude-opus-5', 'sergei'])(
    'una firma que no es de una persona («%s») no vale',
    (editor) => {
      expect(() => validarAtribucionesFirmadas(doc(entrada({ editor })), ESCANOS)).toThrow(
        /persona/,
      )
    },
  )

  it('un grupo de un escaño nombra a su concejal: nivel C, rechazado', () => {
    expect(() =>
      validarAtribucionesFirmadas(doc(entrada({ speakerGroup: 'VOX' })), ESCANOS),
    ).toThrow(/un solo escaño/)
  })

  it('un grupo sin escaños tampoco: no lo ocupa nadie', () => {
    expect(() =>
      validarAtribucionesFirmadas(doc(entrada({ speakerGroup: 'Ciudadanos' })), ESCANOS),
    ).toThrow(/escaño/)
  })

  it('un `from` de un escaño se rechaza: el fichero se sirve y emparejaría la declaración con él', () => {
    expect(() => validarAtribucionesFirmadas(doc(entrada({ from: 'Compromís' })), ESCANOS)).toThrow(
      /un solo escaño/,
    )
  })

  it('un `from` igual al grupo no re-etiqueta nada', () => {
    expect(() => validarAtribucionesFirmadas(doc(entrada({ from: 'PSOE' })), ESCANOS)).toThrow(
      /from/,
    )
  })

  it('el literal va como huella; el texto no se acepta', () => {
    expect(() => validarAtribucionesFirmadas(doc(entrada({ literal: LITERAL })), ESCANOS)).toThrow(
      /huella/,
    )
  })

  it.each([
    [{ desde: 4095, hasta: 4016 }],
    [{ desde: 4016, hasta: 4016 }],
    [{ desde: -1, hasta: 10 }],
    [{ desde: Number.NaN, hasta: 10 }],
    [{ desde: '4016', hasta: 4095 }],
  ])('unos segundos que no son un tramo (%j) se rechazan', (segundos) => {
    expect(() => validarAtribucionesFirmadas(doc(entrada({ segundos })), ESCANOS)).toThrow(
      /segundos/,
    )
  })

  it('el motivo dice algo: ≥20 caracteres, sin charla de la tarea', () => {
    expect(() =>
      validarAtribucionesFirmadas(doc(entrada({ reason: 'es del PSOE' })), ESCANOS),
    ).toThrow(/motivo/)
    expect(() =>
      validarAtribucionesFirmadas(
        doc(
          entrada({
            reason: 'Task completed: la intervención es del grupo de gobierno en ese turno.',
          }),
        ),
        ESCANOS,
      ),
    ).toThrow(/tarea/)
  })

  it('el motivo no nombra un grupo de un escaño, tampoco por su nombre hablado', () => {
    expect(() =>
      validarAtribucionesFirmadas(
        doc(
          entrada({
            reason: 'Habla tras la intervención de Esquerra Unida, en el turno del gobierno.',
          }),
        ),
        ESCANOS,
      ),
    ).toThrow(/un solo escaño/)
  })

  it('una sugerencia que espera firma no es una entrada', () => {
    expect(() =>
      validarAtribucionesFirmadas(doc(entrada({ requiresHumanApproval: true })), ESCANOS),
    ).toThrow(/requiresHumanApproval/)
  })

  it('sin composición falla cerrado si hay entradas, y no molesta si no las hay', () => {
    expect(() => validarAtribucionesFirmadas(doc(), null)).toThrow(/composición|escaños/)
    expect(() => validarAtribucionesFirmadas(vacio(), null)).not.toThrow()
  })
})

describe('firmarAtribucion — la escritura', () => {
  const pedida = (over: Record<string, unknown> = {}) => ({
    claimId: ID,
    grupo: 'PSOE',
    desde: 4016,
    hasta: 4095,
    motivo: MOTIVO,
    editor: '  María   de la Fuente Llorens ',
    ...over,
  })
  const declaracion = (over: Record<string, unknown> = {}) => ({
    base: { speakerGroup: null, verbatim: LITERAL },
    publicada: { verbatim: LITERAL },
    fuente: 'superseded/p1.txt' as string | null,
    ...over,
  })
  const STAMP = '2026-10-04T12:00:00.000Z'

  it('registra lo que decía la BASE, la huella de su literal, el tramo y dónde constan las palabras', () => {
    const antes = vacio()
    const despues = firmarAtribucion(antes, pedida(), declaracion(), ESCANOS, STAMP)
    expect(despues.entries[ID]).toEqual({
      speakerGroup: 'PSOE',
      from: null,
      literal: huellaDeLiteralFirmado(LITERAL),
      segundos: { desde: 4016, hasta: 4095 },
      fuente: 'superseded/p1.txt',
      reason: MOTIVO,
      editor: 'María de la Fuente Llorens',
      appliedAt: STAMP,
    })
    expect(despues.generatedAt).toBe(STAMP)
    // Puro: el documento de entrada no se toca.
    expect(antes.entries).toEqual({})
  })

  it('el `from` es el grupo de la base aunque lo publicado diga otra cosa', () => {
    const d = firmarAtribucion(
      vacio(),
      pedida({ grupo: 'PP' }),
      declaracion({ base: { speakerGroup: 'PSOE', verbatim: LITERAL } }),
      ESCANOS,
      STAMP,
    )
    expect(d.entries[ID].from).toBe('PSOE')
  })

  it('si los segundos no contienen las palabras de la declaración, no firma', () => {
    expect(() =>
      firmarAtribucion(vacio(), pedida(), declaracion({ fuente: null }), ESCANOS, STAMP),
    ).toThrow(/tramo|segundos/)
  })

  it('si la base ya dice ese grupo, no hay nada que firmar', () => {
    expect(() =>
      firmarAtribucion(
        vacio(),
        pedida(),
        declaracion({ base: { speakerGroup: 'PSOE', verbatim: LITERAL } }),
        ESCANOS,
        STAMP,
      ),
    ).toThrow(/ya dice/)
  })

  it('si la base lleva un grupo de un escaño, remite a retirarlo antes', () => {
    expect(() =>
      firmarAtribucion(
        vacio(),
        pedida(),
        declaracion({ base: { speakerGroup: 'VOX', verbatim: LITERAL } }),
        ESCANOS,
        STAMP,
      ),
    ).toThrow(/retract-attribution/)
  })

  it('no firma un grupo de un escaño', () => {
    expect(() =>
      firmarAtribucion(vacio(), pedida({ grupo: 'Compromís' }), declaracion(), ESCANOS, STAMP),
    ).toThrow(/un solo escaño/)
  })

  it('un motivo que reimprime el literal no se escribe: el fichero se sirve', () => {
    expect(() =>
      firmarAtribucion(
        vacio(),
        pedida({ motivo: `Dice «${LITERAL}» y lo dice el grupo de gobierno.` }),
        declaracion(),
        ESCANOS,
        STAMP,
      ),
    ).toThrow(/literal/)
  })

  it('tampoco si reimprime el literal publicado cuando un reanclaje lo cambió', () => {
    const publicado = 'trabajamos para dos conservatorios distintos en el mismo mandato municipal'
    expect(() =>
      firmarAtribucion(
        vacio(),
        pedida({ motivo: `Es del gobierno: ${publicado}.` }),
        declaracion({ publicada: { verbatim: publicado } }),
        ESCANOS,
        STAMP,
      ),
    ).toThrow(/literal/)
  })

  it('no firma una declaración que nombra a un concejal (`speakerSlug`)', () => {
    expect(() =>
      firmarAtribucion(
        vacio(),
        pedida(),
        declaracion({ base: { speakerGroup: null, verbatim: LITERAL, speakerSlug: 'ana-perez' } }),
        ESCANOS,
        STAMP,
      ),
    ).toThrow(/speakerSlug/)
  })

  it('sin composición no firma nada', () => {
    expect(() => firmarAtribucion(vacio(), pedida(), declaracion(), null, STAMP)).toThrow(
      /composición|escaños/,
    )
  })
})

describe('retirarAtribucionFirmada', () => {
  const STAMP = '2026-10-05T09:00:00.000Z'
  const MOTIVO_RETIRADA = 'El segundo firmado era el de otra intervención del mismo punto.'

  it('quita la entrada y deja las demás', () => {
    const otro = 'p1-040-cit-bbbbbb'
    const d = {
      version: 1,
      generatedAt: '',
      entries: { [ID]: entrada(), [otro]: entrada() },
    } as never
    const despues = retirarAtribucionFirmada(
      d,
      { claimId: ID, motivo: MOTIVO_RETIRADA, editor: 'María de la Fuente Llorens' },
      STAMP,
    )
    expect(Object.keys(despues.entries)).toEqual([otro])
    expect(despues.generatedAt).toBe(STAMP)
  })

  it('la firma una persona, con motivo, y sólo si hay algo que retirar', () => {
    const pedida = { claimId: ID, motivo: MOTIVO_RETIRADA, editor: 'María de la Fuente Llorens' }
    expect(() =>
      retirarAtribucionFirmada(doc(), { ...pedida, editor: 'civicpulse-curator' }, STAMP),
    ).toThrow(/persona/)
    expect(() => retirarAtribucionFirmada(doc(), { ...pedida, motivo: 'error' }, STAMP)).toThrow(
      /motivo/,
    )
    expect(() => retirarAtribucionFirmada(vacio(), pedida, STAMP)).toThrow(/no hay/)
  })
})

describe('fuenteDelTramo — ¿contienen los segundos firmados la declaración?', () => {
  // La vigente, con hablante; la sustituida, en tramos de 30 s sin hablante, que
  // es la forma real de las tres sustituidas de las siete (medido el 04-10-2026).
  const VIGENTE = [
    '[4010.0 → 4015.9] (SPEAKER_03) Gracias. Tiene la palabra el portavoz del grupo popular.',
    '[4016.2 → 4060.0] (SPEAKER_07) Nosotros pedimos el segundo conservatorio hace años.',
    '[4061.0 → 4064.5] (SPEAKER_01) trabajamos no para un conservatorio para dos conservatorios y lo hicimos',
    '[4064.6 → 4095.0] (SPEAKER_01) con el presupuesto de este ayuntamiento.',
    '[9000.0 → 9004.0] (SPEAKER_01) Otra vez: trabajamos no para un conservatorio para dos conservatorios y lo hicimos.',
  ].join('\n')
  const SUSTITUIDA = [
    '[3990.0 → 4020.0] Música',
    '[4020.0 → 4050.0] y en el punto quinto trabajamos no para un conservatorio para dos conservatorios y lo hicimos con el presupuesto',
    '[4050.0 → 4080.0] de este ayuntamiento',
  ].join('\n')

  it('lo encuentra en una transcripción con hablante, dentro del tramo', () => {
    expect(
      fuenteDelTramo(LITERAL, [{ fuente: 'current', texto: VIGENTE }], {
        desde: 4016,
        hasta: 4095,
      }),
    ).toBe('current')
  })

  it('lo encuentra en una sustituida de tramos de 30 s sin hablante', () => {
    expect(
      fuenteDelTramo(LITERAL, [{ fuente: 'superseded/p1.txt', texto: SUSTITUIDA }], {
        desde: 4016,
        hasta: 4095,
      }),
    ).toBe('superseded/p1.txt')
  })

  it('las palabras dichas en OTRO momento de la sesión no cuentan', () => {
    expect(
      fuenteDelTramo(LITERAL, [{ fuente: 'current', texto: VIGENTE }], {
        desde: 8000,
        hasta: 8999,
      }),
    ).toBeNull()
  })

  it('el tramo de la llamada de la presidencia, sin la declaración, no basta', () => {
    expect(
      fuenteDelTramo(LITERAL, [{ fuente: 'current', texto: VIGENTE }], {
        desde: 4000,
        hasta: 4016,
      }),
    ).toBeNull()
  })

  it('devuelve la primera transcripción que lo contiene, en el orden en que se le dan', () => {
    expect(
      fuenteDelTramo(
        LITERAL,
        [
          { fuente: 'current', texto: VIGENTE },
          { fuente: 'superseded/p1.txt', texto: SUSTITUIDA },
        ],
        { desde: 4016, hasta: 4095 },
      ),
    ).toBe('current')
  })
})

describe('mergeVerified con atribuciones firmadas', () => {
  const overlay = { version: 1, generatedAt: '', entries: {} } as never

  it('publica el grupo firmado con su marca, y deja el resto de la declaración intacto', () => {
    const [it0] = mergeVerified([item()], overlay, undefined, undefined, doc())
    expect(it0.claim.speakerGroup).toBe('PSOE')
    expect((it0.claim as { atribucionFirmada?: unknown }).atribucionFirmada).toEqual({
      desde: 4016,
      hasta: 4095,
    })
    expect(it0.claim.id).toBe(ID)
    expect(it0.claim.verbatim).toBe(LITERAL)
    expect(tieneAtribucionFirmada(it0.claim)).toBe(true)
  })

  it('una declaración sin entrada sale como estaba, el mismo objeto', () => {
    const otra = item({ id: 'p1-040-cit-bbbbbb' })
    const [fuera] = mergeVerified([otra], overlay, undefined, undefined, doc())
    expect(fuera).toBe(otra)
    expect(tieneAtribucionFirmada((fuera as { claim: object }).claim)).toBe(false)
  })

  it('se compone con la reclasificación y el reanclaje: salen las tres correcciones', () => {
    const base = item({ type: 'acusacion_publica', accusationSubtype: 'factual' })
    const reclas = {
      version: 1,
      generatedAt: '',
      entries: {
        [ID]: {
          type: 'valoracion_politica',
          from: 'acusacion_publica',
          reason: 'motivo de reclasificación de prueba',
          appliedAt: 'x',
        },
      },
    } as never
    const nuevo = 'trabajamos no para un conservatorio, para dos conservatorios, y lo hicimos'
    const reanc = {
      version: 1,
      generatedAt: '',
      entries: {
        [ID]: {
          verbatim: nuevo,
          from: LITERAL,
          fuente: 'current',
          reason: 'el extractor recortó la cita',
          appliedAt: 'x',
        },
      },
    } as never
    const [it0] = mergeVerified([base], overlay, reclas, reanc, doc())
    expect(it0.claim.type).toBe('valoracion_politica')
    expect(it0.claim.verbatim).toBe(nuevo)
    expect(it0.claim.speakerGroup).toBe('PSOE')
  })

  it('obsoleta porque la base pasó a otro grupo: sale SIN grupo, no con el de la base', () => {
    const [it0] = mergeVerified(
      [item({ speakerGroup: 'PP' })],
      overlay,
      undefined,
      undefined,
      doc(),
    )
    expect(it0.claim.speakerGroup).toBeNull()
    expect(tieneAtribucionFirmada(it0.claim)).toBe(false)
  })

  it('obsoleta porque la base pasó al grupo firmado: se queda el de la base, sin marca', () => {
    const [it0] = mergeVerified(
      [item({ speakerGroup: 'PSOE' })],
      overlay,
      undefined,
      undefined,
      doc(),
    )
    expect(it0.claim.speakerGroup).toBe('PSOE')
    expect(tieneAtribucionFirmada(it0.claim)).toBe(false)
  })

  it('obsoleta porque el literal cambió bajo el mismo id: sale sin grupo', () => {
    const [it0] = mergeVerified(
      [item({ verbatim: LITERAL + ' con el presupuesto' })],
      overlay,
      undefined,
      undefined,
      doc(),
    )
    expect(it0.claim.speakerGroup).toBeNull()
  })

  it('obsoleta porque el tramo ya no contiene las palabras: sale sin grupo', () => {
    const [it0] = mergeVerified([item()], overlay, undefined, undefined, doc(), new Set([ID]))
    expect(it0.claim.speakerGroup).toBeNull()
    expect(tieneAtribucionFirmada(it0.claim)).toBe(false)
  })

  it('una obsoleta sobre una base que tampoco tiene grupo deja la declaración tal cual', () => {
    const base = item()
    const [fuera] = mergeVerified(
      [base],
      overlay,
      undefined,
      undefined,
      doc(entrada({ from: 'PP' })),
    )
    expect(fuera).toBe(base)
  })
})

describe('conAtribucionFirmada — compara con la BASE, no con lo ya corregido', () => {
  it('un reanclaje que cambió el literal publicado no vuelve obsoleta la firma', () => {
    const base = claim()
    const reanclada = claim({
      verbatim: 'otro literal publicado, el del acta, más largo que el viejo',
    })
    const fuera = conAtribucionFirmada(base, reanclada, entrada() as never, false)
    expect(fuera.speakerGroup).toBe('PSOE')
    expect(fuera.verbatim).toBe('otro literal publicado, el del acta, más largo que el viejo')
  })
})

describe('desenlacesDeAtribucionFirmada', () => {
  it('cuenta aparte las aplicadas, las obsoletas con su porqué y las que no tienen declaración', () => {
    const ids = ['p1-001-cit-a', 'p1-002-cit-b', 'p1-003-cit-c', 'p1-004-cit-d', 'p1-005-cit-e']
    const base = [
      item({ id: ids[0] }),
      item({ id: ids[1], speakerGroup: 'PP' }),
      item({ id: ids[2], verbatim: 'un literal que ya no es el que se firmó, otro distinto' }),
      item({ id: ids[3] }),
    ]
    const d = {
      version: 1,
      generatedAt: '',
      entries: Object.fromEntries(ids.map((id) => [id, entrada()])),
    } as never
    expect(desenlacesDeAtribucionFirmada(base, d, new Set([ids[3]]))).toEqual({
      aplicadas: [ids[0]],
      obsoletas: [
        { id: ids[1], porque: 'grupo' },
        { id: ids[2], porque: 'literal' },
        { id: ids[3], porque: 'tramo' },
      ],
      sinClaim: [ids[4]],
    })
  })
})
