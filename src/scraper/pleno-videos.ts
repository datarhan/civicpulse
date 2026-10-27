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
 *   - plenoDate is ISO (YYYY-MM-DD) and a real calendar day
 *   - kind ∈ PLENO_VIDEO_KINDS
 *   - entries sorted newest-first
 *   - a pleno title whose date cannot be read lands in `sinFecha`, with its
 *     motive, never in `items`
 *
 * Los títulos del canal (medido el 2026-10-27, `tests/parse-pleno-videos-titulos.test.ts`)
 * van en valenciano o en castellano —«Ple ordinari 6 de Novembre 2023», «Pleno
 * ordinario 10 de febrero de 2025»—, con o sin «de», y con erratas del propio
 * canal («7 ade abril», «4 de decembre», «extrordinari»). Hasta esa fecha sólo
 * se leía la forma valenciana con los dos «de», y 9 grabaciones de sesiones de
 * `plenos.json` quedaban fuera del índice.
 *
 * Lo que no se lee, a propósito: un título sin día o sin año («Ple ordinari
 * octubre 2023», «Pleno ordinario 2 de diciembre») no se ata a una fecha. Quien
 * lo ata por el mes adivina la sesión; regmeet la ata por la página de la sesión
 * (`pleno-video-fuentes.ts`). Esos van a `sinFecha` con su motivo, contados.
 */

export const PLENO_VIDEO_KINDS = ['ordinario', 'extraordinario', 'urgente', 'otro'] as const
export type PlenoVideoKind = (typeof PLENO_VIDEO_KINDS)[number]

/**
 * Por qué un título de pleno no da fecha. `sin-dia` y `sin-año` son del canal;
 * `mes-desconocido`, `fecha-imposible` y `formato-desconocido` serían del parser
 * —una palabra que la tabla no conoce, un 31 de febrero, una forma nueva— y por
 * eso la prueba de la fixture exige que no aparezca ninguno.
 */
export const MOTIVOS_SIN_FECHA = [
  'sin-dia',
  'sin-año',
  'mes-desconocido',
  'fecha-imposible',
  'formato-desconocido',
] as const
export type MotivoSinFecha = (typeof MOTIVOS_SIN_FECHA)[number]

export interface PlenoSinFecha {
  ytId: string
  /** Original title, verbatim from yt-dlp. */
  title: string
  motivo: MotivoSinFecha
}

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
    /** Pleno titles left without a date — `sinFecha.length`. */
    plenosSinFecha: number
  }
  items: PlenoVideoEntry[]
  sinFecha: PlenoSinFecha[]
}

const MONTHS: Record<string, string> = {
  // Valencià
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
  // Castellano: «Pleno ordinario 10 de febrero de 2025». (abril y octubre, arriba.)
  enero: '01',
  febrero: '02',
  marzo: '03',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  noviembre: '11',
  diciembre: '12',
  // Errata del canal: «Ple ordinari 4 de decembre 2023» (2vLWPNAXQMs), la
  // sesión del 04-12-2023. Sólo puede ser diciembre; se añade una errata cuando
  // aparece en un título real, nunca por si acaso.
  decembre: '12',
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
 * Decide the session kind from the title prefix: "Ple Ordinari", "Ple
 * extraordinari i urgent", "Pleno ordinario", "Pleno extraordinario y
 * urgente". Case is inconsistent, and the channel writes "extrordinari(o)" at
 * least twice (AHxn3d-Kc6g, 5bpHZRUclkk) — `extra?ordinari` reads both.
 */
function inferKind(title: string): PlenoVideoKind {
  const t = normaliseTitle(title).toLowerCase()
  if (/^ple(?:no)?\s+extra?ordinario?,?\s+(?:i|y)\s+urgente?\b/.test(t)) return 'urgente'
  if (/^ple(?:no)?\s+extra?ordinario?\b/.test(t)) return 'extraordinario'
  if (/^ple(?:no)?\s+ordinario?\b/.test(t)) return 'ordinario'
  return 'otro'
}

type LecturaTitulo =
  | { tipo: 'no-pleno' }
  | { tipo: 'con-fecha'; fecha: string }
  | { tipo: 'sin-fecha'; motivo: MotivoSinFecha }

/**
 * Read a title: not a pleno, a pleno with its date, or a pleno without one.
 * Forms that must match (all real titles):
 *   "Ple Ordinari  20 d´abril  de 2026."
 *   "Ple extraordinari i urgent, 16 de març de 2026."
 *   "Ple ordinari 6 de Novembre 2023"              — no «de» before the year
 *   "Ple extraordinari 24 octubre 2023"            — no «de» at all
 *   "Ple ordinari de 13 febrer de 2023 - Part II"  — «de» before the day
 *   "Pleno ordinario 10 de febrero de 2025"        — Castilian
 *   "Pleno ordinario 7 ade abril de 2025"          — the channel's typo
 * Not a pleno (intentionally — not the session itself):
 *   "Declaracions portaveus Ple ordinari 9 de febrer de 2026"
 *   Anything that does not START with "Ple " or "Pleno " — retrospective
 *   clips, trailers, «COMPARECENCIA ALCALDE …», and the English titles YouTube
 *   hands back when the listing is not asked for in a language
 *   (`argumentosYtdlp`).
 */
function leeTitulo(title: string): LecturaTitulo {
  const t = normaliseTitle(title).toLowerCase()

  // Reject press-conference titles that quote a session date.
  if (/^declaracions|declaracions portaveus/.test(t)) return { tipo: 'no-pleno' }
  // The title must START WITH "Ple"/"Pleno". This guards against
  // retrospective clips and trailers.
  if (!/^ple(?:no)?\s/.test(t)) return { tipo: 'no-pleno' }

  // [de] DÍA [de|d'|ade] MES [de] AÑO. The connectors are optional because the
  // channel drops them; the day and the year are not.
  const m = t.match(
    /(?<!\d)(\d{1,2})\s*(?:(?:de|ade)\s+|d'\s*)?([a-zñç]+)\s+(?:de\s+)?((?:19|20)\d{2})(?!\d)/,
  )
  if (!m) {
    // «Ple ordinari octubre 2023» no tiene día; «Pleno ordinario 2 de
    // diciembre», año. Con los dos y sin casar, la forma es nueva.
    const tieneAnyo = /(?<!\d)(?:19|20)\d{2}(?!\d)/.test(t)
    const tieneDia = /(?<!\d)\d{1,2}(?!\d)/.test(t.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ''))
    const motivo = !tieneDia ? 'sin-dia' : !tieneAnyo ? 'sin-año' : 'formato-desconocido'
    return { tipo: 'sin-fecha', motivo }
  }

  const day = Number(m[1])
  const month = MONTHS[m[2]]
  const year = Number(m[3])
  if (!month) return { tipo: 'sin-fecha', motivo: 'mes-desconocido' }
  if (year < 2013 || year > 2100) return { tipo: 'sin-fecha', motivo: 'fecha-imposible' }
  // Un día que el calendario no tiene (31 de febrero) no es una fecha.
  const d = new Date(Date.UTC(year, Number(month) - 1, day))
  if (day < 1 || d.getUTCMonth() !== Number(month) - 1) {
    return { tipo: 'sin-fecha', motivo: 'fecha-imposible' }
  }

  return { tipo: 'con-fecha', fecha: `${year}-${month}-${String(day).padStart(2, '0')}` }
}

/**
 * Los argumentos con que `scripts/scrape-pleno-videos.ts` llama a yt-dlp.
 *
 * `--extractor-args youtube:lang=ca`: sin él, yt-dlp pide los listados con
 * `hl=en` y YouTube devuelve TRADUCIDOS los títulos que tienen traducción. El
 * 27-10-2026 eran ocho, entre ellos el pleno del 03-07-2026 («Extraordinary
 * Plenary Session July 3, 2026», L6Cy1hTrpIc), que entró y salió del índice
 * tres veces entre julio y septiembre según qué título devolviera YouTube; con
 * `lang=ca` y con `lang=es` los 121 títulos salieron idénticos: el original.
 */
export function argumentosYtdlp(channelUrl: string, limit: number): string[] {
  return [
    '--flat-playlist',
    '--dump-json',
    '--playlist-end',
    String(limit),
    '--extractor-args',
    'youtube:lang=ca',
    channelUrl,
  ]
}

export interface RawYtdlpEntry {
  id?: unknown
  title?: unknown
  url?: unknown
  channel_url?: unknown
}

function lecturaDe(raw: RawYtdlpEntry): LecturaTitulo | null {
  if (typeof raw.id !== 'string' || !/^[-\w]{11}$/.test(raw.id)) return null
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) return null
  return leeTitulo(raw.title)
}

