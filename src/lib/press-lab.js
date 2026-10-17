// @ts-check
/**
 * Honest headline scalars for /laboratorio, derived from the loaded snapshots.
 * Pure — no I/O; `now` is injected for deterministic tests.
 *
 * The lab *monitors* far more headlines than it *audits*. Trust indicators
 * (has-date, is-local, cross-outlet) are deterministic and computed for every
 * in-window article of the feed, whereas an "audit" requires an LLM-extracted
 * claim that has been verified against municipal data. Conflating the two
 * overstates the work done — a page reading "70 auditados / 0% verificado" is
 * self-contradictory. These fields keep the two counts distinct, and leave the
 * ratios null (→ rendered "—") when there is nothing to divide.
 */
const WINDOW_DAYS = 30

/**
 * Las tarjetas de la ventana: exactamente lo que la lista de /laboratorio pinta con
 * los filtros en «Todos», y por eso lo único que su contador puede poner de total.
 *
 * Son los titulares del feed y, además, los artículos de los que guardamos
 * afirmaciones y que el feed ya no trae. press.json es una foto de lo que los FEEDS
 * llevan hoy —el de infoturia guarda sólo 10 entradas, y Google News rota—, mientras
 * que las afirmaciones se guardan por articleId. Sin esas tarjetas, una afirmación
 * cuyo artículo salió del feed se descargaba y no se pintaba en ninguna parte: así se
 * escondía la cifra en euros más alta del laboratorio, «El Consell inverteix 23,6
 * milions per a ampliar la depuradora a Riba-roja» (Periòdic, 2026-07-10). Cada
 * afirmación lleva la url, el medio y la fecha de su artículo, así que la tarjeta se
 * reconstruye desde ella, sin volver a pedir un feed que ya no la lista.
 *
 * Y una sola lista para las dos cosas. La página construía la suya —feed MÁS esas
 * tarjetas, con la fecha comparada como CADENA— y el total salía de aquí, del feed
 * solo, con la fecha como número y otro reloj. El 28-09-2026 el contador decía «46 de
 * 45 · ventana 30 días»: 45 del feed y `t335v0`, FUERA DEL FEED (revisión lectora de
 * ese día). Cada tarjeta que se pinta estaba en el feed cuando se extrajeron sus
 * afirmaciones, así que también se monitorizó: cuenta en el total.
 */
function articulosDeLaVentana(press, verified, now) {
  const cutoffMs = now - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const enVentana = (iso) => {
    const t = Date.parse(iso)
    return Number.isFinite(t) && t >= cutoffMs
  }
  const delFeed = new Set(press.map((p) => p?.id))
  const fuera = new Map()
  for (const row of verified) {
    const c = row?.claim
    if (!c?.articleId || delFeed.has(c.articleId) || fuera.has(c.articleId)) continue
    if (!enVentana(c.articleDate)) continue
    fuera.set(c.articleId, {
      id: c.articleId,
      title: c.articleTitle ?? c.verbatim?.slice(0, 120) ?? null,
      link: c.articleUrl,
      source: c.articleSource,
      sourceHost: c.articleSourceHost ?? null,
      date: c.articleDate,
      fingerprint: c.articleFingerprint,
      orphan: true,
    })
  }
  return [...press.filter((p) => enVentana(p?.date)), ...fuera.values()]
}

