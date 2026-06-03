/**
 * Minimal structured JSON logger for the bot.
 *
 * One line per event, no dependencies, machine-parseable. Format:
 *   {"ts":"2026-04-20T22:45:12.003Z","level":"info","event":"bot.started","pid":48305,...}
 *
 * We deliberately avoid pino + its ecosystem — a single-process long-polling
 * bot doesn't need high-throughput logging or transports. `console.log` with
 * `JSON.stringify` gets us:
 *   - grep-friendly (jq bot/data/logs/bot.out.log)
 *   - launchd captures stdout to the plist StandardOutPath
 *   - zero extra install surface for contributors
 *
 * Levels: debug | info | warn | error. Default is info. Set LOG_LEVEL env var
 * to override (e.g. LOG_LEVEL=debug for local troubleshooting).
 */

type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Level[] = ['debug', 'info', 'warn', 'error']
const MIN_LEVEL_IDX = (() => {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level
  const idx = LEVELS.indexOf(env)
  return idx >= 0 ? idx : 1 // default info
})()

export function log(level: Level, event: string, context: Record<string, unknown> = {}): void {
  if (LEVELS.indexOf(level) < MIN_LEVEL_IDX) return
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  }
  // stderr for warn/error, stdout for the rest. launchd captures both.
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout
  try {
    stream.write(JSON.stringify(entry) + '\n')
  } catch {
    // Circular refs or unserialisable values in context → fall back to a string dump.
    stream.write(`{"ts":"${entry.ts}","level":"${level}","event":"${event}","context_err":true}\n`)
  }
}

/** Convenience wrappers so call sites stay tight. */
export const logger = {
  debug: (event: string, ctx?: Record<string, unknown>) => log('debug', event, ctx),
  info: (event: string, ctx?: Record<string, unknown>) => log('info', event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>) => log('warn', event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => log('error', event, ctx),
}
