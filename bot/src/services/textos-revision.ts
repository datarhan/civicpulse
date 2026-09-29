/**
 * Lo que se le dice a quien escribió una queja sobre su revisión antes de
 * publicarse: en `/estado`, en `/mis` y en el aviso cuando un administrador
 * decide. En un solo sitio, para que las tres cosas digan lo mismo.
 */
import { MODERACIONES, type Moderacion } from '../db/migraciones.ts'
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

/**
 * Cómo se revisa una queja antes de publicarse, dicho a quien la escribe: al
 * empezar y en el acuse. Depende de si corre la revisión automática y de si
 * puede publicar sola (`comoSeRevisa`, services/moderacion.ts), y tiene que ser
 * verdad en los tres casos.
 */
export const COMO_SE_REVISA: Record<'automatica' | 'persona-tras-lectura' | 'persona', string> = {
  automatica:
    'pasa una revisión automática, y si encuentra algo que deba ver una persona, la decide una persona del equipo',
  'persona-tras-lectura':
    'la lee una revisión automática, que le quita los nombres de otras personas, y la decide una persona del equipo',
  persona: 'la revisa una persona del equipo',
}

/** «1 fragmento», «2 fragmentos». */
const fragmentos = (n: number) => (n === 1 ? '1 fragmento' : `${n} fragmentos`)

/**
 * El aviso a su autor cuando se decide su queja —una persona, o la revisión
 * automática al publicarla—. Texto plano, sin Markdown. `recortes` son los
 * fragmentos que la revisión automática le quitó: su texto cambió, y se le dice.
 */
export function avisoAlAutor(
  id: string,
  hasta: Moderacion,
  o: { recortes?: number } = {},
): string | null {
  const recortes = o.recortes
    ? `\n\nAntes de publicarla, la revisión automática le quitó ${fragmentos(o.recortes)} con ` +
      'datos de otras personas; en su lugar pone «[dato personal retirado]».'
    : ''
  switch (hasta) {
    case 'publicada':
      return (
        `✅ Tu queja ${id} ha pasado la revisión y ya es pública. La web la muestra en su ` +
        `próxima actualización.${recortes}\n\nPara que otros vecinos la apoyen, que envíen /apoyar_${atajo(id)}`
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

/**
 * Las decisiones que llevan aviso a su autor, leídas de `avisoAlAutor`: la
 * pasada que busca los avisos que faltan no mira las demás, y no hay una lista
 * a mano que pueda quedarse atrás.
 */
export const DECISIONES_CON_AVISO: readonly Moderacion[] = MODERACIONES.filter(
  (m) => avisoAlAutor('Q-0', m) !== null,
)
