/**
 * La cola de revisión «¿lo sostiene o sólo se le parece?» de /hallazgos.
 *
 * Estas pruebas se corren contra el snapshot PUBLICADO, no contra un fixture
 * inventado: la regla más cara de este repo es que seis pruebas recitaron una
 * forma en vez de importarla y siguieron verdes mientras producción no
 * encajaba con nada. Y todas afirman que la comprobación EVALUÓ algo — una
 * suite verde que no midió nada ya ha pasado aquí dos veces.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildSupportQueue,
  carriedReviewsFrom,
  classifyClaimShape,
  SUPPORT_VERDICTS,
  SUPPORT_VERDICT_IDS,
  PRIOR_REVIEWS,
  type CarriedReview,
} from '../src/scraper/finding-support'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'

const SNAPSHOT_PATH = join(__dirname, '..', 'public', 'data', 'pleno-findings.json')
const RAW = readFileSync(SNAPSHOT_PATH, 'utf8')
const SNAPSHOT = validateFindingsSnapshot(RAW)

const build = (opts: Partial<Parameters<typeof buildSupportQueue>[1]> = {}) =>
  buildSupportQueue(SNAPSHOT, { generatedAt: '2026-08-09T00:00:00.000Z', ...opts })

describe('buildSupportQueue · nada se cae por el camino', () => {
  it('encola exactamente tantas filas como items trae el snapshot', () => {
    const queue = build()
    // Que la comprobación mide algo: si el snapshot se quedara vacío, esta
    // prueba pasaría comparando 0 con 0 sin haber examinado nada.
    expect(SNAPSHOT.items.length).toBeGreaterThan(40)
    expect(queue.rows).toHaveLength(SNAPSHOT.items.length)
    expect(queue.stats.queued).toBe(SNAPSHOT.items.length)
    expect(queue.sourceSnapshot.itemCount).toBe(SNAPSHOT.items.length)
  })

  it('encola cada id del snapshot una sola vez', () => {
    const queue = build()
    const queued = queue.rows.map((r) => r.id).sort()
    const source = SNAPSHOT.items.map((f) => f.id).sort()
    expect(queued).toEqual(source)
    expect(new Set(queued).size).toBe(source.length)
  })

  it('reordena pero no filtra: las tres formas suman el total', () => {
    const s = build().stats
    expect(s.afirmativaDocumental + s.documentalMatizada + s.sinAfirmacionDocumental).toBe(
      SNAPSHOT.items.length,
    )
  })
})

describe('buildSupportQueue · los extractos viajan byte a byte', () => {
  it('cada excerpt emitido es idéntico al snippet del snapshot', () => {
    const queue = build()
    const byId = new Map(SNAPSHOT.items.map((f) => [f.id, f]))
    let compared = 0
    for (const row of queue.rows) {
      const src = byId.get(row.id)
      expect(src, `sin origen para ${row.id}`).toBeDefined()
      expect(row.crossChecked).toHaveLength(src!.crossChecked.length)
      row.crossChecked.forEach((ref, i) => {
        const origin = src!.crossChecked[i]
        // Igualdad estricta de cadena: cualquier trim, re-wrap o normalización
        // Unicode rompe esto, que es exactamente lo que debe romper.
        expect(ref.excerpt).toBe(origin.snippet)
        expect(ref.ref).toBe(origin.ref)
        expect(ref.kind).toBe(origin.kind)
        compared += 1
      })
    }
    // La suite no puede declararse verde sin haber comparado extractos reales.
    expect(compared).toBeGreaterThan(150)
    expect(compared).toBe(SNAPSHOT.items.reduce((n, f) => n + f.crossChecked.length, 0))
  })

  it('el sumario y las citas también viajan verbatim', () => {
    const queue = build()
    const byId = new Map(SNAPSHOT.items.map((f) => [f.id, f]))
    let checked = 0
    for (const row of queue.rows) {
      const src = byId.get(row.id)!
      expect(row.summary).toBe(src.summary)
      expect(row.title).toBe(src.title)
      expect(row.quotes.map((q) => q.text)).toEqual(src.quotes.map((q) => q.text))
      checked += 1
    }
    expect(checked).toBe(SNAPSHOT.items.length)
  })
})

describe('buildSupportQueue · los casos tabulados, todos reparados', () => {
  /**
   * Los tres casos de libro que esta cola se escribió para enseñar —un sumario
   * que ata el debate a un expediente con el que sólo comparte una palabra—
   * están los tres reparados por `correct-pleno-finding`: `cit-591d40` en
   * b8fea6f, y los otros dos en el lote de revisión de las filas 0–17.
   *
   * Se quedan aquí como ASERCIONES INVERTIDAS en vez de borrarse: un caso que
   * desaparece de una lista no distingue «se arregló» de «se dejó de mirar».
   * Cada fila dice qué frase se fue, qué frase se queda y qué documento dejó
   * de colgar de ella. El detalle de cada retirada está en la bitácora pública
   * del hallazgo y en tests/pleno-findings-published.test.ts.
   */
  const REPARADOS = [
    {
      id: 'f-2025-10-06-cit-591d40',
      // Debate: atención policial a mujeres vulnerables. Documento: un
      // suministro de dos perros. Colisión sobre «Unidad … Policía Local».
      document: /dos perros/,
      claimGone: 'El debate coincide',
      claimKept: 'una unidad de policía local que asiste a mujeres vulnerables',
    },
    {
      id: 'f-2026-01-19-acu-d2b7bb',
      // Debate: si un concejal había contestado un correo. Documento: una
      // migración a Microsoft 365 adjudicada DESPUÉS del pleno. Colisión
      // sobre «correo», y encima con el verbo «corrobora».
      document: /Microsoft 365/,
      claimGone: 'corrobora la referencia a la gestión del correo electrónico municipal',
      claimKept: 'un incumplimiento empresarial calificado de grave ocurrido en enero',
    },
    {
      id: 'f-2026-05-11-acu-1e1bfa',
      // Debate: Tesorería. Documento: el Plan de Igualdad, adjudicado tres
      // semanas DESPUÉS del pleno. El sumario colgaba una valoración técnica
      // negativa del plan equivocado.
      document: /Plan de Igualdad/,
      claimGone: 'en referencia al registro',
      // La cita del hablante se queda tal cual: la vaguedad de «este Plan» es
      // suya, y quitarla sería corregir al hablante en vez de al sumario.
      claimKept: 'la valoración técnica de este Plan no es positiva',
    },
  ]

  it.each(REPARADOS)(
    '$id ya no afirma el vínculo documental que se le tabuló',
    ({ id, claimGone, claimKept }) => {
      const row = build().rows.find((r) => r.id === id)
      expect(row, 'el hallazgo reparado sigue teniendo que estar en la cola').toBeDefined()
      expect(row!.summary).not.toContain(claimGone)
      // Que la aserción negativa se leyó sobre la fila correcta y no sobre una
      // cadena vacía: la frase que el hallazgo conserva tiene que seguir ahí.
      expect(row!.summary).toContain(claimKept)
      expect(row!.claimShape).toBe('sin-afirmacion-documental')
    },
  )

  it.each(REPARADOS)(
    '$id ya no cuelga del documento con el que colisionaba',
    ({ id, document }) => {
      const row = build().rows.find((r) => r.id === id)!
      // Que se está mirando una lista de verdad, no una vacía —que es como una
      // aserción de ausencia pasa sin haber comprobado nada.
      expect(row.crossChecked.length).toBeGreaterThan(0)
      expect(row.crossChecked.every((c) => c.excerpt.length > 0)).toBe(true)
      expect(row.crossChecked.filter((c) => document.test(c.excerpt))).toEqual([])
    },
  )

  it('la cola sigue sabiendo señalar una afirmación documental cuando la hay', () => {
    // El complemento obligatorio de las tres aserciones invertidas: si el
    // clasificador dejara de reconocer conectores, las tres pasarían por la
    // razón equivocada y este bloque sería verde sin medir nada.
    const queue = build()
    const afirmativas = queue.rows.filter((r) => r.claimShape === 'afirmativa-documental')
    expect(afirmativas.length).toBeGreaterThan(10)
    expect(afirmativas.every((r) => r.documentaryConnectors.length > 0)).toBe(true)
  })
})

