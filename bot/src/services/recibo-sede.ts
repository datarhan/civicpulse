/**
 * El recibo de la sede, en la forma del bot y de vuelta.
 *
 * El plazo de una queja corre «desde la fecha en que la solicitud haya tenido
 * entrada en el registro electrónico» (art. 21.3.b LPACAP), y el recibo de la sede
 * la da en su hora oficial, la de Madrid (art. 31.2). Los dos recibos reales del
 * 27-09-2026 —presentados un domingo, así que el registro les dio entrada el
 * primer día hábil— dicen:
 *
 *     Número de Registro   Fecha de Registro     Fecha de Presentación
 *     2026014913           28/09/2026 0:00:01    27/09/2026 8:32:55
 *
 * y el código seguro de verificación, en grupos de cuatro separados por espacios.
 *
 * Hasta el 28-09-2026 `registered_at` era `datetime('now')` al escribir
 * /batch_register: la hora del moderador, antes o después de la de la sede según
 * cuándo se acordara. Ahora es la «Fecha de Registro» del recibo. De las dos
 * fechas del recibo, ésa: el art. 31.2.c habla de la «fecha y hora de
 * presentación», pero la de registro nunca es anterior, y un vigilante que se
 * equivoque debe equivocarse dando el plazo por vencido más tarde, no antes. Es
 * también la que usan las solicitudes de los reportajes (`entradaEl`).
 *
 * El bot guarda sus marcas en UTC y sin la Z, como las escribe SQLite; este módulo
 * traduce la hora de Madrid del recibo a esa forma, y de vuelta para escribirla.
 */

import { instanteUtc, ZONA_DE_LA_SEDE } from '../../../src/scraper/queja-router.ts'

/** La hora civil de la sede de un instante, por partes. */
const RELOJ_DE_LA_SEDE = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_DE_LA_SEDE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function enLaSede(t: number) {
  const p = Object.fromEntries(
    RELOJ_DE_LA_SEDE.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]),
  )
  return {
    anio: p.year,
    mes: p.month,
    dia: p.day,
    hora: p.hour,
    minuto: p.minute,
    segundo: p.second,
  }
}

const FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const HORA = /^(\d{1,2}):(\d{2}):(\d{2})$/

/**
 * La «Fecha de Registro» del recibo («28/09/2026» y «0:00:01», hora de Madrid) en
 * la forma del bot (`2026-09-27 22:00:01`, UTC); null si esa fecha u hora no
 * existe: el 31/02, o las 2:30 del domingo de marzo en que el reloj salta de las
 * 2:00 a las 3:00.
 *
 * El desfase lo da el calendario de zonas, no se escribe a mano: se mide en el
 * instante leído como si fuera UTC y otra vez en el resultado, por si los dos
 * caen a lados distintos de un cambio de hora.
 */
export function marcaDeLaSede(fecha: string, hora: string): string | null {
  const f = FECHA.exec(fecha)
  const h = HORA.exec(hora)
  if (!f || !h) return null
  const [dia, mes, anio] = [Number(f[1]), Number(f[2]), Number(f[3])]
  const [hh, mm, ss] = [Number(h[1]), Number(h[2]), Number(h[3])]
  const comoSiFueraUtc = Date.UTC(anio, mes - 1, dia, hh, mm, ss)
  let t = comoSiFueraUtc
  for (let i = 0; i < 2; i++) {
    const p = enLaSede(t)
    const desfase = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - t
    t = comoSiFueraUtc - desfase
  }
  // Lo que no existe no vuelve igual: `Date.UTC` lleva el 31/02 al 3 de marzo.
  const p = enLaSede(t)
  const vuelve =
    p.anio === anio &&
    p.mes === mes &&
    p.dia === dia &&
    p.hora === hh &&
    p.minuto === mm &&
    p.segundo === ss
  return vuelve ? new Date(t).toISOString().slice(0, 19).replace('T', ' ') : null
}

