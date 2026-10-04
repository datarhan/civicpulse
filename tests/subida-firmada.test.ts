/**
 * La subida firmada: una persona sube el veredicto de una declaración, con el
 * registro que la sostiene y un resumen que escribe ella
 * (docs/superpowers/specs/2026-10-04-subida-firmada-design.md).
 *
 * Hasta el 04-10-2026 ninguna vía podía subir un veredicto: el overlay lo
 * prohibía a toda escritura («lo que bajó una retractación sólo lo vuelve a
 * subir una persona, por una vía que lo firme») y esa vía no existía. Aquí se
 * prueba la vía por el camino real —el overlay, la composición, la puerta—, con
 * los registros de verdad que citan las ocho declaraciones de la lectura de
 * ese día (tests/fixtures/subida-firmada-registros_2026-10-04.json).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evidenciaDelRegistro,
  retirarSubida,
  subidasSobreAcusaciones,
  subirVeredicto,
  type Observado,
  type SubidaPedida,
} from '../src/scraper/subida-firmada'
import {
  applyOverlayEntries,
  mergeVerified,
  overlayOutcomes,
  validateOverlay,
  type Overlay,
  type OverlayEntry,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import { RESUMEN_SIN_REGISTRO_FIJO } from '../src/scraper/claim-verdicts'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { componer } from '../scripts/verified-rebuild'

const REGISTROS = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-registros_2026-10-04.json'), 'utf8'),
)
const CORPUS = { tenders: REGISTROS.tenders, bdns: REGISTROS.bdns }

const ENLACE = {
  /** Cartelería digital (4415701): un contrato, adjudicado. */
  carteleria:
    'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=xkXNO23MYwoZDGvgaZEVxQ%3D%3D',
  /** Juegos del Parque Asunción (5198588): título corto. */
  juegos:
    'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=Dsw60vrWRmm5HQrHoP3G5A%3D%3D',
  /** 136/2025: dos lotes, Garbialdi y Auditesa, con el mismo enlace. */
  lotes:
    'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=oE58TiRVCfAZDGvgaZEVxQ%3D%3D',
  /** 97/2023: una licitación sin fila de contrato. */
  licitacion:
    'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=TO7sKuaZmazpxJFXpLZ%2B2A%3D%3D',
  /** La concesión del agua (46717): adjudicataria con espacios dobles. */
  agua: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=pK1YW0Z3femXQV0WE7lYPw%3D%3D',
  ribactiva: 'https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/752816',
}

const NBSP = ' '
const PERSONA = 'María de la Fuente Llorens'
const STAMP = '2026-10-04T12:00:00.000Z'
const ID = 'p1-034-cit-aaaaaa'
const VECINA = 'p1-050-cit-bbbbbb'
const RESUMEN =
  'La renovación de los juegos del parque de la Asunción de Nuestra Señora se contrató: suministro e instalación adjudicados el 8-09-2026 por 40.727,10 €.'
const MOTIVO_DEL_MOTOR =
  'verdict-engine (claude-code) re-judged parcial→sin-datos: ningún candidato respalda la afirmación con lo que muestra el extracto.'

const claim = (id: string, type = 'cita_obra') => ({
  id,
  plenoId: 'p1',
  plenoDate: '2026-01-19',
  segmentIndex: 34,
  type,
  ...(type === 'acusacion_publica' ? { accusationSubtype: 'factual' } : {}),
  speakerGroup: null,
  verbatim: 'renovación de juegos en el parque junto a la Asunción de Nuestra Señora',
  context: 'Contexto de prueba de la sesión.',
  topic: 'urbanismo',
  entities: {},
  confidence: 0.9,
  reasoning: 'Prueba.',
  requiresHumanApproval: true,
})

const sinDatos = (id: string) => ({
  claimId: id,
  verdict: 'sin-datos' as const,
  summary: RESUMEN_SIN_REGISTRO_FIJO,
  evidence: [],
  checkedAgainst: ['tenders', 'bdns'],
})

const base = (type = 'cita_obra'): VerifiedItem[] =>
  [
    { claim: claim(ID, type), verification: sinDatos(ID) },
    { claim: claim(VECINA), verification: sinDatos(VECINA) },
  ] as unknown as VerifiedItem[]

