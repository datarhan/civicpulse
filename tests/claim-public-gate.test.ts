import { describe, it, expect } from 'vitest'
import {
  classifyClaimVisibility,
  gateItemsForPublic,
  MOTIVOS_DE_RETENCION,
  motivoDeRetencion,
  repartirRetenidas,
  type MotivoDeRetencion,
} from '../src/scraper/claim-public-gate'
import { motivoDeRetirada } from '../src/scraper/declaracion-retirada'
import {
  applyOverlayEntries,
  mergeVerified,
  validateOverlay,
  verificacionDeBajada,
  type Overlay,
  type VerifiedItem,
} from '../src/scraper/verified-merge'
import { corpusReales, type ClaimVerdict } from '../src/scraper/claim-verdicts'

const item = (
  type: string,
  verdict: string | undefined,
  accusationSubtype?: string,
  // Por defecto, un verificador anotado: es lo que deja el verificador real en
  // todos sus caminos, y un fixture sin él estaría probando el caso raro
  // creyendo probar el normal.
  checkedAgainst: string[] = ['tenders'],
) => ({
  claim: {
    type,
    accusationSubtype,
    plenoId: 'p1',
    plenoDate: '2026-04-20',
    verbatim: 'x',
    segmentIndex: 0,
  },
  verification: { verdict, confidence: 1, checkedAgainst },
})

describe('classifyClaimVisibility', () => {
  it('hides opinativa accusations regardless of verdict', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'opinativa') as never),
    ).toBe('hidden')
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'opinativa') as never),
    ).toBe('hidden')
  })
  it('hides factual/contra-datos accusations that are NOT data-grounded', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'factual') as never),
    ).toBe('hidden')
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'contra-datos') as never),
    ).toBe('hidden')
  })
  it('shows data-grounded factual/contra-datos accusations', () => {
    // `contradicho` is now curator-gated on its own (see the machine-contradicho
    // block below), so a data-grounded accusation is exercised here with
    // `parcial` — the strongest verdict the machine may publish unaided.
    expect(classifyClaimVisibility(item('acusacion_publica', 'parcial', 'factual') as never)).toBe(
      'shown',
    )
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'contra-datos') as never),
    ).toBe('shown')
  })
  it('treats a missing accusation subtype as opinativa (hidden)', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', undefined) as never),
    ).toBe('hidden')
  })
  it('shows data-grounded non-accusation claims', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'verificado') as never)).toBe(
      'shown',
    )
    expect(classifyClaimVisibility(item('cita_obra', 'parcial') as never)).toBe('shown')
    expect(classifyClaimVisibility(item('promesa', 'promesa-repetida') as never)).toBe('shown')
  })
  it('puts non-grounded non-accusation claims behind the toggle', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'sin-datos') as never)).toBe(
      'toggle',
    )
  })
  it('fail-safe: unknown verdict never resolves to shown', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', undefined, 'factual') as never)).toBe(
      'hidden',
    )
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'weird-verdict') as never)).toBe(
      'toggle',
    )
  })
})

describe('gateItemsForPublic', () => {
  it('drops hidden items and stamps visibility on survivors', () => {
    const out = gateItemsForPublic([
      item('acusacion_publica', 'sin-datos', 'opinativa') as never, // hidden
      item('afirmacion_numerica', 'verificado') as never, // shown
      item('afirmacion_numerica', 'sin-datos') as never, // toggle
    ])
    expect(out).toHaveLength(2)
    expect(out.map((x) => x.visibility)).toEqual(['shown', 'toggle'])
  })
})

describe('claim-public-gate — machine contradicho', () => {
  it('hides a contradicho the machine assigned', () => {
    // The matcher fires on a strong name match with a mismatched amount, which
    // is indistinguishable from an unrelated contract. It published a €2.36bn
    // regional DANA figure as "refuted" by a municipal rubble-clearing job.
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'contradicho') as never)).toBe(
      'hidden',
    )
  })
})

