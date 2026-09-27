/**
 * Texto para un mensaje de Telegram con `parse_mode: 'HTML'`.
 *
 * Los avisos a los administradores iban en el Markdown antiguo de Telegram, con
 * títulos ajenos a pelo —de GitHub, o escritos por un vecino—, y ese Markdown no
 * tiene escape: un `_` o un `*` sin cerrar hace que Telegram rechace el mensaje
 * ENTERO («can't parse entities»). Una PR llamada «… (secret_token)» bastaba para
 * que el aviso no llegara. En HTML sólo hay tres caracteres que escapar, y
 * escaparlos siempre funciona (https://core.telegram.org/bots/api#html-style).
 *
 * Todo lo que no escribimos nosotros pasa por aquí antes de ir a un mensaje.
 */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