/** La retractación del motor que hoy publican las ocho. */
const retractacion: OverlayEntry = {
  verification: {
    claimId: ID,
    verdict: 'sin-datos',
    summary: MOTIVO_DEL_MOTOR,
    evidence: [],
    checkedAgainst: ['verdict-engine'],
  },
  source: 'verdict-engine',
  reason: MOTIVO_DEL_MOTOR,
  editor: 'verdict-engine:claude-code',
  appliedAt: '2026-08-02T00:00:00.000Z',
}

const overlayConRetractacion = (): Overlay => ({
  version: 1,
  generatedAt: '2026-08-02T00:00:00.000Z',
  entries: { [ID]: retractacion },
})

const observado = (extra: Partial<Observado> = {}): Observado => ({
  tipo: 'cita_obra',
  publicado: 'sin-datos',
  resumenesDeMaquina: [MOTIVO_DEL_MOTOR, RESUMEN_SIN_REGISTRO_FIJO],
  ...extra,
})

const pedida = (extra: Partial<SubidaPedida> = {}): SubidaPedida => ({
  claimId: ID,
  veredicto: 'parcial',
  evidencia: [evidenciaDelRegistro({ enlace: ENLACE.juegos, lote: null }, CORPUS)],
  resumen: RESUMEN,
  editor: PERSONA,
  ...extra,
})

const subir = (extra: Partial<SubidaPedida> = {}, obs: Partial<Observado> = {}) =>
  subirVeredicto(overlayConRetractacion(), pedida(extra), observado(obs), STAMP)

describe('evidenciaDelRegistro · la fila la escribe el registro, no quien firma', () => {
  it('un contrato adjudicado: título, expediente, adjudicataria, importe con céntimos y fecha', () => {
    const e = evidenciaDelRegistro({ enlace: ENLACE.juegos, lote: null }, CORPUS)
    expect(e).toEqual({
      kind: 'tender',
      ref: ENLACE.juegos,
      snippet:
        'Suministro con instalación de juegos infantiles en Parque Asunción de Nuestra Señora · ' +
        `expediente 36/2026 · adjudicado a URBEADAPTA S. L. por 40.727,10${NBSP}€ con IVA el 08-09-2026`,
      stance: 'checked',
    })
    // No es una puntuación de parecido: la tarjeta la imprimiría como si lo fuera.
    expect(e).not.toHaveProperty('similarity')
  })

  it('un título largo se recorta; el importe y la adjudicataria, nunca', () => {
    const e = evidenciaDelRegistro({ enlace: ENLACE.carteleria, lote: null }, CORPUS)
    expect(e.snippet.length).toBeLessThanOrEqual(240)
    expect(e.snippet).toMatch(/^Contrato mixto suministro y servicio de implantación de cartelería/)
    expect(e.snippet).toContain('…')
    expect(
      e.snippet.endsWith(
        `· expediente 33/2024 · adjudicado a VODAFONE ESPANA SA por 35.252,87${NBSP}€ con IVA el 29-05-2024`,
      ),
    ).toBe(true)
  })

  it('los espacios dobles del registro no pasan a la fila', () => {
    const e = evidenciaDelRegistro({ enlace: ENLACE.agua, lote: null }, CORPUS)
    expect(e.snippet).toContain(
      `adjudicado a HIDRAQUA GESTIÓN INTEGRAL DE AGUAS DE LEVANTE, S.A. por 55.685.178,79${NBSP}€ con IVA el 06-08-2026`,
    )
    expect(e.snippet).not.toMatch(/ {2}/)
  })

  it('un enlace con varios lotes no dice qué registro se cita: pide el lote y los enumera', () => {
    const intento = () => evidenciaDelRegistro({ enlace: ENLACE.lotes, lote: null }, CORPUS)
    expect(intento).toThrow(/--lote/)
    expect(intento).toThrow(/lote 1.*GARBIALDI/s)
    expect(intento).toThrow(/lote 2.*AUDITESA/s)
  })

  it('con el lote, la fila es la de ese lote y lo dice', () => {
    const e = evidenciaDelRegistro({ enlace: ENLACE.lotes, lote: 2 }, CORPUS)
    expect(e.ref).toBe(ENLACE.lotes)
    expect(e.snippet).toContain(
      `lote 2 del expediente 136/2025 · adjudicado a AUDITESA SL por 194.810,00${NBSP}€ con IVA el 10-09-2025`,
    )
    expect(e.snippet).not.toContain('GARBIALDI')
  })

  it('un lote que no existe, o un lote en un enlace de un solo contrato, se niega', () => {
    expect(() => evidenciaDelRegistro({ enlace: ENLACE.lotes, lote: 3 }, CORPUS)).toThrow(/lote 3/)
    expect(() => evidenciaDelRegistro({ enlace: ENLACE.juegos, lote: 2 }, CORPUS)).toThrow(
      /un solo contrato/,
    )
  })

  it('una convocatoria de la BDNS: su descripción, su código y su fecha', () => {
    const e = evidenciaDelRegistro({ enlace: ENLACE.ribactiva, lote: null }, CORPUS)
    expect(e.kind).toBe('bdns')
    expect(e.ref).toBe(ENLACE.ribactiva)
    expect(e.snippet).toMatch(/^CONVOCATORIA DE LAS AYUDAS RIBACTIVA EMPREN IV/)
    expect(e.snippet.endsWith('· convocatoria BDNS 752816 del 04-04-2024')).toBe(true)
    expect(e.snippet.length).toBeLessThanOrEqual(240)
  })

  it('un enlace que no está en el corpus se niega', () => {
    expect(() =>
      evidenciaDelRegistro(
        {
          enlace:
            'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=NOESTA',
          lote: null,
        },
        CORPUS,
      ),
    ).toThrow(/no está/)
  })

  it('una licitación sin contrato, un lote anulado o un estado desconocido no se citan por esta vía', () => {
    // La fila diría «adjudicado» de algo que no lo está.
    expect(() => evidenciaDelRegistro({ enlace: ENLACE.licitacion, lote: null }, CORPUS)).toThrow(
      /adjudicado|formalizado/,
    )
    const anulado = REGISTROS.tenders.contracts.find((r: { id: string }) => r.id === '1794430#2')
    const desconocido = REGISTROS.tenders.contracts.find((r: { id: string }) => r.id === '4996875')
    for (const r of [anulado, desconocido]) {
      expect(() => evidenciaDelRegistro({ enlace: r.permalink, lote: null }, CORPUS)).toThrow(
        /adjudicado|formalizado/,
      )
    }
  })
})

