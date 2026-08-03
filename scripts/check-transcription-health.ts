#!/usr/bin/env tsx
/**
 * check:transcription-health — is the transcription backlog still moving, and
 * if not, WHY? Alerts the Telegram admin with the actual cause.
 *
 * The failure this exists for: transcription is OpenAI-only (whisper has no
 * fallback since 2026-07-07), and when the account runs out of credit every
 * call 429s. Nothing else changes — new plenos keep appearing on /plenos, their
 * Declaraciones and Hallazgos tabs just stay empty forever. The pipeline logs a
 * failure into a file nobody reads. There is no symptom a person would notice
 * until they went looking.
 *
 * So the alert must name the cause, not report that "something failed". A
 * message saying "transcription stalled" sends you digging; one saying "OpenAI
 * has no credit, add funds at <url>" is actionable from a phone.
 *
 * Deliberately quiet when healthy, and it does NOT re-alert the same problem
 * every run — a monitor that cries every two days gets muted, and then it is
 * worth nothing. It re-states an unchanged problem at most once a week.
 *
 *   npm run check:transcription-health
 *   npm run check:transcription-health -- --dry-run   # diagnose, never send
 *   npm run check:transcription-health -- --force     # send even if unchanged
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeBacklog, shouldNotify } from '../src/scraper/transcription-health'

const STATE = resolve('.transcription-health-state.json')
const TRANSCRIPTS = resolve('public/data/pleno-transcripts')
const PLENOS = resolve('public/data/plenos.json')
const VIDEOS = resolve('public/data/pleno-videos.json')

/** No transcript in this long, with work outstanding, counts as stalled.
 *  Overridable so the alert path itself can be exercised without waiting three
 *  days for a real stall — an alerting system nobody has ever seen fire is an
 *  alerting system nobody knows works. */
const STALL_DAYS = Number(process.env.TRANSCRIPTION_STALL_DAYS ?? 3)
/** Do not repeat an unchanged alert more often than this. */
const RENOTIFY_DAYS = 7

interface State {
  lastCause?: string
  lastNotifiedAt?: string
  lastRemaining?: number
}

function loadState(): State {
  if (!existsSync(STATE)) return {}
  try {
    return JSON.parse(readFileSync(STATE, 'utf8')) as State
  } catch {
    return {}
  }
}

function envFromBotDotenv(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  const p = resolve('bot/.env')
  if (!existsSync(p)) return undefined
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = new RegExp(`^${key}=(.*)$`).exec(line.trim())
    if (m) return m[1]
  }
  return undefined
}

/** Ask OpenAI a question that COSTS money — the free endpoints answer fine with
 *  an empty balance, which is exactly why this goes unnoticed. */
