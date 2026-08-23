#!/usr/bin/env tsx
/**
 * monitor-health — gather the signals, decide with `health-monitor`, push a
 * single Telegram digest when something needs a person today.
 *
 * One monitor rather than one per subsystem, deliberately. Five separate
 * alerters produce five notifications for one bad night, and the second time
 * that happens they all get muted together.
 *
 *   npm run monitor:health                # alert if something is wrong
 *   npm run monitor:health -- --dry-run   # print, never send
 *   npm run monitor:health -- --force     # send even if unchanged
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  evaluateHealth,
  alertFingerprint,
  formatAlerts,
  pickCheckDiagnosis,
  type Observations,
} from '../src/scraper/health-monitor'

const STATE = resolve('.health-monitor-state.json')
const DATA = resolve('public/data')
const RENOTIFY_DAYS = 3

function readJson(p: string): any {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function botEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key]
  const p = resolve('bot/.env')
  if (!existsSync(p)) return undefined
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = new RegExp(`^${key}=(.*)$`).exec(line.trim())
    if (m) return m[1]
  }
  return undefined
}

async function reachable(url: string): Promise<boolean | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' })
    return r.ok
  } catch {
    return false
  }
}

/** Newest mtime among files in a directory — "when did this last make progress". */
function newestMtime(dir: string, suffix = '.txt'): Date | null {
  if (!existsSync(dir)) return null
  let ms = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(suffix)) continue
    try {
      ms = Math.max(ms, statSync(resolve(dir, f)).mtimeMs)
    } catch {
      /* ignore */
    }
  }
  return ms ? new Date(ms) : null
}

function newestItem(file: string, pick: (x: any) => string | undefined): Date | null {
  const j = readJson(resolve(DATA, file))
  const arr = j?.items ?? j?.rows ?? []
  if (!Array.isArray(arr) || arr.length === 0) return null
  const ts = arr
    .map(pick)
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter(Number.isFinite)
  return ts.length ? new Date(Math.max(...ts)) : null
}

