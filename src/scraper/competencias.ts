/**
 * Quién responde de cada servicio del panel — el validador.
 *
 * `public/data/competencias.json` es un fichero curado A MANO, de la misma
 * clase que `dedicaciones.json`: lo escribe una persona, se revisa en el PR y
 * jamás lo toca la automatización. Este módulo no lo escribe; sólo se niega a
 * publicarlo mal formado.
 *
 * ## Por qué esto se congela en vez de derivarse
 *
 * `officials.json` se raspa cada noche desde la web del ayuntamiento
 * (`nightly-scrape.yml` → `scrape:officials`). Si la página dedujera el nombre
 * en tiempo de render a partir de ese fichero, un raspado nocturno podría
 * cambiar solo qué persona VIVA aparece junto a una cifra de coste en una
 * página publicada. Eso es «nada automático reescribe lo publicado» en su
 * versión más grave. Así que el mapa se congela y se firma, y el raspado se
 * degrada a detector de deriva: `check:competencias` compara y se pone rojo.
 *
 * ## La frontera: competencia, no culpa
 *
 * Lo que se publica es «la competencia delegada sobre este servicio la tiene
 * X», que es una REPUBLICACIÓN de lo que el propio ayuntamiento publica en su
 * portal. Es orientación cívica: a quién se pregunta por esto. No es «X es
 * responsable del sobrecoste», que es una afirmación que la fuente no
 * respalda.
 *
 * Esa frontera está encodada, no sólo documentada: **el esquema no tiene
 * ningún campo donde quepa un juicio**, y el validador rechaza tanto los
 * campos del esquema de pleno (por si alguien copia una fila) como cualquier
 * campo con forma de valoración. La prosa acusatoria no tiene dónde vivir en
 * los datos.
 *
 * ## `confianza` es lo que hace honesta la tabla
 *
 * `literal` es cuando el cargo nombra el servicio con sus propias palabras
 * —«Áreas Industriales y Cementerio» → cementerio—. `editorial` es cuando el
 * enlace lo ponemos nosotros —«Servicios públicos municipales» → recogida de
 * residuos—. Son dos cosas distintas y el lector tiene derecho a distinguirlas,
 * así que una asignación editorial no publica sin su `razon`.
 */

/** Cómo de directo es el salto del cargo al servicio. */
export const CONFIANZAS = ['literal', 'editorial'] as const
export type Confianza = (typeof CONFIANZAS)[number]

/**
 * Campos que no pueden aparecer en ninguna profundidad.
 *
 * Los cuatro primeros son del esquema de hallazgos de pleno: si aparecen, es
 * que alguien copió una fila de allí y trae consigo una afirmación sobre lo
 * que alguien dijo. Los demás tienen forma de valoración, que es exactamente
 * lo que esta superficie no hace.
 */
const PROHIBIDOS = new Set([
  'severity',
  'quotes',
  'individualSpeaker',
  'speakerGroup',
  'responsable',
  'culpa',
  'valoracion',
  'puntuacion',
  'nota',
])

export interface DecretoCorroborante {
  titulo: string
  url: string
  expediente: string
  fecha: string
  /** Literal del decreto, para que la corroboración sea comprobable. */
  cita: string
}

export interface FuenteCompetencias {
  titulo: string
  /**
   * De donde salen LAS CADENAS de `cargo`: la misma página que raspa
   * `scrape-officials.ts`. Citar el decreto aquí mientras las cadenas vienen
   * de la web sería una mentira de procedencia.
   */
  url: string
  consultadaEl: string
  decreto?: DecretoCorroborante
}

export interface Asignacion {
  /** `id` de un indicador del panel: `a164-coste-unitario`, `licitador-unico`. */
  clave: string
  /** LITERAL de `portfolios` en officials.json. Es lo que recoteja el check. */
  cargo: string
  /** `slug` en officials.json. */
  oficial: string
  nombre: string
  partido: string
  confianza: Confianza
  /** Obligatoria y explicativa cuando `confianza === 'editorial'`. */
  razon?: string
  firmadoEl: string
}

/** Un servicio sin cargo identificable. Es contenido, no una lista de pendientes. */
export interface SinAsignar {
  clave: string
  motivo: string
}

/** Réplica de una persona nombrada. Se publica íntegra. */
export interface Replica {
  oficial: string
  recibidaEl: string
  texto: string
  url?: string
}

export interface CompetenciasSnapshot {
  generatedAt: string
  mandato: { id: string; desde: string; hasta: string | null }
  fuente: FuenteCompetencias
  asignaciones: Asignacion[]
  sinAsignar: SinAsignar[]
  replicas: Replica[]
}

const esTexto = (v: unknown, min = 1): v is string =>
  typeof v === 'string' && v.trim().length >= min

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Recorre el objeto entero buscando claves prohibidas, a cualquier profundidad. */
function buscarProhibidos(valor: unknown, ruta: string, halladas: string[]): void {
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => buscarProhibidos(v, `${ruta}[${i}]`, halladas))
    return
  }
  if (!valor || typeof valor !== 'object') return
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (PROHIBIDOS.has(k)) halladas.push(`${ruta}.${k}`)
    buscarProhibidos(v, `${ruta}.${k}`, halladas)
  }
}

