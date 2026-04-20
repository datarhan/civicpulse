import type { Bot } from 'grammy'
import type { MyContext } from '../types.ts'

const WELCOME = `👋 *Bienvenido a MuniGraph · Riba-roja*

Soy el canal directo entre vecinos y Ayuntamiento. Con este bot puedes:

• /queja — Presentar una nueva queja (categoría, foto, ubicación)
• /apoyar Q-XXXX — Apoyar una queja existente (+1 apoyo vecinal)
• /estado Q-XXXX — Ver el estado de una queja
• /mis — Tus quejas

*Cómo funciona*

1. Presentas tu queja con /queja
2. Tus vecinos la apoyan 👍 (a 10 apoyos entra al lote oficial)
3. Cada lunes enviamos el lote al Registro Electrónico del Ayuntamiento
4. El Ayuntamiento tiene *3 meses* (1 mes si es transparencia) para responder
5. Si no responde, escalamos al *Síndic de Greuges de la Comunitat Valenciana*

📊 Dashboard público: https://civicpulse-virid.vercel.app/quejas
📜 Metodología: https://civicpulse-virid.vercel.app/metodologia
`

export function registerStart(bot: Bot<MyContext>) {
  bot.command(['start', 'help'], async (ctx) => {
    await ctx.reply(WELCOME, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } })
  })
}
