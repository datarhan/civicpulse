import type { Bot } from 'grammy'
import type { MyContext } from '../types.ts'

const WELCOME =
  `👋 *Bienvenido a CivicPulse · Riba-roja*

Soy el canal directo entre vecinos y Ayuntamiento. Con este bot puedes:

• /queja — Presentar una nueva queja (categoría, foto, ubicación)
• /apoyar Q-XXXX — Apoyar una queja existente (+1 apoyo vecinal)
• /estado Q-XXXX — Ver el estado de una queja
• /mis — Tus quejas
• /olvidar Q-XXXX — Eliminar una queja tuya (derecho al olvido, RGPD art. 17)
• /subscribe barrio X — Resumen semanal por barrio, concejalía o categoría
• /subscriptions — Ver tus suscripciones activas

*Cómo funciona*

1. Presentas tu queja con /queja
2. Tus vecinos la apoyan 👍 (a 10 apoyos entra al lote oficial)
3. Cada lunes enviamos el lote al Registro Electrónico del Ayuntamiento
4. El Ayuntamiento tiene *3 meses* (1 mes si es transparencia) para responder
5. Si no responde, escalamos al *Síndic de Greuges de la Comunitat Valenciana*

*Privacidad y datos*

Al presentar una queja aceptas que el texto, categoría y barrio aproximado se ` +
  `publiquen en nuestro [dashboard](https://civicpulse.es/quejas) ` +
  `(nunca tu nombre, usuario de Telegram ni coordenadas exactas). Base jurídica: ` +
  `Art. 6.1.e RGPD (misión en interés público). Conservación: 5 años. Puedes ` +
  `ejercer tu derecho al olvido en cualquier momento con /olvidar.

📊 Dashboard público: https://civicpulse.es/quejas
📜 [Aviso legal](https://civicpulse.es/aviso-legal) · [Metodología](https://civicpulse.es/metodologia)
`

export function registerStart(bot: Bot<MyContext>) {
  bot.command(['start', 'help'], async (ctx) => {
    await ctx.reply(WELCOME, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    })
  })
}