describe('subirVeredicto · la entrada que firma una persona', () => {
  it('escribe la subida: canal, firma, `desde`, y la verificación escrita desde el registro', () => {
    const o = subir()
    const e = o.entries[ID]
    expect(e.source).toBe('curator-upgrade')
    expect(e.editor).toBe(PERSONA)
    expect(e.desde).toBe('sin-datos')
    expect(e.appliedAt).toBe(STAMP)
    expect(e.reason).toBe(RESUMEN)
    expect(e.verification).toEqual({
      claimId: ID,
      verdict: 'parcial',
      summary: RESUMEN,
      evidence: [evidenciaDelRegistro({ enlace: ENLACE.juegos, lote: null }, CORPUS)],
      checkedAgainst: ['tenders'],
      derivedBy: ['curator-upgrade'],
    })
    // Sustituye la retractación del motor; no deja ninguna otra marca.
    expect(e).not.toHaveProperty('retirada')
    expect(e).not.toHaveProperty('reasonAmendments')
  })

  it('sube a verificado, y cita dos registros de dos corpus', () => {
    const o = subir({
      veredicto: 'verificado',
      evidencia: [
        evidenciaDelRegistro({ enlace: ENLACE.juegos, lote: null }, CORPUS),
        evidenciaDelRegistro({ enlace: ENLACE.ribactiva, lote: null }, CORPUS),
      ],
    })
    expect(o.entries[ID].verification.verdict).toBe('verificado')
    expect(o.entries[ID].verification.checkedAgainst).toEqual(['tenders', 'bdns'])
  })

  it.each([
    '<nombre y apellidos>',
    'Nombre Apellido',
    'civicpulse-curator',
    'claude-opus-5',
    'sergei',
  ])('firmada «%s», se niega: la sube una persona, con su nombre', (editor) => {
    expect(() => subir({ editor })).toThrow(/persona|nombre/)
  })

  it('nunca una acusación: sigue las reglas de /hallazgos', () => {
    expect(() => subir({}, { tipo: 'acusacion_publica' })).toThrow(/acusaci/)
    expect(() => subir({}, { tipo: 'acusacion_publica' })).toThrow(/hallazgos/)
  })

  it('el resumen no puede ser el de una máquina tal cual, ni con otras mayúsculas o espacios', () => {
    expect(() => subir({ resumen: MOTIVO_DEL_MOTOR })).toThrow(/máquina/)
    expect(() => subir({ resumen: `  ${MOTIVO_DEL_MOTOR.toUpperCase()}  ` })).toThrow(/máquina/)
    // La frase fija del verificador, aunque el llamante no la pase en la lista.
    expect(() =>
      subirVeredicto(
        overlayConRetractacion(),
        pedida({ resumen: RESUMEN_SIN_REGISTRO_FIJO }),
        observado({ resumenesDeMaquina: [] }),
        STAMP,
      ),
    ).toThrow(/máquina/)
  })

  it('el resumen tiene ≥20 caracteres y habla de la declaración, no de una tarea', () => {
    expect(() => subir({ resumen: 'Consta el contrato.' })).toThrow(/20/)
    expect(() =>
      subir({ resumen: 'Task completed: reasoned in Spanish about the candidates and the claim.' }),
    ).toThrow(/tarea/)
  })

  it('sin evidencia no sube: el suelo vale también para una persona', () => {
    expect(() => subir({ evidencia: [] })).toThrow(/suelo de evidencia/)
  })

  it('sólo sube: lo mismo, una bajada o un veredicto de fuera de la escala, se niegan', () => {
    expect(() => subir({ veredicto: 'parcial' }, { publicado: 'parcial' })).toThrow(/sube|subida/)
    expect(() => subir({ veredicto: 'parcial' }, { publicado: 'verificado' })).toThrow(
      /sube|subida/,
    )
    expect(() => subir({ veredicto: 'verificado' }, { publicado: 'contradicho' })).toThrow(
      /sube|subida/,
    )
    expect(() => subir({ veredicto: 'sin-datos' as never })).toThrow()
    expect(() => subir({ veredicto: 'contradicho' as never })).toThrow()
  })

  it('una declaración retirada no se sube: su literal no se dijo', () => {
    const retirada: Overlay = {
      version: 1,
      generatedAt: STAMP,
      entries: {
        [ID]: {
          verification: {
            ...sinDatos(ID),
            summary: 'Escuchada la sesión, se oye otra cifra.',
            checkedAgainst: ['curator-downgrade'],
          },
          source: 'curator-downgrade',
          reason: 'Escuchada la sesión, se oye otra cifra.',
          editor: PERSONA,
          appliedAt: '2026-09-30T00:00:00.000Z',
          retirada: {
            motivo: 'literal-no-dicho',
            literal: 'literal retirado · sha256:0123456789ab',
          },
        },
      },
    }
    expect(() => subirVeredicto(retirada, pedida(), observado(), STAMP)).toThrow(/retirada/)
  })
})

