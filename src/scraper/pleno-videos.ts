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

export interface PestanaLeida {
  /** `playlist_title` tal cual lo da yt-dlp («… - Vídeos», «… - En directe»). */
  pestana: string
  leidas: number
  total: number | null
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
    /**
     * Lo leído de cada pestaña del canal y, si se leyó entera, cuántas tiene.
     * yt-dlp sólo da el total de una pestaña que no cortó (medido el
     * 27-10-2026): `total` null con `leidas` igual a la ventana es «la ventana
     * la cortó y lo de detrás no se pidió», que no es lo mismo que «no hay más».
     */
    pestanas: PestanaLeida[]
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
 *   "Ple ordinari 4 desembre 2023 declaracions protaveus"
 *   Anything that does not START with "Ple " or "Pleno " — retrospective
 *   clips, trailers, «COMPARECENCIA ALCALDE …», and the English titles YouTube
 *   hands back when the listing is not asked for in a language
 *   (`argumentosYtdlp`).
 */
function leeTitulo(title: string): LecturaTitulo {
  const t = normaliseTitle(title).toLowerCase()

  // Reject press-conference titles that quote a session date. Anywhere in the
  // title, not just at the start: «Ple ordinari 4 desembre 2023 declaracions
  // protaveus» (GpLGP5eRLiw, 14 min) is the spokespeople's statements, and read
  // as a pleno it became a second «ordinario» video for that session.
  if (/declaraci/.test(t)) return { tipo: 'no-pleno' }
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
 * Cuántas entradas se leen de CADA pestaña del canal (`--playlist-end`).
 *
 * Fue 60 hasta el 27-10-2026, «enough to cover ~2 years». No lo era, y no por
 * la pestaña que se miraba. Medido ese día: en «En directe» la 60.ª era el
 * pleno más antiguo de `plenos.json` (EKoMiCY-HUk, 23-01-2023), pero 22
 * sesiones tienen su grabación SUBIDA, no emitida, y esas viven en «Vídeos»
 * entre la 90.ª y la 291.ª, detrás de los programas de Tele Riba-roja.
 * «Vídeos» crecía unas 78 entradas al año (la 1.ª era del 22-10-2026, la
 * 300.ª del 12-12-2022): 500 deja más de 200 de margen sobre la 291.ª, unos
 * dos años y medio. «En directe» entra entera.
 *
 * Leer el canal entero también cubriría, pero mete los plenos de 2011–2012,
 * que el parser rechaza como `fecha-imposible` por su suelo de 2013, y ninguna
 * sesión que atar. Lo que entra con 500 y es anterior a 2023 no se ata a nada:
 * `matchVideosToPlenos` casa por fecha exacta y `plenos.json` empieza en 2023
 * (`tests/parse-pleno-videos-ventana.test.ts`).
 *
 * La prueba mide el margen sobre un volcado congelado, así que no envejece con
 * el canal: lo que avisa de que se acaba es el CLI, que en cada pasada dice en
 * qué posición está la grabación de sesión más honda (`grabacionMasHonda`) y
 * avisa por debajo de `MARGEN_AVISO`.
 */
export const VENTANA_CANAL = 500

/** Entradas hasta el borde por debajo de las cuales el CLI avisa: ~15 meses de «Vídeos». */
export const MARGEN_AVISO = 100

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
  playlist_title?: unknown
  playlist_count?: unknown
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
  const pestanas = new Map<string, PestanaLeida>()
  let totalVideosScanned = 0

  for (const line of lines) {
    totalVideosScanned += 1
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      parsed = {}
    }
    const raw = parsed as RawYtdlpEntry
    // Una línea ilegible también se leyó: cuenta en su pestaña desconocida, o
    // la suma de las pestañas dejaría de cuadrar con `totalVideosScanned`.
    const nombre = typeof raw.playlist_title === 'string' ? raw.playlist_title : '(sin pestaña)'
    const pestana = pestanas.get(nombre) ?? { pestana: nombre, leidas: 0, total: null }
    pestana.leidas += 1
    if (typeof raw.playlist_count === 'number') pestana.total = raw.playlist_count
    pestanas.set(nombre, pestana)
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
        'Ajuntament de Riba-roja YouTube channel — pleno recordings only. Feed produced via `yt-dlp --flat-playlist --dump-json --extractor-args youtube:lang=ca`. A pleno whose title yields no date (no day, no year, or a form the parser cannot read) is listed in `sinFecha` with its reason, never tied to a session.',
    },
    stats: {
      totalVideosScanned,
      plenoVideosMatched: items.length,
      byKind,
      plenosSinFecha: sinFecha.length,
      pestanas: [...pestanas.values()],
    },
    items,
    sinFecha,
  }
}

