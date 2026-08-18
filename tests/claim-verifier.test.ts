import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

function baseClaim(partial: Partial<PlenoClaim> = {}): PlenoClaim {
  return {
    id: 'test-001-pro-abc123',
    plenoId: 'test',
    plenoDate: '2026-03-09',
    segmentIndex: 0,
    type: 'afirmacion_numerica',
    speakerGroup: 'PSOE',
    verbatim: 'hemos asignado 46 millones al presupuesto',
    context: 'contexto contexto contexto contexto contexto',
    topic: 'fiscal',
    entities: { amountEuros: 46_000_000 },
    confidence: 0.8,
    reasoning: 'cita numérica',
    requiresHumanApproval: true,
    ...partial,
  }
}

// NOTE: these fixtures build tender rows with `finalAmount`, the field the
// scraper actually writes. They used to say `award_amount_eur`, which exists on
// zero of the 1,231 real rows — so the verifier's amount matcher was tested
// exclusively against a shape that cannot occur, and stayed green while the
// production cross-reference matched nothing at all.
describe('verifyClaim — sin-datos when no datasets provided', () => {
  it('emits sin-datos with checkedAgainst=[]', () => {
    const v = verifyClaim({ claim: baseClaim() })
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence).toHaveLength(0)
    expect(v.checkedAgainst).toEqual([])
  })
})

describe('verifyClaim — verificado on tender exact match', () => {
  it('finds a tender with matching amount and returns verificado', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: {
          amountEuros: 9_500_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r01',
            title: 'Reconstrucción post-DANA fase 1',
            finalAmount: 9_500_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('verificado')
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
    expect(v.checkedAgainst).toContain('tenders')
  })

  it('la vía sólo-entidad (sin importe) también anota el verificador', () => {
    // El camino del bloque 3 —cita_obra sin cifra, casada por título— empujaba
    // evidencia y veredicto SIN llamar a note(): nueve filas publicadas decían
    // «Verificado» con la evidencia marcada «sin verificador anotado», y la
    // puerta retenía como no-fundadas citas genuinamente corroboradas. Una
    // fila que trae evidencia y no anota fuente afirma las dos cosas a la vez
    // (el aviso literal del docblock de la puerta).
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: { referencedEntity: 'refugios climaticos carril bici' },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r02',
            title: 'Mejora del carril bici y la ejecución o mejora de refugios climáticos',
            finalAmount: 250_000,
            status: 'awarded',
          },
        ],
      },
    })
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
    expect(v.checkedAgainst).toContain('tenders')
    // El veredicto de esta vía es `parcial`, no `verificado`: un parecido de
    // título es una pista y no comprueba ni el importe ni el sentido (ver el
    // bloque «un parecido de TÍTULO no verifica» más abajo). Lo que este caso
    // vigila es la ANOTACIÓN — que la fuente conste—, no la fuerza del
    // veredicto.
    expect(v.verdict).toBe('parcial')
  })
})

describe('verifyClaim — parcial on near-match', () => {
  it('returns parcial when tender is same entity but amount only partially agrees', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: {
          amountEuros: 9_500_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r02',
            title: 'Reconstrucción post-DANA fase preliminar',
            // similarAmount(9.5M, 7M) ≈ 0.54. Passes the 0.5 amount gate
            // so the tender registers as evidence, but combined with a 1.0
            // entity text-sim yields 0.72 — above the 0.6 weak threshold
            // (parcial) yet below the 0.8 strong threshold (verificado).
            finalAmount: 7_000_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('parcial')
    expect(v.evidence).toHaveLength(1)
  })
})

