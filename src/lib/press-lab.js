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
import { desenlaceVigente } from '../scraper/press-extraccion'
import { esAnuncioClasificado } from '../scraper/press-clasificado'
import { corpusMunicipales, corpusReales } from '../scraper/claim-verdicts'
import { CATALOGUE } from '../i18n'
import { rellena } from './formatters'

/**
 * El catálogo castellano como `t`, para quien llama sin idioma: las pruebas, la e2e
 * que busca la frase en la página, los exports de abajo. La página pasa el `t` de la
 * interfaz y lee lo mismo en valencià; la prosa vive en el catálogo
 * (`laboratorio.prensa.*`), no aquí.
 *
 * @param {string} clave
 */
const castellano = (clave) => /** @type {Record<string, string>} */ (CATALOGUE.es)[clave] ?? clave

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
 *
 * Sin anuncios clasificados (`esAnuncioClasificado`, press-clasificado.ts): el
 * 19-10-2026, 12 de los 68 titulares eran listados de Fotocasa, y no son prensa.
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
    if (esAnuncioClasificado({ sourceHost: c.articleSourceHost })) continue
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
  return [
    ...press.filter((p) => enVentana(p?.date) && !esAnuncioClasificado(p ?? {})),
    ...fuera.values(),
  ]
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
  let cotejadas = 0
  let cotejadasMunicipales = 0
  let cotejadasSoloPromesas = 0
  for (const row of verified) {
    const id = row?.claim?.articleId
    if (!id || !enLaLista.has(id)) continue
    auditedIds.add(id)
    totalClaims += 1
    const corpus = corpusReales(row?.verification?.checkedAgainst)
    if (corpus.length > 0) {
      cotejadas += 1
      if (corpusMunicipales(corpus).length > 0) cotejadasMunicipales += 1
      else if (corpus.every((c) => c === 'promises')) cotejadasSoloPromesas += 1
    }
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
    // Cuántas se buscaron de verdad en algún corpus (`corpusReales` de su
    // `checkedAgainst`), y de ellas cuántas en datos municipales. El aviso decía
    // «se han extraído 58 … y se han buscado en los datos» con 49 de las 58 sin
    // buscar en ninguno (`checkedAgainst: []`, 19-10-2026).
    cotejadasClaims: cotejadas,
    cotejadasMunicipalesClaims: cotejadasMunicipales,
    // Cotejadas sólo contra el catálogo de promesas, que no es un dato municipal.
    cotejadasSoloPromesasClaims: cotejadasSoloPromesas,
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
  verificado: castellano('laboratorio.prensa.estado.verificado'),
  parcial: castellano('laboratorio.prensa.estado.parcial'),
  contradicho: castellano('laboratorio.prensa.estado.contradicho'),
  'sin-datos': castellano('laboratorio.prensa.estado.sin-datos'),
  'promesa-repetida': castellano('laboratorio.prensa.estado.promesa-repetida'),
}

/**
 * Lo que la pastilla de una afirmación dice: su veredicto, salvo que sea `sin-datos`
 * y no se haya buscado en ningún corpus. Entonces es «No cotejada», no «Sin
 * registro»: el 19-10-2026, 49 de las 58 afirmaciones tenían `checkedAgainst: []` y
 * llevaban la misma pastilla que las 9 que sí se buscaron y no se encontraron. «Sin
 * registro» se lee «se buscó y no está»; de esas 49 no se buscó nada.
 *
 * @param {{ verification?: { verdict?: string, checkedAgainst?: unknown[] | null } } | null | undefined} row
 * @returns {string | undefined}
 */
export function estadoDeAfirmacion(row) {
  const v = row?.verification
  if (v?.verdict === 'sin-datos' && corpusReales(v?.checkedAgainst).length === 0)
    return 'no-cotejada'
  return v?.verdict
}

