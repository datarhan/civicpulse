/**
 * ¿Encola exactamente las fichas con al menos una cita retenida, pregunta por
 * lo que la puerta no alcanza —el sumario— y no decide ninguna?
 *
 * Hasta el 30-09-2026 esta cola preguntaba «¿merece este hallazgo la
 * excepción?» sobre las fichas sin ninguna cita mostrable, y las dos mitades
 * habían dejado de medir nada. La respuesta no cambiaba la página: desde el
 * 27-08 /hallazgos obedece la puerta la promueva quien la promueva, y ni
 * `classifyClaimVisibility` ni `citaRetenida` leen la revisión. Y el filtro no
 * separaba: `citasMostrables === 0` encolaba 38 de 40 fichas, porque tras
 * retirar la pasada `llm` casi ninguna cita queda `shown`.
 *
 * Lo que la puerta no puede retener es el sumario, prosa del sitio al lado del
 * hueco. `check:summary-gate` y la criba de ≥40 caracteres
 * (`TRAMO_MINIMO_EN_CARACTERES`) cazan la copia; la paráfrasis la dejan, a
 * propósito, a una persona. Ésta es la cola de esa persona.
 *
 * Contra los ficheros REALES, y con el recuento hecho por un camino distinto
 * al del constructor: aquí la puerta se vuelve a preguntar contra el corpus;
 * el constructor la lee del snapshot de procedencia. Si los dos usaran la misma
 * travesía, coincidirían aunque los dos estuvieran mal.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { citaRetenida, PUERTA_QUE_RETIENE } from '../src/lib/cita-retenida.js'
import { classifyClaimVisibility } from '../src/scraper/claim-public-gate'
import {
  buildExceptionQueue,
  hechosDelVerificador,
  CORRECTION_CLI,
  EXCEPTION_QUEUE_VERSION,
  MARCADORES,
  PREGUNTA_DE_LA_COLA,
  RECLASSIFICATION_CLI,
  RETRACTION_CLI,
  REVIEW_CLI,
} from '../src/scraper/finding-exception'
import {
  NOTA_MINIMA,
  pendientesDeRevision,
  recordReview,
  summaryHash,
  type ExceptionReview,
} from '../src/scraper/finding-exception-review'
import { RETRACTION_REASON_MIN, retractFinding } from '../src/scraper/finding-retraction'
import { ALLOWED_CLAIM_TYPES } from '../src/scraper/pleno-claim'
import {
  applyFindingRedaction,
  REDACTION_DIGEST_RE,
  validateFindingsSnapshot,
} from '../src/scraper/pleno-finding'
import type { QuoteProvenanceSnapshot } from '../src/scraper/quote-provenance'
import { applyReclassificationEntries } from '../src/scraper/verified-merge'
import { loadVerifiedCorpus } from '../scripts/lib/verified-corpus'

const ROOT = join(__dirname, '..')
const FINDINGS = validateFindingsSnapshot(
  readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'),
)
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
) as QuoteProvenanceSnapshot
const CORPUS = loadVerifiedCorpus({
  monolithPath: join(ROOT, 'public/data/pleno-claims-verified.json'),
  basePath: join(ROOT, 'public/data/pleno-claims-verified-base.json'),
  overlayPath: join(ROOT, 'public/data/pleno-claims-overlay.json'),
})

const QUEUE = buildExceptionQueue(
  FINDINGS.items,
  { gates: PROVENANCE.quotes, facts: hechosDelVerificador(CORPUS.merged) },
  {
    generatedAt: '2026-09-30T00:00:00.000Z',
    findingsGeneratedAt: FINDINGS.generatedAt,
    provenanceGeneratedAt: PROVENANCE.generatedAt,
  },
)

/**
 * El recuento por otro camino: la puerta se vuelve a preguntar aquí, contra el
 * corpus, y la retención la decide el predicado de la página — nunca un
 * `gate === …` escrito en la prueba (docs/DATA_INTEGRITY.md, regla 1).
 */
const CON_RETENIDA = FINDINGS.items.filter((f) =>
  (f.quotes ?? []).some((q) =>
    citaRetenida({ gate: classifyClaimVisibility(CORPUS.merged.get(q.sourceClaimId ?? '')!) }, q),
  ),
)