/** Cada entrada del listado por su id: el título con que vino y dónde estaba. */
function leeListado(
  jsonl: string,
): Map<string, { title: string | null; pestana: string | null; posicion: number | null }> {
  const listado = new Map<
    string,
    { title: string | null; pestana: string | null; posicion: number | null }
  >()
  for (const line of jsonl.split(/\r?\n/)) {
    if (line.trim().length === 0) continue
    let raw: RawYtdlpEntry & { playlist_index?: unknown }
    try {
      raw = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof raw?.id !== 'string' || listado.has(raw.id)) continue
    listado.set(raw.id, {
      title: typeof raw.title === 'string' ? raw.title.trim() : null,
      pestana: typeof raw.playlist_title === 'string' ? raw.playlist_title : null,
      posicion: typeof raw.playlist_index === 'number' ? raw.playlist_index : null,
    })
  }
  return listado
}

/**
 * La grabación de una sesión que está más hondo en su pestaña: lo que la
 * ventana tiene que seguir alcanzando. `fechas` son las de `plenos.json`; null
 * cuando ninguna grabación del listado es de una de ellas.
 */
export function grabacionMasHonda(
  jsonl: string,
  snap: PlenoVideosSnapshot,
  fechas: ReadonlySet<string>,
): { ytId: string; plenoDate: string; pestana: string; posicion: number } | null {
  const listado = leeListado(jsonl)
  let honda: { ytId: string; plenoDate: string; pestana: string; posicion: number } | null = null
  for (const v of snap.items) {
    if (!fechas.has(v.plenoDate)) continue
    const l = listado.get(v.ytId)
    if (l?.posicion == null || l.pestana == null) continue
    if (!honda || l.posicion > honda.posicion) {
      honda = { ytId: v.ytId, plenoDate: v.plenoDate, pestana: l.pestana, posicion: l.posicion }
    }
  }
  return honda
}

/**
 * Por qué un vídeo que estaba en el índice publicado no está en el nuevo:
 *   · `fuera-del-listado` — su id no vino: la ventana lo dejó atrás, una
 *     pestaña no llegó, o YouTube ya no lo lista.
 *   · `sin-fecha` — vino, y su título sigue siendo de un pleno pero ya no da
 *     fecha.
 *   · `no-pleno` — vino, y su título ya no se lee como pleno: traducido
 *     («Extraordinary Plenary Session July 3, 2026»), renombrado o vacío.
 */
export const CAUSAS_BAJA = ['fuera-del-listado', 'sin-fecha', 'no-pleno'] as const
export type CausaBaja = (typeof CAUSAS_BAJA)[number]

export interface BajaIndice {
  ytId: string
  /** El título con que estaba en el índice publicado. */
  title: string
  plenoDate: string
  causa: CausaBaja
  /** El título con que vuelve en esta pasada; null si no vuelve. */
  tituloAhora: string | null
}

/**
 * Bajas que una pasada puede traer sin que se niegue a escribir: el mayor de
 * `BAJAS_TOLERADAS` y la fracción `FRACCION_BAJAS_TOLERADA` del índice
 * anterior. Con la ventana ancha ningún vídeo debería irse; uno suelto es un
 * título que cambió o un vídeo retirado, y se escribe nombrándolo. Varios a la
 * vez son el listado roto —una pestaña que no llegó, títulos devueltos en otro
 * idioma—, y escribir encima sería publicar el hueco como si fuera el canal.
 */
export const BAJAS_TOLERADAS = 2
export const FRACCION_BAJAS_TOLERADA = 0.05

export interface DecisionIndice {
  escribir: boolean
  /** Se imprime tal cual: qué rama se tomó y por qué. */
  motivo: string
  /** Entradas del listado que se leyeron (= `stats.totalVideosScanned`). */
  leidas: number
  /** Plenos con fecha (= `items.length`). */
  conFecha: number
  /** Plenos sin fecha legible (= `sinFecha.length`). */
  sinFecha: number
  /** Vídeos del índice publicado; null si no lo había o no se pudo leer. */
  anteriores: number | null
  /** Del índice publicado, los que siguen. */
  conservadas: number
  /** Los que no estaban en el índice publicado. */
  nuevas: number
  bajas: BajaIndice[]
}

