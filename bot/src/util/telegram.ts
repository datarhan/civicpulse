/**
 * Mensajes a los administradores que caben en Telegram.
 *
 * Telegram rechaza un mensaje de más de 4096 caracteres ENTERO, y quien lo manda
 * no se entera más que por el error. Dos avisos lo sufrían: el del repositorio
 * (un lote de eventos) y el de fotos retenidas, que crece justo en la caída larga
 * para la que existe. Los dos parten aquí.
 */

/** Lo más largo que se manda. Telegram corta en 4096; se mide el HTML, con margen. */
export const MAX_MENSAJE = 4000

/**
 * Corta a `n` unidades como mucho sin partir un carácter en dos (un emoji son
 * dos) ni dejar una entidad HTML a medias. Un sustituto suelto o un `&am` pueden
 * hacer que Telegram rechace el mensaje entero.
 */
export function cortar(texto: string, n: number): string {
  if (texto.length <= n) return texto
  let out = ''
  for (const c of texto) {
    if (out.length + c.length > n) break
    out += c
  }
  return out.replace(/&[#a-z0-9]*$/i, '').replace(/<[^>]*$/, '')
}

/**
 * Parte bloques en mensajes que caben, con la cabecera delante de cada uno y sin
 * partir ningún bloque. Cada trozo lleva los ids de sus bloques, para dar por
 * enviado sólo lo que llegó.
 */
export function trocear<T>(
  cabecera: string,
  bloques: Array<{ texto: string; id: T }>,
  max = MAX_MENSAJE,
): Array<{ texto: string; ids: T[] }> {
  const cabe = max - cabecera.length - 2
  const trozos: Array<{ texto: string; ids: T[] }> = []
  let actual: { texto: string; ids: T[] } | null = null
  for (const b of bloques) {
    const texto = cortar(b.texto, cabe)
    if (actual && actual.texto.length + 2 + texto.length <= max) {
      actual.texto += `\n\n${texto}`
      actual.ids.push(b.id)
    } else {
      actual = { texto: `${cabecera}\n\n${texto}`, ids: [b.id] }
      trozos.push(actual)
    }
  }
  return trozos
}