describe('el overlay, con la subida firmada', () => {
  const entrada = () => subir().entries[ID]

  it('valida al leer una subida bien firmada', () => {
    expect(() => validateOverlay(subir())).not.toThrow()
  })

  it('al leer, una subida editada a mano con una firma que no es de una persona revienta', () => {
    for (const editor of ['civicpulse-curator', '<nombre y apellidos>', 'claude-opus-5']) {
      const o = { ...subir() }
      o.entries = { [ID]: { ...entrada(), editor } }
      expect(() => validateOverlay(o), editor).toThrow(/persona/)
    }
    const sinFirma = { ...subir(), entries: { [ID]: { ...entrada(), editor: undefined } } }
    expect(() => validateOverlay(sinFirma)).toThrow(/persona/)
  })

  it('al leer, el resumen es el motivo firmado, y `desde` dice de dónde subió', () => {
    const otro = { ...entrada(), reason: `${RESUMEN} Y algo más.` }
    expect(() => validateOverlay({ ...subir(), entries: { [ID]: otro } })).toThrow(/resumen/)
    const { desde: _sin, ...sinDesde } = entrada()
    expect(() =>
      validateOverlay({ ...subir(), entries: { [ID]: sinDesde as OverlayEntry } }),
    ).toThrow(/desde/)
    const igual = { ...entrada(), desde: 'parcial' as const }
    expect(() => validateOverlay({ ...subir(), entries: { [ID]: igual } })).toThrow(/desde/)
  })

  it('al leer, la lista de corpus es la de los registros citados, ni uno más', () => {
    const e = entrada()
    const inflada = {
      ...e,
      verification: { ...e.verification, checkedAgainst: ['tenders', 'bdns', 'budget'] },
    }
    expect(() => validateOverlay({ ...subir(), entries: { [ID]: inflada } })).toThrow(/corpus/)
  })

  it('al leer, una fila con puntuación de parecido no es un registro elegido', () => {
    const e = entrada()
    const conSim = {
      ...e,
      verification: {
        ...e.verification,
        evidence: [{ ...e.verification.evidence[0], similarity: 0.58 }],
      },
    }
    expect(() => validateOverlay({ ...subir(), entries: { [ID]: conSim } })).toThrow(/parecido/)
  })

  it('al leer, una subida no lleva las marcas de una bajada', () => {
    const conRetirada = {
      ...entrada(),
      retirada: { motivo: 'literal-no-dicho', literal: 'literal retirado · sha256:0123456789ab' },
    } as OverlayEntry
    expect(() => validateOverlay({ ...subir(), entries: { [ID]: conRetirada } })).toThrow()
    const conEnmienda = {
      ...entrada(),
      reasonAmendments: [
        {
          previous: 'motivo · sha256:0123456789ab',
          reason: 'una enmienda de prueba larga',
          editor: PERSONA,
          amendedAt: STAMP,
        },
      ],
    } as OverlayEntry
    expect(() => validateOverlay({ ...subir(), entries: { [ID]: conEnmienda } })).toThrow()
  })

  it('`desde` sólo lo lleva una subida firmada', () => {
    const conDesde = { ...retractacion, desde: 'parcial' as const }
    expect(() =>
      validateOverlay({ version: 1, generatedAt: STAMP, entries: { [ID]: conDesde } }),
    ).toThrow(/desde/)
  })

  it('el anclaje NLI sigue sin escribir, ni firmado: su resumen y su evidencia son de la máquina', () => {
    const e = entrada()
    const intento = () =>
      applyOverlayEntries(
        overlayConRetractacion(),
        [
          {
            claimId: ID,
            verification: { ...e.verification, derivedBy: ['nli-grounding'] },
            source: 'nli',
            editor: PERSONA,
          },
        ],
        STAMP,
        new Map([[ID, 'sin-datos']]),
      )
    expect(intento).toThrow(/propone/)
  })

  it('al escribir, `desde` tiene que ser lo publicado', () => {
    const e = entrada()
    const intento = (publicado: 'sin-datos' | 'parcial') =>
      applyOverlayEntries(
        overlayConRetractacion(),
        [
          {
            claimId: ID,
            verification: e.verification,
            source: 'curator-upgrade',
            reason: RESUMEN,
            editor: PERSONA,
            desde: 'sin-datos',
          },
        ],
        STAMP,
        new Map([[ID, publicado]]),
      )
    expect(() => intento('sin-datos')).not.toThrow()
    expect(() => intento('parcial')).toThrow(/desde|publicado/)
  })

  it('lo que firmó una persona no lo pisa una pasada; una bajada de curador sí', () => {
    const conSubida = subir()
    const delMotor = () =>
      applyOverlayEntries(
        conSubida,
        [{ ...retractacion, claimId: ID, reason: MOTIVO_DEL_MOTOR }],
        STAMP,
        new Map([[ID, 'parcial']]),
      )
    expect(delMotor).toThrow(/firm/)
    const bajada = () =>
      applyOverlayEntries(
        conSubida,
        [
          {
            claimId: ID,
            verification: {
              ...sinDatos(ID),
              summary: 'El contrato citado es de otro parque del municipio.',
              checkedAgainst: ['curator-downgrade'],
            },
            source: 'curator-downgrade',
            reason: 'El contrato citado es de otro parque del municipio.',
            editor: PERSONA,
          },
        ],
        STAMP,
        new Map([[ID, 'parcial']]),
      )
    expect(bajada).not.toThrow()
  })
})