/**
 * ¿Puede esta pasada escribir encima de `pleno-videos.json`?
 *
 * Hasta el 27-10-2026 el CLI escribía lo que hubiera casado, y un índice que
 * encogía no lo decía en ninguna parte: L6Cy1hTrpIc salió y entró tres veces
 * entre julio y septiembre porque YouTube devolvía su título en inglés, y lo
 * único que lo notaba era un aviso de `check:relations` que lo atribuía a la
 * ventana. La sesión dejaba de tener vídeo, y la cola de transcripción con ella.
 *
 * Se cuentan BAJAS por identidad —vídeos del índice publicado que no están en
 * el nuevo—, no la diferencia de totales: una pestaña que no llega mientras
 * otra trae más deja el total igual o mayor y pierde todos los plenos de la
 * primera. Cada baja lleva su causa (`CAUSAS_BAJA`) y el título con que vuelve.
 *
 * Una pasada que no leyó ninguna entrada no escribe nunca: yt-dlp saliendo 0
 * sin listado no es un canal vacío. `aceptarBajas` es la puerta del operador
 * cuando las bajas son de verdad (vídeos retirados); el motivo lo dice.
 *
 * Pura: `anteriorRaw` se pasa leído, para que fichero ausente, ilegible y
 * encogido se prueben sin tocar el disco (como `decideSnapshotWrite`).
 */
export function decideEscrituraIndice(args: {
  nuevo: PlenoVideosSnapshot
  jsonl: string
  anteriorRaw: string | null
  aceptarBajas?: boolean
}): DecisionIndice {
  const { nuevo, jsonl, anteriorRaw, aceptarBajas = false } = args
  const cuenta = {
    leidas: nuevo.stats.totalVideosScanned,
    conFecha: nuevo.items.length,
    sinFecha: nuevo.sinFecha.length,
  }
  const resumen = `leídas ${cuenta.leidas} · con fecha ${cuenta.conFecha} · sin fecha ${cuenta.sinFecha}`

  let anteriores: PlenoVideoEntry[] | null = null
  let porQueSinAnterior = 'sin índice anterior'
  if (anteriorRaw != null) {
    porQueSinAnterior = 'índice anterior ilegible'
    try {
      const parsed = JSON.parse(anteriorRaw) as { items?: unknown }
      if (Array.isArray(parsed?.items)) anteriores = parsed.items as PlenoVideoEntry[]
    } catch {
      // ilegible: se queda en null
    }
  }

  const nuevos = new Set(nuevo.items.map((v) => v.ytId))
  const listado = leeListado(jsonl)
  const sinFechaAhora = new Set(nuevo.sinFecha.map((s) => s.ytId))
  const bajas: BajaIndice[] = []
  for (const v of anteriores ?? []) {
    if (typeof v?.ytId !== 'string' || nuevos.has(v.ytId)) continue
    const vuelve = listado.get(v.ytId)
    const causa: CausaBaja = !vuelve
      ? 'fuera-del-listado'
      : sinFechaAhora.has(v.ytId)
        ? 'sin-fecha'
        : 'no-pleno'
    bajas.push({
      ytId: v.ytId,
      title: v.title,
      plenoDate: v.plenoDate,
      causa,
      tituloAhora: vuelve?.title ?? null,
    })
  }
  const conservadas = (anteriores?.length ?? 0) - bajas.length
  const base = {
    ...cuenta,
    anteriores: anteriores?.length ?? null,
    conservadas,
    nuevas: cuenta.conFecha - conservadas,
    bajas,
  }

  if (cuenta.leidas === 0) {
    return {
      ...base,
      escribir: false,
      motivo:
        'se niega: yt-dlp no devolvió ninguna entrada, y un listado vacío no es un canal vacío',
    }
  }
  if (anteriores == null) {
    return {
      ...base,
      escribir: true,
      motivo: `${porQueSinAnterior}: escribe sin comparar · ${resumen}`,
    }
  }

  const tolera = Math.max(BAJAS_TOLERADAS, Math.floor(anteriores.length * FRACCION_BAJAS_TOLERADA))
  const bajasTxt = `${bajas.length} baja${bajas.length === 1 ? '' : 's'} de ${anteriores.length} (tolera ${tolera})`
  if (bajas.length > tolera && !aceptarBajas) {
    return {
      ...base,
      escribir: false,
      motivo:
        `se niega: ${bajasTxt} — el índice publicado se queda como está; ` +
        `si las bajas son de verdad, --aceptar-bajas · ${resumen}`,
    }
  }
  return {
    ...base,
    escribir: true,
    motivo:
      bajas.length > tolera
        ? `escribe con ${bajasTxt} aceptadas por el operador · ${resumen}`
        : `escribe: ${bajasTxt} · ${resumen}`,
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