describe('un importe que coincide y un objeto que no, no es corroboración', () => {
  /**
   * La aritmética que fabricaba la clase entera: `combined = amountSim*0,6 +
   * textSim*0,4` con umbral `>= 0,6`. Un importe EXACTO (amountSim 1) y cero
   * solapamiento de objeto (textSim 0) suman exactamente 0,6 — pasaban. Así se
   * publicó, con veredicto `parcial` y el contrato ajeno de evidencia debajo:
   *
   *   «adecuación del Centro Social Santa Mónica, 36.000 €»
   *      ⇒ plataforma de licitación electrónica · it · 36.000 €
   *   «edificios, el cementerio, 50.000 €»
   *      ⇒ grabación y mantenimiento de redes sociales · culture · 50.000 €
   *   «caminos rurales, 25.000 €»
   *      ⇒ tractor municipal tras la DANA · industry · 25.000 €
   *
   * El propio comentario del bloque ya avisaba de la mitad del peligro («un
   * 0,6 puede venir de un solo lado»), pero lo mitigaba sólo por el lado del
   * TEXTO. El lado del importe seguía abierto, y es el que produjo la cosecha
   * del debate de presupuestos: partidas de cifra redonda contra contratos de
   * cifra redonda. Es la misma regla que el repositorio ya aprendió para la
   * corroboración —el solapamiento tiene que ser MUTUO— aplicada al camino que
   * entra por el importe.
   */
  const contratoAjeno = {
    permalink: 'https://contrataciones.example/r03',
    title:
      'Contrato de servicio para la implantación y mantenimiento de una plataforma de licitación electrónica',
    finalAmount: 36_000,
  }

  it('no adjunta un contrato cuyo único parecido es la cifra, ni con el importe exacto', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: {
          amountEuros: 36_000,
          referencedEntity: 'adecuacion centro social santa monica',
        },
      }),
      tenders: { contracts: [contratoAjeno] },
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toHaveLength(0)
    expect(v.verdict).toBe('sin-datos')
    // Y lo dice habiendo mirado: la fuente queda anotada igual.
    expect(v.checkedAgainst).toContain('tenders')
  })

  it('tampoco cuando la afirmación no nombra ningún objeto', () => {
    // Sin entidad, `textSim` es 0 por construcción: cualquier contrato de la
    // misma cifra corroboraría cualquier cosa.
    const v = verifyClaim({
      claim: baseClaim({ type: 'afirmacion_numerica', entities: { amountEuros: 36_000 } }),
      tenders: { contracts: [contratoAjeno] },
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toHaveLength(0)
    expect(v.verdict).toBe('sin-datos')
  })

  it('control positivo: con el objeto compartido, el importe exacto sigue corroborando', () => {
    // La regla acota el camino del importe, no lo cierra.
    //
    // El control es `afirmacion_numerica` A PROPÓSITO: con `cita_obra` la vía
    // sólo-entidad (bloque 3) es elegible y adjunta la evidencia ella sola, así
    // que el control pasaba aunque el camino del importe estuviera muerto del
    // todo — lo demostró la revisión independiente sustituyendo la guarda por
    // `if (true) continue` y viéndolo seguir verde. Un control positivo que no
    // puede distinguir «acotado» de «cerrado» no controla nada.
    const v = verifyClaim({
      claim: baseClaim({
        type: 'afirmacion_numerica',
        entities: { amountEuros: 36_000, referencedEntity: 'centro social santa monica' },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r04',
            title: 'Obras de adecuación del Centro Social Santa Mónica',
            finalAmount: 36_000,
          },
        ],
      },
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toHaveLength(1)
    expect(v.verdict).toBe('verificado')
  })
})

describe('un parecido de TÍTULO no verifica, y a una acusación no la funda', () => {
  /**
   * La avería que la revisión independiente cazó en el arreglo anterior, y que
   * es peor que la que arreglaba: al dejar de casar por importe, la afirmación
   * caía a la vía sólo-entidad (bloque 3) — que compara TÍTULOS y no mira el
   * importe ni el sentido — y esa vía sí devolvía `verificado`. Resultado: una
   * acusación pública del PP («¿cómo puede ser que ustedes quiten 50.000 euros
   * del plan de refugios climáticos?») pasó de `parcial` a VERIFICADO sobre el
   * contrato de obras de los refugios, que no acredita ni el recorte ni la
   * cifra. Un cambio automático había SUBIDO una acusación contra un grupo con
   * nombre, que es justo la dirección que este repositorio prohíbe.
   *
   * Dos reglas, las dos escritas en el comentario que el propio bloque 3 ya
   * llevaba («title overlap only — no amount, no semantics»):
   *
   *   · un parecido de título es una pista, no una comprobación: sostiene
   *     `parcial` como mucho, nunca `verificado`;
   *   · y a una ACUSACIÓN no la funda en absoluto — que el título de un
   *     contrato comparta palabras con lo que se denuncia no dice nada sobre si
   *     la denuncia es cierta, y publicar eso como fundado es exactamente lo
   *     que la puerta editorial existe para impedir.
   */
  const contratoDelObjeto = {
    permalink: 'https://contrataciones.example/r05',
    title: 'Obras ejecución del proyecto: mejora del carril bici y de refugios climáticos',
    finalAmount: 250_000,
    status: 'awarded',
  }

  /** Un presupuesto cuyo capítulo de medio ambiente casa con el importe citado. */
  const presupuestoDe = (amount: number) => ({
    snapshot: {
      year: 2026,
      totalExpense: 41_000_000,
      expenseByProgram: [{ code: '1621', name: 'Residuos y medio ambiente', amount }],
    },
  })

  it('una cita casada sólo por el título se queda en parcial', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: { referencedEntity: 'refugios climaticos carril bici' },
      }),
      tenders: { contracts: [contratoDelObjeto] },
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toHaveLength(1)
    expect(v.verdict).toBe('parcial')
  })

  it('una acusación casada sólo por el título NO queda fundada', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
        speakerGroup: 'PP',
        verbatim:
          '¿cómo puede ser que ustedes quiten 50.000 euros del plan de refugios climáticos, pero hace dos semanas lo pusieran en marcha?',
        entities: { referencedEntity: 'plan de refugios climaticos' },
      }),
      tenders: { contracts: [contratoDelObjeto] },
    })
    expect(v.verdict).toBe('sin-datos')
    // El contrato se sigue ENSEÑANDO como lo que se miró; lo que no hace es
    // fundar la acusación.
    expect(v.evidence.filter((e) => e.kind === 'tender')).toHaveLength(1)
    expect(v.checkedAgainst).toContain('tenders')
  })

  it('control positivo: con importe y objeto de acuerdo, la acusación sí se funda', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
        speakerGroup: 'PP',
        entities: { amountEuros: 250_000, referencedEntity: 'refugios climaticos carril bici' },
      }),
      tenders: { contracts: [contratoDelObjeto] },
    })
    expect(v.verdict).toBe('verificado')
  })

  /**
   * Los tres huecos que la segunda revisión independiente encontró EN ESTAS
   * MISMAS REGLAS, con cero filas vivas cada uno — o sea, cazados antes de que
   * publicaran nada. Los tres son la misma forma de error: una regla escrita
   * sobre «todas las filas de evidencia» o sobre un camino concreto, cuando lo
   * que hay que decidir es si ALGUNA fila funda.
   */
  it('una fila de presupuesto no rescata la acusación: sigue sin fundar', () => {
    // La puerta preguntaba «¿son TODAS de título?»; bastaba una fila de otro
    // tipo para que no disparara. Y la de presupuesto es, por su propio
    // comentario, «una comprobación de plausibilidad: plausible no es
    // corroborado» — así que rescataba la acusación una fila que no prueba nada.
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
        speakerGroup: 'PP',
        topic: 'medio-ambiente',
        entities: { amountEuros: 50_000, referencedEntity: 'plan de refugios climaticos' },
      }),
      // 83.000 € contra 50.000 citados: ratio² = 0,36 — ni casa por importe
      // (umbral 0,5) ni es una discrepancia material (umbral 0,3), así que la
      // afirmación cae a la vía de títulos y la evidencia que queda son la fila
      // sólo-título y la de presupuesto. Exactamente el caso que la revisión
      // construyó.
      tenders: { contracts: [{ ...contratoDelObjeto, finalAmount: 83_000 }] },
      budget: presupuestoDe(50_000),
    })
    expect(v.evidence.map((e) => e.kind).sort()).toEqual(['budget', 'tender'])
    expect(v.verdict).toBe('sin-datos')
  })

  it('una fila de presupuesto tampoco basta para VERIFICAR una cita', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'afirmacion_numerica',
        topic: 'medio-ambiente',
        entities: { amountEuros: 50_000, referencedEntity: 'algo que ningun contrato nombra' },
      }),
      budget: presupuestoDe(50_000),
    })
    // La fila de presupuesto entra como lo que se miró…
    expect(v.evidence.some((e) => e.kind === 'budget')).toBe(true)
    // …pero un orden de magnitud plausible no es una comprobación.
    expect(v.verdict).not.toBe('verificado')
  })

  it('y un parecido de título tampoco CONTRADICE una acusación', () => {
    // La otra salida del bloque 3: si la afirmación dice «terminada» y el
    // contrato figura pendiente, devolvía `contradicho` — el veredicto más
    // acusatorio que sabe emitir esta máquina— desde el camino que sólo mira
    // títulos. Es la avería que este repositorio ya documenta para el
    // emparejador determinista, entrando por la puerta de al lado.
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
        speakerGroup: 'PP',
        verbatim: 'el refugio climático ya está terminado, nos lo vendieron así',
        entities: { referencedEntity: 'refugios climaticos carril bici' },
      }),
      tenders: { contracts: [{ ...contratoDelObjeto, status: 'pending' }] },
    })
    expect(v.verdict).toBe('sin-datos')
  })
})

