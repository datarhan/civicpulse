/**
 * El horario de un agente de launchd, y cuándo le tocaba correr por última vez.
 *
 * Lo comparten `check:cron` (que lee los plists instalados con `plutil`) y el
 * despiece de la app (que lee los del repositorio como texto). Vivía dentro de
 * `check-cron.ts` y sólo sabía de una hora diaria; cuando los agentes con LLM
 * pasaron a lunes y jueves, o a los lunes, un intervalo en ARRAY se saltaba en
 * silencio y uno con `Weekday` se daba por atrasado seis días de cada siete.
 *
 * `StartCalendarInterval` (launchd.plist(5)) es un dict o un array de dicts, con
 * `Weekday` 0–7 (0 y 7 son domingo).
 */

/** Una entrada del intervalo. `dia` null: cada día. */
export interface Horario {
  dia: number | null
  hora: number
  minuto: number
}

/**
 * El intervalo como lista. Una entrada sin `Hour` no es un horario que se pueda
 * medir (launchd la dispararía cada hora), así que se descarta; si no queda
 * ninguna, la lista sale vacía y quien la use tiene que decirlo.
 */
export function horariosDe(intervalo: unknown): Horario[] {
  const entradas = Array.isArray(intervalo) ? intervalo : intervalo ? [intervalo] : []
  const out: Horario[] = []
  for (const e of entradas as Array<{ Weekday?: unknown; Hour?: unknown; Minute?: unknown }>) {
    if (typeof e?.Hour !== 'number') continue
    out.push({
      dia: typeof e.Weekday === 'number' ? e.Weekday : null,
      hora: e.Hour,
      minuto: typeof e.Minute === 'number' ? e.Minute : 0,
    })
  }
  return out
}

/**
 * Lo mismo, desde el XML de un plist y sin librería. Sólo mira el valor de
 * `StartCalendarInterval`: un dict suelto o los dicts de un array.
 */
export function horariosDePlistXml(texto: string): Horario[] {
  const m =
    /<key>StartCalendarInterval<\/key>\s*(<array>[\s\S]*?<\/array>|<dict>[\s\S]*?<\/dict>)/.exec(
      texto,
    )
  if (!m) return []
  const entradas = [...m[1].matchAll(/<dict>([\s\S]*?)<\/dict>/g)].map((d) => {
    const entrada: Record<string, number> = {}
    for (const k of d[1].matchAll(/<key>(\w+)<\/key>\s*<integer>(-?\d+)<\/integer>/g)) {
      entrada[k[1]] = Number(k[2])
    }
    return entrada
  })
  return horariosDe(entradas)
}

/**
 * La última vez que tocaba correr antes de `ahora`: la más reciente de todas las
 * entradas. Se retrocede día a día —como mucho una semana— en vez de restar
 * horas, para que un cambio de hora no la desplace.
 */
export function ultimaProgramada(horarios: Horario[], ahora: Date): Date | null {
  let mejor: Date | null = null
  for (const h of horarios) {
    for (let atras = 0; atras <= 7; atras++) {
      const d = new Date(ahora)
      d.setDate(d.getDate() - atras)
      d.setHours(h.hora, h.minuto, 0, 0)
      if (d.getTime() > ahora.getTime()) continue
      if (h.dia !== null && d.getDay() !== h.dia % 7) continue
      if (!mejor || d.getTime() > mejor.getTime()) mejor = d
      break
    }
  }
  return mejor
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** «09:30», «lun 10:15», «lun/jue 07:30» — agrupado por hora. */
export function describirHorarios(horarios: Horario[]): string {
  if (horarios.length === 0) return 'sin horario'
  const porHora = new Map<string, Array<number | null>>()
  for (const h of horarios) {
    const hhmm = `${String(h.hora).padStart(2, '0')}:${String(h.minuto).padStart(2, '0')}`
    porHora.set(hhmm, [...(porHora.get(hhmm) ?? []), h.dia])
  }
  return [...porHora]
    .map(([hhmm, dias]) => {
      if (dias.includes(null)) return hhmm
      // Lunes primero: es como se lee una semana aquí.
      const orden = [...new Set(dias.map((d) => (d as number) % 7))].sort(
        (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
      )
      return `${orden.map((d) => DIAS[d]).join('/')} ${hhmm}`
    })
    .join(' · ')
}
