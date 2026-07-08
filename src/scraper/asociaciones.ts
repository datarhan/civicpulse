/**
 * Pure parser for the municipal association register PDF (pdf-parsed to text
 * upstream). Each row is "<Nombre><Tipo>␠␠<Domicilio><Correo>" — the type is a
 * controlled vocabulary glued to the name and followed by 2+ spaces; the email
 * (when present) is the trailing token. No I/O.
 *
 * pdf-parse quirks handled here (all observed in the committed fixture):
 * - the domicilio column glues straight into the correo column (no separator),
 *   so a naive email regex absorbs the tail of the address ("…de Túria" →
 *   "ria…", "…46190" → leading digits, "…s/n" → "n"). `extractEmail` trims
 *   only those observed remnants — an honest miss beats a fabricated email.
 * - long rows wrap across lines: a fragment line carries the fields the
 *   previous row is still missing (tipo / domicilio / email). Fragments are
 *   attached to the previous row instead of surfacing as junk rows.
 * - a handful of rows have a single space (not 2+) after the tipo; those are
 *   split at "<Tipo>␠<address-start>" as a fallback.
 */
export interface Asociacion {
  nombre: string
  tipo: string | null
  domicilio: string | null
  email: string | null
}

export interface AsociacionesDoc {
  fechaRegistro: string | null
  asociaciones: Asociacion[]
}

// Controlled vocabulary of tipos (from the register). Longest-first so
// "B.Animal" wins over "Animal" and multi-word types match before single
// ("Fallas" before "Falla").
const TIPOS = [
  'Medioambiental',
  'B.Animal',
  'Deportiva',
  'Educativa',
  'Solidaria',
  'Religiosa',
  'Comercial',
  'Cultural',
  'Vecinal',
  'Sanitaria',
  'Fiestas',
  'Fallas',
  'Genero',
  'Musical',
  'Juvenil',
  'Social',
  'Mujer',
  'Falla',
  'Peña',
].sort((a, b) => b.length - a.length)

const TIPO_SET = new Set(TIPOS)

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const EMAIL_ONLY_RE = new RegExp(`^${EMAIL_RE.source}$`)

// Address-start tokens (used to recognise wrapped domicilio fragments and the
// single-space tipo gap). Anchored token list — no bare word-boundary so
// "Casa/Club/Coordinadora…" nombres can never match.
const ADDR_START_RE =
  /^(?:[Cc]\/|Ctra|Crta|Carrer |Cam[ií] |Avda|Avinguda|Avenida |Pla[çz]a |Plaza |Partida |Ptda|Urb)/

/**
 * Extract the email from a glued "<domicilio><correo>" segment. The regex's
 * leftmost ASCII run absorbs the address tail, so trim the remnants observed
 * in the register: "…de Túria" (the non-ASCII ú stops the run at "ria…"),
 * "…s/n" (the slash leaves a leading "n"), house/CP numbers ("…46190…"),
 * and bare town/venue names glued mid-word. Ambiguous all-letter boundaries
 * are left as-is (reported upstream, never guessed).
 */
function extractEmail(segment: string): string | null {
  const m = EMAIL_RE.exec(segment)
  if (!m) return null
  let email = m[0]
  const prev = m.index > 0 ? segment.charAt(m.index - 1) : ''
  if ((prev === 'ú' || prev === 'Ú') && email.startsWith('ria'))
    email = email.slice(3) // "…de Túria" tail
  else if (prev === '/' && email.startsWith('n')) email = email.slice(1) // "…s/n" tail
  email = email
    .replace(/^[\d.,_-]+/, '') // house/CP number tails ("…46190", "…8-3", "…KM 7")
    .replace(/^(?:Riba-roja|Valencia|Vilamarxant|Municipal)(?=[A-Za-z])/, '') // glued town/venue tails
    .replace(/^[.\-_]+/, '') // separator left at the seam
  return EMAIL_ONLY_RE.test(email) ? email : null
}

/** Split a "<domicilio><correo>" segment into its two fields. */
function splitDomicilioEmail(segment: string): { domicilio: string | null; email: string | null } {
  const email = extractEmail(segment)
  const domicilio = (email ? segment.replace(email, '') : segment).trim() || null
  return { domicilio, email }
}

export function parseAsociacionesPdf(text: string): AsociacionesDoc {
  const fechaRegistro = (text.match(/Fecha actualizaci[oó]n\s+(.+)/i) || [])[1]?.trim() || null

  const asociaciones: Asociacion[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length < 8) continue
    if (/^Fecha actualiz|Nombre de la entidad/i.test(line)) continue

    // — Wrapped-row fragments: attach to the previous row instead of pushing
    //   a junk row (an email, a bare tipo, or an address is never a nombre).
    const row = asociaciones[asociaciones.length - 1]
    if (row) {
      if (EMAIL_ONLY_RE.test(line)) {
        if (row.email === null) row.email = line
        continue
      }
      if (TIPO_SET.has(line)) {
        if (row.tipo === null) row.tipo = line
        continue
      }
      const tipoLed = TIPOS.find(
        (t) => line.startsWith(t) && ADDR_START_RE.test(line.slice(t.length).trimStart()),
      )
      if (tipoLed) {
        // "<Tipo>␠␠<Domicilio><Correo>" fragment (nombre was on the previous line).
        if (row.tipo === null && row.domicilio === null && row.email === null) {
          row.tipo = tipoLed
          const { domicilio, email } = splitDomicilioEmail(line.slice(tipoLed.length).trim())
          row.domicilio = domicilio
          row.email = email
        }
        continue
      }
      if (ADDR_START_RE.test(line)) {
        if (row.domicilio === null && row.email === null) {
          const { domicilio, email } = splitDomicilioEmail(line)
          row.domicilio = domicilio
          row.email = email
        }
        continue
      }
    }

    // Split "<Nombre><Tipo>" from the rest at the first 2+ space gap.
    const gap = line.match(/^(.+?)\s{2,}(.*)$/)
    let left = (gap ? gap[1] : line).trim()
    let rest = gap ? gap[2].trim() : ''

    // Fallback: a few rows leave only ONE space after the tipo — split at
    // "<Tipo>␠<address-start>" (the address token keeps nombres like
    // "Asociación Cultural Fiestas Cristo…" from being split mid-name).
    if (!gap) {
      for (const t of TIPOS) {
        const i = line.indexOf(`${t} `)
        if (i > 0 && ADDR_START_RE.test(line.slice(i + t.length + 1))) {
          left = line.slice(0, i + t.length)
          rest = line.slice(i + t.length + 1).trim()
          break
        }
      }
    }

    // tipo = the vocabulary token the left segment ends with (glued to nombre).
    let tipo: string | null = null
    let nombre = left
    for (const t of TIPOS) {
      if (left.endsWith(t) && left.length > t.length) {
        tipo = t
        nombre = left.slice(0, left.length - t.length).trim()
        break
      }
    }

    const { domicilio, email } = splitDomicilioEmail(rest)
    if (nombre.length < 3) continue
    asociaciones.push({ nombre, tipo, domicilio, email })
  }

  return { fechaRegistro, asociaciones }
}
