/**
 * Lo que se le dice a quien escribió una queja sobre su revisión antes de
 * publicarse: en `/estado`, en `/mis` y en el aviso cuando un administrador
 * decide. En un solo sitio, para que las tres cosas digan lo mismo.
 */
import type { Moderacion } from '../db/migraciones.ts'
import { CONTACTO } from './contacto.ts'

/** Para el Markdown de `/estado`: el `_` de la dirección abriría una cursiva. */
const CONTACTO_MD = CONTACTO.replace(/_/g, '\\_')

/** La línea de `/estado` para su autor; null cuando ya es pública y no hay nada que decir. */
export const REVISION_PARA_AUTOR: Record<Moderacion, string | null> = {
  pendiente: '🕒 *En revisión:* todavía no es pública. Te aviso aquí cuando se publique.',
  retenida: '🕒 *En revisión:* todavía no es pública. Te aviso aquí cuando se publique.',
  publicada: null,
  descartada: `🚫 *No se ha publicado* tras revisarla. Si crees que es un error: ${CONTACTO_MD}`,
  retirada: `↩️ *Retirada de la publicación* tras revisarla. Si crees que es un error: ${CONTACTO_MD}`,
}

/** La marca corta de `/mis`. */
export const REVISION_CORTA: Record<Moderacion, string | null> = {
  pendiente: 'en revisión',
  retenida: 'en revisión',
  publicada: null,
  descartada: 'no publicada',
  retirada: 'retirada de la publicación',
}

const atajo = (id: string) => id.replace('Q-', '').toLowerCase()

/** El aviso a su autor cuando un administrador decide. Texto plano, sin Markdown. */
export function avisoAlAutor(id: string, hasta: Moderacion): string | null {
  switch (hasta) {
    case 'publicada':
      return (
        `✅ Tu queja ${id} ha pasado la revisión y ya es pública. La web la muestra en su ` +
        `próxima actualización.\n\nPara que otros vecinos la apoyen, que envíen /apoyar_${atajo(id)}`
      )
    case 'descartada':
      return (
        `Tu queja ${id} no se publica tras revisarla. Sigue en tu lista (/mis) y puedes ` +
        `retirarla con /olvidar. Si crees que es un error: ${CONTACTO}`
      )
    case 'retirada':
      return (
        `Tu queja ${id} se ha retirado de la publicación tras revisarla. Si crees que es un ` +
        `error: ${CONTACTO}`
      )
    default:
      return null
  }
}