describe('verifyClaim — promesa-repetida on quote overlap', () => {
  it('flags a promise whose quote overlaps ≥0.55 with verbatim', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'promesa',
        speakerGroup: 'PSOE',
        topic: 'vivienda',
        verbatim: 'construiremos quinientas viviendas sociales antes de dos mil veintisiete',
        entities: {},
      }),
      promises: {
        items: [
          {
            id: 'psoe-vivienda-2024',
            party: 'PSOE',
            title: 'Plan municipal de vivienda',
            quote: 'Construiremos 500 viviendas sociales antes de 2027',
            topic: 'vivienda',
            madeAt: '2024-06-01',
            source: { url: 'https://prensa.example/v', publisher: 'Test' },
          },
        ],
      },
    })
    expect(v.verdict).toBe('promesa-repetida')
    expect(v.evidence[0].kind).toBe('promise')
  })
})

describe('verifyClaim — acusacion_publica opinativa stays sin-datos', () => {
  it('returns sin-datos for opinativa subtype even with strong evidence nearby', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'opinativa',
        verbatim: 'el equipo de gobierno nunca escucha a los vecinos',
      }),
      tenders: { contracts: [{ title: 'cualquier cosa', finalAmount: 46_000_000 }] },
    })
    expect(v.verdict).toBe('sin-datos')
    expect(v.summary).toContain('carácter')
  })

  it('defaults to opinativa when subtype is missing (safe default)', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        verbatim: 'algo controvertido sin cifras ni entidades',
      }),
    })
    expect(v.verdict).toBe('sin-datos')
  })
})