describe('la composición y lo que se sirve', () => {
  it('estampa el canal y quién la subió; la declaración no se toca', () => {
    const items = base()
    const [subida, vecina] = mergeVerified(items, subir())
    expect(subida.verification).toMatchObject({
      verdict: 'parcial',
      source: 'curator-upgrade',
      raisedBy: PERSONA,
      checkedAgainst: ['tenders'],
    })
    // check:claim-provenance lee la declaración: la subida no la cambia.
    expect(subida.claim).toBe(items[0].claim)
    expect(vecina).toBe(items[1])
  })

  it('un `raisedBy` colado en la verificación de otra entrada no se publica', () => {
    const colado: Overlay = {
      ...overlayConRetractacion(),
      entries: {
        [ID]: {
          ...retractacion,
          verification: { ...retractacion.verification, raisedBy: PERSONA } as never,
        },
      },
    }
    const [it0] = mergeVerified(base(), colado)
    expect(it0.verification).not.toHaveProperty('raisedBy')
  })

  it('la puerta pública la enseña: nombra corpus y trae evidencia', () => {
    const [servida] = gateItemsForPublic(mergeVerified(base(), subir()) as never)
    expect(servida.claim.id).toBe(ID)
    expect(servida.visibility).toBe('shown')
  })

  it('componer se niega si una subida firmada cae sobre una acusación', () => {
    const vacio = { version: 1, generatedAt: '', entries: {} }
    const capas = (overlay: Overlay) => ({
      overlay,
      reclas: vacio,
      reanclajes: vacio,
      firmadas: vacio,
    })
    expect(() => componer(base(), capas(subir()))).not.toThrow()
    // Editada a mano: la CLI nunca la escribe, porque mira el tipo publicado.
    expect(() => componer(base('acusacion_publica'), capas(subir()))).toThrow(/acusaci/)
    expect(
      subidasSobreAcusaciones(subir(), mergeVerified(base('acusacion_publica'), subir())),
    ).toEqual([ID])
  })
})