async function diagnoseOpenAI(): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return 'OPENAI_API_KEY no está en el entorno del proceso de transcripción.'
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: 'x' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (r.ok) return null
    const body = (await r.json().catch(() => ({}))) as {
      error?: { code?: string; type?: string; message?: string }
    }
    const code = body.error?.code ?? ''
    const type = body.error?.type ?? ''
    if (code === 'credit_balance_exhausted' || type === 'insufficient_quota') {
      return 'OpenAI se ha quedado sin saldo. Añade fondos en https://platform.openai.com/settings/organization/billing/ — la transcripción no tiene alternativa configurada, así que está parada hasta entonces.'
    }
    if (r.status === 401) return 'La clave de OpenAI ya no es válida (401).'
    return `OpenAI responde ${r.status}: ${body.error?.message ?? '(sin mensaje)'}`
  } catch (err) {
    return `No se puede contactar con OpenAI: ${err instanceof Error ? err.message : String(err)}`
  }
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = envFromBotDotenv('BOT_TOKEN')
  const admins = (envFromBotDotenv('ADMIN_USER_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!token || admins.length === 0) {
    process.stderr.write(
      '[transcription-health] sin BOT_TOKEN/ADMIN_USER_IDS — no se puede avisar\n',
    )
    return false
  }
  let ok = false
  for (const chatId of admins) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(20_000),
      })
      if (r.ok) ok = true
      else process.stderr.write(`[transcription-health] telegram ${r.status} para ${chatId}\n`)
    } catch (err) {
      process.stderr.write(`[transcription-health] telegram falló: ${String(err).slice(0, 100)}\n`)
    }
  }
  return ok
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  const plenos = JSON.parse(readFileSync(PLENOS, 'utf8')).items as { id: string; date: string }[]
  const done = new Set(
    existsSync(TRANSCRIPTS)
      ? readdirSync(TRANSCRIPTS)
          .filter((f) => f.endsWith('.txt'))
          .map((f) => f.replace(/\.txt$/, ''))
      : [],
  )
  // Only sessions with a video can ever be transcribed; counting the rest as
  // "pending" would keep the alarm on forever over work that cannot be done.
  //
  // But the video index LAGS — it currently lists fewer sessions than we have
  // transcripts for. Treating it as the universe produced "44/24 transcritas",
  // an impossible figure, and a monitor that prints impossible numbers is one
  // nobody believes when it finally reports something real. So the universe is
  // "has a video OR already has a transcript", and the denominator is only ever
  // that set.
  const videoDates: string[] | null = existsSync(VIDEOS)
    ? ((JSON.parse(readFileSync(VIDEOS, 'utf8')).items ?? []) as { plenoDate: string }[]).map(
        (v) => v.plenoDate,
      )
    : null

  const newestMs = [...done]
    .map((id) => {
      try {
        return statSync(resolve(TRANSCRIPTS, `${id}.txt`)).mtimeMs
      } catch {
        return 0
      }
    })
    .reduce((a, b) => Math.max(a, b), 0)

  const backlog = computeBacklog({
    plenos,
    transcribedIds: [...done],
    videoDates,
    newestTranscriptMs: newestMs,
    nowMs: Date.now(),
  })
  const { remaining, daysSinceNewest: daysSince } = backlog
  const doneCount = backlog.done.length
  const transcribable = backlog.transcribable

  process.stdout.write(
    `[transcription-health] ${doneCount}/${transcribable.length} transcritas ` +
      `(${backlog.totalSessions} sesiones en total, ${backlog.withoutVideo} sin vídeo conocido) · ` +
      `${remaining.length} pendientes · última hace ${daysSince === Infinity ? '—' : daysSince.toFixed(1)} días\n`,
  )

  if (remaining.length === 0) {
    process.stdout.write('[transcription-health] ✓ backlog completo — nada que avisar\n')
    writeFileSync(STATE, JSON.stringify({ lastRemaining: 0 }, null, 2) + '\n')
    return
  }
  if (daysSince < STALL_DAYS) {
    process.stdout.write(
      `[transcription-health] ✓ progresando (última hace <${STALL_DAYS} días) — nada que avisar\n`,
    )
    return
  }

  const cause =
    (await diagnoseOpenAI()) ??
    'La transcripción lleva días sin avanzar y OpenAI responde con normalidad, así que la causa está en otro sitio: revisa yt-dlp, el índice de vídeos o el log del cron.'

  const state = loadState()
  const decision = shouldNotify({
    state,
    cause,
    nowMs: Date.now(),
    force,
    renotifyDays: RENOTIFY_DAYS,
  })

  const msg =
    `⚠️ <b>Transcripción parada</b>\n\n` +
    `${doneCount} de ${transcribable.length} sesiones transcribibles · ` +
    `<b>${remaining.length} pendientes</b>\n` +
    `Sin avance desde hace ${daysSince.toFixed(1)} días.\n\n` +
    `<b>Causa:</b> ${cause}\n\n` +
    `<i>Mientras siga parada, los plenos nuevos aparecen en /plenos pero sus pestañas ` +
    `de Declaraciones y Hallazgos se quedan vacías.</i>`

  process.stdout.write(`\n${msg.replace(/<[^>]+>/g, '')}\n\n`)

  if (dryRun) {
    process.stdout.write('[transcription-health] --dry-run: no se envía nada\n')
    process.exitCode = 1
    return
  }
  if (!decision.notify) {
    process.stdout.write(`[transcription-health] ${decision.reason} — no se repite el aviso\n`)
    process.exitCode = 1
    return
  }

  const sent = await sendTelegram(msg)
  writeFileSync(
    STATE,
    JSON.stringify(
      {
        lastCause: cause,
        lastNotifiedAt: sent ? new Date().toISOString() : state.lastNotifiedAt,
        lastRemaining: remaining.length,
      },
      null,
      2,
    ) + '\n',
  )
  process.stdout.write(
    sent
      ? '[transcription-health] aviso enviado al admin de Telegram\n'
      : '[transcription-health] NO se pudo enviar el aviso\n',
  )
  process.exitCode = 1
}

main().catch((err) => {
  process.stderr.write(
    `[transcription-health] FATAL: ${err instanceof Error ? err.message : err}\n`,
  )
  process.exit(1)
})
