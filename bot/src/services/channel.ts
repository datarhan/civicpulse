/**
 * Channel broadcaster — pushes state-transition notifications to the
 * public Telegram channel (CHANNEL_ID env var). No-op when CHANNEL_ID
 * is missing so dev mode works without a channel.
 *
 * All copy is factual; no editorial adjectives. Keep it that way.
 */

import type { Bot } from 'grammy'
import type { MyContext } from '../types.ts'
import type { QuejaRow } from '../db/queries.ts'
import type { QuejaRouting } from '../../../src/scraper/queja-router.ts'
import { isLoregFrozen } from './freeze.ts'

function formatNeighborhood(slug: string | null | undefined): string {
  if (!slug) return 'Riba-roja'
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL || 'https://civicpulse.es'
}

export interface Channel {
  postNuevaQueja(q: QuejaRow, routing: QuejaRouting): Promise<void>
  postApoyoMilestone(q: QuejaRow, apoyos: number): Promise<void>
  postRegistrada(q: QuejaRow): Promise<void>
  postResuelta(q: QuejaRow, daysToResolve: number): Promise<void>
  postSilencio(q: QuejaRow): Promise<void>
  postEscaladaSindic(q: QuejaRow): Promise<void>
}

class NoopChannel implements Channel {
  async postNuevaQueja() {}
  async postApoyoMilestone() {}
  async postRegistrada() {}
  async postResuelta() {}
  async postSilencio() {}
  async postEscaladaSindic() {}
}

class TelegramChannel implements Channel {
  constructor(
    private bot: Bot<MyContext>,
    private chatId: string,
  ) {}

  private async send(text: string) {
    // LOREG art. 50 — during the electoral freeze window all institutional
    // broadcasts pause. Exception: already-active legal deadlines continue
    // to be tracked internally; only the public channel stays quiet.
    if (isLoregFrozen()) {
      console.log('[channel] suppressed (LOREG freeze active):', text.slice(0, 60) + '…')
      return
    }
    try {
      await this.bot.api.sendMessage(this.chatId, text, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      })
    } catch (err) {
      console.error('[channel] send failed:', err)
    }
  }

  async postNuevaQueja(q: QuejaRow, routing: QuejaRouting) {
    const responsible = routing.concejalia.responsible
    const plazo = routing.timeLimits.find((t) => t.kind === 'resolucion')?.days ?? 90
    const lines = [
      `🆕 *NUEVA QUEJA* · \`${q.id}\``,
      `*${q.title}*`,
      '',
      `📍 ${formatNeighborhood(q.neighborhood)} · 🏛 ${routing.concejalia.area}`,
      responsible ? `👤 Responsable: ${responsible.name} (${responsible.party})` : '',
      `⏱ Plazo legal: ${plazo} días (silencio ${routing.silencio})`,
      `📜 ${routing.legalBasis[0]?.law} ${routing.legalBasis[0]?.article}`,
      '',
      `Apoyar: escribe /apoyar\\_${q.id.replace('Q-', '').toLowerCase()} al bot`,
      `Detalle: ${publicBaseUrl()}/quejas/${q.id.toLowerCase()}`,
    ].filter(Boolean)
    await this.send(lines.join('\n'))
  }

  async postApoyoMilestone(q: QuejaRow, apoyos: number) {
    await this.send(
      [
        `👥 *VERIFICADA POR LA COMUNIDAD* · \`${q.id}\``,
        `*${q.title}*`,
        '',
        `${apoyos} apoyos vecinales — entra en el próximo lote semanal al Registro Electrónico.`,
      ].join('\n'),
    )
  }

  async postRegistrada(q: QuejaRow) {
    await this.send(
      [
        `🗃 *REGISTRADA EN SEDE* · \`${q.id}\``,
        `*${q.title}*`,
        '',
        q.registro_entry_number ? `Nº asiento: \`${q.registro_entry_number}\`` : '',
        q.registro_csv ? `CSV: \`${q.registro_csv}\`` : '',
        '⏱ El reloj legal ha empezado. 3 meses hasta silencio administrativo.',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  async postResuelta(q: QuejaRow, days: number) {
    await this.send(
      [
        `✅ *RESUELTA* · \`${q.id}\``,
        `*${q.title}*`,
        '',
        `⏱ ${days} días desde registro · 🏛 ${q.concejalia_area ?? 'Ayuntamiento'}`,
      ].join('\n'),
    )
  }

  async postSilencio(q: QuejaRow) {
    await this.send(
      [
        `⚠️ *SILENCIO ADMINISTRATIVO* · \`${q.id}\``,
        `*${q.title}*`,
        '',
        '90 días desde el registro sin respuesta expresa. Silencio negativo (art. 24 LPACAP).',
        'Escalamos al Síndic de Greuges de la Comunitat Valenciana.',
      ].join('\n'),
    )
  }

  async postEscaladaSindic(q: QuejaRow) {
    await this.send(
      [
        `⚖️ *ESCALADA AL SÍNDIC* · \`${q.id}\``,
        `*${q.title}*`,
        '',
        'Queja remitida al Síndic de Greuges CV (https://www.elsindic.com).',
        'Sus resoluciones son públicas y tienen autoridad estatutaria.',
      ].join('\n'),
    )
  }
}

export function makeChannel(bot: Bot<MyContext>): Channel {
  const chatId = process.env.CHANNEL_ID
  if (!chatId) {
    console.log('[channel] CHANNEL_ID not set — broadcasts disabled (dev mode)')
    return new NoopChannel()
  }
  console.log(`[channel] broadcasting to ${chatId}`)
  return new TelegramChannel(bot, chatId)
}