/** Una marca del bot escrita como el recibo: «28/09/2026 0:00:01»; null si no se lee. */
export function fechaHoraDeLaSede(marca: string | null | undefined): string | null {
  if (typeof marca !== 'string') return null
  const t = instanteUtc(marca)
  if (Number.isNaN(t)) return null
  const p = enLaSede(t)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(p.dia)}/${dos(p.mes)}/${p.anio} ${p.hora}:${dos(p.minuto)}:${dos(p.segundo)}`
}

/**
 * Cuánto puede separarse la fecha de registro del momento en que se apunta sin
 * tomarla por una errata. Hacia delante, porque lo presentado en día inhábil entra
 * el primer día hábil siguiente (un domingo, el lunes; una Semana Santa, el
 * martes). Hacia atrás, porque el moderador lo apunta al volver de la sede; un mes
 * mal tecleado adelantaría un mes el silencio, y ésa es la errata que se para.
 */
export const DIAS_ANTES_ADMITIDOS = 30
export const DIAS_DESPUES_ADMITIDOS = 7

export const USO_BATCH_REGISTER =
  'Uso: `/batch_register <nº de registro> <CSV> <fecha> <hora> [Q-XXXX Q-YYYY ...]`\n\n' +
  'Copia del recibo de la sede el número de registro, el código seguro de ' +
  'verificación (con sus espacios, si los lleva) y la «Fecha de Registro» con su ' +
  'hora, tal cual: `28/09/2026 0:00:01`. El plazo legal corre desde esa fecha, no ' +
  'desde que se escribe esta orden.\n\n' +
  'Si omites los IDs, se usa el lote actual (top 10 verificadas).'

export type LecturaDeRegistro =
  | { ok: true; entry_number: string; csv: string; registered_at: string; ids: string[] }
  | { ok: false; motivo: string }

/**
 * Los argumentos de /batch_register, leídos por su forma y no por su posición: el
 * CSV del recibo lleva espacios, y partido por ellos cada grupo de cuatro se
 * tomaba por el id de una queja. Lo que va antes de la fecha es el número y el
 * CSV; lo que va detrás de la hora, las quejas.
 */
export function leerBatchRegister(texto: string, ahora: Date = new Date()): LecturaDeRegistro {
  const partes = texto.trim().split(/\s+/).filter(Boolean)
  const i = partes.findIndex((p) => FECHA.test(p))
  if (i < 2 || !HORA.test(partes[i + 1] ?? '')) return { ok: false, motivo: USO_BATCH_REGISTER }
  const [fecha, hora] = [partes[i], partes[i + 1]]
  const registered_at = marcaDeLaSede(fecha, hora)
  if (!registered_at) {
    return {
      ok: false,
      motivo: `La «Fecha de Registro» ${fecha} ${hora} no existe en el calendario de Madrid.`,
    }
  }
  const dias = (instanteUtc(registered_at) - ahora.getTime()) / 86_400_000
  if (dias < -DIAS_ANTES_ADMITIDOS || dias > DIAS_DESPUES_ADMITIDOS) {
    return {
      ok: false,
      motivo:
        `La «Fecha de Registro» ${fecha} ${hora} está a ${Math.round(Math.abs(dias))} días ` +
        `de hoy: ¿es una errata? Se admite desde ${DIAS_ANTES_ADMITIDOS} días antes hasta ` +
        `${DIAS_DESPUES_ADMITIDOS} después.`,
    }
  }
  const ids = partes.slice(i + 2).map((s) => s.toUpperCase())
  const raros = ids.filter((s) => !/^Q-[A-Z0-9]+$/.test(s))
  if (raros.length > 0) {
    return { ok: false, motivo: `No reconozco como quejas: ${raros.join(', ')}.` }
  }
  const [entry_number, ...csv] = partes.slice(0, i)
  return { ok: true, entry_number, csv: csv.join(' '), registered_at, ids }
}