export function pressLabSummary({ press = [], verified = [] } = {}, now = Date.now()) {
  const articulos = articulosDeLaVentana(press, verified, now)

  // Los KPI cuentan las afirmaciones de las tarjetas que la lista pinta, no el corpus
  // entero. Desde octubre de 2026 la extracción se acumula entre pasadas
  // (src/scraper/press-extraccion.ts) y el corpus guarda afirmaciones de artículos que
  // ya salieron de la ventana: «Artículos auditados» y las tasas las sumaban mientras
  // «Titulares monitorizados» y la lista contaban la ventana, y la página podía decir
  // más auditados que monitorizados. La ventana es una sola —la de
  // `articulosDeLaVentana`—: aquí se pregunta por su lista, no se repite su regla.
  const enLaLista = new Set(articulos.map((a) => a?.id))
  const auditedIds = new Set()
  let totalClaims = 0
  let verificado = 0
  let contradicho = 0
  let parcial = 0
  for (const row of verified) {
    const id = row?.claim?.articleId
    if (!id || !enLaLista.has(id)) continue
    auditedIds.add(id)
    totalClaims += 1
    const v = row?.verification?.verdict
    if (v === 'verificado') verificado += 1
    else if (v === 'contradicho') contradicho += 1
    else if (v === 'parcial') parcial += 1
  }

  // Ninguna fila ha llegado a un veredicto que se pueda contar: ni confirmada
  // ni desmentida. `sin-datos` y `parcial` no resuelven nada que dividir.
  const sinResolver = verificado + contradicho === 0
  return {
    windowDays: WINDOW_DAYS,
    // La lista que la página filtra y pinta. Se devuelve para que la página no
    // construya otra: su contador cuenta un subconjunto de ésta y lo pone sobre su
    // longitud, así que no puede volver a decir «46 de 45».
    articulos,
    // Titulares de la ventana: los del feed y los que ya no están en él. Es el total
    // del contador de la lista y el KPI «Titulares monitorizados».
    monitoredCount: articulos.length,
    // Cuántos de esos ya no trae el feed. El KPI lo dice en su pie cuando hay alguno.
    fueraDelFeedCount: articulos.filter((a) => a.orphan).length,
    // Artículos con ≥1 afirmación ANALIZADA, sea cual sea su veredicto. El
    // comentario decía «with ≥1 verified claim» y la etiqueta de /laboratorio
    // repetía lo mismo, pero `auditedIds` mete el articleId de toda fila del
    // corpus sin mirar `verdict`. Con un artículo, una claim y cero
    // verificadas, la página decía «1 · con ≥1 afirmación verificada» justo
    // encima de «TASA DE VERIFICACIÓN 0% · 0 de 1». Se contradecía sola en la
    // misma pantalla.
    auditedCount: auditedIds.size,
    totalClaims,
    verificadoClaims: verificado,
    contradichoClaims: contradicho,
    // La tasa de VERIFICACIÓN se queda en 0: «0 de 63 verificadas» es una
    // cobertura, y es verdad. Quien la lee concluye exactamente lo que pasa —
    // que no se ha verificado nada. No hay nada que arreglar ahí, y
    // `tests/press-lab.js` lo fija a propósito.
    verificadoRatio: totalClaims === 0 ? null : verificado / totalClaims,
    // Cuántas filas llegaron a un veredicto que se pueda contar. Se publica
    // porque es el DENOMINADOR de la discrepancia, y una tasa cuyo divisor no
    // se ve es una tasa que nadie puede desmentir.
    resueltasClaims: verificado + contradicho,
    // Las parciales no resuelven —no entran en ninguna de las dos tasas—, pero la
    // tarjeta las pinta con su pastilla. Se cuentan para que la prosa pueda
    // nombrarlas en vez de negarlas.
    parcialClaims: parcial,
    // La de DISCREPANCIA no es una cobertura, es un hallazgo, y ahí el 0
    // miente: «0 %» se lee «hemos mirado y no hay discrepancias» cuando lo
    // cierto es «no se ha mirado». Sin una sola fila resuelta, la tasa no vale
    // 0, no existe.
    //
    // Y el divisor es lo RESUELTO, no el corpus. Con `totalClaims` debajo, la
    // guarda de `sinResolver` sólo tapaba el caso de cero: el 7-09-2026 había
    // 36 filas con UNA resuelta, la guarda se abrió y la página publicó
    // «0 % · 0 de 36 claims» — se lee «examinadas 36, ninguna falla» cuando se
    // examinó una. Las 35 que nadie resolvió estaban engordando el denominador
    // de un hallazgo, que es el centinela otra vez, un nivel más abajo: no en
    // el 0, en aquello entre lo que se divide.
    contradichoRatio: sinResolver ? null : contradicho / (verificado + contradicho),
    // «Hay contenido editorial» no es «hay filas»: es «hay veredictos
    // resueltos». Con `totalClaims > 0` no podía dispararse sobre un corpus
    // lleno de `sin-datos`, que es exactamente el estado de hoy — 63 de 63
    // filas sin resolver — y la página publicaba «TASA DE DISCREPANCIA 0 %»
    // al lado de «TASA DE VERIFICACIÓN 0 %» sobre las mismas 63.
    //
    // Un 0 % de discrepancia sobre un corpus que nadie ha examinado no
    // significa «no hay discrepancias», significa «no se ha mirado». Es el
    // cero-que-es-un-centinela otra vez, y el aviso que existe para decirlo
    // —«Extracción pendiente»— estaba apagado justo cuando hacía falta.
    //
    // El recuento no se pierde: sigue en el pie de cada tarjeta («0 de 63
    // claims»), que es una cobertura y sí es un hecho.
    hasEditorialContent: !sinResolver,
  }
}