describe('verifyClaim — acusacion_publica factual is verified against data', () => {
  it('returns verificado when a factual accusation matches a tender', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
        topic: 'fiscal',
        verbatim: 'gastaron 9,5 millones en la reconstrucción sin licitar',
        entities: {
          amountEuros: 9_500_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r01',
            title: 'Reconstrucción post-DANA fase 1',
            finalAmount: 9_500_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('verificado')
  })
})

describe('verifyClaim — contradicho on amount mismatch with same entity', () => {
  it('emits contradicho when a claim cites an amount that disagrees with the matching tender', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'afirmacion_numerica',
        topic: 'urbanismo',
        verbatim: 'hemos invertido 20 millones en la reconstrucción',
        entities: {
          amountEuros: 20_000_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r02',
            title: 'Reconstrucción post-DANA fase 1',
            finalAmount: 9_500_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('contradicho')
    expect(v.summary).toContain('Discrepancia material')
  })
})

describe('verifyClaim — contradicho on completion vs tender status', () => {
  it('emits contradicho when the speaker says "terminada" but tender is open', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'la reconstrucción post-DANA está terminada y entregada',
        entities: {
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r03',
            title: 'Reconstrucción post-DANA fase 1',
            status: 'open',
          },
        ],
      },
    })
    expect(v.verdict).toBe('contradicho')
    expect(v.summary).toContain('terminada')
  })
})

