/**
 * Qué ficha lee la revisión lectora de cada ruta con parámetro.
 *
 * Hasta el 29-09-2026 no leía ninguna. `rutasPublicas` tira toda ruta con `:`
 * —«elegir CUÁL es una decisión editorial», decía—, y así se quedaron fuera
 * del pre-push y del barrido de lunes y jueves las ocho plantillas de detalle:
 * /plenos/:id, /departamentos/:slug, /hallazgos/:id, /cargos/:slug,
 * /eficiencia/:id, /empleo/:id, /quejas/:id y /laboratorio/agentes/:assignmentId.
 * Varias son legalmente materiales. Se vio con la #175: cambió ClaimLedger.jsx,
 * que sólo pintan /plenos/:id y /departamentos/:slug, y el gancho leyó
 * /declaraciones —por otro fichero— y dijo «nada que señalar».
 *
 * La decisión editorial sigue siéndolo, así que se toma aquí, por escrito y una
 * vez por plantilla, en vez de no tomarse:
 *
 *   · UNA ficha por plantilla. Leerlas todas son cientos de páginas y horas de
 *     modelo. Una basta para lo que falla en la PLANTILLA —un rótulo, una
 *     salvedad, una juxtaposición que el componente pinta en todas—, que es lo
 *     que rompe un cambio de código. Lo que sólo está mal en OTRA ficha no lo ve;
 *     el parte lo dice («1 de N»).
 *   · Elegida de los DATOS, nunca escrita a mano. Un id apuntado se queda viejo
 *     en silencio: un hallazgo se retira, una oferta caduca, una queja se olvida
 *     con /olvidar. Aquí se elige cada vez entre lo que existe.
 *   · La que más plantilla pinta. Cada elector cuenta qué partes de la página
 *     llena cada ficha —y antes que nada las legalmente materiales: el bloque de
 *     encaje firmado, el registro de correcciones, el nombre de quien tiene la
 *     competencia—. A igualdad, la más reciente; a igualdad, el id menor, para
 *     que dos pasadas sobre los mismos datos lean la misma.
 *   · Sin datos, NO se inventa una ficha: la clave es la plantilla misma y el
 *     lector la da por SIN FICHA. Tirarla sería volver al silencio de antes.
 *
 * Lo que esta elección NO cubre, dicho: la ficha de quien dejó el cargo es otra
 * plantilla (FormerDetalle) y aquí se elige a alguien en ejercicio; y las notas
 * de curaduría plegadas de /laboratorio/agentes/:assignmentId no se abren.
 *
 * Módulo puro salvo `leerDeDisco`: los electores reciben los snapshots.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conEstado, ESTADO_PESTANAS } from '../../src/scraper/reader-review'
import { computeDepartmentStats } from '../../src/lib/department-stats'
import { bioReportRoutes } from '../../src/lib/journalist-links'
import { ALLOWED_FINDING_SEVERITIES } from '../../src/scraper/pleno-finding'

/** Un snapshot de `public/data` por su nombre relativo (`pleno-claims/index.json`); null si no está. */
export type LeerSnapshot = (nombre: string) => unknown

export interface Ficha {
  patron: string
  /** Lo que se le pide al lector: la URL de la ficha, con su estado; o la plantilla si no hay ficha. */
  clave: string
  id: string | null
  /** Entre cuántas se eligió. */
  total: number
}

interface Eleccion {
  id: string | null
  total: number
}

// Los snapshots llegan sin tipo: los electores sólo leen campos opcionales.
type Fila = Record<string, any>

/** Una colección de un snapshot, o `[]` si no está o no es una lista. */
function lista(snap: unknown, campo = 'items'): Fila[] {
  const v = (snap as Fila | null | undefined)?.[campo]
  return Array.isArray(v) ? v : []
}