/** Las etiquetas de `estadoDeAfirmacion`: las de los veredictos y «No cotejada». */
export const ESTADO_LABEL = {
  ...VERDICT_LABEL,
  'no-cotejada': castellano('laboratorio.prensa.estado.no-cotejada'),
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
 * La frase de cada desenlace vive en el catálogo (`laboratorio.prensa.libro.*`): aquí
 * va su clave.
 *
 * @typedef {import('../scraper/press-extraccion').DesenlaceExtraccion} DesenlaceExtraccion
 * @type {Record<DesenlaceExtraccion, {estado: 'con' | 'descartado' | 'pendiente', clave: string}>}
 */
const LIBRO_VACIO = {
  extraido: { estado: 'con', clave: 'laboratorio.prensa.libro.extraido' },
  'descartado-en-triaje': {
    estado: 'descartado',
    clave: 'laboratorio.prensa.libro.descartado-en-triaje',
  },
  'sin-afirmaciones': { estado: 'descartado', clave: 'laboratorio.prensa.libro.sin-afirmaciones' },
  'llm-no-disponible': { estado: 'pendiente', clave: 'laboratorio.prensa.libro.llm-no-disponible' },
}
const NUNCA_VISTO = { estado: 'pendiente', clave: 'laboratorio.prensa.libro.nuncaVisto' }
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
 * @param {(clave: string) => string} [t]  el del idioma de la página; sin él, castellano.
 * @returns {string}
 */
export function textoLibroVacio(desenlace, t = castellano) {
  return t(filaDelLibro(desenlace).clave)
}

// `desenlaceVigente` vive en src/scraper/press-extraccion.ts: press-analytics.ts
// la necesita para «Afirmaciones contrastables», y dos copias de la regla de la
// huella acabarían diciendo cosas distintas de la misma tarjeta.
export { desenlaceVigente }

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

/**
 * Una cuenta con su plural, del catálogo: la clave `uno` para 1 y `varios` para lo
 * demás, con el número en su `{n}`. Las dos claves van escritas enteras en cada
 * llamada para que `tests/i18n-catalogue.test.ts` las encuentre.
 *
 * @param {(clave: string) => string} t
 * @param {number} n
 * @param {string} uno
 * @param {string} varios
 */
const contar = (t, n, uno, varios) =>
  t(n === 1 ? uno : varios)
    .split('{n}')
    .join(numero(n))

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
const parcialesMarcadas = (n, t) =>
  rellena(t('laboratorio.prensa.parcialesMarcadas'), {
    n: numero(n),
    etiqueta: t('laboratorio.prensa.estado.parcial'),
  })

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
 * @param {(clave: string) => string} [t]  el del idioma de la página; sin él, castellano.
 * @returns {{titulo: string, texto: string} | null}
 */
export function avisoSinVeredicto(summary, t = castellano) {
  const total = summary?.totalClaims ?? 0
  const parciales = summary?.parcialClaims ?? 0
  if ((summary?.resueltasClaims ?? 0) > 0) return null
  if (total === 0) {
    return {
      titulo: t('laboratorio.prensa.aviso.pendiente.titulo'),
      texto: rellena(t('laboratorio.prensa.aviso.pendiente.texto'), {
        titulares: contar(
          t,
          summary?.monitoredCount ?? 0,
          'laboratorio.prensa.n.titular.uno',
          'laboratorio.prensa.n.titular',
        ),
      }),
    }
  }
  const extraidas = rellena(t('laboratorio.prensa.aviso.extraidas'), {
    afirmaciones: contar(
      t,
      total,
      'laboratorio.prensa.n.afirmacion.uno',
      'laboratorio.prensa.n.afirmacion',
    ),
    articulos: contar(
      t,
      summary?.auditedCount ?? 0,
      'laboratorio.prensa.n.articulo.uno',
      'laboratorio.prensa.n.articulo',
    ),
  })
  const tasas = t('laboratorio.prensa.aviso.tasas')
  const cotejo = rellena(t('laboratorio.prensa.aviso.cotejo'), {
    extraidas,
    cotejo: fraseCotejo(summary, t),
  })
  if (parciales > 0) {
    return {
      titulo: t('laboratorio.prensa.aviso.parcial.titulo'),
      texto: rellena(t('laboratorio.prensa.aviso.parcial.texto'), {
        cotejo,
        parciales: parcialesMarcadas(parciales, t),
        tasas,
      }),
    }
  }
  return {
    titulo: t('laboratorio.prensa.aviso.sinVeredictos.titulo'),
    texto: rellena(t('laboratorio.prensa.aviso.sinVeredictos.texto'), { cotejo, tasas }),
  }
}

/**
 * Cuántas de las extraídas se buscaron en algún dato, y en cuáles. Decía «y se han
 * buscado en los datos» de todas, y el 19-10-2026 sólo 9 de 58 se habían buscado en
 * alguno: 6 en datos municipales y 3 sólo en el catálogo de promesas, que no lo es.
 */
function fraseCotejo(summary, t) {
  const total = summary?.totalClaims ?? 0
  const cotejadas = summary?.cotejadasClaims ?? 0
  const municipales = summary?.cotejadasMunicipalesClaims ?? 0
  const soloPromesas = summary?.cotejadasSoloPromesasClaims ?? 0
  const otras = cotejadas - municipales - soloPromesas
  if (cotejadas === 0) return t('laboratorio.prensa.cotejo.ninguna')
  const partes = [rellena(t('laboratorio.prensa.cotejo.municipales'), { n: numero(municipales) })]
  if (soloPromesas > 0)
    partes.push(rellena(t('laboratorio.prensa.cotejo.soloPromesas'), { n: numero(soloPromesas) }))
  if (otras > 0) partes.push(rellena(t('laboratorio.prensa.cotejo.otras'), { n: numero(otras) }))
  const resto = total - cotejadas
  const cuantas = cotejadas === total ? t('laboratorio.prensa.cotejo.todas') : numero(cotejadas)
  return (
    rellena(t('laboratorio.prensa.cotejo.frase'), { cuantas, desglose: enumerar(partes, t) }) +
    (resto > 0
      ? resto === 1
        ? t('laboratorio.prensa.cotejo.resto.una')
        : rellena(t('laboratorio.prensa.cotejo.resto'), { n: numero(resto) })
      : '')
  )
}

/**
 * @param {ReturnType<typeof pressLabSummary>} summary
 * @param {(clave: string) => string} [t]  el del idioma de la página; sin él, castellano.
 */
export function fraseVeredictos(summary, t = castellano) {
  const total = summary?.totalClaims ?? 0
  const resueltas = summary?.resueltasClaims ?? 0
  const parciales = summary?.parcialClaims ?? 0
  if (total === 0) return t('laboratorio.prensa.veredictos.sinAfirmaciones')
  // Con parciales, «ninguna ha llegado a un veredicto» niega la pastilla que la tarjeta
  // pinta, y «la otra mitad / la mayoría vuelve sin nada» mete entre las que no trajeron
  // nada a unas que volvieron con datos relacionados: con 1 verificada, 5 parciales y 4
  // sin-datos, «la mayoría» eran 4 de 10. Así que se cuentan las dos.
  if (parciales > 0) {
    const cola = t('laboratorio.prensa.veredictos.cola')
    if (resueltas === 0) {
      return rellena(t('laboratorio.prensa.veredictos.parcialSinResueltas'), {
        parciales: parcialesMarcadas(parciales, t),
        cola,
      })
    }
    return rellena(t('laboratorio.prensa.veredictos.parcialConResueltas'), {
      afirmaciones: contar(
        t,
        total,
        'laboratorio.prensa.n.afirmacion.uno',
        'laboratorio.prensa.n.afirmacion',
      ),
      resueltas: contar(
        t,
        resueltas,
        'laboratorio.prensa.veredictos.resueltas.una',
        'laboratorio.prensa.veredictos.resueltas',
      ),
      parciales: parcialesMarcadas(parciales, t),
      cola,
    })
  }
  if (resueltas === 0) return t('laboratorio.prensa.veredictos.ninguna')
  if (resueltas === total) return t('laboratorio.prensa.veredictos.todas')
  if (resueltas * 2 === total) return t('laboratorio.prensa.veredictos.mitad')
  if (resueltas * 2 < total) return t('laboratorio.prensa.veredictos.mayoriaSin')
  return t('laboratorio.prensa.veredictos.mayoriaCon')
}

/**
 * ¿Lo escribió el curador automático? Las filas de press-auto-curate.ts llevan
 * `curatorName: 'auto-curation-v1'`; una persona firma con su nombre.
 *
 * @param {{ curatorName?: string } | null | undefined} f
 */
export function esHallazgoAutomatico(f) {
  return typeof f?.curatorName === 'string' && f.curatorName.startsWith('auto-')
}

/**
 * Los hallazgos de prensa agrupados por lote, con el más reciente de cada uno.
 *
 * El KPI decía «Hallazgos editoriales 17 · curados» y la columna «17 verificación(es)»:
 * el 19-10-2026 las 17 filas eran `auto-curation-v1` —ninguna la firmó una persona— y
 * salían de 5 lotes, porque el curador automático volvía a publicar el mismo lote cada
 * vez que corría, con la fecha en el id. La columna enseñaba el titular de Nerco cuatro
 * veces en cinco filas. Un lote es su historia (`articleFingerprints`); lo automático y
 * lo firmado no se mezclan en uno.
 *
 * @param {Array<{ id: string, publishedAt: string, curatorName?: string,
 *   articleFingerprints?: string[], corrections?: unknown[] }>} findings
 */
export function resumenHallazgos(findings = []) {
  const porLote = new Map()
  for (const f of findings ?? []) {
    if (!f) continue
    const automatico = esHallazgoAutomatico(f)
    const historia = [...(f.articleFingerprints ?? [])].sort().join('|') || f.id
    const clave = `${automatico ? 'auto' : 'firmado'}:${historia}`
    const l = porLote.get(clave)
    if (!l) {
      porLote.set(clave, {
        finding: f,
        automatico,
        veces: 1,
        primera: f.publishedAt,
        ultima: f.publishedAt,
        correcciones: [...(f.corrections ?? [])],
      })
      continue
    }
    l.veces += 1
    l.correcciones.push(...(f.corrections ?? []))
    if (f.publishedAt > l.ultima) {
      l.ultima = f.publishedAt
      l.finding = f
    }
    if (f.publishedAt < l.primera) l.primera = f.publishedAt
  }
  const lotes = [...porLote.values()].sort(
    (a, b) => b.ultima.localeCompare(a.ultima) || a.finding.id.localeCompare(b.finding.id),
  )
  return {
    lotes,
    publicaciones: (findings ?? []).length,
    automaticos: lotes.filter((l) => l.automatico).length,
    humanos: lotes.filter((l) => !l.automatico).length,
  }
}

/**
 * «a, b y c» en el idioma de la página.
 *
 * @param {string[]} xs
 * @param {(clave: string) => string} t
 */
const enumerar = (xs, t) =>
  xs.length <= 1
    ? (xs[0] ?? '')
    : rellena(t('laboratorio.prensa.enumera'), {
        lista: xs.slice(0, -1).join(', '),
        ultimo: xs.at(-1),
      })

/**
 * La frase del carril «Verificaciones externas», sacada de factcheck.json.
 *
 * Decía siempre «Configurar GOOGLE_FACT_CHECK_API_KEY en .env para activar» y nombraba
 * a EFE Verifica y AFP Factual, y el 19-10-2026 el fichero decía otra cosa: tres de tres
 * fuentes consultadas (la API de Google, el RSS de Maldita y el de Newtral) y 61
 * revisiones examinadas, ninguna sobre Riba-roja de Túria. La lista vacía era un
 * resultado, no una configuración pendiente. Lee `consulta.intentos`, el registro de
 * cada fuente con su estado (src/scraper/factcheck.ts, `IntentoFuente`): un cero de
 * «miré y no hay» y uno de «no pude mirar» no son el mismo cero.
 *
 * @param {{ consulta?: { intentos?: Array<{ fuente: string, estado: string,
 *   examinadas?: number, aceptadas?: number, motivo?: string }> } } | null | undefined} fc
 * @param {(clave: string) => string} [t]  el del idioma de la página; sin él, castellano.
 * @returns {string}
 */
export function fraseFactcheck(fc, t = castellano) {
  const intentos = fc?.consulta?.intentos
  if (!Array.isArray(intentos) || intentos.length === 0) {
    return t('laboratorio.prensa.factcheck.noConsta')
  }
  const n = intentos.length
  const ok = intentos.filter((i) => i.estado === 'consultada')
  const caidas = intentos.filter((i) => i.estado !== 'consultada')
  // El motivo que registró la consulta es suyo: se pinta como llegó.
  const motivo = (i) => i.motivo ?? t('laboratorio.prensa.factcheck.sinMotivo')
  if (ok.length === 0) {
    return rellena(t('laboratorio.prensa.factcheck.ninguna'), {
      n: numero(n),
      caidas: caidas.map((i) => `${i.fuente}: ${motivo(i)}`).join('; '),
    })
  }
  const examinadas = ok.reduce((s, i) => s + (Number(i.examinadas) || 0), 0)
  const aceptadas = ok.reduce((s, i) => s + (Number(i.aceptadas) || 0), 0)
  const nombres = enumerar(
    ok.map((i) => i.fuente),
    t,
  )
  const quienes =
    ok.length === n
      ? n === 1
        ? rellena(t('laboratorio.prensa.factcheck.unica'), { nombres })
        : rellena(t('laboratorio.prensa.factcheck.todas'), { n: numero(n), nombres })
      : rellena(t('laboratorio.prensa.factcheck.algunas'), {
          ok: numero(ok.length),
          n: numero(n),
          nombres,
        })
  const resultado =
    examinadas === 0
      ? t('laboratorio.prensa.factcheck.sinRevisiones')
      : `${contar(t, examinadas, 'laboratorio.prensa.factcheck.examinadas.una', 'laboratorio.prensa.factcheck.examinadas')}, ` +
        (aceptadas === 0
          ? t('laboratorio.prensa.factcheck.ningunaSobre')
          : rellena(t('laboratorio.prensa.factcheck.sobre'), { n: numero(aceptadas) }))
  const fallos = caidas.map((i) =>
    rellena(t('laboratorio.prensa.factcheck.fallo'), { fuente: i.fuente, motivo: motivo(i) }),
  )
  return `${quienes}: ${resultado}.${fallos.join('')}`
}

/**
 * El puente entre la tabla por medio y el KPI «Titulares monitorizados».
 *
 * El 19-10-2026 la tabla sumaba 65 artículos y el KPI decía 68: la tabla sale de
 * press-trust.json, que sólo ve el feed, y el KPI cuenta también las 3 tarjetas FUERA
 * DEL FEED. Dos cifras ciertas sin puente. Y sólo se afirma que cuadran cuando cuadran:
 * la tabla se calcula en una pasada y el KPI al abrir la página, cada uno con su ventana
 * de 30 días, y otro día no tienen por qué coincidir.
 *
 * @param {Array<{ articleCount?: number }>} outlets  filas de press-trust.json
 * @param {{ monitoredCount?: number, fueraDelFeedCount?: number }} summary  `pressLabSummary`
 * @param {(clave: string) => string} [t]  el del idioma de la página; sin él, castellano.
 */
export function puenteTablaMedios(outlets, summary, t = castellano) {
  const suma = (outlets ?? []).reduce((s, o) => s + (Number(o?.articleCount) || 0), 0)
  const monitorizados = summary?.monitoredCount ?? 0
  const fuera = summary?.fueraDelFeedCount ?? 0
  const titulares = contar(
    t,
    suma,
    'laboratorio.prensa.n.titular.uno',
    'laboratorio.prensa.n.titular',
  )
  if (suma + fuera === monitorizados) {
    if (fuera === 0)
      return rellena(t('laboratorio.prensa.puente.todos'), {
        titulares: contar(
          t,
          suma,
          'laboratorio.prensa.n.titularMonitorizado.uno',
          'laboratorio.prensa.n.titularMonitorizado',
        ),
      })
    return rellena(t('laboratorio.prensa.puente.fuera'), {
      titulares,
      monitorizados: numero(monitorizados),
      fuera:
        fuera === 1
          ? t('laboratorio.prensa.puente.fuera.uno')
          : rellena(t('laboratorio.prensa.puente.fuera.varios'), { n: numero(fuera) }),
    })
  }
  return rellena(t('laboratorio.prensa.puente.distinto'), {
    titulares,
    monitorizados: numero(monitorizados),
    fuera:
      fuera > 0
        ? rellena(t('laboratorio.prensa.puente.distinto.fuera'), { n: numero(fuera) })
        : '.',
  })
}

/**
 * Cuándo corre cada parte del laboratorio. Decía «La cadena extract → verify →
 * summarize → analytics corre una vez por semana, los lunes, o a mano», y la analítica
 * —indicadores, triangulación y lagunas— la recalcula también cada noche `npm run
 * refresh`, al final de la nocturna, en cuanto cambia press.json (data-graph.ts, nodo
 * press-trust.json). La cadena con modelo —factcheck → extract → verify → summarize →
 * analytics → auto-curate— es la de los lunes (scripts/press-lab-pipeline.sh, launchd).
 */
export const CADENCIA_LABORATORIO = castellano('laboratorio.prensa.cadencia')
