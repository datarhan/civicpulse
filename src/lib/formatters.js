// @ts-check
/**
 * Shared presentation formatters. Kept dependency-free (no React, no fetch)
 * so any hook, component, or page can import them.
 *
 * NOTE on scope: `formatEuros` (useBudget) stays deliberately NOT centralised
 * here — its local copies (ClaimLedger.jsx etc.) have genuinely different
 * output (suffix "M €" vs prefix "€…M"). `useTenders.formatDate` remains the
 * import path pages historically use, but it now delegates to fmtDateShort;
 * the "—"-fallback variants (Datos/Laboratorio/QuejaDetail) compose it as
 * `fmtDateShort(iso) || '—'`.
 */

/**
 * The two canonical Spanish absolute-date formats. Previously ~21 inline
 * `.toLocaleDateString('es-ES', …)` copies across pages had already drifted
 * (some omitted the year); pages should import these instead. The deliberate
 * exceptions that stay local: the landing topbar's weekday-long banner
 * (tokens.jsx) and the day+month-no-year KPI chips (KpiStrip/EditorialColumn).
 *
 * `idioma` sólo cambia el nombre del mes. El deslizador del mapa y la tarjeta de
 * contrato escribían «3 jun 2026» también en la portada valenciana; con «ca» sale
 * «3 de juny del 2026». Sin idioma —como la llaman todas las demás páginas— o con
 * uno que el sitio no tiene, escribe lo mismo que escribía.
 *
 * @param {string|null|undefined} iso
 * @param {string} [idioma]  'es' (por defecto) o 'ca'
 * @returns {string} e.g. "3 jun 2026" — empty string when iso is falsy
 */