// ---------------------------------------------------------------------------
describe('claim-public-gate — un veredicto sin verificador anotado no está fundado', () => {
  /**
   * `checkedAgainst` es lo que el verificador anota sobre SU PROPIO trabajo: las
   * fuentes cuyo emparejador llegó a ejecutarse. Se llena así desde que se vio
   * que rellenarlo al LEER los ficheros hacía que cada fila afirmara haber
   * consultado PLACSP, TED, BDNS y el presupuesto cuando los bucles que los
   * consultan van condicionados (ver `note` en claim-verifier.ts). Vacío
   * significa, literalmente, que no consta nada — y una fila que trae evidencia
   * y no anota fuente afirma las dos cosas a la vez.
   *
   * No es una ampliación de la política de este fichero, es aplicarla: «lo que
   * no esté EXPLÍCITAMENTE fundado se oculta (acusaciones) o se pliega (el
   * resto)». Una fila que no dice quién la comprobó no está explícitamente
   * fundada.
   *
   * Lo que estaba en juego, medido el 2026-08-15 al regenerar el corpus:
   *
   *     veredictos fuertes             113 → 254
   *     ACUSACIONES PÚBLICAS fuertes    16 →  65
   *     de ésas, por coincidencia léxica  3 →  49
   *
   * Cuarenta y nueve acusaciones contra grupos municipales cuyo único respaldo
   * es que una palabra sale en el título de un contrato. El mismo emparejador
   * que da «verificado» a «Vox dice que no, que no» contra un contrato de voto
   * electrónico, y «parcial» a «Reducimos en cultura,» — un trozo de discurso.
   *
   * Este fichero ya documenta esa avería del emparejador para `contradicho` (el
   * «2.364 millones para la dana» refutado por un contrato de escombros) y por
   * eso lo oculta. `verificado` y `parcial` entraban por la puerta de al lado.
   */
  it('oculta una acusación cuyo veredicto no anota verificador', () => {
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'factual', []) as never),
    ).toBe('hidden')
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'parcial', 'contra-datos', []) as never),
    ).toBe('hidden')
  })

  it('pliega tras el desplegable una cita cuyo veredicto no anota verificador', () => {
    expect(classifyClaimVisibility(item('cita_obra', 'verificado', undefined, []) as never)).toBe(
      'toggle',
    )
    expect(classifyClaimVisibility(item('cita_obra', 'parcial', undefined, []) as never)).toBe(
      'toggle',
    )
  })

  it('falla del lado seguro cuando el campo ni siquiera está', () => {
    // Es el caso contra el que avisa `ClaimVisibilityInput`: un campo que quien
    // llama no reenvía llega `undefined`. Aquí eso tiene que OCULTAR, no
    // publicar.
    const sinCampo = {
      claim: { type: 'acusacion_publica', accusationSubtype: 'factual' },
      verification: { verdict: 'verificado' },
    }
    expect(classifyClaimVisibility(sinCampo as never)).toBe('hidden')
  })

  it('pliega una valoración política sin fundar — el destino de la reclasificación curada', () => {
    // `valoracion_politica` sólo nace de `reclassify-claim` (el prompt del
    // extractor no lo emite). La rama por defecto de la puerta ya hace lo que el
    // lector pedía para la defensa de constitucionalidad del PSOE: toggle, con
    // el chip «sin contraste en los datos» y la nota «no es una acusación».
    expect(classifyClaimVisibility(item('valoracion_politica', 'sin-datos') as never)).toBe(
      'toggle',
    )
    // Control: fundada se muestra, como cualquier no-acusación.
    expect(classifyClaimVisibility(item('valoracion_politica', 'verificado') as never)).toBe(
      'shown',
    )
  })

  it('sigue publicando lo que SÍ anota quién lo comprobó', () => {
    // Control: sin esto, un «oculta todo» pasaría estas pruebas y vaciaría la
    // página entera.
    expect(
      classifyClaimVisibility(
        item('acusacion_publica', 'verificado', 'factual', ['tenders', 'bdns']) as never,
      ),
    ).toBe('shown')
    // OJO: aquí había una aserción que fijaba el defecto —una `cita_obra` con
    // sólo `llm-second-pass` daba 'shown'—. Una marca de pasada dice CÓMO se
    // llegó al veredicto, no contra qué se comprobó, así que no funda: ahora
    // pliega. El control de que la puerta no lo oculta todo lo hace la línea de
    // arriba, que sí anota corpus de verdad.
    expect(
      classifyClaimVisibility(item('cita_obra', 'parcial', undefined, ['tenders']) as never),
    ).toBe('shown')
  })
})

/**
 * El defecto vivo, medido el 2026-08-27: las ONCE acusaciones publicadas pasaban
 * esta puerta con `checkedAgainst: ['llm-second-pass']` y nada más — una pasada
 * que su propia cabecera marca LEGACY / SUPERSEDED / «do not use in the
 * pipeline», sin un solo corpus de datos detrás.
 *
 * `checkedAgainst` mezcla dos significados: lo que el emparejador CONSULTÓ
 * (tenders, bdns, budget, promises) y el NOMBRE de la pasada que produjo el
 * veredicto (nli-grounding, llm-second-pass, verdict-engine). Contar la longitud
 * del array trata las dos cosas como si fundaran igual.
 *
 * Es la avería que este fichero ya documenta para `contradicho` entrando por la
 * puerta de al lado, tal y como su propio comentario predijo. Y no amplía la
 * política: la aplica. «Lo que no esté EXPLÍCITAMENTE fundado se oculta.» Una
 * fila que sólo dice qué pasada la miró no dice contra qué se comprobó.
 */
