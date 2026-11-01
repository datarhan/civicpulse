/**
 * «¿Cuándo es el próximo pleno?» (auditoría de las dos lecturas, §9).
 *
 * regmeet sólo lista las sesiones ya celebradas (leído el 27-10-2026: la página
 * del año no trae ninguna convocada), así que la fecha del próximo no la
 * tenemos hasta después. Lo que sí está publicado es la regla, y se cita del
 * acta en que el Pleno la aprobó; `tests/proximo-pleno.test.ts` comprueba que
 * cada literal sigue tal cual en el acta publicada.
 *
 * - **Si una sesión de hoy en adelante llega al índice**, es ésa: la más
 *   próxima.
 * - **Si no, la regla y lo que dicen las fechas de ella**, contado sobre los
 *   ordinarios celebrados DESDE EL ACUERDO: cuántos fueron en lunes y cuántos
 *   el primer lunes del mes. Contado, nunca escrito: la portavocía fija las
 *   fechas cada año, y muchos ordinarios no caen el primer lunes. Contaba todos
 *   los del índice, que empieza en enero de 2023: cinco eran de antes de la
 *   regla, y la cuenta se leía como cumplimiento de una regla que aún no
 *   existía (I-2026-10-27-la-tarjeta-cuando-es-el-proximo-de-pleno).
 * - **Nunca se deduce una fecha de la regla.** Una fecha deducida sería una
 *   cifra que ninguna fuente publica, y en cuanto la portavocía la mueve, falsa.
 */

/** El régimen de sesiones del mandato 2023-2027, del acta en que se aprobó. */
export const REGIMEN_DE_SESIONES = {
  /** La sesión extraordinaria del 7 de julio de 2023. */
  plenoId: '16ujrlm',
  fecha: '2023-07-07',
  punto: 8,
  expediente: '3979/2023/GEN',
  /** Lo que el acta dice, letra a letra. */
  literales: [
    'El Pleno celebrará sesión ordinaria el lunes primer de cada mes en el horario de las 17:30 horas durante todos los meses del año; en el mes de agosto no se celebrará Pleno Ordinario.',
    'Si fuera festivo se trasladará al siguiente lunes.',
    'se celebrará una Junta de Portavoces al inicio de cada año (o periodo anual correspondiente como ocurre en 2023 y ocurrirá en 2027) a los efectos de fijar los días concretos de celebración de las sesiones atendiendo a los festivos u otras circunstancias a tener en cuenta.',
  ],
} as const

export interface ProximoPleno {
  /** La sesión más próxima de hoy en adelante, si el índice ya la tiene. */
  convocado: { id: string; fecha: string; tipo: string | null } | null
  /** Ordinarios desde el acuerdo, y de ellos cuántos en lunes y cuántos el primer lunes del mes. */
  ordinarios: number
  enLunes: number
  primerLunes: number
}

/** El día de calendario de «AAAA-MM-DD…», en UTC para que el huso no lo mueva. */
function dia(fecha: string): Date {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function proximoPleno(e: {
  sesiones: readonly { id: string; date?: string; kind?: string | null }[]
  /** «AAAA-MM-DD» en Riba-roja (`hoyEnRibarroja`). */
  hoy: string
}): ProximoPleno {
  const conFecha = e.sesiones.filter((s): s is typeof s & { date: string } => Boolean(s.date))
  const desdeHoy = conFecha
    .filter((s) => s.date.slice(0, 10) >= e.hoy.slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const ordinarios = conFecha.filter(
    (s) => s.kind === 'ordinario' && s.date.slice(0, 10) >= REGIMEN_DE_SESIONES.fecha,
  )
  const lunes = ordinarios.filter((s) => dia(s.date).getUTCDay() === 1)
  return {
    convocado: desdeHoy
      ? { id: desdeHoy.id, fecha: desdeHoy.date.slice(0, 10), tipo: desdeHoy.kind ?? null }
      : null,
    ordinarios: ordinarios.length,
    enLunes: lunes.length,
    primerLunes: lunes.filter((s) => dia(s.date).getUTCDate() <= 7).length,
  }
}
