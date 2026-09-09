/**
 * Avisos de convocatorias — el calendario de subvenciones y premios, por DM y
 * sólo a los administradores.
 *
 * POR QUÉ EXISTE. Los plazos que importan son anuales y caen en meses
 * distintos: NLnet cierra el 3 de noviembre, el European Press Prize abre el 1
 * de noviembre y dura unas seis semanas, Sigma abre por diciembre. Perder uno
 * no cuesta un plazo, cuesta un AÑO. Hasta ahora ese calendario vivía en la
 * cabeza del operador y en un documento que hay que acordarse de abrir.
 *
 * QUÉ ENTRA AQUÍ, y es una regla de contenido, no de estilo: **sólo hechos
 * públicos** — el nombre de la convocatoria, sus fechas y su URL, tal y como
 * los publica quien convoca. Ni el importe que pedimos, ni la prioridad, ni
 * nada de la estrategia. Este fichero se despliega en Fly y vive en un
 * repositorio público desde el 8-09-2026, así que la regla la comprueba una
 * prueba y no se queda en este comentario.
 *
 * DOS REGLAS MÁS, las dos sobre honestidad:
 *
 *   · Una fecha APROXIMADA no se pinta como exacta. «Sigma abre por diciembre»
 *     es lo que sabemos; decir «abre el 1 de diciembre» inventa una precisión
 *     que nadie ha comprobado. Avisa antes y se declara aproximada.
 *
 *   · Lo que todavía NO se puede pedir se dice CON SU MOTIVO. Una línea de
 *     1,4 M€ anunciada sin «necesita entidad jurídica» manda a perder una
 *     tarde. El motivo es el aviso.
 *
 * NO se pausa con el bloqueo LOREG, y es deliberado: el resto de crons del bot
 * publican o escriben sobre cargos electos, y por eso se paran. Esto es un DM
 * interno sobre el plazo de un tercero. Pararlo durante una campaña sólo
 * conseguiría perder una convocatoria.
 */

import type { Bot } from 'grammy'
import { logger } from '../util/log.ts'
import { parseAdminIds } from '../util/admins.ts'
import type { MyContext } from '../types.ts'

export interface Convocatoria {
  id: string
  nombre: string
  url: string
  /** ISO. Ausente cuando no se sabe o cuando la convocatoria es continua. */
  abre?: string
  cierra?: string
  /** Lo que falta para poder pedirla. Su ausencia significa que no falta nada. */
  requiere?: string
  /** Abierta de forma permanente: no hay ventana que recordar. */
  continua?: boolean
  /**
   * Ya enviada. El plazo NO deja de importar —se puede reenviar hasta el
   * cierre— pero repetir cinco veces «cierra en N días» sobre algo hecho es
   * ruido, y el ruido es lo que enseña a ignorar los avisos.
   */
  presentada?: { fecha: string; ref?: string }
  precision: 'exacta' | 'aproximada'
  nota?: string
}

export type Estado = 'abierta' | 'cerrada' | 'aun-no' | 'bloqueada' | 'presentada'

/**
 * La referencia de una solicitud NUESTRA no va escrita aquí.
 *
 * Identifica una propuesta viva —NLnet admite reenvío hasta el 3 de noviembre— y
 * este fichero, además de desplegarse en Fly, vive en un repositorio público
 * desde el 8-09-2026. La regla de este módulo siempre fue «sólo hechos públicos
 * de quien convoca», y un código de solicitud no es un hecho de quien convoca:
 * es un identificador nuestro que al lector del repositorio no le sirve de nada.
 *
 * La guarda que vigilaba la regla miraba importes y las palabras «prioridad» y
 * «estrategia», así que estuvo en verde mientras el código se comiteaba. Medir
 * la letra y perder el espíritu es el defecto de siempre en esta casa.
 *
 * Sin la variable el aviso sigue diciendo que ya se envió y que se puede
 * reenviar, que es el aviso; lo que se pierde es el código, que era el lujo.
 */
const REF_NLNET = process.env.NLNET_REF?.trim() || undefined

/**
 * El calendario. Fechas comprobadas contra la web de cada convocante el
 * 2026-09-09; las marcadas `aproximada` son las que el convocante no publica
 * todavía con día exacto.
 */
