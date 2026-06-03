/**
 * Pleno video discovery parser.
 *
 * Takes the raw JSONL output from `yt-dlp --flat-playlist --dump-json` against
 * the Ajuntament de Riba-roja YouTube channel and extracts the pleno session
 * videos. Valencian titles are non-standardised — spacing, apostrophe style,
 * trailing periods all vary — so the parser is defensive but strict about
 * what qualifies as a pleno (vs. a press-conference clip that also mentions
 * the session).
 *
 * Output is a JSON snapshot the SPA reads to decorate /plenos with "ver
 * grabación" links, and that the transcription CLI walks to pull audio.
 *
 * Schema guarantees:
 *   - one entry per unique ytId
 *   - plenoDate is ISO (YYYY-MM-DD)
 *   - kind ∈ { ordinario, extraordinario, urgente, otro }
 *   - entries sorted newest-first
 */

export type PlenoVideoKind = 'ordinario' | 'extraordinario' | 'urgente' | 'otro'

export interface PlenoVideoEntry {
  /** YouTube video id (11 chars). */
  ytId: string
  /** Original title, verbatim from yt-dlp. */
  title: string
  /** ISO session date extracted from the title. */
  plenoDate: string
  /** Session classification inferred from the title. */
  kind: PlenoVideoKind
  /** Stable URL (watch?v=...) for the UI. */
  url: string
}

export interface PlenoVideosSnapshot {
  generatedAt: string
  source: {
    channelUrl: string
    description: string
  }
  stats: {
    totalVideosScanned: number
    plenoVideosMatched: number
    byKind: Record<PlenoVideoKind, number>
  }
  items: PlenoVideoEntry[]
}

const VALENCIAN_MONTHS: Record<string, string> = {
  gener: '01',
  febrer: '02',
  // "març" has a cedilla (ç) and sometimes appears as "marc" with bad encoding.
  març: '03',
  marc: '03',
  abril: '04',
  maig: '05',
  juny: '06',
  juliol: '07',
  agost: '08',
  setembre: '09',
  octubre: '10',
  novembre: '11',
  desembre: '12',
}

/**
 * Normalises weird whitespace + curly/straight quotes in yt-dlp titles so
 * the regex family below can stay readable.
 */
