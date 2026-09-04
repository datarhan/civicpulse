// @ts-check
/**
 * Todo lo que /plenos enseña, derivado de los snapshots. Puro — sin I/O.
 *
 * LA REGLA DE ESTE MÓDULO, y es la razón de que exista el rediseño: **un cero
 * y una ausencia no son el mismo dato**. La versión anterior devolvía
 * `agendaCount: 0` para una sesión de la que no habíamos extraído nada, así
 * que la página pintaba igual «no lo hemos leído» y «lo leímos y no había».
 * En una página cuyo tema es cuánto del acta nos falta, ése es el error que no
 * se puede permitir. El sentinela es `null` y nunca un cero — DATA_INTEGRITY
 * regla 3, «un sentinela no es un valor».
 *
 * Y cada columna se pregunta la ausencia por su lado, porque no todas tienen
 * la misma respuesta:
 *
 *   puntos  null si la sesión no está en plenos-agendas.json. Un 0 sí puede
 *           existir: orden del día extraído y vacío.
 *   decl    null si no tiene trozo en el manifiesto de declaraciones.
 *   votos   null SIEMPRE que no haya votaciones publicadas. Extraerlas y
 *           firmarlas es trabajo de curador y ningún snapshot registra
 *           «miramos esta sesión y no se votó»: un 0 afirmaría lo que no
 *           sabemos.
 *   hall    0 sólo si la sesión tiene texto procesado — los hallazgos salen de
 *           ahí. Sin declaraciones extraídas no hemos mirado.
 */
import { DEPARTMENT_LABEL } from '../scraper/departments'

/** La etiqueta canónica del slug, o el nombre crudo si el slug no la tiene. */
function nombreDepartamento(department, slug) {
  const label = slug && DEPARTMENT_LABEL[slug]
  return label ? label.es : department
}

/**
 * Una fila por sesión, de la más reciente a la más antigua.
 *
 * @param {{plenos?: any[], manifestPlenos?: any[], findings?: any[], agendas?: any[], votesByPleno?: Record<string, number>}} entrada
 */
