/**
 * Los hitos de una queja —diez apoyos, registrada en sede, silencio
 * administrativo, escalada al Síndic—, avisados a quien modera por mensaje
 * privado de Telegram.
 *
 * Hasta el 2026-09-29 salían al canal público de Telegram (`CHANNEL_ID`,
 * services/channel.ts) con el título literal de la queja. Desde que las quejas
 * llegan por WhatsApp, Telegram es sólo para administrar, y el canal se retiró.
 * Estos avisos no llevan el texto de la queja: un mensaje privado no se vacía
 * cuando su autora la retira con /olvidar, como sí las tarjetas de revisión
 * (services/avisos-admin.ts). Llevan el id, lo que pasó, y el camino a la tarjeta.
 *
 * No se pausan con el bloqueo LOREG: son avisos internos, no difusión. Lo que se
 * pausa en campaña es lo automático que mueve un estado (cron.ts, el silencio).
 *
 * El canal se tragaba sus errores, así que nada reintentaba un aviso perdido.
 * Éste falla si no le llega a ningún administrador —y hay alguno—, para que
 * quien avisa pueda reintentarlo o contarlo.
 */
import { logger } from '../util/log.ts'

export const HITOS = ['apoyada', 'registrada', 'silencio', 'escalada'] as const
export type Hito = (typeof HITOS)[number]

export interface DatosHito {
  apoyos?: number
  plazoDias?: number
  asiento?: string | null
  csv?: string | null
}

/** Lo que se le dice a quien modera de un hito: el id, lo que pasó y dónde verla. Texto plano. */
export function textoDeHito(hito: Hito, id: string, d: DatosHito = {}): string {
  const tarjeta = `Su tarjeta: /revisar ${id}`
  switch (hito) {
    case 'apoyada':
      return (
        `👥 La queja ${id} ha llegado a ${d.apoyos ?? 'los'} apoyos: entra en el próximo lote ` +
        `al Registro Electrónico (/batch). ${tarjeta}`
      )
    case 'registrada':
      return (
        `🗃 La queja ${id} consta registrada en sede` +
        `${d.asiento ? `, asiento ${d.asiento}` : ''}${d.csv ? `, CSV ${d.csv}` : ''}. ` +
        `Desde hoy corre su plazo legal. ${tarjeta}`
      )
    case 'silencio':
      return (
        `⚠️ La queja ${id} lleva ${d.plazoDias ?? 'sus'} días registrada sin respuesta expresa: ` +
        `silencio negativo (art. 24 LPACAP). Puede prepararse la plantilla del Síndic de Greuges ` +
        `con /escalar ${id}. ${tarjeta}`
      )
    case 'escalada':
      return (
        `⚖️ La queja ${id} está marcada como escalada al Síndic de Greuges: el bot ha preparado ` +
        `su plantilla, y presentarla allí es a mano. ${tarjeta}`
      )
  }
}

export interface AvisosHitos {
  /** Avisa a cada administrador. Lanza si ninguno lo recibió habiendo alguno. */
  avisar(hito: Hito, id: string, d?: DatosHito): Promise<{ entregados: number; fallidos: number }>
}

export function avisosHitos(o: {
  admins: () => number[]
  /** Un texto plano a un chat privado (`EnvioAdmin.mensaje`, services/avisos-admin.ts). */
  mensaje: (chatId: number, texto: string) => Promise<unknown>
}): AvisosHitos {
  return {
    avisar: async (hito, id, d) => {
      const admins = o.admins()
      const texto = textoDeHito(hito, id, d)
      const r = { entregados: 0, fallidos: 0 }
      if (admins.length === 0) {
        logger.warn('avisos-hitos.sin-administradores', { hito, queja: id })
        return r
      }
      for (const admin of admins) {
        try {
          await o.mensaje(admin, texto)
          r.entregados += 1
        } catch (err) {
          r.fallidos += 1
          logger.warn('avisos-hitos.envio', { hito, queja: id, admin, err: String(err) })
        }
      }
      if (r.entregados === 0) {
        throw new Error(`ningún administrador recibió el aviso de ${hito} de ${id}`)
      }
      return r
    },
  }
}

/** Para las pruebas: no avisa a nadie. */
export const HITOS_MUDOS: AvisosHitos = {
  avisar: async () => ({ entregados: 0, fallidos: 0 }),
}