describe('claim-public-gate — una marca de pasada no funda', () => {
  const MARCAS = ['llm-second-pass', 'verdict-engine', 'nli-grounding', 'curator-downgrade']

  it('oculta una acusación que sólo anota una marca de pasada', () => {
    for (const marca of MARCAS) {
      expect(
        classifyClaimVisibility(
          item('acusacion_publica', 'verificado', 'factual', [marca]) as never,
        ),
        `marca ${marca}`,
      ).toBe('hidden')
      expect(
        classifyClaimVisibility(
          item('acusacion_publica', 'parcial', 'contra-datos', [marca]) as never,
        ),
        `marca ${marca}`,
      ).toBe('hidden')
    }
  })

  it('pliega una cita que sólo anota una marca de pasada', () => {
    expect(
      classifyClaimVisibility(
        item('cita_obra', 'verificado', undefined, ['nli-grounding']) as never,
      ),
    ).toBe('toggle')
  })

  it('un corpus real junto a una marca SÍ funda', () => {
    // La mezcla es lo normal: el segundo paso anota su nombre encima de lo que
    // ya había. Basta con que quede UN corpus.
    expect(
      classifyClaimVisibility(
        item('acusacion_publica', 'verificado', 'factual', ['llm-second-pass', 'tenders']) as never,
      ),
    ).toBe('shown')
  })

  it('la prueba ha evaluado las dos ramas, no sólo la que oculta', () => {
    // Un «oculta todo» pasaría los casos de arriba. Este control lo impide.
    expect(
      classifyClaimVisibility(
        item('acusacion_publica', 'verificado', 'factual', ['bdns']) as never,
      ),
    ).toBe('shown')
    expect(
      classifyClaimVisibility(
        item('acusacion_publica', 'verificado', 'factual', ['verdict-engine']) as never,
      ),
    ).toBe('hidden')
  })
})

/**
 * Lo que firma un curador, por el camino REAL: la verificación que escribe
 * `downgrade-verdict` → `applyOverlayEntries` → `mergeVerified` → la puerta.
 *
 * Aquí había tres pruebas que construían a mano `verification.source:
 * 'curator'`, una forma que ningún productor escribe. `mergeVerified` guardaba
 * el canal en la ENTRADA del overlay y no lo llevaba a la verificación, así que
 * la excepción de curador no casaba con nada en producción mientras la suite
 * seguía verde (docs/DATA_INTEGRITY.md regla 1). Medido el 28-09-2026 sobre los
 * trozos servidos: cinco «parcial» firmados por un curador salían `toggle`, y
 * /hallazgos citaba uno como «sin contraste en los datos» mientras /plenos lo
 * rotulaba «Parcial». Lo destapó el 27-08: desde que una marca de pasada dejó
 * de fundar, la de `curator-downgrade` tampoco, y la excepción que debía
 * recogerla estaba muerta.
 *
 * Decisión del operador, 2026-09-28: lo que un curador baja a `parcial` se
 * publica (`shown`), que es lo que la cabecera de la puerta ya prometía.
 */
const MOTIVO = 'la evidencia acredita el contrato, no lo que afirma la cita'

/** Una fila como la deja el verificador determinista: fuerte, con corpus y evidencia. */
function deLaBase(type: string, accusationSubtype?: string): VerifiedItem {
  return {
    claim: {
      id: 'c1',
      type,
      accusationSubtype,
      plenoId: 'p1',
      plenoDate: '2026-04-20',
      verbatim: 'x',
      segmentIndex: 0,
    } as unknown as VerifiedItem['claim'],
    verification: {
      claimId: 'c1',
      verdict: 'verificado',
      summary: 's',
      evidence: [{ kind: 'tender', ref: 'r', snippet: 'sn' }],
      checkedAgainst: ['tenders'],
    },
  }
}