export function summarizeSessions({
  plenos = [],
  manifestPlenos = [],
  findings = [],
  agendas = [],
  votesByPleno = {},
} = {}) {
  const declPorId = new Map()
  for (const d of manifestPlenos) declPorId.set(d.plenoId, d)
  const puntosPorId = new Map()
  for (const a of agendas) puntosPorId.set(a.id, a.agendaCount ?? (a.agenda?.length || 0))
  const hallazgosPorId = new Map()
  for (const f of findings) hallazgosPorId.set(f.plenoId, (hallazgosPorId.get(f.plenoId) || 0) + 1)

  return plenos
    .map((p) => {
      const d = declPorId.get(p.id)
      const v = d?.byVerdict || {}
      const decl = d ? (d.itemCount ?? 0) : null
      const hall = hallazgosPorId.get(p.id) ?? (decl === null ? null : 0)
      return {
        id: p.id,
        date: p.date,
        anio: Number(String(p.date || '').slice(0, 4)) || null,
        title: p.title,
        kind: p.kind,
        link: p.link,
        puntos: puntosPorId.has(p.id) ? puntosPorId.get(p.id) : null,
        decl,
        votos: votesByPleno[p.id] ?? null,
        hall,
        verificado: v.verificado || 0,
        contradicho: v.contradicho || 0,
      }
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

/**
 * Los cinco filtros del índice. Cada uno se define por su predicado y CUENTA
 * las filas que deja pasar: un chip que promete «7» y enseña 4 es peor que no
 * tener filtro, así que el rótulo se calcula, nunca se escribe.
 */
const FILTROS = [
  { id: 'todas', rotulo: 'Todas', pasa: () => true },
  { id: 'votos', rotulo: 'Con votaciones', pasa: (f) => f.votos !== null },
  { id: 'declaraciones', rotulo: 'Con declaraciones', pasa: (f) => f.decl !== null },
  { id: 'sin-orden', rotulo: 'Sin orden del día', pasa: (f) => f.puntos === null },
  {
    id: 'no-ordinarias',
    rotulo: 'Extraordinarias y urgentes',
    pasa: (f) => f.kind !== 'ordinario',
  },
]

/**
 * El resumen entero de la página: la escalera de cobertura, las filas, el
 * embudo de declaraciones, las votaciones, el reparto por área y la ventana
 * temporal. Todo derivado; la página no escribe ni una cifra a mano.
 *
 * @param {{plenos?: any, agendas?: any, manifest?: any, votes?: any, findings?: any}} snapshots
 */
export function resumenPlenos({ plenos, agendas, manifest, votes, findings } = {}) {
  const sesiones = plenos?.items ?? []
  const total = plenos?.stats?.total ?? sesiones.length
  const votesByPleno = votes?.stats?.byPleno ?? {}

  const filas = summarizeSessions({
    plenos: sesiones,
    manifestPlenos: manifest?.plenos ?? [],
    findings: findings?.items ?? [],
    agendas: agendas?.plenos ?? [],
    votesByPleno,
  })

  const conOrden = filas.filter((f) => f.puntos !== null).length
  const conDecl = filas.filter((f) => f.decl !== null).length
  const conVotos = filas.filter((f) => f.votos !== null).length

  // Cuatro escalones sobre el MISMO denominador. El tono no lo elige el
  // escalón: lo elige la COLUMNA que representa, para que la barra de la
  // escalera y la cifra de la tabla se pinten igual.
  const escalera = [
    { id: 'sesiones', rotulo: 'Sesiones celebradas', n: total, tono: 'civic' },
    { id: 'orden', rotulo: 'Con orden del día extraído', n: conOrden, tono: 'civic' },
    { id: 'declaraciones', rotulo: 'Con declaraciones extraídas', n: conDecl, tono: 'intel' },
    { id: 'votaciones', rotulo: 'Con votaciones transcritas', n: conVotos, tono: 'warn' },
  ].map((e) => ({ ...e, de: total, cuota: total ? e.n / total : 0 }))

  // La escalera decía «cada escalón es un subconjunto del anterior» y no lo
  // es: el orden del día viene de regmeet y las declaraciones de la
  // transcripción, que son dos tuberías independientes, así que una sesión
  // puede tener transcripción y no tener acta. Cuatro la tienen hoy, y la
  // frase las negaba una por una en la misma tarjeta que las cuenta.
  //
  // DERIVADO, no escrito: cuando esas cuatro se resuelvan, la nota se calla
  // sola. Una frase a mano volvería a envejecer, que es cómo llegó ésta aquí.
  const escaleraExcepciones = {
    declSinOrden: filas.filter((f) => f.decl !== null && f.puntos === null).length,
    votosSinDecl: filas.filter((f) => f.votos !== null && f.decl === null).length,
  }

  const fechas = sesiones
    .map((s) => s.date)
    .filter(Boolean)
    .sort()
  const ventana = {
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
  }

  const t = manifest?.totals ?? {}
  const embudo = {
    extraidas: t.items ?? 0,
    sesiones: manifest?.plenos?.length ?? 0,
    retenidas: t.retenidas?.acusacion_publica ?? 0,
    // El segundo motivo por el que una declaración no llega a publicarse, y de
    // otra clase que el primero: la puerta editorial retiene lo que no podemos
    // CONTRASTAR, y ésta retiene lo que no podemos demostrar que se DIJERA —su
    // literal no consta en ninguna transcripción nuestra, ni la vigente ni las
    // sustituidas. Se cuenta porque, si no, la retirada sería invisible: la
    // comprobación de procedencia audita lo publicado, así que retirarlas la
    // deja en verde. La fila sólo se pinta cuando hay alguna.
    retenidasSinProcedencia: t.retenidasSinProcedencia ?? 0,
    sinDatos: t.byVerdict?.['sin-datos'] ?? 0,
    parcial: t.byVerdict?.parcial ?? 0,
    verificado: t.byVerdict?.verificado ?? 0,
    contradicho: t.byVerdict?.contradicho ?? 0,
    sinCorpus: t.sinDatosPorque?.sinCorpus ?? 0,
    comprobadoSinHallar: t.sinDatosPorque?.comprobadoSinHallar ?? 0,
  }

  const vs = votes?.stats ?? {}
  const votosItems = votes?.items ?? []
  const votosLista = votosItems.map((v) => v.outcome ?? null)
  const votosResumen = {
    total: vs.total ?? votosItems.length,
    aprobado: vs.byOutcome?.aprobado ?? 0,
    rechazado: vs.byOutcome?.rechazado ?? 0,
    otros:
      (vs.total ?? votosItems.length) -
      (vs.byOutcome?.aprobado ?? 0) -
      (vs.byOutcome?.rechazado ?? 0),
    sesiones: Object.keys(votesByPleno).length,
    lista: votosLista,
    retiradas: {
      record: vs.retracted?.record ?? 0,
      breakdown: vs.retracted?.breakdown ?? 0,
    },
  }

  const tops = agendas?.topDepartments ?? []
  const maximo = tops.reduce((m, d) => Math.max(m, d.count || 0), 0)
  const departamentos = tops.map((d) => ({
    slug: d.departmentSlug || null,
    nombre: nombreDepartamento(d.department, d.departmentSlug),
    n: d.count,
    cuota: maximo ? d.count / maximo : 0,
  }))

  const porAnio = [...new Set(filas.map((f) => f.anio).filter(Boolean))]
    .sort((a, b) => b - a)
    .map((anio) => ({ anio, n: filas.filter((f) => f.anio === anio).length }))

  const filtros = FILTROS.map((f) => ({ ...f, n: filas.filter(f.pasa).length }))

  return {
    total,
    filas,
    filtros,
    porAnio,
    escalera,
    escaleraExcepciones,
    ventana,
    embudo,
    votos: votosResumen,
    departamentos,
    agenda: {
      sesiones: conOrden,
      puntos: agendas?.stats?.agendaItemsTotal ?? 0,
      conDepartamento: agendas?.stats?.agendaItemsWithDepartment ?? null,
    },
    hallazgos: {
      publicados: (findings?.items ?? []).length,
      sesiones: new Set((findings?.items ?? []).map((f) => f.plenoId)).size,
      retiradas: (findings?.retractions ?? []).length,
    },
  }
}
