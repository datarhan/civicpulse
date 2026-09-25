#!/usr/bin/env tsx
/**
 * ops:alarm — la alarma operativa que corre FUERA del portátil.
 *
 *   npm run ops:alarm              # sale 1 si hay algo que hacer hoy
 *   npm run ops:alarm -- --dry-run # imprime y sale 0 siempre
 *
 * La corre `.github/workflows/ops-alarm.yml` una vez al día en un runner de
 * GitHub. No manda nada por su cuenta: sale en ROJO, y un workflow en rojo ya
 * llega a una persona por dos caminos que existen hoy —el sondeo horario del
 * bot en Fly (`bot/src/services/eventos-repo.ts`, «🔴 Workflow FALLIDO») y el
 * correo de GitHub—. Ninguno depende del portátil, que es el punto.
 *
 * Las reglas son las de `monitor:health` (`src/scraper/health-monitor.ts`); lo
 * propio de aquí está en `src/scraper/ops-alarm.ts`.
 *
 * Entorno:
 *   BOT_EXPORT_URL  la variable del repositorio que ya usa `pull-quejas.yml`;
 *                   de ella se deriva el origen del bot (`/health`).
 *   BOT_BASE_URL    alternativa directa, para probar a mano.
 *   SITE_URL        por defecto https://www.civicpulse.es
 *   GH_TOKEN        para `gh run list` (en el workflow, `github.token`).
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { formatAlerts } from '../src/scraper/health-monitor'
import { evaluarAlarma, LATIDO_DEL_PORTATIL, type EntradaAlarma } from '../src/scraper/ops-alarm'
import type { FreshnessRow } from '../src/scraper/snapshot-cadence'

const SITE = (process.env.SITE_URL ?? 'https://www.civicpulse.es').replace(/\/$/, '')
const dryRun = process.argv.includes('--dry-run')

/** `check:cadence --json`. Sale 1 cuando algo está rancio, y el JSON sigue en stdout. */
function cadencia(): FreshnessRow[] | null {
  let out = ''
  try {
    out = execFileSync('npx', ['tsx', 'scripts/check-snapshot-cadence.ts', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    out = String((err as { stdout?: unknown }).stdout ?? '')
  }
  try {
    const filas = JSON.parse(out)
    return Array.isArray(filas) ? (filas as FreshnessRow[]) : null
  } catch {
    return null
  }
}

/** El último commit-latido del portátil en la historia que el runner tiene. */
function ultimoLatido(): Date | null {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--fixed-strings', `--grep=${LATIDO_DEL_PORTATIL}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return out ? new Date(out) : null
  } catch {
    return null
  }
}

function nocturnas(): EntradaAlarma['nocturnas'] {
  try {
    const out = execFileSync(
      'gh',
      [
        'run',
        'list',
        '--workflow=nightly-scrape.yml',
        '--limit',
        '8',
        '--json',
        'conclusion,createdAt',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const runs = JSON.parse(out)
    return Array.isArray(runs) ? runs : null
  } catch {
    return null
  }
}

async function responde(url: string, validar?: (r: Response) => Promise<boolean>) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' })
    if (!r.ok) return false
    return validar ? await validar(r) : true
  } catch {
    return false
  }
}

function baseDelBot(): string | null {
  if (process.env.BOT_BASE_URL) return process.env.BOT_BASE_URL.replace(/\/$/, '')
  const exportUrl = process.env.BOT_EXPORT_URL
  if (!exportUrl) return null
  try {
    return new URL(exportUrl).origin
  } catch {
    return null
  }
}

async function bot(): Promise<EntradaAlarma['bot']> {
  const base = baseDelBot()
  if (!base) return null
  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) return { alcanzable: false }
    const j = (await r.json()) as { status?: unknown; degraded?: unknown }
    return {
      alcanzable: true,
      estado: typeof j.status === 'string' ? j.status : '?',
      degradado: Array.isArray(j.degraded) ? j.degraded.map(String) : [],
    }
  } catch {
    return { alcanzable: false }
  }
}

async function main() {
  const entrada: EntradaAlarma = {
    now: new Date(),
    cadencia: cadencia(),
    ultimoLatido: ultimoLatido(),
    nocturnas: nocturnas(),
    web: {
      portada: await responde(`${SITE}/`),
      datos: await responde(`${SITE}/data/officials.json`, async (r) => {
        try {
          await r.json()
          return true
        } catch {
          return false
        }
      }),
    },
    bot: await bot(),
  }

  const avisos = evaluarAlarma(entrada)
  const resumen =
    `latido del portátil: ${entrada.ultimoLatido?.toISOString() ?? 'ninguno'} · ` +
    `nocturnas: ${entrada.nocturnas === null ? 'sin consultar' : entrada.nocturnas.map((r) => r.conclusion ?? 'en curso').join(',')} · ` +
    `web: ${entrada.web.portada && entrada.web.datos ? 'ok' : 'NO'} · ` +
    `bot: ${entrada.bot === null ? 'sin URL' : entrada.bot.alcanzable ? entrada.bot.estado : 'NO responde'} · ` +
    `cadencia: ${entrada.cadencia === null ? 'sin ejecutar' : `${entrada.cadencia.filter((r) => r.status === 'stale').length} rancio(s)`}`
  process.stdout.write(`[ops-alarm] ${resumen}\n`)

  const texto = avisos.length > 0 ? formatAlerts(avisos) : '✓ sin avisos'
  process.stdout.write(`${texto}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Alarma operativa\n\n${resumen}\n\n${texto.replace(/\n/g, '  \n')}\n`,
    )
  }

  if (avisos.length > 0 && !dryRun) process.exitCode = 1
}

main().catch((err) => {
  process.stderr.write(`[ops-alarm] FATAL: ${err instanceof Error ? err.message : err}\n`)
  process.exitCode = 1
})