describe('política · la cola presenta, no tría', () => {
  const FORBIDDEN =
    /^(score|puntuacion|puntuación|rank|ranking|orden|priority|prioridad|confidence|confianza|likelihood|probabilidad|strength|fuerza|recommendation|recomendacion|recomendación|suggested|sugerido|verdictSuggestion|autoVerdict|weight|peso)$/i

  /** Devuelve toda clave del árbol y, aparte, las que violan la política. */
  const walk = (node: unknown, path: string, seen: string[], hits: string[]) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, seen, hits))
      return
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        seen.push(`${path}.${k}`)
        if (FORBIDDEN.test(k)) hits.push(`${path}.${k}`)
        walk(v, `${path}.${k}`, seen, hits)
      }
    }
  }

  it('ninguna clave del JSON emitido puntúa, ordena por fuerza ni recomienda', () => {
    const queue = build()
    const seen: string[] = []
    const hits: string[] = []
    walk(queue, '$', seen, hits)
    expect(hits).toEqual([])
    // Que el recorrido evaluó algo: si `walk` no bajara por las filas, la
    // aserción de arriba pasaría sobre un árbol vacío sin haber mirado nada.
    expect(seen.length).toBeGreaterThan(500)
    expect(seen.some((p) => p.endsWith('.excerpt'))).toBe(true)
    expect(seen.some((p) => p.endsWith('.summary'))).toBe(true)
  })

  it('ningún valor numérico acompaña a una fila: sólo texto y etiquetas', () => {
    const queue = build()
    for (const row of queue.rows) {
      const numeric = Object.entries(row).filter(([, v]) => typeof v === 'number')
      expect(numeric, `${row.id} lleva un número: ${JSON.stringify(numeric)}`).toEqual([])
    }
    expect(queue.rows.length).toBeGreaterThan(0)
  })

  it('todas las filas arrancan sin veredicto: la cola no juzga por el curador', () => {
    const queue = build()
    expect(queue.rows.every((r) => r.verdict === 'pendiente')).toBe(true)
    expect(queue.stats.conVeredictoDelCurador).toBe(0)
    expect(queue.rows.length).toBe(SNAPSHOT.items.length)
  })

  it('ofrece las cuatro clases de fallo de revisar-borrador, más «lo sostiene»', () => {
    expect(SUPPORT_VERDICT_IDS).toContain('solo-se-le-parece')
    expect(SUPPORT_VERDICT_IDS).toContain('tiempo-verbal-no-coincide')
    expect(SUPPORT_VERDICT_IDS).toContain('omision-que-cambia-la-conclusion')
    expect(SUPPORT_VERDICT_IDS).toContain('nombra-persona-con-prueba-de-bloque')
    expect(SUPPORT_VERDICTS.filter((v) => v.isFailure)).toHaveLength(4)
    expect(SUPPORT_VERDICT_IDS).toContain('lo-sostiene')
    expect(build().verdictOptions).toBe(SUPPORT_VERDICTS)
  })
})