export function validarCompetencias(raw: unknown): CompetenciasSnapshot {
  const errores: string[] = []
  const r = raw as Record<string, unknown>
  if (!r || typeof r !== 'object') throw new Error('competencias: el snapshot no es un objeto')

  const prohibidos: string[] = []
  buscarProhibidos(r, '$', prohibidos)
  for (const p of prohibidos) errores.push(`campo prohibido en ${p}`)

  if (typeof r.generatedAt !== 'string') errores.push('generatedAt debe ser una fecha ISO')

  const m = r.mandato as Record<string, unknown> | undefined
  if (!m || !esTexto(m.id)) errores.push('mandato.id vacío')
  else {
    if (!esFecha(m.desde)) errores.push('mandato.desde debe ser YYYY-MM-DD')
    if (m.hasta !== null && !esFecha(m.hasta)) errores.push('mandato.hasta debe ser fecha o null')
  }

  const f = r.fuente as Record<string, unknown> | undefined
  if (!f || !esTexto(f.titulo)) errores.push('fuente.titulo vacío')
  else {
    if (!esTexto(f.url) || !/^https?:\/\//.test(f.url as string))
      errores.push('fuente.url debe ser absoluta')
    if (!esFecha(f.consultadaEl)) errores.push('fuente.consultadaEl debe ser YYYY-MM-DD')
  }

  const claves = new Set<string>()
  const asignaciones = Array.isArray(r.asignaciones) ? (r.asignaciones as unknown[]) : null
  if (!asignaciones) errores.push('asignaciones debe ser un array')
  else {
    asignaciones.forEach((a, i) => {
      const x = a as Record<string, unknown>
      const donde = `asignaciones[${i}]`
      for (const campo of ['clave', 'cargo', 'oficial', 'nombre', 'partido'] as const) {
        if (!esTexto(x[campo])) errores.push(`${donde}.${campo} vacío`)
      }
      if (!CONFIANZAS.includes(x.confianza as Confianza))
        errores.push(`${donde}.confianza fuera del enum`)
      if (x.confianza === 'editorial' && !esTexto(x.razon, 20))
        errores.push(`${donde}.razon: una asignación editorial explica el salto (≥20 caracteres)`)
      if (!esFecha(x.firmadoEl)) errores.push(`${donde}.firmadoEl debe ser YYYY-MM-DD`)
      if (esTexto(x.clave)) {
        if (claves.has(x.clave as string)) errores.push(`clave duplicada: ${x.clave}`)
        claves.add(x.clave as string)
      }
    })
  }

  const sinAsignar = Array.isArray(r.sinAsignar) ? (r.sinAsignar as unknown[]) : null
  if (!sinAsignar) errores.push('sinAsignar debe ser un array')
  else {
    sinAsignar.forEach((s, i) => {
      const x = s as Record<string, unknown>
      if (!esTexto(x.clave)) errores.push(`sinAsignar[${i}].clave vacía`)
      if (!esTexto(x.motivo, 10))
        errores.push(`sinAsignar[${i}].motivo: un hueco se explica (≥10 caracteres)`)
      if (esTexto(x.clave)) {
        if (claves.has(x.clave as string)) errores.push(`clave duplicada: ${x.clave}`)
        claves.add(x.clave as string)
      }
    })
  }

  const replicas = Array.isArray(r.replicas) ? (r.replicas as unknown[]) : null
  if (!replicas) errores.push('replicas debe ser un array')
  else {
    replicas.forEach((p, i) => {
      const x = p as Record<string, unknown>
      if (!esTexto(x.oficial)) errores.push(`replicas[${i}].oficial vacío`)
      if (!esFecha(x.recibidaEl)) errores.push(`replicas[${i}].recibidaEl debe ser YYYY-MM-DD`)
      if (!esTexto(x.texto, 20)) errores.push(`replicas[${i}].texto vacío`)
    })
  }

  if (errores.length) throw new Error(`competencias inválido:\n  - ${errores.join('\n  - ')}`)
  return r as unknown as CompetenciasSnapshot
}

/**
 * ¿Se pueden pintar los nombres hoy?
 *
 * Durante la ventana electoral de la LOREG la capa de nombres desaparece de
 * las dos superficies, con el mismo interruptor que ya pone `/promesas` en
 * sólo lectura (`npm run freeze:set`). La ventana INCLUYE su último día: un
 * `frozenUntil` de hoy sigue congelado hoy.
 *
 * Función pura para que la puerta se pueda probar sin montar una página.
 */
export function nombresVisibles(frozenUntil: string | null, hoy: string): boolean {
  if (!frozenUntil) return true
  return hoy > frozenUntil
}

/**
 * ¿Estaba vigente este mandato cuando pasó lo que se cuenta?
 *
 * Las series del panel van de 2014 a 2024 y atraviesan tres corporaciones. El
 * nombre de quien HOY tiene la competencia no se extiende hacia atrás: pintarlo
 * junto a la entrega de 2016 diría que respondía de ella, y es falso. La
 * entrega sin rendir de 2020 es el caso que más importa — nombrar a quien hoy
 * lleva hacienda por un incumplimiento de otra corporación sería nombrar por
 * eliminación, la trampa del centinela.
 *
 * Fechas ISO `YYYY-MM-DD`, que ordenan lexicográficamente. `hasta: null` es un
 * mandato en curso.
 */
export function vigenteEn(
  mandato: { desde: string; hasta: string | null },
  fecha: string,
): boolean {
  if (fecha < mandato.desde) return false
  return mandato.hasta === null || fecha <= mandato.hasta
}