function nightlyFailStreak(): number {
  try {
    const out = execFileSync(
      'gh',
      ['run', 'list', '--workflow=nightly-scrape.yml', '--limit', '8', '--json', 'conclusion'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const runs = JSON.parse(out) as { conclusion: string }[]
    let n = 0
    for (const r of runs) {
      if (r.conclusion === 'failure') n++
      else break
    }
    return n
  } catch {
    return 0 // gh unavailable — do not invent a streak
  }
}

function runCheck(script: string): string | null {
  try {
    execFileSync('npm', ['run', '--silent', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return null
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string }
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
    // Prefiere el renglón que dice QUÉ falló sobre el que dice CUÁNTOS fallos
    // hubo. Ver `pickCheckDiagnosis`: quedarse con la cola mandaba al móvil
    // «5 run(s) · 4 error(s)» y dejaba el diagnóstico en el log.
    return pickCheckDiagnosis(out)
  }
}

async function diagnoseOpenAI(): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: 'x' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (r.ok) return null
    const b = (await r.json().catch(() => ({}))) as { error?: { code?: string; type?: string } }
    if (b.error?.code === 'credit_balance_exhausted' || b.error?.type === 'insufficient_quota') {
      return 'OpenAI sin saldo — añade fondos en https://platform.openai.com/settings/organization/billing/'
    }
    return `OpenAI responde ${r.status}`
  } catch {
    return null
  }
}

async function gather(): Promise<Observations> {
  const plenos = readJson(resolve(DATA, 'plenos.json'))?.items ?? []
  const transcripts = new Set(
    existsSync(resolve(DATA, 'pleno-transcripts'))
      ? readdirSync(resolve(DATA, 'pleno-transcripts'))
          .filter((f) => f.endsWith('.txt'))
          .map((f) => f.replace(/\.txt$/, ''))
      : [],
  )
  const claims = readJson(resolve(DATA, 'pleno-claims-suggestions.json'))?.items ?? []
  const extracted = new Set(claims.map((c: { plenoId: string }) => c.plenoId))

  const videos = readJson(resolve(DATA, 'pleno-videos.json'))?.items ?? []
  const videoDates = new Set(videos.map((v: { plenoDate: string }) => v.plenoDate))
  const transcribable = plenos
    .filter((p: { id: string; date: string }) => videoDates.has(p.date) || transcripts.has(p.id))
    .map((p: { id: string }) => p.id)

  const openaiCause = await diagnoseOpenAI()

  const integrity: { check: string; message: string }[] = []
  // `check:runs` is here because everything else on this screen measures how
  // FRESH the data looks, and on 2026-08-11 that was the difference between
  // «✓ sin avisos» and nine days with no LLM work at all: the deterministic
  // scrapers kept every source young while the nightly extraction had been
  // dead since 08-03. Source freshness cannot see a pass that never ran; only
  // the run manifests can.
  // `check:queues` for the sibling reason: a worklist that still names
  // withdrawn findings overstates the backlog, and a backlog nobody trusts is
  // a backlog nobody works. Reports; the fix is re-running the triage pass.
  // `check:surfaces` cierra el hueco que los otros cuatro no pueden ver: ellos
  // comprueban que el DATO cuadre, y los cuatro defectos corregidos el
  // 2026-08-12 tenían el dato bien y la frase mal. La lectura la hace el
  // barrido nocturno (scripts/review-sweep.sh); esto sólo comprueba que esté
  // ocurriendo y que lo encontrado no lleve días sin arreglar. Es barato: mira
  // la caché, no llama a ningún modelo.
  // Las tres de eficiencia entran por un motivo distinto del de las anteriores:
  // no es que nadie las ejecutara —el nocturno sí lo hacía— sino que su
  // veredicto moría en un log. Iban a `soft_failures`, que imprime una línea y
  // deja la pasada saliendo 0 bajo «all critical scrapers succeeded», y esta
  // pantalla no las miraba. El desenlace que existen para detectar es una ficha
  // FIRMADA sobre gasto municipal cuya fuente ya no la sostiene: eso no puede
  // depender de que alguien lea la salida del nocturno.
  //   · check:eficiencia-findings — la cifra congelada ya no coincide con el panel
  //   · check:indicadores          — una cifra publicada sin celda que la respalde
  //   · check:dea                  — la frontera no se reproduce, o nombra a un tercero
  //   · check:coste-esperado       — la recta no se reproduce, o nombra a un tercero
  // `check:cadence` entra por el mismo motivo que `check:runs`: la frescura de
  // un fichero no dice si su pasada corrió, y la pasada no dice si el fichero
  // envejece dentro de SU presupuesto. Existía con presupuestos por fichero y
  // no lo invocaba nadie, así que `pmp.json` —trimestral, y debajo de una ficha
  // firmada— podía quedarse quieto para siempre sin que ninguna pantalla lo
  // dijera.
  for (const c of [
    'check:json',
    'check:relations',
    'check:runs',
    'check:queues',
    'check:surfaces',
    'check:cadence',
    'check:indicadores',
    'check:eficiencia-findings',
    'check:dea',
    'check:coste-esperado',
  ]) {
    const msg = runCheck(c)
    if (msg) integrity.push({ check: c, message: msg })
  }

  return {
    now: new Date(),
    pipelines: [
      {
        name: 'Transcripción',
        lastProgressAt: newestMtime(resolve(DATA, 'pleno-transcripts')),
        pending: transcribable.filter((id: string) => !transcripts.has(id)).length,
        stallDays: 3,
        cause: openaiCause,
      },
      {
        name: 'Extracción de claims',
        // Progress = the suggestions snapshot being rewritten.
        lastProgressAt: existsSync(resolve(DATA, 'pleno-claims-suggestions.json'))
          ? new Date(statSync(resolve(DATA, 'pleno-claims-suggestions.json')).mtimeMs)
          : null,
        pending: [...transcripts].filter((id) => !extracted.has(id)).length,
        stallDays: 2,
        cause: null,
      },
    ],
    botHealthy: await reachable(
      `${(botEnv('BOT_BASE_URL') ?? 'https://munigraph-ribarroja.fly.dev').replace(/\/$/, '')}/health`,
    ),
    siteHealthy: await reachable('https://civicpulse.es'),
    sources: [
      {
        name: 'Prensa',
        newestItemAt: newestItem('press.json', (x) => x.publishedAt ?? x.date),
        expectDays: 5,
      },
      {
        name: 'Empleo',
        newestItemAt: newestItem('empleo.json', (x) => x.publishedAt ?? x.date),
        expectDays: 10,
      },
    ],
    nightlyFailStreak: nightlyFailStreak(),
    integrity,
  }
}

async function send(text: string): Promise<boolean> {
  const token = botEnv('BOT_TOKEN')
  const admins = (botEnv('ADMIN_USER_IDS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!token || admins.length === 0) return false
  let ok = false
  for (const id of admins) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: id, text, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(20_000),
      })
      if (r.ok) ok = true
    } catch {
      /* reported by the caller */
    }
  }
  return ok
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  const observations = await gather()
  if (process.argv.includes('--explain')) {
    // "No alerts" and "the collector silently gathered nothing" look identical
    // from the outside — the exact ambiguity this whole monitor exists to kill.
    // So the observations are always inspectable.
    const o = observations
    process.stdout.write('[monitor-health] observaciones:\n')
    for (const p of o.pipelines) {
      process.stdout.write(
        `  pipeline ${p.name.padEnd(22)} pendientes=${String(p.pending).padStart(3)} · ` +
          `último avance ${p.lastProgressAt ? p.lastProgressAt.toISOString().slice(0, 16) : 'nunca'} · ` +
          `umbral ${p.stallDays}d${p.cause ? ` · causa: ${p.cause.slice(0, 60)}` : ''}\n`,
      )
    }
    process.stdout.write(
      `  bot=${o.botHealthy} · web=${o.siteHealthy} · nocturnas-en-rojo=${o.nightlyFailStreak}\n`,
    )
    for (const s2 of o.sources) {
      const d = s2.newestItemAt ? (Date.now() - s2.newestItemAt.getTime()) / 86400000 : null
      process.stdout.write(
        `  fuente   ${s2.name.padEnd(22)} más reciente ${s2.newestItemAt ? s2.newestItemAt.toISOString().slice(0, 10) : '—'}` +
          `${d !== null ? ` (${d.toFixed(1)}d)` : ''} · se espera cada ${s2.expectDays}d\n`,
      )
    }
    process.stdout.write(
      `  integridad: ${o.integrity.length ? o.integrity.map((i) => i.check).join(', ') : 'sin fallos'}\n\n`,
    )
  }
  const alerts = evaluateHealth(observations)
  if (alerts.length === 0) {
    process.stdout.write('[monitor-health] ✓ sin avisos\n')
    writeFileSync(STATE, JSON.stringify({ fingerprint: '', at: new Date().toISOString() }) + '\n')
    return
  }

  const text = formatAlerts(alerts)
  process.stdout.write(`\n${text.replace(/<[^>]+>/g, '')}\n\n`)

  const fp = alertFingerprint(alerts)
  const prev = readJson(STATE) ?? {}
  const ageDays = prev.at ? (Date.now() - new Date(prev.at).getTime()) / 86_400_000 : Infinity
  const shouldSend = force || prev.fingerprint !== fp || ageDays >= RENOTIFY_DAYS

  if (dryRun) {
    process.stdout.write('[monitor-health] --dry-run: no se envía\n')
    process.exitCode = 1
    return
  }
  if (!shouldSend) {
    process.stdout.write(
      `[monitor-health] mismos avisos que hace ${ageDays.toFixed(1)} días — no se repite\n`,
    )
    process.exitCode = 1
    return
  }
  const sent = await send(text)
  writeFileSync(
    STATE,
    JSON.stringify({ fingerprint: fp, at: sent ? new Date().toISOString() : prev.at }) + '\n',
  )
  process.stdout.write(sent ? '[monitor-health] aviso enviado\n' : '[monitor-health] NO enviado\n')
  process.exitCode = 1
}

main().catch((err) => {
  process.stderr.write(`[monitor-health] FATAL: ${err instanceof Error ? err.message : err}\n`)
  process.exit(2)
})