describe('verifyClaim — completion detection is negation-aware (libel-safe)', () => {
  const openTender = {
    contracts: [
      {
        permalink: 'https://contrataciones.example/r04',
        title: 'Reconstrucción post-DANA fase 1',
        status: 'open',
      },
    ],
  }

  it('does NOT emit contradicho when the speaker says the work is NOT finished', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'la reconstrucción post-DANA no está terminada todavía',
        entities: { referencedEntity: 'reconstruccion dana' },
      }),
      tenders: openTender,
    })
    // Speaker AGREES it is not done — flagging this as "contradicho" would
    // falsely claim their statement is contradicted by the data.
    expect(v.verdict).not.toBe('contradicho')
  })

  it('does NOT emit contradicho for "aún no se ha finalizado"', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'aún no se ha finalizado la reconstrucción post-DANA',
        entities: { referencedEntity: 'reconstruccion dana' },
      }),
      tenders: openTender,
    })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('still emits contradicho when "no" appears AFTER the completion verb (unrelated)', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'la reconstrucción post-DANA está terminada, no como dicen otros',
        entities: { referencedEntity: 'reconstruccion dana' },
      }),
      tenders: openTender,
    })
    expect(v.verdict).toBe('contradicho')
  })
})

describe('verifyClaim — completion synonyms (recall)', () => {
  const openTender = {
    contracts: [
      {
        permalink: 'https://contrataciones.example/r05',
        title: 'Urbanización del polígono norte',
        status: 'pendiente',
      },
    ],
  }
  for (const phrase of [
    'el polígono norte ya está operativo',
    'el polígono norte se ha puesto en servicio',
    'el polígono norte está en funcionamiento',
    'la urbanización del polígono norte se ha puesto en marcha',
    'la urbanización del polígono norte está concluida',
  ]) {
    it(`flags contradicho for "${phrase}" vs a still-pending tender`, () => {
      const v = verifyClaim({
        claim: baseClaim({
          type: 'cita_obra',
          topic: 'urbanismo',
          verbatim: phrase,
          entities: { referencedEntity: 'urbanización del polígono norte' },
        }),
        tenders: openTender,
      })
      expect(v.verdict).toBe('contradicho')
    })
  }
})

describe('verifyClaim — BDNS match', () => {
  it('finds a matching grant in BDNS and returns verificado', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_convenio',
        topic: 'social',
        verbatim: 'recibimos un convenio de 120.000 euros para servicios sociales',
        entities: {
          amountEuros: 120_000,
          referencedEntity: 'servicios sociales convenio generalitat',
        },
      }),
      bdns: {
        items: [
          {
            url: 'https://bdns.example/g',
            titulo: 'Convenio Generalitat — servicios sociales municipal',
            importe: 120_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('verificado')
    expect(v.evidence[0].kind).toBe('bdns')
  })
})

describe('verifyClaim — empty promises list does not trigger repetida', () => {
  it('returns sin-datos for a promesa with no match', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'promesa',
        verbatim: 'nunca dicho antes quinientas cosas inexistentes',
      }),
      promises: { items: [] },
    })
    expect(v.verdict).toBe('sin-datos')
  })
})