function normaliseTitle(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ') // NBSP → space
    .replace(/\s+/g, ' ') // collapse repeated spaces
    .replace(/[´`‘’]/g, "'") // normalise apostrophes/acute accents used as apostrophes
    .trim()
}

/**
 * Decide the session kind from the title prefix. Titles in the channel use
 * Valencian consistently: "Ple Ordinari", "Ple extraordinari i urgent",
 * occasionally just "Ple extraordinari". Case is inconsistent.
 */
function inferKind(title: string): PlenoVideoKind {
  const t = title.toLowerCase()
  if (/\bple\s+extraordinari\s+i\s+urgent\b/.test(t)) return 'urgente'
  if (/\bple\s+extraordinari\b/.test(t)) return 'extraordinario'
  if (/\bple\s+ordinari\b/.test(t)) return 'ordinario'
  return 'otro'
}

/**
 * Extract (day, month, year) from a Valencian title. Examples that must match:
 *   "Ple Ordinari 20 d'abril de 2026."
 *   "Ple extraordinari i urgent, 16 de març de 2026."
 *   "Ple Ordinari  9  de  febrer  de 2026."
 *   "Ple extraordinari i urgent 7 de gener de 2026"
 * Not a match (intentionally — not the session itself):
 *   "Declaracions portaveus Ple ordinari 9 de febrer de 2026"
 *   Anything without "Ple ordinari" or "Ple extraordinari" as a prefix (after
 *   dropping leading punctuation/whitespace).
 */
function extractDate(title: string): string | null {
  const t = normaliseTitle(title)

  // Reject press-conference titles that quote a session date.
  if (/^declaracions|declaracions portaveus/i.test(t)) return null
  // The title must STARTWITH "Ple" (after any leading spaces we already
  // collapsed). This guards against retrospective clips and trailers.
  if (!/^ple\s/i.test(t)) return null

  // Parse the (d[ 'd'] MONTH) token. The day is 1-31; apostrophe before a
  // vowel-starting month ("d'abril") counts as "de".
  const m = t.match(/(\d{1,2})\s*(?:de|d'|d ')\s*([a-zñç]+)\s+de\s+(\d{4})/i)
  if (!m) return null

  const day = Number(m[1])
  const monthRaw = m[2].toLowerCase()
  const year = Number(m[3])

  const month = VALENCIAN_MONTHS[monthRaw]
  if (!month) return null
  if (day < 1 || day > 31) return null
  if (year < 2013 || year > 2100) return null

  return `${year}-${month}-${String(day).padStart(2, '0')}`
}

export interface RawYtdlpEntry {
  id?: unknown
  title?: unknown
  url?: unknown
  channel_url?: unknown
}

/** Parse a single yt-dlp JSONL record; returns null if it isn't a pleno. */
export function parseVideoEntry(raw: RawYtdlpEntry): PlenoVideoEntry | null {
  if (typeof raw.id !== 'string' || !/^[-\w]{11}$/.test(raw.id)) return null
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) return null

  const plenoDate = extractDate(raw.title)
  if (!plenoDate) return null

  const kind = inferKind(raw.title)
  const url =
    typeof raw.url === 'string' && raw.url.startsWith('https://')
      ? raw.url
      : `https://www.youtube.com/watch?v=${raw.id}`

  return {
    ytId: raw.id,
    title: raw.title.trim(),
    plenoDate,
    kind,
    url,
  }
}

/**
 * Parse the full yt-dlp JSONL output (one entry per line). Returns a fully
 * validated snapshot. Duplicate ytIds are collapsed (keeping the first
 * occurrence). Entries are sorted newest-first by plenoDate.
 */
export function parseChannelFeed(
  jsonl: string,
  opts: { channelUrl?: string; generatedAt?: string } = {},
): PlenoVideosSnapshot {
  const lines = jsonl.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const seen = new Set<string>()
  const items: PlenoVideoEntry[] = []
  let totalVideosScanned = 0

  for (const line of lines) {
    totalVideosScanned += 1
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const entry = parseVideoEntry(parsed as RawYtdlpEntry)
    if (!entry) continue
    if (seen.has(entry.ytId)) continue
    seen.add(entry.ytId)
    items.push(entry)
  }

  items.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  const byKind: Record<PlenoVideoKind, number> = {
    ordinario: 0,
    extraordinario: 0,
    urgente: 0,
    otro: 0,
  }
  for (const i of items) byKind[i.kind] += 1

  return {
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    source: {
      channelUrl: opts.channelUrl ?? 'https://www.youtube.com/@ajuntam_riba_roja_de_turia',
      description:
        'Ajuntament de Riba-roja YouTube channel — pleno recordings only. Feed produced via `yt-dlp --flat-playlist --dump-json`.',
    },
    stats: {
      totalVideosScanned,
      plenoVideosMatched: items.length,
      byKind,
    },
    items,
  }
}

/**
 * Given plenos.json items, return a best-effort mapping from plenoId → video
 * by exact date match. Used by the UI hook and by the transcription CLI.
 * Ambiguity (two videos on the same date) is resolved by preferring the
 * non-'otro' kind; ties fall back to the first-seen video.
 */
export function matchVideosToPlenos<T extends { id: string; date: string }>(
  plenos: T[],
  videos: PlenoVideoEntry[],
): Record<string, PlenoVideoEntry> {
  const byDate: Record<string, PlenoVideoEntry[]> = {}
  for (const v of videos) {
    ;(byDate[v.plenoDate] ||= []).push(v)
  }

  const map: Record<string, PlenoVideoEntry> = {}
  for (const p of plenos) {
    const candidates = byDate[p.date]
    if (!candidates || candidates.length === 0) continue
    const priority = (v: PlenoVideoEntry) => (v.kind === 'otro' ? 1 : 0)
    const best = [...candidates].sort((a, b) => priority(a) - priority(b))[0]
    map[p.id] = best
  }
  return map
}