function cuenta(filas: Fila[], clave: (f: Fila) => unknown): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of filas) {
    const k = clave(f)
    if (typeof k === 'string' && k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const si = (v: unknown): number => (v ? 1 : 0)

/**
 * La primera según los criterios, cada uno de mayor a menor; a igualdad de
 * todos, el id menor. Un criterio devuelve un número o una fecha ISO.
 */
function elige(
  candidatas: Fila[],
  id: (f: Fila) => string,
  criterios: Array<(f: Fila) => number | string>,
): Eleccion {
  const orden = [...candidatas].sort((a, b) => {
    for (const c of criterios) {
      const va = c(a)
      const vb = c(b)
      if (va !== vb) return va < vb ? 1 : -1
    }
    return id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0
  })
  return { id: orden.length > 0 ? id(orden[0]) : null, total: candidatas.length }
}

const gravedad = (s: unknown): number =>
  ALLOWED_FINDING_SEVERITIES.indexOf(s as (typeof ALLOWED_FINDING_SEVERITIES)[number]) + 1

/**
 * Un elector por plantilla. `tests/fichas-representativas.test.ts` pone en rojo
 * una ruta con `:` de App.jsx que no tenga el suyo.
 */
export const ELECTORES: Record<
  string,
  { elige: (leer: LeerSnapshot) => Eleccion; estado?: string }
> = {
  // Las pestañas que llena, porque la carga sólo abre el resumen (ver
  // ESTADO_PESTANAS): orden del día, votos, declaraciones y hallazgos; luego
  // cuántos veredictos distintos pinta la tabla. Sólo sesiones de
  // plenos.json: una que no está ahí pinta «no encontrado».
  '/plenos/:id': {
    estado: ESTADO_PESTANAS,
    elige: (leer) => {
      const votos = cuenta(lista(leer('pleno-votes.json')), (v) => v.plenoId)
      const hallazgos = cuenta(lista(leer('pleno-findings.json')), (f) => f.plenoId)
      const ordenDelDia = new Set(lista(leer('plenos-agendas.json'), 'plenos').map((a) => a.id))
      const decl = new Map(
        lista(leer('pleno-claims/index.json'), 'plenos').map((p) => [p.plenoId, p]),
      )
      return elige(lista(leer('plenos.json')), (p) => String(p.id), [
        (p) =>
          si(ordenDelDia.has(p.id)) +
          si(votos.has(p.id)) +
          si((decl.get(p.id)?.itemCount ?? 0) > 0) +
          si(hallazgos.has(p.id)),
        (p) => Object.keys(decl.get(p.id)?.byVerdict ?? {}).length,
        (p) => String(p.date ?? ''),
      ])
    },
  },

  // Con el agregador de la propia página, para no contar las secciones de
  // otra manera que ella. Toda área permitida tiene ficha, aunque esté vacía.
  '/departamentos/:slug': {
    elige: (leer) => {
      const indice = leer('pleno-claims/index.json') as Fila | null
      const stats = computeDepartmentStats({
        officials: leer('officials.json'),
        promises: leer('promises.json'),
        agendas: leer('plenos-agendas.json'),
        votes: leer('pleno-votes.json'),
        quejas: leer('quejas.json'),
        tenders: leer('tenders.json'),
        claimsSummary: indice?.totals?.byTopicVerdict ?? null,
      } as Parameters<typeof computeDepartmentStats>[0])
      return elige(Object.values(stats.bySlug) as Fila[], (d) => String(d.slug), [
        (d) =>
          si(d.plenoVotes?.total > 0) +
          si(d.plenoAgendas?.total > 0) +
          si(d.promesas?.total > 0) +
          si(d.quejas?.total > 0) +
          si(d.declaraciones?.conEvidencia > 0) +
          si(d.contratacion?.contratos > 0) +
          si(d.responsableOfficial),
        (d) => d.declaraciones?.conEvidencia ?? 0,
      ])
    },
  },

  // Nunca uno retirado: su URL pinta la lápida, que es otra página. Antes el
  // más grave —un `critical` exige su contradicción—, luego el que lleva
  // réplica o correcciones.
  '/hallazgos/:id': {
    elige: (leer) => {
      const snap = leer('pleno-findings.json')
      const retirados = new Set(lista(snap, 'retractions').map((r) => r.findingId))
      return elige(
        lista(snap).filter((f) => !retirados.has(f.id)),
        (f) => String(f.id),
        [
          (f) => gravedad(f.severity),
          (f) => si(f.response),
          (f) => si((f.corrections ?? []).length > 0),
          (f) => String(f.publishedAt ?? ''),
        ],
      )
    },
  },

  // En ejercicio y con el bloque de encaje firmado, que es lo legalmente
  // material de la ficha; luego con biografía publicada; luego el que más
  // filas de encaje pinta.
  '/cargos/:slug': {
    elige: (leer) => {
      const encaje = cuenta(lista(leer('area-fit.json'), 'rows'), (r) => r.officialSlug)
      const bios = bioReportRoutes(
        leer('journalist-assignments.json'),
        leer('journalist-reports.json'),
      ) as Map<string, unknown>
      return elige(lista(leer('officials.json'), 'officials'), (o) => String(o.slug), [
        (o) => si(encaje.has(o.slug)),
        (o) => si(bios.has(o.slug)),
        (o) => encaje.get(o.slug) ?? 0,
      ])
    },
  },

  // El nombre de quien tiene delegada la competencia primero (la misma clave
  // que `indexarCompetencias`), luego las partes que la ficha pinta: pares,
  // serie, declaración de entregas y salvedades.
  '/eficiencia/:id': {
    elige: (leer) => {
      const conTitular = new Set(
        lista(leer('competencias.json'), 'asignaciones').map((a) => a.clave),
      )
      return elige(lista(leer('indicadores.json'), 'indicadores'), (i) => String(i.id), [
        (i) => si(conTitular.has(i.id)),
        (i) =>
          si(i.pares) +
          si((i.serie ?? []).filter((p: Fila) => p.estado === 'declarado').length > 1) +
          si(i.declaracion?.paresMedibles > 0) +
          si((i.caveats ?? []).length > 0),
      ])
    },
  },

  '/empleo/:id': {
    elige: (leer) =>
      elige(lista(leer('empleo.json')), (o) => String(o.id), [(o) => String(o.publishedAt ?? '')]),
  },

  // La que tiene respuesta del ayuntamiento pinta el bloque de réplica.
  '/quejas/:id': {
    elige: (leer) => {
      const respondidas = cuenta(lista(leer('quejas-responses.json')), (r) => r.queja_id)
      return elige(lista(leer('quejas.json')), (q) => String(q.service_request_id), [
        (q) => si(respondidas.has(q.service_request_id)),
        (q) => String(q.registered_at ?? q.requested_datetime ?? ''),
      ])
    },
  },

  // Réplica y registro de correcciones son lo que una biografía de alguien
  // vivo tiene de legalmente material además del texto.
  '/laboratorio/agentes/:assignmentId': {
    elige: (leer) =>
      elige(lista(leer('journalist-reports.json')), (r) => String(r.assignmentId), [
        (r) => si(r.response),
        (r) => si((r.corrections ?? []).length > 0),
        (r) => String(r.promotedAt ?? ''),
      ]),
  },
}

/** La ficha de una plantilla: su URL con el id elegido, o la plantilla si no hay. */
export function fichaDe(patron: string, leer: LeerSnapshot): Ficha {
  const elector = ELECTORES[patron]
  const { id, total } = elector ? elector.elige(leer) : { id: null, total: 0 }
  if (!elector || !id) return { patron, clave: patron, id: null, total }
  const ruta = patron.replace(/:[A-Za-z]+/, encodeURIComponent(id))
  return { patron, clave: elector.estado ? conEstado(ruta, elector.estado) : ruta, id, total }
}

export function fichasRepresentativas(patrones: string[], leer: LeerSnapshot): Ficha[] {
  return patrones.map((p) => fichaDe(p, leer))
}

/**
 * Lee de `dir` —`public/data`—, una vez por fichero.
 *
 * Un fichero que no está es `null` y el elector lo trata como vacío. Uno que no
 * se puede parsear REVIENTA: tratarlo como vacío haría decir «SIN FICHA» a una
 * plantilla por un JSON roto, que es otra cosa y tiene otro arreglo.
 */
export function leerDeDisco(dir: string): LeerSnapshot {
  const memo = new Map<string, unknown>()
  return (nombre) => {
    if (!memo.has(nombre)) {
      const f = join(dir, nombre)
      memo.set(nombre, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null)
    }
    return memo.get(nombre)
  }
}