/**
 * La etiqueta de cada veredicto en las pastillas de /laboratorio. Vive aquí y no en la
 * página porque la prosa de este módulo nombra la pastilla: con una copia a cada lado,
 * renombrar una deja la frase hablando de una etiqueta que ya no se ve.
 */
export const VERDICT_LABEL = {
  verificado: 'Verificado',
  parcial: 'Parcial',
  contradicho: 'Discrepa',
  'sin-datos': 'Sin registro',
  'promesa-repetida': 'Promesa repetida',
}

/**
 * Qué pasó con un titular que no enseña afirmaciones, y en qué casilla del recuento de
 * la lista cae. Una tabla por desenlace de src/scraper/press-extraccion.ts
 * (`DESENLACES_EXTRACCION`; tests/laboratorio-desenlace-extraccion.test.jsx recorre el
 * enum exportado, no una copia).
 *
 * La tarjeta decía «El extractor no sacó ninguna afirmación de este titular» en todas
 * las que no tenían ninguna, y la pasada auditada en octubre de 2026 sólo había mirado
 * los titulares del 7 al 9: «nunca intentado» doblado en «intentado, no encontró nada»
 * (regla 2 de CLAUDE.md). `llm-no-disponible` no es un descarte: el modelo no respondió,
 * así que cuenta como pendiente junto a lo que nadie ha mirado. Y `extraido` sin nada
 * que pintar es el filtro editorial del verificador (claim-public-gate.ts) reteniendo
 * todas las de ese artículo: hubo afirmaciones, y la frase no puede negarlo.
 *
 * `sin-afirmaciones` no dice «leyó la noticia»: muchas veces no la leyó. Con
 * `needsBody: false`, con `--headline-only` o cuando la descarga del cuerpo falla en
 * silencio (press-claim-llm.ts), la extracción trabaja sobre el titular, y la mayoría
 * de enlaces son redirecciones de news.google.com. «Revisó este titular» es lo único
 * que vale en todos los casos.
 *
 * @typedef {import('../scraper/press-extraccion').DesenlaceExtraccion} DesenlaceExtraccion
 * @type {Record<DesenlaceExtraccion, {estado: 'con' | 'descartado' | 'pendiente', texto: string}>}
 */
const LIBRO_VACIO = {
  extraido: {
    estado: 'con',
    texto:
      'El extractor sacó afirmaciones de este titular, pero el filtro editorial de esta página no publica ninguna.',
  },
  'descartado-en-triaje': {
    estado: 'descartado',
    texto:
      'El extractor leyó el titular y no vio nada que contrastar; el cuerpo no se llegó a leer. No es lo mismo que no lo tenga.',
  },
  'sin-afirmaciones': {
    estado: 'descartado',
    texto:
      'El extractor revisó este titular y no sacó ninguna afirmación. No es lo mismo que no las tenga.',
  },
  'llm-no-disponible': {
    estado: 'pendiente',
    texto: 'El extractor no pudo procesarlo: el modelo no respondió. Se reintentará.',
  },
}
const NUNCA_VISTO = {
  estado: 'pendiente',
  texto: 'Este titular aún no ha pasado por el extractor.',
}
/** @param {string | null | undefined} desenlace */
const filaDelLibro = (desenlace) =>
  desenlace && Object.hasOwn(LIBRO_VACIO, desenlace)
    ? LIBRO_VACIO[/** @type {DesenlaceExtraccion} */ (desenlace)]
    : NUNCA_VISTO

/**
 * La frase de una tarjeta sin afirmaciones. `null` es «el extractor no tiene fila de
 * este artículo»: nunca lo ha visto. Un desenlace que esta tabla no conoce (un enum más
 * nuevo que la página) se lee igual, porque de él no se sabe nada que se pueda decir.
 *
 * @param {DesenlaceExtraccion | null} desenlace
 * @returns {string}
 */
export function textoLibroVacio(desenlace) {
  return filaDelLibro(desenlace).texto
}

