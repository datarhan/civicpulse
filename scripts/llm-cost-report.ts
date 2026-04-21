/**
 * LLM spend + cache-hit dashboard.
 *
 * Walks every cached LLM result in .llm-cache/*.json and summarises:
 *   - per model      · calls · tokens · $
 *   - per prompt version (regression tracking after prompt edits)
 *   - per day (last 30 days) with sparkline-ready numbers
 *
 * All figures come from the telemetry embedded in each cache entry, so
 * cost reflects *what was actually paid* (or $0 on claude-code / Max plan).
 *
 *   npm run llm:cost                 # summary table
 *   npm run llm:cost -- --json       # raw JSON for piping
 *   npm run llm:cost -- --since 7    # only entries from the last 7 days
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface CacheEntry {
  result: unknown
  backend: string
  model: string
  promptVersion: string
  tokenCount: number
  latencyMs: number
  retryCount: number
  costUSD: number
  createdAt: string
}

function euro(n: number): string {
  return '$' + n.toFixed(4).replace(/(\..*?)0+$/, '$1').replace(/\.$/, '')
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

interface Agg {
  calls: number
  tokens: number
  costUSD: number
  latencyMsTotal: number
  retriesTotal: number
  hitCount: number // entries where result !== null
  nullCount: number // entries where result === null (no signal found)
}

function newAgg(): Agg {
  return {
    calls: 0,
    tokens: 0,
    costUSD: 0,
    latencyMsTotal: 0,
    retriesTotal: 0,
    hitCount: 0,
    nullCount: 0,
  }
}

function addEntry(agg: Agg, e: CacheEntry) {
  agg.calls += 1
  agg.tokens += e.tokenCount ?? 0
  agg.costUSD += e.costUSD ?? 0
  agg.latencyMsTotal += e.latencyMs ?? 0
  agg.retriesTotal += e.retryCount ?? 0
  if (e.result === null) agg.nullCount += 1
  else agg.hitCount += 1
}

function daysBetween(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
}

function table(title: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return
  console.log('\n' + title)
  console.log('─'.repeat(title.length))
  const cols = Object.keys(rows[0])
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)))
  const fmtRow = (r: Record<string, string | number>) =>
    cols.map((c, i) => String(r[c]).padEnd(widths[i])).join('  ')
  console.log(fmtRow(Object.fromEntries(cols.map((c) => [c, c]))))
  console.log(widths.map((w) => '─'.repeat(w)).join('  '))
  rows.forEach((r) => console.log(fmtRow(r)))
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOnly = args.includes('--json')
  const sinceDays = (() => {
    const idx = args.indexOf('--since')
    if (idx < 0) return null
    const n = Number(args[idx + 1])
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const cacheDir = resolve('.llm-cache')
  if (!existsSync(cacheDir)) {
    console.log('No .llm-cache directory — no LLM calls have been made yet.')
    return
  }

  const now = new Date()
  const entries: CacheEntry[] = []
  for (const name of readdirSync(cacheDir)) {
    if (!name.endsWith('.json')) continue
    const p = resolve(cacheDir, name)
    try {
      const mtime = statSync(p).mtime
      if (sinceDays !== null) {
        const ageDays = Math.floor((now.getTime() - mtime.getTime()) / 86_400_000)
        if (ageDays > sinceDays) continue
      }
      const e = JSON.parse(readFileSync(p, 'utf8')) as CacheEntry
      if (!e.createdAt) e.createdAt = mtime.toISOString()
      entries.push(e)
    } catch {
      /* ignore corrupt */
    }
  }

  if (entries.length === 0) {
    console.log('No cache entries matched the filter.')
    return
  }

  // Per-model aggregation
  const byModel = new Map<string, Agg>()
  const byPrompt = new Map<string, Agg>()
  const byDay = new Map<string, Agg>() // YYYY-MM-DD
  const byBackend = new Map<string, Agg>()

  for (const e of entries) {
    const k = `${e.backend}/${e.model}`
    if (!byModel.has(k)) byModel.set(k, newAgg())
    addEntry(byModel.get(k)!, e)

    if (!byPrompt.has(e.promptVersion)) byPrompt.set(e.promptVersion, newAgg())
    addEntry(byPrompt.get(e.promptVersion)!, e)

    const day = e.createdAt.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, newAgg())
    addEntry(byDay.get(day)!, e)

    if (!byBackend.has(e.backend)) byBackend.set(e.backend, newAgg())
    addEntry(byBackend.get(e.backend)!, e)
  }

  const total: Agg = newAgg()
  for (const e of entries) addEntry(total, e)

  if (jsonOnly) {
    console.log(
      JSON.stringify(
        {
          generatedAt: now.toISOString(),
          total,
          byBackend: Object.fromEntries(byBackend),
          byModel: Object.fromEntries(byModel),
          byPrompt: Object.fromEntries(byPrompt),
          byDay: Object.fromEntries(byDay),
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(`LLM spend report · ${entries.length} cached calls`)
  console.log(`Cache dir: ${cacheDir}`)
  if (sinceDays !== null) console.log(`Window: last ${sinceDays} day(s)`)
  console.log(
    `Totals: ${total.tokens.toLocaleString('en-US')} tokens · ${euro(total.costUSD)} · ` +
      `hit-rate ${pct(total.hitCount / total.calls)} · ` +
      `avg latency ${Math.round(total.latencyMsTotal / total.calls)}ms`,
  )
  const hasClaudeCode = [...byBackend.keys()].includes('claude-code')
  if (hasClaudeCode) {
    console.log(
      'Note: claude-code calls on Anthropic Max plan bill $0 (rate-limited, not metered).\n' +
        '      The $ figure above is API-equivalent, kept for cost-awareness.',
    )
  }

  table(
    'By backend',
    [...byBackend.entries()]
      .sort((a, b) => b[1].costUSD - a[1].costUSD)
      .map(([k, v]) => ({
        backend: k,
        calls: v.calls,
        tokens: v.tokens.toLocaleString('en-US'),
        '$ cost': euro(v.costUSD),
        hits: `${v.hitCount} (${pct(v.hitCount / v.calls)})`,
        'avg ms': Math.round(v.latencyMsTotal / v.calls),
      })),
  )

  table(
    'By model',
    [...byModel.entries()]
      .sort((a, b) => b[1].costUSD - a[1].costUSD)
      .map(([k, v]) => ({
        model: k,
        calls: v.calls,
        tokens: v.tokens.toLocaleString('en-US'),
        '$ cost': euro(v.costUSD),
        'hit %': pct(v.hitCount / v.calls),
      })),
  )

  table(
    'By prompt version (regression tracking)',
    [...byPrompt.entries()]
      .sort((a, b) => b[1].calls - a[1].calls)
      .map(([k, v]) => ({
        promptVersion: k,
        calls: v.calls,
        'hit %': pct(v.hitCount / v.calls),
        'avg retries': (v.retriesTotal / v.calls).toFixed(2),
      })),
  )

  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const recentDays = days.slice(-30)
  table(
    `By day (last ${recentDays.length})`,
    recentDays.map(([k, v]) => ({
      day: k,
      calls: v.calls,
      tokens: v.tokens.toLocaleString('en-US'),
      '$ cost': euro(v.costUSD),
      'hits (%)': `${v.hitCount} (${pct(v.hitCount / v.calls)})`,
    })),
  )
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
})