describe('classifyClaimShape · propiedad léxica, nunca un pronóstico', () => {
  it('reconoce una afirmación documental sin matiz', () => {
    const r = classifyClaimShape(
      'El PSOE señala X. El registro municipal incluye el «Contrato de servicio Y».',
    )
    expect(r.shape).toBe('afirmativa-documental')
    expect(r.connectors.map((c) => c.name)).toContain('incluye')
    // El conector devuelve la frase entera para que la fila pueda justificarse.
    expect(r.connectors[0].sentence).toContain('El registro municipal incluye')
  })

  it('degrada a matizada cuando el propio sumario niega el respaldo', () => {
    const r = classifyClaimShape(
      'El registro municipal incluye el contrato Y, pero no documenta el asunto debatido.',
    )
    expect(r.shape).toBe('documental-matizada')
    expect(r.hedges.map((h) => h.name)).toContain('negacion')
  })

  it('no cuenta como afirmación documental lo que sólo reproduce lo dicho', () => {
    const r = classifyClaimShape(
      'Ambos grupos mencionan contratos menores relacionados con servicios jurídicos.',
    )
    expect(r.shape).toBe('sin-afirmacion-documental')
    expect(r.connectors).toEqual([])
  })

  it('clasifica los 52 hallazgos publicados en las tres formas, sin dejar ninguna vacía', () => {
    const counts = { a: 0, m: 0, s: 0 }
    for (const f of SNAPSHOT.items) {
      const shape = classifyClaimShape(f.summary).shape
      if (shape === 'afirmativa-documental') counts.a += 1
      else if (shape === 'documental-matizada') counts.m += 1
      else counts.s += 1
    }
    expect(counts.a + counts.m + counts.s).toBe(SNAPSHOT.items.length)
    // Techo de sentinela: si el clasificador dejara de reconocer conectores,
    // todo caería en «sin afirmación» y la cola perdería su orden sin fallar.
    expect(counts.a).toBeGreaterThan(SNAPSHOT.items.length * 0.3)
    expect(counts.s).toBeLessThan(SNAPSHOT.items.length * 0.5)
  })
})