/** Lo que publica una bajada de curador, por el mismo camino que la CLI. */
function bajadaDeCurador(base: VerifiedItem, nuevo: ClaimVerdict): VerifiedItem {
  const overlay = applyOverlayEntries(
    { version: 1, generatedAt: '', entries: {} },
    [
      {
        claimId: base.claim.id,
        verification: verificacionDeBajada(base.claim.id, base.verification, nuevo, MOTIVO),
        source: 'curator-downgrade',
        reason: MOTIVO,
        editor: 'curador',
      },
    ],
    '2026-09-28T00:00:00.000Z',
    new Map([[base.claim.id, base.verification.verdict]]),
  )
  return mergeVerified([base], overlay)[0]
}

describe('claim-public-gate — lo que firma un curador, por el camino real', () => {
  it('una bajada a parcial se sigue publicando: responde una persona', () => {
    const base = deLaBase('cita_obra')
    expect(classifyClaimVisibility(base), 'control: la base ya se publicaba').toBe('shown')
    const firmada = bajadaDeCurador(base, 'parcial')
    // La vía sancionada no puede depender de que una máquina anotara nada, y
    // aquí no anotó nada: la bajada deja sólo su marca, ningún corpus.
    expect(corpusReales(firmada.verification.checkedAgainst)).toEqual([])
    expect(classifyClaimVisibility(firmada)).toBe('shown')
  })

  it('también la de una acusación contrastable', () => {
    const firmada = bajadaDeCurador(deLaBase('acusacion_publica', 'factual'), 'parcial')
    expect(classifyClaimVisibility(firmada)).toBe('shown')
  })

  it('una acusación opinativa sigue oculta aunque la firme un curador', () => {
    const firmada = bajadaDeCurador(deLaBase('acusacion_publica', 'opinativa'), 'parcial')
    expect(classifyClaimVisibility(firmada)).toBe('hidden')
  })

  it('bajar a sin-datos no funda nada, lo firme quien lo firme', () => {
    expect(classifyClaimVisibility(bajadaDeCurador(deLaBase('cita_obra'), 'sin-datos'))).toBe(
      'toggle',
    )
    expect(
      classifyClaimVisibility(
        bajadaDeCurador(deLaBase('acusacion_publica', 'factual'), 'sin-datos'),
      ),
    ).toBe('hidden')
  })

  it('un contradicho no se publica aunque el overlay diga que lo firmó un curador', () => {
    // Ningún canal lo produce —`isDowngrade` no admite contradicho como destino
    // y al motor de veredictos se le prohíbe—, pero `validateOverlay` no puede
    // comprobar la dirección de una bajada al LEER: no tiene la base. Una entrada
    // editada a mano llega hasta aquí, y la puerta es la última que la ve.
    const aMano: Overlay = {
      version: 1,
      generatedAt: '',
      entries: {
        c1: {
          verification: {
            claimId: 'c1',
            verdict: 'contradicho',
            summary: MOTIVO,
            evidence: [{ kind: 'tender', ref: 'r', snippet: 'sn' }],
            checkedAgainst: ['curator-downgrade'],
          },
          source: 'curator-downgrade',
          reason: MOTIVO,
          appliedAt: '2026-09-28T00:00:00.000Z',
        },
      },
    }
    expect(() => validateOverlay(aMano), 'el cargador la acepta').not.toThrow()
    const fila = mergeVerified([deLaBase('cita_obra')], aMano)[0]
    expect(fila.verification.verdict).toBe('contradicho')
    expect(classifyClaimVisibility(fila)).toBe('hidden')
  })
})

/**
 * Por qué se retiene, como valor.
 *
 * /laboratorio/cobertura decía que la puerta retiene «por dos motivos
 * distintos» —una acusación cuyo veredicto no nombra ningún corpus, y una cita
 * cuyo literal no consta en ninguna transcripción—, y no eran los motivos que
 * más pesan: medido el 19-10-2026 sobre lo retenido, la mayoría eran
 * acusaciones opinativas (o sin subtipo, que la puerta trata como tales) y
 * acusaciones de hecho que SÍ nombran un corpus sin un dato que las respalde.
 * La frase iba escrita a mano; ahora el motivo lo da la misma función que
 * decide ocultar, y la página lo cuenta.
 */