/** Parse a single yt-dlp JSONL record; returns null if it isn't a dated pleno. */
export function parseVideoEntry(raw: RawYtdlpEntry): PlenoVideoEntry | null {
  const lectura = lecturaDe(raw)
  if (lectura?.tipo !== 'con-fecha') return null
  // lecturaDe ya comprobó los dos.
  const id = raw.id as string
  const title = raw.title as string

  const plenoDate = lectura.fecha
  const kind = inferKind(title)
  const url =
    typeof raw.url === 'string' && raw.url.startsWith('https://')
      ? raw.url
      : `https://www.youtube.com/watch?v=${id}`

  return {
    ytId: id,
    title: title.trim(),
    plenoDate,
    kind,
    url,
  }
}

/**
 * A pleno whose title gives no date — «Ple ordinari octubre 2023» — or null
 * when the record is not a pleno, or is one with a date (`parseVideoEntry`).
 */
export function plenoSinFecha(raw: RawYtdlpEntry): PlenoSinFecha | null {
  const lectura = lecturaDe(raw)
  if (lectura?.tipo !== 'sin-fecha') return null
  return { ytId: raw.id as string, title: (raw.title as string).trim(), motivo: lectura.motivo }
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
  const sinFecha: PlenoSinFecha[] = []
  let totalVideosScanned = 0

  for (const line of lines) {
    totalVideosScanned += 1
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const raw = parsed as RawYtdlpEntry
    const entry = parseVideoEntry(raw)
    if (!entry) {
      const sin = plenoSinFecha(raw)
      if (sin && !seen.has(sin.ytId)) {
        seen.add(sin.ytId)
        sinFecha.push(sin)
      }
      continue
    }
    if (seen.has(entry.ytId)) continue
    seen.add(entry.ytId)
    items.push(entry)
  }

  items.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))

  const byKind = Object.fromEntries(PLENO_VIDEO_KINDS.map((k) => [k, 0])) as Record<
    PlenoVideoKind,
    number
  >
  for (const i of items) byKind[i.kind] += 1

  return {
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    source: {
      channelUrl: opts.channelUrl ?? 'https://www.youtube.com/@ajuntam_riba_roja_de_turia',
      description:
        'Ajuntament de Riba-roja YouTube channel — pleno recordings only. Feed produced via `yt-dlp --flat-playlist --dump-json --extractor-args youtube:lang=ca`. A pleno whose title gives no day or no year is listed in `sinFecha`, never tied to a session.',
    },
    stats: {
      totalVideosScanned,
      plenoVideosMatched: items.length,
      byKind,
      plenosSinFecha: sinFecha.length,
    },
    items,
    sinFecha,
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