export function fmtDateShort(iso, idioma = 'es') {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * La fecha de una columna estrecha: «24 may 2023» en castellano, «24 maig 2023» en
 * valencià.
 *
 * `fmtDateShort` en valencià escribe «24 de maig del 2023», que en la columna de
 * fechas del índice de plenos saltaba a dos líneas casi en cada fila. El CLDR
 * catalán mete la preposición dentro del propio mes —`formatToParts` devuelve «de
 * maig» como mes—, así que quitar los literales no basta; con el mes suelto sí. En
 * castellano escribe exactamente lo que `fmtDateShort`: medido mes a mes, con el
 * Node de la CI y con el de desarrollo, y fijado en `tests/fecha-compacta.test.js`.
 *
 * @param {string|null|undefined} iso
 * @param {string} [idioma]
 * @returns {string}
 */
export function fmtDateCompacta(iso, idioma = 'es') {
  if (!iso) return ''
  const d = new Date(iso)
  const mes = d.toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', { month: 'short' })
  return `${d.getDate()} ${mes} ${d.getFullYear()}`
}

/**
 * @param {string|null|undefined} iso
 * @param {string} [idioma] el de la interfaz: «3 de juny de 2026» en valencià
 * @returns {string} e.g. "3 de junio de 2026" — empty string when iso is falsy
 */
export function fmtDateLong(iso, idioma = 'es') {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Relative-time label in Spanish ("ahora", "hace 5 min", "hace 3 h",
 * "hace 12 d", then an absolute date past 30 days). This unifies the two
 * previously-divergent copies in usePress (floor / 48h / 14d) and useQuejas
 * (round / 24h / 30d); the useQuejas thresholds are the canonical choice.
 *
 * Con `{ t, locale }` las palabras salen del catálogo (`tiempo.*`) y la fecha va en
 * el idioma de la interfaz: la portada valenciana escribía «hace 3 h» junto a cada
 * titular. Este módulo no importa el catálogo —no depende de React—, así que quien
 * pinta le pasa su `t`. Sin ellos escribe exactamente lo de siempre.
 *
 * @param {string|null|undefined} iso  ISO timestamp
 * @param {{ t?: (clave: string) => string, locale?: string }} [idioma]
 * @returns {string}
 */
export function timeAgo(iso, { t, locale } = {}) {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const mins = Math.round((now - then) / 60000)
  if (mins < 1) return t ? t('tiempo.ahora') : 'ahora'
  if (mins < 60) return t ? rellena(t('tiempo.haceMin'), { n: mins }) : `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return t ? rellena(t('tiempo.haceHoras'), { n: hours }) : `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return t ? rellena(t('tiempo.haceDias'), { n: days }) : `hace ${days} d`
  return new Date(iso).toLocaleDateString(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Turn a slug ("santa-rosa", "l_oliveral") into a Title-Cased label.
 *
 * @param {string|null|undefined} slug
 * @returns {string}
 */
export function prettyNeighborhood(slug) {
  if (!slug) return ''
  return slug
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Shorten a summary to fit a teaser slot WITHOUT slicing a word in half.
 *
 * The column's list rows truncate headlines with a naive `.slice()`, which is
 * tolerable for a title you are meant to click. A summary is meant to be READ,
 * and "…comportamiento de los visi…" reads as a rendering bug rather than an
 * abridgement. So: cut at the last space inside the budget, drop the dangling
 * punctuation that cut would strand ("visitantes,…"), and append one ellipsis.
 *
 * Two deliberate edge behaviours:
 *   · a word-boundary further back than 40% of the budget is ignored (a single
 *     very long token would otherwise return almost nothing) — hard-cut instead;
 *   · text already within budget comes back untouched, with NO ellipsis, so a
 *     short summary never pretends there is more to read.
 *
 * @param {string|null|undefined} text
 * @param {number} max  budget for the visible text; output is at most max + 1
 *                      characters (the ellipsis).
 * @returns {string}
 */
export function truncateAtWord(text, max) {
  if (!text) return ''
  const t = String(text).trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const body = lastSpace > max * 0.4 ? cut.slice(0, lastSpace) : cut
  return body.replace(/[\s,;:.·—–-]+$/u, '') + '…'
}

/**
 * Render a date that may arrive EITHER as ISO or as hand-written Spanish prose.
 *
 * The reportaje snapshots carry both shapes — `publicadoEl: "15 de julio de
 * 2026"` next to `fechaDatos: "2026-07-06"` — and every surface that falls back
 * from one to the other has been printing the raw ISO string next to prose.
 * Anything non-ISO passes through verbatim rather than being guessed at.
 *
 * ISO date-only values are parsed as LOCAL midnight on purpose: `new
 * Date('2026-07-06')` is UTC midnight, which renders as the 5th for any reader
 * west of Greenwich. A publication date has no time zone.
 *
 * `idioma` sólo cambia el nombre del mes, como en `fmtDateShort`: la portada
 * valenciana fechaba sus reportajes «6 de julio de 2026».
 *
 * @param {string|null|undefined} value
 * @param {string} [idioma]  'es' (por defecto) o 'ca'
 * @returns {string}
 */
export function fmtDateHuman(value, idioma = 'es') {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Return the URL only when it is safe to put in an href, else null.
 * Guards against javascript:/data: hrefs from scraped external data (XSS).
 *
 * Site-absolute paths pass too. Some citations point at an artefact this site
 * publishes itself — a vote's per-bloc breakdown cites the session transcript
 * at `/data/pleno-transcripts/<plenoId>.txt` — and `new URL()` throws on a bare
 * path, so those were being turned into an unlinked <span> by ExtLink: the
 * citation silently disappeared instead of failing loudly. A leading `/` cannot
 * carry a scheme, so it cannot be the attack this function exists to stop.
 *
 * `//host/x` stays blocked: that is a protocol-relative REMOTE url wearing a
 * local path's clothes, and it is the one string a "starts with /" test gets
 * wrong.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function safeHref(url) {
  if (!url) return null
  if (url.startsWith('/')) return url.startsWith('//') ? null : url
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Rellena `{clave}` con su valor. Sin regex: una llave no es un patrón.
 *
 * Vivía dentro de /presupuesto, que la estrenó, y aquí llega sin cambiarle una
 * coma porque ya tiene dos consumidores: la cabecera de la portada compone su
 * chip con ella. Copiarla habría sido la trampa de siempre —una forma repetida
 * en vez de importada— y con una función de sustitución el coste de que las dos
 * copias deriven lo paga el lector en mitad de una frase.
 *
 * Y `split`/`join` en vez de `String.replace` a propósito, que es lo que hace
 * que merezca la pena centralizarla: con un patrón de TEXTO, `replace` cambia
 * sólo la PRIMERA aparición —una plantilla que repite `{n}` se queda a medias— y
 * además interpreta `$&` y compañía en el valor, de modo que un dato que
 * contenga `$&` se reescribe solo. Las dos cosas están fijadas en la prueba.
 *
 * @param {string} plantilla
 * @param {Record<string, string|number>} vars
 * @returns {string}
 */
export function rellena(plantilla, vars = {}) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), plantilla)
}

/**
 * Parte una plantilla por su hueco: `[antes, despues]`.
 *
 * Para las frases del catálogo que envuelven un dato en un elemento —«Atribuido
 * por la Generalitat a <strong>{municipio}</strong>; …»—, que `rellena` no puede
 * componer porque devuelve texto. El componente pinta `antes`, el elemento con el
 * dato y `despues`, y cada idioma pone el hueco donde su gramática lo pide.
 *
 * Una plantilla sin el hueco no se come el dato: va entera delante y el dato se
 * pinta detrás, que se ve y se arregla, en vez de desaparecer sin que se note.
 *
 * @param {string} plantilla
 * @param {string} hueco  p. ej. '{municipio}'
 * @returns {[string, string]}
 */
export function partePorHueco(plantilla, hueco) {
  const donde = plantilla.indexOf(hueco)
  if (donde === -1) return [plantilla, '']
  return [plantilla.slice(0, donde), plantilla.slice(donde + hueco.length)]
}

/**
 * Un decimal escrito como lo escribe esta página: con coma.
 *
 * /presupuesto publicaba «el 2.5 % del importe» —`cuota.toFixed(1)`— y, una
 * frase después, «los menores serían el 4.5 %», porque `String(4.5)` también
 * lleva punto. Dos líneas más arriba, la misma tarjeta escribe «22,06 M€». El
 * dato estaba bien las dos veces; el idioma del número no, y en castellano y en
 * valencià el separador decimal es la coma.
 *
 * Vive aquí y no en la página porque eran dos sitios dentro de UNA frase: dos
 * copias de una decisión de formato es exactamente lo que acaba derivando.
 *
 * No inventa decimales que no hay —`decimal(7)` es «7», no «7,0»— y sin número
 * devuelve la cadena vacía en vez de un cero, que es un dato que nadie midió.
 *
 * @param {number|null|undefined} n
 * @param {number} [digitos]  el máximo de decimales, 1 por defecto
 * @returns {string}
 */
export function decimal(n, digitos = 1) {
  if (n == null || !Number.isFinite(Number(n))) return ''
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: digitos })
}

/**
 * Un porcentaje para leer: lo que no es cero no se escribe «0», ni lo que no
 * llega al total «100». Con 2 declaraciones de 1.005 la ficha de urbanismo decía
 * «0%», y quien lee concluye que no hay ninguna. Devuelve la cifra sin el signo;
 * sin total no hay proporción, y eso es `null`, no un cero.
 *
 * @param {number} parte
 * @param {number} total
 * @returns {string | null}
 */
export function porcentajeLegible(parte, total) {
  if (!(total > 0)) return null
  const bruto = (parte / total) * 100
  if (bruto > 0 && bruto < 1) return '<1'
  if (bruto > 99 && bruto < 100) return '>99'
  return String(Math.round(bruto))
}
