/**
 * Preguntas registradas al gobierno municipal — el validador.
 *
 * `public/data/eficiencia-preguntas.json` es un fichero curado A MANO, de la
 * misma clase que los JSON de reportaje: lo escribe una persona, se revisa
 * afirmación por afirmación en el PR y jamás lo toca la automatización. Este
 * módulo no lo escribe — sólo se niega a publicarlo mal formado.
 *
 * Reglas de fondo, heredadas de la superficie a la que acompaña:
 *
 * - **Una pregunta se dirige a una institución, nunca a una persona.** El
 *   esquema no tiene campo para un nombre, y rechaza activamente los campos
 *   del esquema de pleno (`individualSpeaker`, `speakerGroup`, `quotes`,
 *   `severity`) por si alguna vez se copia una fila de allí — el mismo gesto
 *   que `eficiencia-finding.ts`.
 * - **Cada pregunta nace de una base documentada** que apunta a la superficie
 *   publicada (`href` interno). La base cita hechos CONGELADOS —del reportaje,
 *   de una ficha firmada, de un resultado con fuente fechada— y no restata
 *   números vivos del panel: así no hace falta un segundo motor de recotejo
 *   como el de las fichas.
 * - **Una pregunta termina en «?»**. Lo que no termina en interrogación es una
 *   afirmación disfrazada, y las afirmaciones van por el circuito de fichas
 *   firmadas, no por aquí.
 */

export const PANELES_PREGUNTAS = ['coste-efectivo', 'gestion'] as const
export type PanelPreguntas = (typeof PANELES_PREGUNTAS)[number]

export interface PreguntaRegistrada {
  /** La pregunta, en interrogativa directa. */
  q: string
  /** El hecho publicado del que nace: sin base documentada no hay pregunta. */
  base: string
  /** Ancla interna a la superficie que publica la base («/ruta», «#ancla»). */
  href?: string
}

export interface BloquePreguntas {
  titulo: string
  /** Institucional siempre: «A la Alcaldía», «Al Ayuntamiento y al consorcio…». */
  destinatario: string
  items: PreguntaRegistrada[]
}

export interface PanelDePreguntas {
  intro: string
  cierre?: string
  bloques: BloquePreguntas[]
}

export interface PreguntasSnapshot {
  version: 1
  /** Fecha de la última edición humana, YYYY-MM-DD. */
  actualizadoEl: string
  panels: Partial<Record<PanelPreguntas, PanelDePreguntas>>
}

/** Campos del esquema de pleno que aquí no pueden existir ni por accidente. */
const CAMPOS_PROHIBIDOS = ['individualSpeaker', 'speakerGroup', 'quotes', 'severity']

function clavesProfundas(valor: unknown, ruta: string, halladas: string[]): void {
  if (Array.isArray(valor)) {
    valor.forEach((v, ix) => clavesProfundas(v, `${ruta}[${ix}]`, halladas))
    return
  }
  if (valor !== null && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPOS_PROHIBIDOS.includes(k)) halladas.push(`${ruta}.${k}`)
      clavesProfundas(v, `${ruta}.${k}`, halladas)
    }
  }
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/**
 * Valida el snapshot entero y devuelve el objeto tipado, o lanza con TODAS las
 * violaciones a la vez — un validador que se para en la primera obliga a
 * iterar a ciegas.
 */
export function validarPreguntas(raw: unknown): PreguntasSnapshot {
  const errores: string[] = []
  const r = raw as Record<string, unknown>

  if (!r || typeof r !== 'object') throw new Error('preguntas: el snapshot no es un objeto')
  if (r.version !== 1) errores.push(`version debe ser 1 (es ${JSON.stringify(r.version)})`)
  if (!esTexto(r.actualizadoEl) || !/^\d{4}-\d{2}-\d{2}$/.test(r.actualizadoEl as string)) {
    errores.push('actualizadoEl debe ser una fecha YYYY-MM-DD')
  }

  const panels = (r.panels ?? {}) as Record<string, unknown>
  const clavesPanel = Object.keys(panels)
  if (clavesPanel.length === 0) errores.push('panels está vacío')
  for (const clave of clavesPanel) {
    if (!(PANELES_PREGUNTAS as readonly string[]).includes(clave)) {
      errores.push(`panel desconocido «${clave}» (válidos: ${PANELES_PREGUNTAS.join(', ')})`)
      continue
    }
    const p = panels[clave] as Record<string, unknown>
    if (!esTexto(p?.intro)) errores.push(`${clave}: falta intro`)
    const bloques = Array.isArray(p?.bloques) ? (p.bloques as Record<string, unknown>[]) : []
    if (bloques.length === 0) errores.push(`${clave}: sin bloques`)
    bloques.forEach((b, bi) => {
      const donde = `${clave}.bloques[${bi}]`
      if (!esTexto(b.titulo)) errores.push(`${donde}: falta titulo`)
      if (!esTexto(b.destinatario)) errores.push(`${donde}: falta destinatario`)
      const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : []
      if (items.length === 0) errores.push(`${donde}: sin items`)
      items.forEach((it, ii) => {
        const aqui = `${donde}.items[${ii}]`
        if (!esTexto(it.q)) errores.push(`${aqui}: falta q`)
        else {
          const q = (it.q as string).trim()
          if (!q.endsWith('?'))
            errores.push(`${aqui}: la pregunta no termina en «?» — ${q.slice(0, 60)}…`)
          if (q.length > 400) errores.push(`${aqui}: pregunta de ${q.length} caracteres (máx. 400)`)
        }
        if (!esTexto(it.base))
          errores.push(`${aqui}: falta base — sin hecho documentado no hay pregunta`)
        if (it.href !== undefined) {
          if (!esTexto(it.href) || !/^[/#]/.test(it.href as string)) {
            errores.push(
              `${aqui}: href debe ser interno («/ruta» o «#ancla»), es ${JSON.stringify(it.href)}`,
            )
          }
        }
      })
    })
  }

  const prohibidas: string[] = []
  clavesProfundas(r, 'preguntas', prohibidas)
  for (const p of prohibidas) {
    errores.push(`campo prohibido ${p}: este esquema no puede nombrar personas ni hablar de plenos`)
  }

  if (errores.length > 0) {
    throw new Error(`eficiencia-preguntas inválido:\n  - ${errores.join('\n  - ')}`)
  }
  return raw as PreguntasSnapshot
}