export const CONVOCATORIAS: Convocatoria[] = [
  {
    id: 'nlnet',
    nombre: 'NLnet — Other/open call',
    url: 'https://nlnet.nl/propose/',
    cierra: '2026-11-03T11:00:00Z', // 12:00 CET
    precision: 'exacta',
    presentada: { fecha: '2026-09-09', ...(REF_NLNET ? { ref: REF_NLNET } : {}) },
    nota: 'Si se reenvía hay que regenerar el registro de prompts (npm run build:prompt-log) y cuadrar las cifras de la divulgación con el fichero adjunto.',
  },
  {
    id: 'aepd-comunicacion',
    nombre: 'AEPD — Premio Comunicación de Protección de Datos Personales',
    url: 'https://www.aepd.es/la-agencia/transparencia/informacion-economica-presupuestaria-y-estadistica/premios',
    cierra: '2026-10-15T21:59:00Z', // 23:59 CEST del 15-10
    precision: 'exacta',
    nota: 'Las bases (BOE-A-2026-15843) premian trabajos «dedicados a la materia objeto de la convocatoria» y advierten que «no se considerarán aquellas candidaturas fuera del objeto del premio». Admiten medios exclusivamente online (URL más el contenido). Ventana de publicación 16-10-2025 a 15-10-2026. Se envía por la sede electrónica con el anexo 1 firmado y un resumen ejecutivo de 4 páginas; la mitad de la puntuación es la difusión conseguida.',
  },
  {
    id: 'valencia-datos',
    nombre: 'Ayuntamiento de València — periodismo de datos y datos abiertos',
    url: 'https://www.valencia.es/cas/campa%C3%B1as-municipales/-/content/premios-proyectos-datos-abiertos-periodismo-datos-2025',
    abre: '2027-05-08T00:00:00Z',
    precision: 'aproximada',
    nota: 'Categoría de periodismo de datos, tres premios (5.000/3.000/2.000 €). La edición de 2026 corrió del 8-05 al 8-06. Sus bases están SIN LEER: queda por comprobar si exigen reutilizar datos del portal de València.',
  },
  {
    id: 'european-press-prize',
    nombre: 'European Press Prize — Innovation Award',
    url: 'https://www.europeanpressprize.com/judging/submission-rules/',
    abre: '2026-11-01T00:00:00Z',
    precision: 'exacta',
    nota: 'La ventana dura unas seis semanas; el cierre exacto se publica al abrir. Una candidatura por autor en Innovation, y hasta tres artículos aparte en Public Discourse.',
  },
  {
    id: 'sigma',
    nombre: 'Sigma Awards — periodismo de datos',
    url: 'https://sigmaawards.org/',
    abre: '2026-12-01T00:00:00Z',
    precision: 'aproximada',
    nota: 'Admite candidaturas individuales. Cierre por mediados de enero.',
  },
  {
    id: 'goteo',
    nombre: 'Goteo — micromecenazgo',
    url: 'https://www.goteo.org/',
    continua: true,
    precision: 'exacta',
    nota: 'Sin plazo: se puede empezar cuando se quiera.',
  },
  {
    id: 'ij4eu',
    nombre: 'IJ4EU — Freelancer Support Scheme',
    url: 'https://www.ij4eu.eu/',
    abre: '2026-12-01T00:00:00Z',
    precision: 'aproximada',
    requiere: 'un equipo transfronterizo de autónomos',
  },
  {
    id: 'pluralistic-media',
    nombre: 'Pluralistic Media for Democracy',
    url: 'https://culture.ec.europa.eu/calls',
    requiere: 'una entidad jurídica con sede en la UE27',
    precision: 'aproximada',
    nota: 'Reparte 1,4 M€ entre medios de interés público en desiertos informativos. Sin entidad no se puede ni presentar.',
  },
  {
    id: 'local-media',
    nombre: 'Local Media for Democracy',
    url: 'https://culture.ec.europa.eu/calls',
    requiere: 'una entidad jurídica con sede en la UE27',
    precision: 'aproximada',
  },
  {
    id: 'gva-participacion',
    nombre: 'GVA — participación ciudadana',
    url: 'https://participacio.gva.es/',
    requiere: 'una asociación constituida',
    precision: 'aproximada',
  },
]

const DIA = 24 * 60 * 60 * 1000