describe('la cola tiene exactamente las fichas con al menos una cita retenida', () => {
  it('mide algo: el corpus publicado tiene fichas con citas retenidas', () => {
    // Sin esto, la igualdad de abajo pasaría comparando dos conjuntos vacíos.
    expect(CON_RETENIDA.length).toBeGreaterThan(0)
  })

  it('encola los mismos ids que el recuento directo, ni uno más', () => {
    expect(QUEUE.rows.map((r) => r.findingId).sort()).toEqual(CON_RETENIDA.map((f) => f.id).sort())
    expect(QUEUE.stats.encolados).toBe(CON_RETENIDA.length)
  })

  it('NO encola las fichas con citas y ninguna retenida — el control', () => {
    const encolables = new Set(CON_RETENIDA.map((f) => f.id))
    const sinRetenida = FINDINGS.items.filter(
      (f) => (f.quotes ?? []).length > 0 && !encolables.has(f.id),
    )
    expect(sinRetenida.length).toBeGreaterThan(0)
    const encolados = new Set(QUEUE.rows.map((r) => r.findingId))
    for (const f of sinRetenida) expect(encolados.has(f.id), f.id).toBe(false)
  })

  it('cada cita dice si la puerta la retiene, con el predicado de la página', () => {
    for (const r of QUEUE.rows) {
      const f = FINDINGS.items.find((x) => x.id === r.findingId)!
      r.quotes.forEach((q, i) => {
        expect(q.retenida, `${r.findingId}#${i}`).toBe(
          citaRetenida(PROVENANCE.quotes[r.findingId]?.[i], f.quotes![i]),
        )
      })
      expect(r.citasRetenidas).toBe(r.quotes.filter((q) => q.retenida).length)
      expect(r.citasRetenidas).toBeGreaterThan(0)
      expect(r.todasRetenidas).toBe(r.citasRetenidas === r.quotes.length)
    }
  })

  it('coincide con lo que el snapshot de procedencia contó por su cuenta', () => {
    // Cada cita retenida es de una ficha encolada, así que la cola las lleva
    // todas; y el snapshot las contó al calcular la marca de /hallazgos.
    expect(QUEUE.stats.citasRetenidas).toBe(
      PROVENANCE.contraste.stats.porContraste[PUERTA_QUE_RETIENE],
    )
    expect(QUEUE.stats.citasRetenidas).toBeGreaterThan(0)
    expect(QUEUE.stats.todasRetenidas).toBe(PROVENANCE.contraste.stats.hallazgosSoloConCitasOcultas)
  })

  it('la marca de «todas retenidas» no está muerta: dispara sobre una ficha así', () => {
    // Control positivo. El corpus vivo no tiene ninguna desde el 27-08 —se
    // retiraron—, y sin esto «cero» y «no mira» serían indistinguibles.
    const f = FINDINGS.items.find((x) => (x.quotes ?? []).length > 1)!
    const hueca = buildExceptionQueue(
      [f],
      {
        gates: {
          [f.id]: f.quotes!.map(() => ({ status: 'en-vigente', gate: PUERTA_QUE_RETIENE })),
        },
        facts: new Map(),
      },
      {
        generatedAt: '2026-09-30T00:00:00.000Z',
        findingsGeneratedAt: FINDINGS.generatedAt,
        provenanceGeneratedAt: PROVENANCE.generatedAt,
      },
    )
    expect(hueca.rows).toHaveLength(1)
    expect(hueca.rows[0].todasRetenidas).toBe(true)
    expect(hueca.stats.todasRetenidas).toBe(1)
    expect(hueca.rows[0].decision).toBeNull()
  })

  it('no reescribe el predicado: el módulo no compara la puerta a mano', () => {
    const src = readFileSync(join(ROOT, 'src/scraper/finding-exception.ts'), 'utf8')
    expect(src).toMatch(/citaRetenida\(/)
    expect(src).not.toMatch(/gate\s*[!=]==?\s*['"]hidden['"]/)
    expect(src).not.toMatch(/citasMostrables\s*[!=><]/)
  })
})

describe('la pregunta es la del sumario, no la de la excepción', () => {
  it('se enuncia una vez, y la cola la lleva escrita', () => {
    expect(PREGUNTA_DE_LA_COLA).toMatch(/^¿.*\?$/)
    expect(PREGUNTA_DE_LA_COLA).toMatch(/sumario/)
    expect(PREGUNTA_DE_LA_COLA).toMatch(/con otras palabras/)
    expect(PREGUNTA_DE_LA_COLA).toMatch(/cita retenida/)
    expect(QUEUE.pregunta).toBe(PREGUNTA_DE_LA_COLA)
    expect(QUEUE._comment).toContain(PREGUNTA_DE_LA_COLA)
  })

  it('y no vuelve a preguntar la de antes', () => {
    expect(QUEUE._comment).not.toMatch(/merece (este hallazgo )?la excepci[oó]n/i)
  })

  it('sube de versión: una cola vieja en disco no se lee como si preguntara esto', () => {
    expect(QUEUE.queueVersion).toBe(EXCEPTION_QUEUE_VERSION)
    expect(EXCEPTION_QUEUE_VERSION).not.toBe('finding-exception-v1')
  })
})

describe('las cuatro respuestas, preparadas y sin ejecutar', () => {
  it('cada fila trae mantener, corregir el sumario y retirar, con su id', () => {
    expect(QUEUE.rows.length).toBeGreaterThan(0)
    for (const r of QUEUE.rows) {
      expect(r.commands.mantener.startsWith(`${REVIEW_CLI} -- ${r.findingId} `)).toBe(true)
      expect(r.commands.corregirSumario.startsWith(`${CORRECTION_CLI} -- ${r.findingId} `)).toBe(
        true,
      )
      // En cada fila, no sólo en las huecas: una respuesta posible a la
      // pregunta es que la ficha ES su acusación. Ofrecerla no es elegirla
      // —la fila llega con `decision: null`— y la orden no corre sin editar
      // (abajo).
      expect(r.commands.retirarHallazgo.startsWith(`${RETRACTION_CLI} -- ${r.findingId} `)).toBe(
        true,
      )
    }
  })

  it('corregir el sumario va por --redact: el sumario viejo es justo lo que se quita', () => {
    // `--field summary` deja el original tachado en la bitácora pública de la
    // ficha. Si el sumario parafrasea una acusación retenida, eso la republica.
    for (const r of QUEUE.rows) {
      expect(r.commands.corregirSumario).toContain(' --redact summary ')
      expect(r.commands.corregirSumario).not.toContain('--field')
    }
  })

  it('reclasificar: una orden por cita retenida que publica acusacion_publica, hacia los demás tipos', () => {
    let ordenes = 0
    for (const r of QUEUE.rows) {
      for (const q of r.quotes) {
        if (q.retenida && q.claimType === 'acusacion_publica') {
          ordenes += 1
          expect(q.reclasificar!.startsWith(`${RECLASSIFICATION_CLI} -- ${q.claimId} `)).toBe(true)
        } else {
          // La CLI sólo aleja de acusacion_publica; en una cita que la ficha ya
          // enseña no hay nada que responder.
          expect(q.reclasificar, `${r.findingId}#${q.index}`).toBeNull()
        }
      }
    }
    expect(ordenes).toBeGreaterThan(0)
    for (const t of ALLOWED_CLAIM_TYPES) {
      if (t === 'acusacion_publica') expect(MARCADORES.tipo).not.toContain(t)
      else expect(MARCADORES.tipo).toContain(t)
    }
  })

  it('ninguna orden se ejecuta tal cual: lo que llaman las CLIs rechaza sus huecos', () => {
    const r = QUEUE.rows[0]
    const f = FINDINGS.items.find((x) => x.id === r.findingId)!
    const firma = 'Ana Pérez Gil'
    const motivo = 'un motivo escrito de verdad, de más de veinte caracteres'

    // retract-finding: el motivo del hueco no llega al suelo.
    expect(r.commands.retirarHallazgo).toContain(`--reason "${MARCADORES.motivo}"`)
    expect(() =>
      retractFinding(FINDINGS, {
        findingId: r.findingId,
        reason: MARCADORES.motivo,
        editor: firma,
        retractedAt: '2026-09-30T00:00:00.000Z',
      }),
    ).toThrow(/reason/)

    // correct-pleno-finding --redact: el sumario del hueco es un muñón, y el
    // motivo, el mismo hueco (mismo suelo que el de retirar).
    expect(r.commands.corregirSumario).toContain(`--new "${MARCADORES.sumario}"`)
    expect(r.commands.corregirSumario).toContain(`--reason "${MARCADORES.motivo}"`)
    expect(() => applyFindingRedaction(structuredClone(f), 'summary', MARCADORES.sumario)).toThrow(
      /stub/,
    )
    expect(MARCADORES.motivo.trim().length).toBeLessThan(RETRACTION_REASON_MIN)

    // reclassify-claim: ni el tipo del hueco ni su motivo pasan.
    const q = QUEUE.rows.flatMap((x) => x.quotes).find((x) => x.reclasificar)!
    expect(q.reclasificar).toContain(`"${MARCADORES.tipo}"`)
    expect(q.reclasificar).toContain(`--reason "${MARCADORES.motivo}"`)
    const publicado = new Map([[q.claimId!, 'acusacion_publica' as const]])
    const vacio = { version: 1, generatedAt: '', entries: {} }
    expect(() =>
      applyReclassificationEntries(
        vacio,
        [{ claimId: q.claimId!, type: MARCADORES.tipo as never, reason: motivo, editor: firma }],
        '2026-09-30T00:00:00.000Z',
        publicado,
      ),
    ).toThrow(/outside ClaimType/)
    expect(() =>
      applyReclassificationEntries(
        vacio,
        [
          {
            claimId: q.claimId!,
            type: 'valoracion_politica',
            reason: MARCADORES.motivo,
            editor: firma,
          },
        ],
        '2026-09-30T00:00:00.000Z',
        publicado,
      ),
    ).toThrow(/reason/)

    // review:finding-exception: la nota del hueco no llega al suelo de la CLI.
    expect(r.commands.mantener).toContain(`--note "${MARCADORES.nota}"`)
    expect(MARCADORES.nota.trim().length).toBeLessThan(NOTA_MINIMA)

    // Y la firma es el marcador de siempre, en todas.
    for (const cmd of [r.commands.corregirSumario, r.commands.retirarHallazgo, q.reclasificar!]) {
      expect(cmd).toContain(`--editor "${MARCADORES.firma}"`)
    }
    expect(r.commands.mantener).toContain(`--reviewer "${MARCADORES.firma}"`)
  })
})

describe('la cola presenta y no elige', () => {
  it('ninguna fila llega con decisión, y no hay rama que la ponga', () => {
    expect(QUEUE.rows.length).toBeGreaterThan(0)
    for (const r of QUEUE.rows) expect(r.decision).toBeNull()
    // Y no existe en el módulo: la única aparición de `decision` en el
    // constructor la fija a null.
    const src = readFileSync(join(ROOT, 'src/scraper/finding-exception.ts'), 'utf8')
    const asignaciones = src.match(/decision:\s*[^,\n]+/g) ?? []
    expect(asignaciones.length).toBeGreaterThan(0)
    for (const a of asignaciones) expect(a).toMatch(/decision:\s*(null|null,)$/)
  })

  it('no puntúa ni ordena por gravedad: el orden es cronológico', () => {
    const fechas = QUEUE.rows.map((r) => r.plenoDate)
    expect([...fechas].sort().reverse()).toEqual(fechas)
    for (const r of QUEUE.rows) {
      expect(Object.keys(r)).not.toContain('score')
      expect(Object.keys(r)).not.toContain('recomendacion')
    }
  })
})

describe('cada fila trae lo que hace falta para responder la pregunta', () => {
  it('el sumario publicado, que es lo que se juzga', () => {
    for (const r of QUEUE.rows) {
      const f = FINDINGS.items.find((x) => x.id === r.findingId)!
      expect(r.summary).toBe(f.summary)
      expect(r.title).toBe(f.title)
    }
  })

  it('cada cita con el veredicto de la puerta Y el del verificador', () => {
    let conVeredicto = 0
    for (const r of QUEUE.rows) {
      for (const q of r.quotes) {
        expect(q.gate).toBeTruthy()
        expect(q.claimId).toBeTruthy()
        if (q.verdict) conVeredicto += 1
      }
    }
    // Sin esto, «trae el veredicto» pasaría con todas las filas a null.
    expect(conVeredicto).toBe(QUEUE.stats.citasEnCola)
    expect(QUEUE.stats.citasEnCola).toBeGreaterThan(0)
  })

  it('quién la firmó', () => {
    for (const r of QUEUE.rows) {
      const f = FINDINGS.items.find((x) => x.id === r.findingId)!
      expect(r.curatorName).toBe(f.curatorName)
    }
    const firmas = Object.values(QUEUE.stats.porCurador).reduce((a, b) => a + b, 0)
    expect(firmas).toBe(QUEUE.stats.encolados)
  })

  it('y el otro eje de la misma cita, para no tener que abrir otra pantalla', () => {
    const conTranscripcion = QUEUE.rows.flatMap((r) =>
      r.quotes.filter((q) => q.transcriptStatus != null),
    )
    expect(conTranscripcion.length).toBe(QUEUE.stats.citasEnCola)
  })
})

describe('una revisión se ata al sumario que juzgó (sobre las fichas reales)', () => {
  /**
   * Una ficha de la cola cuyo sumario ya cambió una vez, con el anterior
   * legible en su bitácora: es el caso real —alguien juzgó unas palabras que
   * luego se editaron—, no uno construido.
   */
  const conAnterior = QUEUE.rows
    .map((r) => {
      const f = FINDINGS.items.find((x) => x.id === r.findingId)!
      const previa = [...(f.corrections ?? [])]
        .reverse()
        .find(
          (c) =>
            c.field === 'summary' &&
            typeof c.original === 'string' &&
            !REDACTION_DIGEST_RE.test(c.original) &&
            c.original !== f.summary,
        )
      return previa ? { row: r, anterior: previa.original } : null
    })
    .find((x) => x !== null)

  const mantener = (findingId: string, sumario: string): ExceptionReview => ({
    findingId,
    decision: 'keep',
    reviewer: 'Ana Pérez Gil',
    reviewedAt: '2026-09-30T10:00:00.000Z',
    summaryHash: summaryHash(sumario),
    note: 'el sumario no dice con otras palabras lo que la cita retenida no puede decir',
  })

  it('mide algo: hay una ficha en cola con un sumario anterior legible', () => {
    expect(conAnterior).toBeTruthy()
  })

  it('atada a un sumario anterior, la ficha vuelve a la cola', () => {
    const { row, anterior } = conAnterior!
    const registro = recordReview(null, mantener(row.findingId, anterior))
    const { pendientes, revisadas } = pendientesDeRevision(QUEUE.rows, registro)
    expect(pendientes.map((r) => r.findingId)).toContain(row.findingId)
    expect(revisadas).toEqual([])
  })

  it('atada al sumario vigente, sale — el control', () => {
    const { row } = conAnterior!
    const registro = recordReview(null, mantener(row.findingId, row.summary))
    const { pendientes, revisadas } = pendientesDeRevision(QUEUE.rows, registro)
    expect(pendientes.map((r) => r.findingId)).not.toContain(row.findingId)
    expect(revisadas.map((r) => r.findingId)).toEqual([row.findingId])
    expect(pendientes.length + revisadas.length).toBe(QUEUE.rows.length)
  })

  it('una «keep» de la v1, aunque se ate al sumario vigente, no la saca', () => {
    // Las 28 «keep» del 11-08-2026 respondían a «¿merece la excepción?».
    const { row } = conAnterior!
    const v1 = {
      version: 'finding-exception-review-v1',
      generatedAt: '2026-08-11T09:07:22.909Z',
      reviews: [mantener(row.findingId, row.summary)],
    }
    const { pendientes, revisadas } = pendientesDeRevision(QUEUE.rows, v1)
    expect(pendientes.map((r) => r.findingId)).toContain(row.findingId)
    expect(revisadas).toEqual([])
  })
})

describe('la cabecera del fichero dice lo que es', () => {
  it('se declara no publicable y nombra a los escritores', () => {
    expect(QUEUE._comment).toMatch(/editorial\//)
    expect(QUEUE._comment).toMatch(/no debe publicarse/)
    expect(QUEUE._comment).toContain(CORRECTION_CLI)
  })

  it('apunta a los dos snapshots de los que sale', () => {
    expect(QUEUE.sourceSnapshot.findings).toBe('public/data/pleno-findings.json')
    expect(QUEUE.sourceSnapshot.provenance).toBe('public/data/finding-quote-provenance.json')
    expect(QUEUE.sourceSnapshot.provenanceGeneratedAt).toBe(PROVENANCE.generatedAt)
  })
})