describe('claim-public-gate — el motivo de lo que se retiene', () => {
  const conVerif = (
    type: string,
    verification: Record<string, unknown>,
    accusationSubtype?: string,
  ) => ({ claim: { type, accusationSubtype }, verification })

  const casos: Array<[string, ReturnType<typeof conVerif>, MotivoDeRetencion | null]> = [
    [
      'acusación sin subtipo → opinativa',
      conVerif('acusacion_publica', { verdict: 'verificado', checkedAgainst: ['tenders'] }),
      'acusacion-opinativa',
    ],
    [
      'acusación opinativa',
      conVerif('acusacion_publica', { verdict: 'sin-datos', checkedAgainst: [] }, 'opinativa'),
      'acusacion-opinativa',
    ],
    [
      'acusación de hecho cotejada contra un corpus y sin dato',
      conVerif(
        'acusacion_publica',
        { verdict: 'sin-datos', checkedAgainst: ['tenders', 'tenders-ted'] },
        'factual',
      ),
      'acusacion-cotejada-sin-respaldo',
    ],
    [
      'acusación de hecho sin nada anotado',
      conVerif('acusacion_publica', { verdict: 'sin-datos', checkedAgainst: [] }, 'factual'),
      'acusacion-sin-corpus',
    ],
    [
      'acusación de hecho que sólo lleva la marca de una pasada',
      conVerif(
        'acusacion_publica',
        { verdict: 'sin-datos', checkedAgainst: [], derivedBy: ['verdict-engine'] },
        'contra-datos',
      ),
      'acusacion-no-consta',
    ],
    [
      'contradicho de máquina, de cualquier tipo',
      conVerif('cita_obra', { verdict: 'contradicho', checkedAgainst: ['tenders'] }),
      'contradicho',
    ],
    [
      'acusación de hecho respaldada: no se retiene',
      conVerif('acusacion_publica', { verdict: 'parcial', checkedAgainst: ['tenders'] }, 'factual'),
      null,
    ],
    [
      'afirmación sin datos: se pliega, no se retiene',
      conVerif('afirmacion_numerica', { verdict: 'sin-datos', checkedAgainst: [] }),
      null,
    ],
  ]

  for (const [nombre, fila, motivo] of casos) {
    it(nombre, () => {
      expect(motivoDeRetencion(fila)).toBe(motivo)
    })
  }

  it('sin procedencia manda sobre cualquier otro motivo', () => {
    expect(motivoDeRetencion(casos[0][1], { sinProcedencia: true })).toBe('sin-procedencia')
  })

  it('una retirada firmada es su propio motivo', () => {
    const r = conVerif('afirmacion_numerica', {
      verdict: 'sin-datos',
      checkedAgainst: ['curator-downgrade'],
      source: 'curator-downgrade',
      retirada: { motivo: 'literal-no-dicho' },
    })
    // Si el canal cambia, que la prueba lo diga en vez de quedarse verde.
    expect(motivoDeRetirada(r)).not.toBeNull()
    expect(motivoDeRetencion(r)).toBe('retirada')
  })

  it('oculta exactamente lo que tiene motivo: una sola regla, no dos', () => {
    for (const [, fila, motivo] of casos) {
      expect(classifyClaimVisibility(fila) === 'hidden').toBe(motivo !== null)
    }
    // Y la prueba evaluó las dos ramas.
    expect(casos.some(([, , m]) => m === null)).toBe(true)
    expect(casos.some(([, , m]) => m !== null)).toBe(true)
  })

  it('cada motivo del enum sale en algún caso: ninguno se declara sin probar', () => {
    const vistos = new Set<string>(
      casos.map(([, , m]) => m).filter((m): m is MotivoDeRetencion => m !== null),
    )
    vistos.add('sin-procedencia')
    vistos.add('retirada')
    expect([...vistos].sort()).toEqual([...MOTIVOS_DE_RETENCION].sort())
  })

  it('repartirRetenidas cuenta por tipo y por motivo, y las dos particiones suman lo mismo', () => {
    const items = casos.map(([, fila], i) => ({
      ...fila,
      claim: { ...fila.claim, id: `c${i}` },
    }))
    const sinProcedencia = new Set(['c7'])
    const r = repartirRetenidas(items, { sinProcedencia })
    const suma = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + n, 0)
    // Seis con motivo propio, más la afirmación sin procedencia (c7).
    expect(suma(r.porTipo)).toBe(7)
    expect(suma(r.porMotivo)).toBe(7)
    expect(r.porMotivo['sin-procedencia']).toBe(1)
    expect(r.porMotivo['acusacion-opinativa']).toBe(2)
    // Todos los motivos están, aunque sea a cero: un cero contado no es un hueco.
    expect(Object.keys(r.porMotivo).sort()).toEqual([...MOTIVOS_DE_RETENCION].sort())
    // Y lo que reparte es exactamente lo que la puerta no sirve.
    const servidos = gateItemsForPublic(items as never, { sinProcedencia })
    expect(suma(r.porTipo)).toBe(items.length - servidos.length)
  })
})
