/**
 * La revisión automática de una queja antes de publicarla.
 *
 * Desde #137 ninguna queja sale sin que un administrador la decida. Con esto, un
 * modelo la lee antes, sobre el texto que ya limpió services/pii.ts, y puede
 * hacer dos cosas: señalar los fragmentos EXACTOS que nombran a un particular
 * —que se quitan del texto guardado, como hace pii.ts: lo quitado no se guarda
 * en el bot— y decir por qué motivos, de una lista cerrada
 * (services/moderacion-criterios.ts), tiene que verla una persona. No reescribe
 * nada.
 *
 * El código decide lo demás. Una respuesta que no se sostiene —un fragmento que
 * no está en el texto, un motivo que no existe, un campo que falta— no se
 * arregla ni se completa: la revisión es `invalida` y se reintenta, igual que un
 * error. Una queja sin motivos se publica sola sólo si `decideAutomation`
 * (src/scraper/automation-policy.ts) lo permite con lo medido; si no, la decide
 * una persona, que la tiene ya en su tarjeta. En periodo electoral no se publica
 * ninguna sin una persona.
 */
import { MARCA_RETIRADO } from './pii.ts'
import {
  ESPERAS_REINTENTO_MIN,
  MAX_RECORTE,
  MOTIVOS_DEL_MODELO,
  pideInstrucciones,
  type MotivoRetencion,
} from './moderacion-criterios.ts'

/** El texto de una queja, como se guarda y como se publica. */
export interface TextoQueja {
  titulo: string
  detalle: string
}

/** Una revisión con respuesta que se sostiene: lo que dijo, y el texto como queda. */
export interface RevisionValida {
  resultado: 'limpia' | 'marcada'
  motivos: MotivoRetencion[]
  /** Cuántos fragmentos se quitaron del texto. */
  retirados: number
  texto: TextoQueja
}

/** Una revisión que no dio respuesta que se sostenga: se reintenta. */
export interface RevisionFallida {
  resultado: 'invalida' | 'error'
  /** Un código corto; nunca el texto de la queja ni el cuerpo de una respuesta. */
  error: string
}

export type Revision = RevisionValida | RevisionFallida

const esMotivoDelModelo = (m: unknown): m is (typeof MOTIVOS_DEL_MODELO)[number] =>
  typeof m === 'string' && (MOTIVOS_DEL_MODELO as readonly string[]).includes(m)

const invalida = (error: string): RevisionFallida => ({ resultado: 'invalida', error })

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Las apariciones SUELTAS de un fragmento: «Ana», no dentro de «Mariana». */
const suelto = (fragmento: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapar(fragmento)}(?![\\p{L}\\p{N}])`, 'gu')

/**
 * Quita las apariciones sueltas de un fragmento, sin tocar las marcas que ya
 * había: se trabaja entre ellas. Devuelve el texto y cuántas quitó.
 */
function quitar(texto: string, fragmento: string): { texto: string; veces: number } {
  let veces = 0
  const partes = texto.split(MARCA_RETIRADO).map((p) =>
    p.replace(suelto(fragmento), () => {
      veces += 1
      return MARCA_RETIRADO
    }),
  )
  return { texto: partes.join(MARCA_RETIRADO), veces }
}

const aparece = (texto: TextoQueja, fragmento: string) =>
  [texto.titulo, texto.detalle].some((t) =>
    t.split(MARCA_RETIRADO).some((p) => suelto(fragmento).test(p)),
  )

/**
 * Lo que dijo el modelo —el texto JSON de su respuesta—, contra el texto que se
 * le mandó. Pura: sin red y sin base.
 */
export function interpretarRevision(crudo: string, texto: TextoQueja): Revision {
  let r: unknown
  try {
    r = JSON.parse(crudo)
  } catch {
    return invalida('json')
  }
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return invalida('forma')
  const { retirar, motivos } = r as { retirar?: unknown; motivos?: unknown }
  // Un campo que falta no es una lista vacía (regla 3 de docs/DATA_INTEGRITY.md).
  if (!Array.isArray(retirar) || !retirar.every((f) => typeof f === 'string')) {
    return invalida('sin-retirar')
  }
  if (!Array.isArray(motivos)) return invalida('sin-motivos')
  if (!motivos.every(esMotivoDelModelo)) return invalida('motivo-desconocido')

  const fragmentos = [...new Set(retirar.map((f) => f.normalize('NFC').trim()))]
  if (fragmentos.some((f) => f.length < 2)) return invalida('fragmento-vacio')
  // Todos tienen que estar en el texto que se mandó; se quitan de más largo a más
  // corto, y el que otro más largo ya se llevó («Paco» en «Paco García») cuenta.
  if (!fragmentos.every((f) => aparece(texto, f))) return invalida('fragmento-ausente')

  let { titulo, detalle } = texto
  let retirados = 0
  let quitados = 0
  for (const f of [...fragmentos].sort((a, b) => b.length - a.length)) {
    const t = quitar(titulo, f)
    const d = quitar(detalle, f)
    titulo = t.texto
    detalle = d.texto
    retirados += t.veces + d.veces
    quitados += f.length * (t.veces + d.veces)
  }

  const razones: MotivoRetencion[] = [...new Set(motivos)]
  if (quitados / Math.max(1, texto.titulo.length + texto.detalle.length) > MAX_RECORTE) {
    razones.push('recorte-excesivo')
  }
  if (
    !razones.includes('instrucciones') &&
    pideInstrucciones(`${texto.titulo}\n${texto.detalle}`)
  ) {
    razones.push('instrucciones')
  }
  return {
    resultado: razones.length > 0 ? 'marcada' : 'limpia',
    motivos: razones,
    retirados,
    texto: { titulo, detalle },
  }
}

/** Lo que pasa con una queja tras una revisión válida. */
export type DecisionRevision =
  | { hasta: 'publicada' }
  | { hasta: 'retenida'; motivos: MotivoRetencion[] }
  /** Sin motivos, pero la publicación automática no está permitida: la decide una persona. */
  | { hasta: 'pendiente'; razon: string }

/**
 * La política, pura. Con motivos, o en periodo electoral, la queja se retiene
 * para una persona. Sin motivos, se publica sólo si la publicación automática
 * está permitida (`decideAutomation` con la clase de moderacion-criterios.ts).
 */
export function decidirTrasRevision(
  r: RevisionValida,
  o: { congelado: boolean; automatizacion: { allow: boolean; reason: string } },
): DecisionRevision {
  const motivos: MotivoRetencion[] = o.congelado ? [...r.motivos, 'periodo-electoral'] : r.motivos
  if (motivos.length > 0) return { hasta: 'retenida', motivos }
  if (!o.automatizacion.allow) return { hasta: 'pendiente', razon: o.automatizacion.reason }
  return { hasta: 'publicada' }
}

/** Minutos que se espera, tras `fallos` revisiones fallidas seguidas, antes de la siguiente. */
export function esperaTrasFallos(fallos: number): number {
  const i = Math.min(Math.max(fallos, 1), ESPERAS_REINTENTO_MIN.length) - 1
  return ESPERAS_REINTENTO_MIN[i]
}
