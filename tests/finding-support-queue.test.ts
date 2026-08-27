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
  DOCUMENTARY_CONNECTOR_NAMES,
  HEDGE_MARKER_NAMES,
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
    //
    // El umbral era 40, o sea el tamaño del corpus del día que se escribió, y
    // por tanto se rompía con cada retirada legítima — que es lo contrario de
    // lo que una guarda anti-vacío debe hacer. Lo que hay que exigir es que
    // haya corpus, no que no encoja nunca.
    expect(SNAPSHOT.items.length).toBeGreaterThan(10)
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
    expect(compared).toBeGreaterThan(120)
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

  /**
   * Dos de los tres reparados —`d2b7bb` y `1e1bfa`— se retiraron enteros el
   * 2026-08-11: la puerta editorial retenía TODAS sus citas, así que no había
   * sumario que corregir. La reparación siguió siendo correcta; lo que ya no
   * existe es la ficha. Se comprueba la lápida en vez de la prosa, por la
   * misma razón por la que estas filas no se borran: un caso que desaparece de
   * una lista no distingue «se arregló» de «se dejó de mirar».
   */
  const RETIRADOS = new Set(
    (SNAPSHOT.retractions ?? []).map((r: { findingId: string }) => r.findingId),
  )
  const expectLapidado = (id: string): void => {
    const r = (SNAPSHOT.retractions ?? []).find((x: { findingId: string }) => x.findingId === id)
    expect(r, `${id}: ni en la cola ni en el registro de retiradas`).toBeDefined()
    expect(r!.digest).toMatch(/^hallazgo · sha256:[0-9a-f]{12}$/)
  }

  it.each(REPARADOS)(
    '$id ya no afirma el vínculo documental que se le tabuló',
    ({ id, claimGone, claimKept }) => {
      if (RETIRADOS.has(id)) return expectLapidado(id)
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
      if (RETIRADOS.has(id)) return expectLapidado(id)
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
    //
    // Se mide sobre ENTRADA CONTROLADA, no contando filas del corpus vivo. La
    // versión anterior exigía «más de diez afirmativas publicadas», y eso hace
    // que una pasada de correcciones —cuyo objetivo es justamente que queden
    // menos— rompa la prueba por haber acertado. Dos sumarios sintéticos
    // montados sobre una fila real del snapshot (para no recitar la forma)
    // bastan: si el léxico muere, los dos caen en el mismo cajón y la
    // aserción de separación se pone roja pase lo que pase en el corpus.
    const base = SNAPSHOT.items[0]
    const probe = (id: string, summary: string) => ({ ...base, id, summary })
    const controlled = {
      ...SNAPSHOT,
      items: [
        probe('probe-sin-afirmacion', 'Un grupo menciona en el pleno la limpieza de los colegios.'),
        probe(
          'probe-afirmativa',
          'Un grupo menciona la limpieza de los colegios. El registro municipal incluye el contrato de limpieza.',
        ),
      ],
    }
    const rows = buildSupportQueue(controlled, { generatedAt: '2026-08-09T00:00:00.000Z' }).rows
    const shapeOf = (id: string) => rows.find((r) => r.id === id)!.claimShape
    expect(shapeOf('probe-afirmativa')).toBe('afirmativa-documental')
    expect(shapeOf('probe-sin-afirmacion')).toBe('sin-afirmacion-documental')
    // Y la cola sigue leyéndose por ese orden: lo que afirma un vínculo, antes.
    expect(rows.map((r) => r.id)).toEqual(['probe-afirmativa', 'probe-sin-afirmacion'])
    expect(rows[0].documentaryConnectors.length).toBeGreaterThan(0)
    expect(rows[1].documentaryConnectors).toEqual([])
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

  /**
   * ─── El punto ciego, declarado ────────────────────────────────────────────
   *
   * La sonda de aquí arriba —«Ambos grupos mencionan contratos menores…»— es
   * casi literalmente el sumario publicado de `f-2025-10-06-cit-6c4d24`, y
   * este bloque la fijaba como comportamiento DESEADO. Lo es, para lo que el
   * clasificador mide: los verbos de habla están fuera de la lista a propósito,
   * porque que un grupo mencione un contrato en el pleno no es que nosotros
   * afirmemos que el registro lo respalda.
   *
   * Y aun así esa frase era falsa: ninguna de las cuatro citas de aquel
   * hallazgo menciona contrato alguno. La revisión de las filas 36–51 encontró
   * tres sumarios así, y el patrón no es un conector que faltara en la lista
   * sino dos formas que la lista no puede ver — la APOSICIÓN («…en el debate
   * sobre X y el «Contrato mixto…»», sin verbo ninguno) y el verbo de habla con
   * un documento CONCRETO por objeto.
   *
   * No se «arregla» el léxico para que atrape estas tres. Añadir «hacen
   * referencia a» y una regla de aposición sería ajustar al conjunto de prueba:
   * las tres dejarían de aparecer y la clase de fallo seguiría entera, ahora
   * invisible. Lo que sí se puede fijar es la propiedad honesta —el
   * clasificador es LÉXICO e INCOMPLETO, y su etiqueta no es un permiso—, y
   * eso se demuestra con las tres frases reales, no con una sonda inventada.
   */
  const PUNTO_CIEGO = [
    {
      id: 'f-2026-04-20-cit-947479',
      /** Cómo la frase nombró el documento sin ningún conector. */
      forma: 'aposición',
      /** Un trozo del título del expediente que la frase soldó, verbatim. */
      expediente: 'sistema de debate, voto electrónico',
    },
    {
      id: 'f-2025-12-01-cit-d89862',
      forma: 'verbo de habla con documento concreto',
      expediente: 'adquisición de una carpa',
    },
    {
      id: 'f-2025-10-06-cit-6c4d24',
      forma: 'verbo de habla con documento concreto',
      expediente: 'asesoramiento jurídico y defensa procesal',
    },
  ]

  it.each(PUNTO_CIEGO)(
    '$id: el clasificador no vio la afirmación documental que la frase sí hacía ($forma)',
    ({ id, expediente }) => {
      const finding = SNAPSHOT.items.find((f) => f.id === id)
      expect(finding, `${id} ya no está en el snapshot`).toBeDefined()
      // El sumario TAL Y COMO SE PUBLICÓ, leído de la bitácora de correcciones
      // en vez de copiado a mano: si mañana alguien reescribe la historia, esto
      // se cae en vez de seguir midiendo una frase que ya no existió.
      const defectuoso = (finding!.corrections ?? []).find(
        (c) => c.field === 'summary' && c.original.includes(expediente.split(',')[0]),
      )
      // Si el sumario se REDACTÓ después, la bitácora guarda un digest en vez
      // de la prosa: `--redact` barre las copias precisamente para que el
      // original tachado no vuelva a publicarse en /hallazgos. Sin esta salida,
      // el test exigiría la fuga.
      if (!defectuoso) {
        const digest = (finding!.corrections ?? []).find(
          (c) => c.field === 'summary' && /^sumario · sha256:[0-9a-f]{12}$/.test(c.original),
        )
        expect(digest, `${id}: la bitácora no conserva ni el sumario ni su digest`).toBeDefined()
        return
      }

      // 1. La etiqueta que el clasificador le dio, y sigue dándole.
      const antes = classifyClaimShape(defectuoso!.original)
      expect(antes.shape).toBe('sin-afirmacion-documental')
      expect(antes.connectors).toEqual([])

      // 2. La mitad positiva: la frase SÍ nombraba un expediente concreto —el
      //    fragmento existe verbatim en el título de un contrato real del
      //    corpus que este sitio publica—, así que «sin afirmación documental»
      //    describe lo que el léxico mide y no lo que la frase hacía.
      const t = JSON.parse(
        readFileSync(join(__dirname, '..', 'public', 'data', 'tenders.json'), 'utf8'),
      ) as {
        tenders: { title: string }[]
        contracts: { title: string }[]
      }
      const rows = [...t.tenders, ...t.contracts]
      expect(rows.length).toBeGreaterThan(100)
      expect(
        rows.filter((r) => r.title.toLowerCase().includes(expediente.toLowerCase())).length,
        `«${expediente}» no aparece en ningún título del corpus`,
      ).toBeGreaterThan(0)
      expect(defectuoso!.original.toLowerCase()).toContain(expediente.split(',')[0].toLowerCase())

      // 3. Y la etiqueta NO se movió al corregirlo. El sumario de hoy ya no
      //    afirma nada documental y sigue clasificado igual, así que la
      //    etiqueta no distinguió la frase falsa de la reparada en ninguna de
      //    las dos direcciones. `sin-afirmacion-documental` ordena la cola;
      //    nunca es «aquí no hay nada que comprobar».
      const ahora = classifyClaimShape(finding!.summary)
      expect(ahora.shape).toBe(antes.shape)
      expect(ahora.connectors).toEqual([])
      expect(finding!.summary).not.toBe(defectuoso!.original)
    },
  )

  it('las tres entran en la cola igual que las demás: la forma ordena, no filtra', () => {
    // El corolario operativo del punto ciego. Si la etiqueta fuera un filtro,
    // las tres filas peores del corpus habrían salido de la cola sin que nadie
    // las leyera; entran, sin veredicto, con la CLI de corrección al lado.
    const rows = build().rows
    for (const { id } of PUNTO_CIEGO) {
      const row = rows.find((r) => r.id === id)
      expect(row, `${id} no está en la cola`).toBeDefined()
      expect(row!.claimShape).toBe('sin-afirmacion-documental')
      expect(row!.verdict).toBe('pendiente')
      expect(row!.correctionCommand).toContain('npm run correct-pleno-finding')
    }
    // Que se midió sobre una cola de verdad y no sobre tres filas sueltas.
    expect(rows.length).toBe(SNAPSHOT.items.length)
  })

  /**
   * ─── El sentinela era una proporción del corpus vivo, y medía al revés ────
   *
   * Hasta este lote, la garantía de «el clasificador sigue vivo» era
   * `counts.a > items.length * 0.3` sobre el snapshot publicado. Nació bien
   * —si el léxico moría, todo caía en «sin afirmación» y la cola perdía su
   * orden sin romper nada— pero mide la cosa equivocada en cuanto empieza a
   * haber correcciones: `afirmativa-documental` cuenta los sumarios que
   * AFIRMAN un vínculo documental en voz del medio, y retirar los que nadie
   * comprobó es exactamente el trabajo. El lote 1 lo bajó de 30 a 18 sobre un
   * suelo de 15,6; el lote 2 lo deja en 12. El suelo castigaba el acierto, y
   * el modo de «arreglarlo» que invita —bajar el número— es el que deja de
   * medir.
   *
   * La propiedad que de verdad se quería es que el clasificador DISCRIMINE, y
   * eso no depende del corpus: se comprueba con entradas conocidas. Queda
   * repartido en dos bloques:
   *
   *   · sondas — un par mínimo por cada conector y por cada matiz declarados
   *     en el módulo, con la lista IMPORTADA, no recitada. Ninguna pasada de
   *     correcciones puede vaciarlas.
   *   · corpus — sólo la coherencia entre la etiqueta y la prueba léxica que
   *     la etiqueta significa, más la constancia de que se recorrieron todas
   *     las filas. Sin proporciones: ninguna aserción de este bloque puede
   *     ponerse roja porque el sitio afirme menos vínculos.
   */
  it('discrimina: el mismo enunciado documental cambia de forma al añadirle un matiz', () => {
    // El par mínimo. Una sola frase, una sola variable: el matiz.
    const afirmativa = 'El registro municipal incluye el contrato de limpieza de los colegios.'
    const matizada = `${afirmativa.slice(0, -1)}, pero no documenta el asunto debatido.`
    const sinAfirmacion = 'Un grupo menciona en el pleno la limpieza de los colegios.'

    const shapes = [afirmativa, matizada, sinAfirmacion].map((s) => classifyClaimShape(s).shape)
    // La aserción de separación, que es la que hay que leer: tres entradas
    // controladas, tres formas distintas. Si el léxico de conectores muere,
    // las tres colapsan en «sin afirmación»; si muere el de matices, las dos
    // primeras colapsan en «afirmativa». Ambos casos caen aquí.
    expect(new Set(shapes).size).toBe(3)
    expect(shapes).toEqual([
      'afirmativa-documental',
      'documental-matizada',
      'sin-afirmacion-documental',
    ])
  })

  it('cada conector y cada matiz declarados en el módulo se reconocen', () => {
    // Sondas por nombre. La cobertura se comprueba contra la lista EXPORTADA:
    // añadir un conector sin sonda pone esto rojo, que es lo contrario de lo
    // que hace un banco de casos escrito a mano.
    const CONNECTOR_PROBES: Record<string, string> = {
      incluye: 'El registro municipal incluye el contrato de limpieza.',
      consta: 'Según la documentación municipal, consta la licitación de las obras.',
      registra: 'La base municipal de contratación registra un contrato de obras.',
      figura: 'En el registro municipal figura el expediente de las obras.',
      'cuenta-con': 'El registro municipal cuenta con un contrato de limpieza.',
      corrobora: 'El expediente corrobora la fecha de la adjudicación.',
      'coincide-con': 'El debate coincide con registros oficiales de contratación.',
      'se-relaciona-con': 'Este debate se relaciona con el registro de la licitación.',
      'se-refleja-en': 'Estos puntos se reflejan en registros de contratación municipal.',
      'se-enmarca-en': 'El debate se enmarca en la documentación del contrato de obras.',
      'queda-documentado': 'La contratación municipal publicada queda documentada como tal.',
      'en-referencia-al': 'En referencia al registro, la licitación se tramitó en 2025.',
      'segun-el-registro': 'Según el registro, la licitación se adjudicó en 2025.',
      // Sin «incluyen»: el clasificador se queda con el PRIMER conector de la
      // tabla que encaja en cada frase, así que una sonda con dos conectores
      // mide el otro y pasa creyendo que midió éste. La aserción de sonda
      // única, más abajo, es la que lo destapó.
      'documentos-cotejados': 'Los documentos cotejados corresponden a la licitación de las obras.',
    }
    const HEDGE_PROBES: Record<string, string> = {
      negacion: 'El registro municipal incluye el contrato, pero no documenta lo debatido.',
      'sin-respaldo': 'El registro municipal incluye el contrato, sin corroboración de lo dicho.',
      ninguno: 'El registro municipal incluye contratos, pero ninguno respalda lo debatido.',
      parcial: 'El registro municipal incluye el contrato; sólo podemos confirmar su existencia.',
    }
    expect(Object.keys(CONNECTOR_PROBES).sort()).toEqual([...DOCUMENTARY_CONNECTOR_NAMES].sort())
    expect(Object.keys(HEDGE_PROBES).sort()).toEqual([...HEDGE_MARKER_NAMES].sort())

    for (const [name, probe] of Object.entries(CONNECTOR_PROBES)) {
      const r = classifyClaimShape(probe)
      // Sonda de un solo conector, o no se sabe cuál se está midiendo.
      expect(
        r.connectors.map((c) => c.name),
        `sonda de «${name}»`,
      ).toEqual([name])
      expect(r.shape, `sonda de «${name}»`).toBe('afirmativa-documental')
      // Y la frase que se le devuelve al curador es verbatim del sumario, que
      // es lo único que le permite justificar la etiqueta.
      expect(probe).toContain(r.connectors[0].sentence)
    }
    for (const [name, probe] of Object.entries(HEDGE_PROBES)) {
      const r = classifyClaimShape(probe)
      expect(
        r.hedges.map((h) => h.name),
        `matiz «${name}» no reconocido`,
      ).toContain(name)
      expect(r.shape).toBe('documental-matizada')
      expect(probe.toLowerCase()).toContain(r.hedges[0].match.toLowerCase())
    }
  })

  it('sobre el corpus publicado: la etiqueta y la prueba léxica nunca se separan', () => {
    // Lo único que se afirma del corpus vivo, y lo que atraparía: una fila
    // etiquetada sin la evidencia léxica que la etiqueta significa —una
    // «afirmativa» sin conector, una «matizada» sin matiz, una «sin
    // afirmación» que sí lo lleva—. Es invariante bajo correcciones: borrar
    // conectores mueve filas de cajón sin romperlo nunca.
    let checked = 0
    for (const f of SNAPSHOT.items) {
      const { shape, connectors, hedges } = classifyClaimShape(f.summary)
      checked += 1
      if (shape === 'afirmativa-documental') {
        expect(connectors.length, `${f.id}`).toBeGreaterThan(0)
        expect(hedges, `${f.id}`).toEqual([])
      } else if (shape === 'documental-matizada') {
        expect(connectors.length, `${f.id}`).toBeGreaterThan(0)
        expect(hedges.length, `${f.id}`).toBeGreaterThan(0)
      } else {
        expect(connectors, `${f.id}`).toEqual([])
      }
      // La frase citada por el conector sale del sumario, byte a byte.
      for (const c of connectors) expect(f.summary).toContain(c.sentence)
    }
    // Que el recorrido evaluó algo. NO se afirma cuántas filas caen en cada
    // forma: ese número debe poder bajar sin que nada se ponga rojo. El umbral
    // de abajo decía justo lo contrario —era el tamaño del corpus del día que
    // se escribió— y se rompió con la primera retirada legítima.
    expect(checked).toBe(SNAPSHOT.items.length)
    expect(checked).toBeGreaterThan(10)
  })
})