describe('overlayOutcomes · una subida firmada no es «por encima» sin que nadie lo decidiera', () => {
  it('por encima de su base, con la firma de una persona: se cuenta aparte', () => {
    const d = overlayOutcomes(base(), subir())
    expect(d.porEncima).toEqual([])
    expect(d.subidasFirmadas).toEqual([
      { id: ID, base: 'sin-datos', publica: 'parcial', source: 'curator-upgrade' },
    ])
  })

  it('sin la firma de una persona, el canal solo no la reconoce: sigue «por encima»', () => {
    // No pasaría `validateOverlay`; overlayOutcomes no valida y no debe fiarse.
    const o = subir()
    const falsa: Overlay = {
      ...o,
      entries: { [ID]: { ...o.entries[ID], editor: 'civicpulse-curator' } },
    }
    const d = overlayOutcomes(base(), falsa)
    expect(d.subidasFirmadas).toEqual([])
    expect(d.porEncima.map((p) => p.id)).toEqual([ID])
  })
})

describe('retirarSubida · la salida baja a lo que había, firmada', () => {
  const MOTIVO = 'El parque del contrato no es el que se cita en la sesión, sino otro del casco.'

  it('deja una bajada de curador a `desde`, con el motivo y la firma de la persona', () => {
    const o = retirarSubida(subir(), { claimId: ID, motivo: MOTIVO, editor: PERSONA }, STAMP)
    const e = o.entries[ID]
    expect(e).toMatchObject({ source: 'curator-downgrade', reason: MOTIVO, editor: PERSONA })
    expect(e.verification).toMatchObject({ verdict: 'sin-datos', summary: MOTIVO, evidence: [] })
    expect(e).not.toHaveProperty('desde')
    const [it0] = mergeVerified(base(), o)
    expect(it0.verification).toMatchObject({
      verdict: 'sin-datos',
      source: 'curator-downgrade',
      downgradedBy: 'persona',
    })
  })

  it('no borra la entrada: si la borrara, la base podría publicar más de lo que había', () => {
    // La base dice parcial, el motor la retractó y una persona la subió a
    // verificado: borrar la subida republicaría el parcial que el motor bajó.
    const items = base()
    items[0] = {
      ...items[0],
      verification: {
        ...items[0].verification,
        verdict: 'parcial',
        evidence: [evidenciaDelRegistro({ enlace: ENLACE.juegos, lote: null }, CORPUS)],
        checkedAgainst: ['tenders'],
      },
    } as never
    const subida = subirVeredicto(
      overlayConRetractacion(),
      pedida({ veredicto: 'verificado' }),
      observado(),
      STAMP,
    )
    const retirada = retirarSubida(subida, { claimId: ID, motivo: MOTIVO, editor: PERSONA }, STAMP)
    const [it0] = mergeVerified(items, retirada)
    expect(it0.verification.verdict).toBe('sin-datos')
  })

  it('sólo retira una subida firmada, y la retira una persona', () => {
    expect(() =>
      retirarSubida(
        overlayConRetractacion(),
        { claimId: ID, motivo: MOTIVO, editor: PERSONA },
        STAMP,
      ),
    ).toThrow(/subida/)
    expect(() =>
      retirarSubida(subir(), { claimId: ID, motivo: MOTIVO, editor: 'civicpulse-curator' }, STAMP),
    ).toThrow(/persona/)
    expect(() =>
      retirarSubida(subir(), { claimId: ID, motivo: 'corto', editor: PERSONA }, STAMP),
    ).toThrow(/20/)
  })
})