describe('revisiones previas · sólo lo que un commit nombra', () => {
  it('etiqueta los hallazgos que la auditoría dio por sostenidos, y los nombra', () => {
    const queue = build()
    const upheld = queue.rows.filter((r) => r.priorReview?.outcome === 'upheld').map((r) => r.id)
    expect(upheld).toEqual(
      expect.arrayContaining([
        'f-2026-07-03-cit-df8455',
        'f-2026-01-19-acu-2c074a',
        'f-2025-12-23-cit-c905c3',
      ]),
    )
    // Nada de deducir por eliminación: la auditoría dio 10 por sostenidos pero
    // sólo nombró 4, así que sólo 4 pueden llevar etiqueta.
    expect(upheld).toHaveLength(4)
    for (const r of queue.rows) {
      if (r.priorReview) expect(r.priorReview.sourceCommit).toMatch(/^[0-9a-f]{7,40}$/)
    }
  })

  it('cada id etiquetado existe de verdad en el snapshot publicado', () => {
    const ids = new Set(SNAPSHOT.items.map((f) => f.id))
    const labelled = Object.keys(PRIOR_REVIEWS)
    expect(labelled.length).toBeGreaterThan(0)
    for (const id of labelled) expect(ids.has(id), `${id} ya no existe`).toBe(true)
  })

  it('el resto se encola sin etiqueta, no como «ya revisado»', () => {
    const queue = build()
    const unlabelled = queue.rows.filter((r) => r.priorReview === null)
    expect(unlabelled.length).toBe(SNAPSHOT.items.length - Object.keys(PRIOR_REVIEWS).length)
    expect(unlabelled.length).toBeGreaterThan(0)
  })
})

describe('arrastre de veredictos · direccionado por contenido', () => {
  const first = SNAPSHOT.items[0]

  it('conserva el veredicto de un curador si el sumario no ha cambiado', () => {
    const hash = build().rows.find((r) => r.id === first.id)!.summaryHash
    const previous = new Map<string, CarriedReview>([
      [
        first.id,
        {
          summaryHash: hash,
          verdict: 'lo-sostiene',
          reviewer: 'curador',
          reviewedAt: '2026-08-08',
          notes: 'leído contra el expediente',
        },
      ],
    ])
    const queue = build({ previous })
    const row = queue.rows.find((r) => r.id === first.id)!
    expect(row.verdict).toBe('lo-sostiene')
    expect(row.reviewer).toBe('curador')
    expect(queue.stats.veredictosArrastrados).toBe(1)
    expect(queue.stats.veredictosInvalidadosPorCambio).toBe(0)
  })

  it('invalida el veredicto si el sumario cambió: se refería a otra frase', () => {
    const previous = new Map<string, CarriedReview>([
      [
        first.id,
        {
          summaryHash: 'obsoleto',
          verdict: 'lo-sostiene',
          reviewer: 'curador',
          reviewedAt: '2026-08-08',
          notes: 'leído contra el expediente',
        },
      ],
    ])
    const queue = build({ previous })
    const row = queue.rows.find((r) => r.id === first.id)!
    expect(row.verdict).toBe('pendiente')
    expect(row.verdictInvalidatedBy).toMatch(/sumario cambió/)
    expect(queue.stats.veredictosInvalidadosPorCambio).toBe(1)
    expect(queue.stats.veredictosArrastrados).toBe(0)
  })

  it('carriedReviewsFrom ignora basura y veredictos inventados', () => {
    expect(carriedReviewsFrom(null).size).toBe(0)
    expect(carriedReviewsFrom({ rows: 'nope' }).size).toBe(0)
    const m = carriedReviewsFrom({
      rows: [{ id: 'x', summaryHash: 'h', verdict: 'inventado' }, { summaryHash: 'sin-id' }],
    })
    expect(m.size).toBe(1)
    expect(m.get('x')!.verdict).toBe('pendiente')
  })
})

describe('la cola no puede escribir en el snapshot publicado', () => {
  it('cada fila enseña la CLI como único camino de escritura', () => {
    const queue = build()
    for (const row of queue.rows) {
      expect(row.correctionCommand).toContain('npm run correct-pleno-finding')
      expect(row.correctionCommand).toContain(row.id)
      expect(row.correctionCommand).toContain('--reason')
    }
    expect(queue.rows.length).toBe(SNAPSHOT.items.length)
  })

  it('construir la cola no muta el snapshot leído', () => {
    const before = JSON.stringify(SNAPSHOT)
    build()
    expect(JSON.stringify(SNAPSHOT)).toBe(before)
  })

  it('el fichero publicado sigue siendo byte a byte el que había en disco', () => {
    build()
    expect(readFileSync(SNAPSHOT_PATH, 'utf8')).toBe(RAW)
  })

  it('el script escribe en editorial/, jamás bajo public/', () => {
    const src = readFileSync(join(__dirname, '..', 'scripts', 'triage-finding-support.ts'), 'utf8')
    expect(src).toContain("const OUT = 'editorial/finding-support-queue.json'")
    // Ninguna escritura apunta a public/: la única mención de public/data es la
    // lectura del snapshot.
    const writes = src.match(/writeFileSync\([^)]*/g) ?? []
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) expect(w).not.toContain('public/')
  })
})