/**
 * El desenlace que vale para la tarjeta, o `null` si no hay ninguno que valga.
 *
 * La fila se busca por `articleId`, pero describe el titular con la huella con que se
 * procesó. Si la tarjeta trae otra, el titular cambió después y lo que se pinta no es
 * lo que el extractor miró: la tarjeta está pendiente, igual que para el extractor
 * (`elegirPendientes` devuelve a la cola un artículo cuya huella cambió).
 *
 * @param {{fingerprint?: string} | null | undefined} articulo  la tarjeta
 * @param {import('../scraper/press-extraccion').ExtraccionArticulo | null | undefined} fila
 * @returns {DesenlaceExtraccion | null}
 */
export function desenlaceVigente(articulo, fila) {
  if (!fila) return null
  if (fila.fingerprint !== articulo?.fingerprint) return null
  return fila.desenlace
}

/**
 * El recuento que va bajo el contador de la lista, sobre las tarjetas que se ven: cada
 * una cae en UNA casilla, así que las tres suman el total visible. Una tarjeta con
 * afirmaciones pintadas cuenta «con» aunque su desenlace sea otro —sus afirmaciones son
 * de una pasada anterior a que el extractor guardara desenlaces, o de un artículo que
 * salió del feed—: el recuento describe lo que la lista enseña.
 *
 * @param {Array<{id: string, fingerprint?: string}>} articulos  las tarjetas visibles
 * @param {Map<string, unknown[]>} afirmacionesPorArticulo
 * @param {Map<string, import('../scraper/press-extraccion').ExtraccionArticulo>} filaPorArticulo
 */
export function recuentoDeExtraccion(articulos, afirmacionesPorArticulo, filaPorArticulo) {
  const r = { con: 0, descartados: 0, pendientes: 0 }
  for (const a of articulos) {
    if ((afirmacionesPorArticulo.get(a.id)?.length ?? 0) > 0) {
      r.con += 1
      continue
    }
    const { estado } = filaDelLibro(desenlaceVigente(a, filaPorArticulo.get(a.id)))
    if (estado === 'con') r.con += 1
    else if (estado === 'descartado') r.descartados += 1
    else r.pendientes += 1
  }
  return r
}

/**
 * La frase de la entradilla de /laboratorio sobre cuántas afirmaciones llegan a un
 * veredicto, sacada del mismo recuento que las tasas.
 *
 * Decía siempre «La mayoría vuelve sin nada que las confirme ni las desmienta», y el
 * 15-09-2026 estaba encima de «0 de 64»: ninguna había llegado a un veredicto. Una
 * cuantía escrita a mano es la prosa que se queda rancia cuando se mueve el dato.
 * «Resuelta» significa lo mismo que en la tasa de discrepancia —verificada o
 * contradicha—; `sin-datos` y `parcial` no resuelven nada.
 */