/** Diferencia en días de CALENDARIO (UTC): «hoy» es 0 aunque falten horas. */
function diasHasta(iso: string, ahora: Date): number {
  const a = Date.parse(iso)
  const inicioDe = (t: number) => {
    const d = new Date(t)
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  return Math.round((inicioDe(a) - inicioDe(ahora.getTime())) / DIA)
}

export function estadoDe(c: Convocatoria, ahora: Date): { estado: Estado; motivo?: string } {
  if (c.requiere) return { estado: 'bloqueada', motivo: `necesita ${c.requiere}` }
  if (c.cierra && Date.parse(c.cierra) < ahora.getTime()) {
    return { estado: 'cerrada', motivo: `cerró el ${c.cierra.slice(0, 10)}` }
  }
  if (c.presentada) {
    return {
      estado: 'presentada',
      motivo: `enviada el ${c.presentada.fecha}${c.presentada.ref ? ` · ${c.presentada.ref}` : ''}`,
    }
  }
  if (c.continua) return { estado: 'abierta' }
  if (c.abre && Date.parse(c.abre) > ahora.getTime()) {
    return { estado: 'aun-no', motivo: `abre el ${c.abre.slice(0, 10)}` }
  }
  if (c.cierra && Date.parse(c.cierra) < ahora.getTime()) {
    return { estado: 'cerrada', motivo: `cerró el ${c.cierra.slice(0, 10)}` }
  }
  return { estado: 'abierta' }
}

export interface Aviso {
  id: string
  clase: 'abre' | 'cierra'
  dias: number
  texto: string
}

/** Hitos en días. Lo aproximado avisa antes, porque hay que ir a confirmarlo. */
const HITOS = {
  cierra: { exacta: [30, 14, 7, 3, 1], aproximada: [45, 30, 14, 7] },
  abre: { exacta: [7, 1, 0], aproximada: [30, 14, 7, 0] },
}

/** Ya enviada: sólo la última llamada, que es cuando aún se puede reenviar. */
const HITOS_PRESENTADA = [7, 1]

export function avisosDe(cs: Convocatoria[], ahora: Date): Aviso[] {
  const out: Aviso[] = []
  for (const c of cs) {
    const { estado } = estadoDe(c, ahora)
    if (estado === 'cerrada' || estado === 'bloqueada') continue

    const aprox = c.precision === 'aproximada'
    const sufijo = aprox ? ' — fecha APROXIMADA, confírmala en la web antes de contar con ella' : ''
    // La nota es lo que hay que saber ANTES de sentarse a escribir. Va debajo
    // del enlace, no en una tabla que nadie abre.
    const cola = `\n${c.url}` + (c.nota ? `\n${c.nota}` : '')

    if (c.abre) {
      const d = diasHasta(c.abre, ahora)
      if (HITOS.abre[c.precision].includes(d) && d >= 0) {
        out.push({
          id: c.id,
          clase: 'abre',
          dias: d,
          texto:
            d === 0
              ? `🟢 ABRE HOY · ${c.nombre}${sufijo}${cola}`
              : `🔔 Abre en ${d} día(s) · ${c.nombre}${sufijo}${cola}`,
        })
      }
    }
    if (c.cierra) {
      const d = diasHasta(c.cierra, ahora)
      const hitos = c.presentada ? HITOS_PRESENTADA : HITOS.cierra[c.precision]
      if (hitos.includes(d) && d >= 0) {
        const ref = c.presentada?.ref ? ` (${c.presentada.ref})` : ''
        out.push({
          id: c.id,
          clase: 'cierra',
          dias: d,
          texto: c.presentada
            ? `✅ Ya presentada el ${c.presentada.fecha}${ref} · ${c.nombre}\nCierra en ${d} día(s): hasta entonces puedes REENVIARLA si quieres cambiar algo.${cola}`
            : `⏳ Cierra en ${d} día(s) · ${c.nombre}${sufijo}${cola}`,
        })
      }
    }
  }
  return out
}

/**
 * El siguiente día en que este cron dirá algo, o `null` si ya no queda ninguno.
 *
 * Existe para que el arranque pueda DEMOSTRAR que el cron está vivo. Sin esto
 * sólo habla cuando hay un hito —diez días de aquí a diciembre— y los otros
 * trescientos es indistinguible de un import que nunca cargó. Es la regla 2 de
 * DATA_INTEGRITY aplicada a un cron: una pasada tiene que probar que hizo el
 * trabajo, y «no dije nada» no lo prueba.
 *
 * Mira un año hacia delante y para: más allá, las fechas aproximadas de este
 * calendario no significan nada.
 */
export function proximoHito(
  desde: Date,
  cs: Convocatoria[] = CONVOCATORIAS,
): { fecha: string; id: string; clase: 'abre' | 'cierra' } | null {
  for (let i = 0; i <= 366; i++) {
    const d = new Date(desde.getTime() + i * DIA)
    const [a] = avisosDe(cs, d)
    if (a) return { fecha: d.toISOString().slice(0, 10), id: a.id, clase: a.clase }
  }
  return null
}

/**
 * Las filas cuyo plazo ya pasó — que aquí significa «hay que volver a fecharlas»
 * y no «ya no toca».
 *
 * Todas estas convocatorias son ANUALES menos Goteo, así que `cerrada` no es un
 * estado final: es un dato viejo. Y una fila vieja deja de emitir para siempre,
 * con lo que un calendario que se ha quedado atrás y uno al día dicen
 * exactamente lo mismo —nada—. Esto es lo único que los distingue.
 *
 * No prueba que no falte una convocatoria; eso no se puede probar. Prueba lo
 * otro: que las que hay siguen vigentes. El 2026-09-09 el premio de
 * Comunicación de la AEPD llevaba tres meses abierto, cerraba en 36 días, y no
 * estaba en esta lista.
 *
 * Sólo juzga lo que puede medir: una fila que declara apertura y no cierre no
 * cuenta como vieja, porque el cierre del European Press Prize no se publica
 * hasta el día en que abre.
 */
export function caducadas(cs: Convocatoria[], ahora: Date = new Date()): Convocatoria[] {
  return cs.filter((c) => !c.continua && c.cierra && Date.parse(c.cierra) < ahora.getTime())
}

export interface CorridaConvocatorias {
  avisos: number
  enviados: number
  /** Distinto de «no había nada que decir»: aquí HAY avisos y nadie los recibe. */
  sinAdministradores: boolean
}

export async function runConvocatoriasOnce(
  admins: number[],
  sendDm: (userId: number, texto: string) => Promise<void>,
  ahora: Date = new Date(),
  cs: Convocatoria[] = CONVOCATORIAS,
): Promise<CorridaConvocatorias> {
  const avisos = avisosDe(cs, ahora)
  if (avisos.length === 0) {
    return { avisos: 0, enviados: 0, sinAdministradores: admins.length === 0 }
  }

  const cuerpo = ['📅 *Convocatorias*', '', ...avisos.map((a) => a.texto)].join('\n')
  let enviados = 0
  for (const a of admins) {
    try {
      await sendDm(a, cuerpo)
      enviados += 1
    } catch (e) {
      logger.warn?.(`[convocatorias] no se pudo avisar a ${a}: ${String(e)}`)
    }
  }
  return { avisos: avisos.length, enviados, sinAdministradores: admins.length === 0 }
}

const TICK_MS = 60 * 60 * 1000
const HORA_UTC = 8 // 09:00/10:00 en España según estación

/** Tic horario que emite una sola vez al día, como el cron del digest. */
export function startConvocatoriasCron(bot: Bot<MyContext>): void {
  let ultimoDia = ''
  const tick = async () => {
    const ahora = new Date()
    const dia = ahora.toISOString().slice(0, 10)
    if (ahora.getUTCHours() !== HORA_UTC || dia === ultimoDia) return
    ultimoDia = dia

    const admins = parseAdminIds()
    const r = await runConvocatoriasOnce(admins, async (id, texto) => {
      await bot.api.sendMessage(id, texto, { parse_mode: 'Markdown' })
    })
    if (r.sinAdministradores && r.avisos > 0) {
      logger.warn?.(
        `[convocatorias] ${r.avisos} aviso(s) y ADMIN_USER_IDS sin configurar — nadie los recibe`,
      )
    } else if (r.avisos > 0) {
      logger.info?.(`[convocatorias] ${r.avisos} aviso(s) a ${r.enviados} administrador(es)`)
    }
  }
  // Un renglón al arrancar, y no es decoración: es lo único que distingue
  // «cron vivo y sin nada que decir» de «cron que no cargó».
  const p = proximoHito(new Date())
  logger.info?.(
    p
      ? `[convocatorias] cron armado · ${CONVOCATORIAS.length} convocatoria(s) · siguiente aviso ${p.fecha} (${p.clase}:${p.id})`
      : `[convocatorias] cron armado · ${CONVOCATORIAS.length} convocatoria(s) · ningún hito en los próximos 12 meses`,
  )

  // Un calendario que se ha quedado viejo no se queja solo: sus filas
  // simplemente dejan de emitir. Como son anuales, decirlo al arrancar es la
  // única forma de que se note.
  const viejas = caducadas(CONVOCATORIAS)
  if (viejas.length > 0) {
    logger.warn?.(
      `[convocatorias] ${viejas.length} con el plazo pasado y sin refechar: ${viejas
        .map((c) => c.id)
        .join(', ')} — son anuales, tocan fechas nuevas`,
    )
  }

  void tick()
  setInterval(() => void tick(), TICK_MS)
}