/** Ids retirados del fichero publicado, para los bloques de más abajo. */
const RETIRADOS_GLOBAL = new Set(
  (SNAPSHOT.retractions ?? []).map((r: { findingId: string }) => r.findingId),
)

describe('revisiones previas · sólo lo que un commit nombra', () => {
  it('etiqueta los hallazgos que la auditoría dio por sostenidos, y los nombra', () => {
    const queue = build()
    const upheld = queue.rows.filter((r) => r.priorReview?.outcome === 'upheld').map((r) => r.id)
    // `2c074a` la dio por sostenida la auditoría y se retiró entera el
    // 2026-08-11 — la puerta retenía sus cuatro citas. Sale de la cola con el
    // hallazgo; los demás nombrados siguen.
    const NOMBRADOS = [
      'f-2026-07-03-cit-df8455',
      'f-2026-01-19-acu-2c074a',
      'f-2025-12-23-cit-c905c3',
    ].filter((id) => !RETIRADOS_GLOBAL.has(id))
    expect(NOMBRADOS.length).toBeGreaterThan(0)
    expect(upheld).toEqual(expect.arrayContaining(NOMBRADOS))
    // Nada de deducir por eliminación: la auditoría dio 10 por sostenidos pero
    // sólo nombró 4, así que sólo 4 pueden llevar etiqueta — menos las retiradas.
    expect(upheld).toHaveLength(
      4 - Object.keys(PRIOR_REVIEWS).filter((id) => RETIRADOS_GLOBAL.has(id)).length,
    )
    for (const r of queue.rows) {
      if (r.priorReview) expect(r.priorReview.sourceCommit).toMatch(/^[0-9a-f]{7,40}$/)
    }
  })

  it('cada id etiquetado existe de verdad en el snapshot publicado', () => {
    const ids = new Set(SNAPSHOT.items.map((f) => f.id))
    const labelled = Object.keys(PRIOR_REVIEWS)
    expect(labelled.length).toBeGreaterThan(0)
    // Publicado o lapidado: lo que no puede es haberse esfumado sin registro.
    for (const id of labelled) {
      expect(
        ids.has(id) || RETIRADOS_GLOBAL.has(id),
        `${id} no está ni publicado ni en el registro de retiradas`,
      ).toBe(true)
    }
  })

  it('el resto se encola sin etiqueta, no como «ya revisado»', () => {
    const queue = build()
    const unlabelled = queue.rows.filter((r) => r.priorReview === null)
    expect(unlabelled.length).toBe(
      SNAPSHOT.items.length -
        Object.keys(PRIOR_REVIEWS).filter((id) => !RETIRADOS_GLOBAL.has(id)).length,
    )
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