const numero = (n) => new Intl.NumberFormat('es-ES').format(n)
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`

/**
 * Las parciales, nombradas y contadas.
 *
 * Una `parcial` no resuelve, pero la tarjeta la pinta con su pastilla, y el 28-09-2026
 * la entradilla y el aviso decían «ninguna ha llegado a un veredicto» —y el aviso se
 * titulaba «Sin veredictos todavía»— encima de la tarjeta del Ayuntamiento con «1
 * Parcial». Cierto al pie de la letra, porque una parcial ni confirma ni desmiente; pero
 * se lee «no hay veredictos», y la página enseña uno (revisión lectora de ese día).
 *
 * La marca se atribuye al verificador, con lo que él mismo dice de ella: es una
 * coincidencia automática —la de ese día emparejaba los 135.000 € de los contenedores
 * con un contrato de 131.336 € para unas pérgolas—, no algo que esta página afirme.
 */
const parcialesMarcadas = (n) =>
  `el verificador ha marcado ${numero(n)} como «${VERDICT_LABEL.parcial}» (datos relacionados, pero no idénticos)`

/**
 * El aviso de /laboratorio cuando no hay nada resuelto, o null si sí lo hay.
 *
 * Eran dos estados con un solo texto. «Extracción pendiente … no se ha examinado
 * nada» es cierto cuando no hay afirmaciones; con 58 extraídas de 11 artículos y
 * contrastadas todas, que volvieron `sin-datos`, era falso —y lo decía al lado del
 * KPI «11 artículos auditados»—. `sin-datos` es «mirado, y sin nada con qué
 * compararlo»: no resuelve la tasa, pero tampoco es «sin mirar». Las cifras salen
 * del recuento para que la frase no se quede vieja cuando el dato se mueva.
 *
 * Y un tercero: con alguna `parcial` no se titula «Sin veredictos» (ver
 * `parcialesMarcadas`).
 *
 * @param {ReturnType<typeof pressLabSummary>} summary
 * @returns {{titulo: string, texto: string} | null}
 */
export function avisoSinVeredicto(summary) {
  const total = summary?.totalClaims ?? 0
  const parciales = summary?.parcialClaims ?? 0
  if ((summary?.resueltasClaims ?? 0) > 0) return null
  if (total === 0) {
    return {
      titulo: 'Extracción pendiente.',
      texto:
        `Se están monitorizando ${plural(summary?.monitoredCount ?? 0, 'titular', 'titulares')}, ` +
        'pero todavía no se ha extraído ninguna afirmación de ellos, así que las tasas no tienen nada que medir.',
    }
  }
  const extraidas =
    `Se han extraído ${plural(total, 'afirmación', 'afirmaciones')} de ` +
    `${plural(summary?.auditedCount ?? 0, 'artículo', 'artículos')} y se han buscado en los datos`
  const tasas =
    'Por eso la tasa de discrepancia aparece como «—» —no hay nada resuelto entre lo que ' +
    'dividir— y la de verificación marca el 0 % que le corresponde.'
  if (parciales > 0) {
    return {
      titulo: 'Nada resuelto todavía.',
      texto:
        `${extraidas}, pero ninguna ha quedado confirmada ni desmentida: ` +
        `${parcialesMarcadas(parciales)}, y una coincidencia parcial no cuenta como resuelta. ${tasas}`,
    }
  }
  return {
    titulo: 'Sin veredictos todavía.',
    texto: `${extraidas}, pero ninguna ha llegado a un veredicto que la confirme o la desmienta. ${tasas}`,
  }
}

export function fraseVeredictos(summary) {
  const total = summary?.totalClaims ?? 0
  const resueltas = summary?.resueltasClaims ?? 0
  const parciales = summary?.parcialClaims ?? 0
  if (total === 0) {
    return 'Todavía no hay afirmaciones analizadas; cuando las haya, las tasas de aquí abajo dirán cuántas llegan a un veredicto.'
  }
  // Con parciales, «ninguna ha llegado a un veredicto» niega la pastilla que la tarjeta
  // pinta, y «la otra mitad / la mayoría vuelve sin nada» mete entre las que no trajeron
  // nada a unas que volvieron con datos relacionados: con 1 verificada, 5 parciales y 4
  // sin-datos, «la mayoría» eran 4 de 10. Así que se cuentan las dos.
  if (parciales > 0) {
    const cola = 'no cuentan una coincidencia parcial como resuelta.'
    if (resueltas === 0) {
      return `Por ahora ninguna ha quedado confirmada ni desmentida: ${parcialesMarcadas(parciales)}, y las tasas de aquí abajo ${cola}`
    }
    return (
      `De ${plural(total, 'afirmación', 'afirmaciones')}, ` +
      `${plural(resueltas, 'ha quedado confirmada o desmentida', 'han quedado confirmadas o desmentidas')} ` +
      `y ${parcialesMarcadas(parciales)}; las tasas de aquí abajo dicen en qué sentido, y ${cola}`
    )
  }
  if (resueltas === 0) {
    return 'Por ahora ninguna ha llegado a un veredicto que la confirme o la desmienta, y así lo dicen las tasas de aquí abajo.'
  }
  if (resueltas === total) {
    return 'Todas han llegado a un veredicto; las tasas de aquí abajo dicen en qué sentido.'
  }
  if (resueltas * 2 === total) {
    return 'La mitad llega a un veredicto y la otra mitad vuelve sin nada que la confirme ni la desmienta: las tasas de aquí abajo lo detallan.'
  }
  if (resueltas * 2 < total) {
    return 'La mayoría vuelve sin nada que las confirme ni las desmienta: las tasas de aquí abajo dicen cuántas llegaron a un veredicto.'
  }
  return 'La mayoría llega a un veredicto: las tasas de aquí abajo dicen cuántas, y en qué sentido.'
}
