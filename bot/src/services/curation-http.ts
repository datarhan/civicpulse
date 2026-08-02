/**
 * HTTP surface for the curation loop, so it works with the bot deployed
 * remotely (Fly.io) rather than only on the curator's laptop.
 *
 * The queue is produced by `auto-curate` on the HOST, where the datasets live.
 * The bot runs in a container with a volume and no view of that filesystem, so
 * without this the `/curar` command would always answer "no hay cola" — a
 * feature that looks installed and does nothing, which is the failure mode this
 * whole session has been about.
 *
 *   POST /curation/queue      host → bot   the drafts + their checks
 *   GET  /curation/decisions  bot → host   what the curator decided
 *   POST /curation/applied    host → bot   close the loop after publishing
 *
 * All three require `Authorization: Bearer $EXPORT_TOKEN`, the same secret the
 * quejas export already uses. Without a token configured the endpoints refuse
 * everything rather than defaulting open.
 *
 * The queue is written to the volume, so it survives restarts — a curator
 * halfway through a review does not lose the list because Fly moved the
 * machine.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

export function curationQueuePath(): string {
  return (
    process.env.CURATION_QUEUE_PATH ??
    resolve(dirname(process.env.DB_PATH ?? './data/bot.db'), 'curation-queue.json')
  )
}

function unauthorized(req: IncomingMessage): boolean {
  const token = process.env.EXPORT_TOKEN ?? ''
  // No token configured ⇒ refuse. An endpoint that accepts editorial drafts
  // must not fall open when a secret is missing.
  if (!token) return true
  const header = req.headers.authorization ?? ''
  return header !== `Bearer ${token}`
}

async function readBody(req: IncomingMessage, maxBytes = 4_000_000): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > maxBytes) throw new Error('payload too large')
    chunks.push(c as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export interface CurationHttpDeps {
  /** Pending decisions, injected so this module stays free of the DB import. */
  listPending: () => unknown[]
  markApplied: (refs: string[]) => number
}

/**
 * Returns true when it handled the request. Mount BEFORE the 404 fallback.
 */
export async function handleCurationRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CurationHttpDeps,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (!url.pathname.startsWith('/curation/')) return false

  if (unauthorized(req)) {
    res.statusCode = 401
    res.end('unauthorized')
    return true
  }

  try {
    if (req.method === 'POST' && url.pathname === '/curation/queue') {
      const body = await readBody(req)
      const parsed = JSON.parse(body) as { items?: unknown[] }
      if (!Array.isArray(parsed.items)) {
        res.statusCode = 400
        res.end('expected {items: []}')
        return true
      }
      const path = curationQueuePath()
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(parsed, null, 2))
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, items: parsed.items.length, path }))
      return true
    }

    if (req.method === 'GET' && url.pathname === '/curation/decisions') {
      const decisions = deps.listPending()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ generatedAt: new Date().toISOString(), decisions }))
      return true
    }

    if (req.method === 'POST' && url.pathname === '/curation/applied') {
      const body = await readBody(req)
      const { refs } = JSON.parse(body) as { refs?: string[] }
      if (!Array.isArray(refs)) {
        res.statusCode = 400
        res.end('expected {refs: []}')
        return true
      }
      const n = deps.markApplied(refs)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, marked: n }))
      return true
    }
  } catch (err) {
    res.statusCode = 400
    res.end(`bad request: ${err instanceof Error ? err.message : String(err)}`)
    return true
  }

  res.statusCode = 404
  res.end('not found')
  return true
}

export function readStoredQueue(): { items: unknown[] } | null {
  const path = curationQueuePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { items?: unknown[] }
    return Array.isArray(raw.items) ? (raw as { items: unknown[] }) : null
  } catch {
    return null
  }
}
