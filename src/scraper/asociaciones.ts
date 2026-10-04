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
 *   KNOWN RESIDUAL (Wave 3.1): the final `EMAIL_ONLY_RE` gate guarantees
 *   WELL-FORMEDNESS, not correctness. An address ending in an unseen town/venue
 *   glued to the email (e.g. a town not in the trim list) can pass as a
 *   valid-looking but WRONG email rather than degrading to null (1/85 in the
 *   fixture: "Espai Dona" → Donadones…@). The `email` field is therefore
 *   JSON-only — NOT rendered on any surface (/datos shows nombre + tipo). A
 *   town-gazetteer hardening to prefer null on unresolved glue is tracked as a
 *   Wave 3.1 follow-up. Do not surface `email` on a public page until then.
 * - long rows wrap across lines: a fragment line carries the fields the
 *   previous row is still missing (tipo / domicilio / email). Fragments are
 *   attached to the previous row instead of surfacing as junk rows.
 * - a handful of rows have a single space (not 2+) after the tipo; those are
 *   split at "<Tipo>␠<address-start>" as a fallback.
 *
 * La columna CIF (registro del 9-jul-2026). El PDF de julio añade «CIF» entre
 * «Domicilio Social» y «Correo de la entidad», y pdf-parse la pega a las dos:
 * «…de TúriaG46694352 afacundo@…», «…de TúriaG97932685udp.ribarroja@…». El
 * parser no la conocía y, del 13-jul al 4-oct, se publicaron domicilios con el
 * CIF pegado, líneas sueltas como entidades («G24784993», «46190 Riba-roja del
 * Túria…») y correos dentro del nombre, que /datos pinta. Ahora:
 * - la cola «<CIF>[␠]<Correo>» se separa de la línea ANTES que nada (`separarCola`):
 *   el CIF tiene forma fija, así que marca dónde acaba el domicilio y empieza el
 *   correo sin las podas a ojo que necesita `extractEmail` en el formato de mayo;
 * - una línea que sólo trae la cola (el CIF, o CIF y correo) completa su fila;
 * - una línea que empieza por un código postal sigue el domicilio de su fila;
 * - si la fila anterior sólo tiene nombre, la línea siguiente sin tipo delante
 *   es la segunda línea de ese nombre: todas las filas del registro llevan tipo
 *   (0 sin él en mayo y en julio), así que un nombre solo es un nombre partido;
 * - el tipo se busca en TODAS sus apariciones, no sólo en la primera, y también
 *   pegado sin espacio a los dos lados («Casa PeruCulturalPere Rico, …»).
 * Lo que aun así sale mal no se publica: `motivosParaNoPublicar` lo comprueba
 * antes de escribir.
 */
export interface Asociacion {
  nombre: string
  tipo: string | null
  domicilio: string | null
  /** CIF de la entidad, sin guion. `null` en el formato de mayo, que no lo traía. */
  cif: string | null
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

// Un código postal al principio de la línea: es domicilio, nunca un nombre
// («46190 Riba-roja del Túria…», segunda línea del domicilio de Riba-rock).
const CP_RE = /^\d{5}\b/

// CIF de la entidad: letra de la forma jurídica, siete cifras y un carácter de
// control; «G-98473978» lo trae con guion.
const CIF_RE = /[ABCDEFGHJNPQRSUVW]-?\d{7}[0-9A-J]/

// La cola de una fila con CIF: «<CIF>[␠…]<Correo>[;]» al final de la línea.
const COLA_RE = new RegExp(`(${CIF_RE.source})(?:\\s*(\\S+@\\S+))?$`)

/**
 * Separa la cola «<CIF>[␠]<Correo>» del final de una línea. Lo que queda delante
 * (la cabeza) es «<Nombre><Tipo>␠␠<Domicilio>» o un trozo de ello, y ya no lleva
 * ni el CIF ni el correo, así que ninguno de los dos puede acabar en el nombre
 * aunque el corte de la cabeza falle. Sin CIF la línea vuelve entera: es el
 * formato de mayo, y allí el correo lo saca `splitDomicilioEmail`.
 */
function separarCola(line: string): { cabeza: string; cif: string | null; email: string | null } {
  const m = COLA_RE.exec(line)
  if (!m) return { cabeza: line, cif: null, email: null }
  const correo = m[2]?.replace(/[;,.]+$/, '') ?? null // «…@gmail.com;»
  return {
    cabeza: line.slice(0, m.index).trim(),
    cif: m[1].replace('-', ''),
    email: correo !== null && EMAIL_ONLY_RE.test(correo) ? correo : null,
  }
}

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

/**
 * Fallback for rows with no 2+ gap after the tipo. Recorre TODAS las apariciones
 * de cada tipo, de izquierda a derecha: en «Asociación Cultural TaurinaCultural
 * Ctra. …» el primer «Cultural » es del nombre, y mirar sólo la primera dejaba
 * la línea entera —correo incluido— como nombre.
 * - «<Tipo>␠<address-start>»: the address token keeps nombres like "Asociación
 *   Cultural Fiestas Cristo…" from being split mid-name;
 * - «<Nombre><Tipo><Domicilio>» sin un espacio («Casa PeruCulturalPere Rico,
 *   …»): sólo si el tipo va pegado a la izquierda —así junta pdf-parse las
 *   columnas; dentro de un nombre el tipo es una palabra suelta— y a la derecha
 *   arranca una mayúscula o una señal de calle.
 */
function cortarSinHueco(line: string): { left: string; rest: string } | null {
  for (let i = 1; i < line.length; i++) {
    const t = TIPOS.find((tipo) => line.startsWith(tipo, i))
    if (!t) continue
    const fin = i + t.length
    const tras = line.slice(fin)
    if (tras.startsWith(' ') && ADDR_START_RE.test(tras.slice(1)))
      return { left: line.slice(0, fin), rest: tras.slice(1).trim() }
    if (!/\s/.test(line[i - 1]) && (/^[A-ZÁÉÍÓÚÑ]/.test(tras) || ADDR_START_RE.test(tras)))
      return { left: line.slice(0, fin), rest: tras.trim() }
  }
  return null
}

/** «<Nombre><Tipo>␠␠<Domicilio>[<Correo>]», ya sin la cola con CIF → sus campos. */
function partirFila(line: string): Asociacion {
  // Split "<Nombre><Tipo>" from the rest at the first 2+ space gap.
  const gap = line.match(/^(.+?)\s{2,}(.*)$/)
  let left = (gap ? gap[1] : line).trim()
  let rest = gap ? gap[2].trim() : ''
  const corte = gap ? null : cortarSinHueco(line)
  if (corte) {
    left = corte.left
    rest = corte.rest
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
  return { nombre, tipo, domicilio, cif: null, email }
}

/** Pone en la fila la cola de su línea, sin pisar lo que la fila ya tenga. */
function ponCola(fila: Asociacion, cola: { cif: string | null; email: string | null }) {
  if (fila.cif === null) fila.cif = cola.cif
  if (fila.email === null) fila.email = cola.email
}

export function parseAsociacionesPdf(text: string): AsociacionesDoc {
  const fechaRegistro = (text.match(/Fecha actualizaci[oó]n\s+(.+)/i) || [])[1]?.trim() || null

  const asociaciones: Asociacion[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length < 8) continue
    if (/^Fecha actualiz|Nombre de la entidad/i.test(line)) continue

    const { cabeza, ...cola } = separarCola(line)

    // — Wrapped-row fragments: attach to the previous row instead of pushing a
    //   junk row (an email, a bare tipo, a CIF or an address is never a nombre).
    const row = asociaciones[asociaciones.length - 1]
    if (row) {
      if (!cabeza) {
        // «G24784993», «G96909601avpoudescoto@gmail.com»: la línea es sólo cola.
        ponCola(row, cola)
        continue
      }
      if (EMAIL_ONLY_RE.test(cabeza)) {
        if (row.email === null) row.email = cabeza
        continue
      }
      if (TIPO_SET.has(cabeza)) {
        if (row.tipo === null) row.tipo = cabeza
        continue
      }
      // Una fila sigue abierta mientras no tenga ni CIF ni correo: cualquiera de
      // los dos es el final de su línea en el registro.
      const abierta = row.cif === null && row.email === null
      const tipoLed = TIPOS.find(
        (t) => cabeza.startsWith(t) && ADDR_START_RE.test(cabeza.slice(t.length).trimStart()),
      )
      if (tipoLed) {
        // "<Tipo>␠␠<Domicilio><Correo>" fragment (nombre was on the previous line).
        if (abierta && row.tipo === null && row.domicilio === null) {
          row.tipo = tipoLed
          const { domicilio, email } = splitDomicilioEmail(cabeza.slice(tipoLed.length).trim())
          row.domicilio = domicilio
          row.email = email
          ponCola(row, cola)
        }
        continue
      }
      if (ADDR_START_RE.test(cabeza) || CP_RE.test(cabeza)) {
        // Con código postal delante, la línea puede ser la SEGUNDA del domicilio
        // («C/ Villamarchante, 86-19» + «46190 Riba-roja del Túria…»).
        if (abierta && (row.domicilio === null || CP_RE.test(cabeza))) {
          const { domicilio, email } = splitDomicilioEmail(cabeza)
          row.domicilio = [row.domicilio, domicilio].filter(Boolean).join(' ') || null
          row.email = email
          ponCola(row, cola)
        }
        continue
      }
      if (abierta && row.tipo === null && row.domicilio === null) {
        // La fila anterior no tiene más que el nombre, y toda fila del registro
        // lleva tipo: esta línea es la segunda de ese nombre («…(Agrupación
        // cultural festera» + «Xaranga el Minaor)»), no una entidad nueva.
        const resto = partirFila(cabeza)
        row.nombre = `${row.nombre} ${resto.nombre}`
        row.tipo = resto.tipo
        row.domicilio = resto.domicilio
        row.email = resto.email
        ponCola(row, cola)
        continue
      }
    }

    const fila = partirFila(cabeza)
    if (fila.nombre.length < 3) continue
    ponCola(fila, cola)
    asociaciones.push(fila)
  }

  return { fechaRegistro, asociaciones }
}

/** Techo de filas sin tipo con el que un registro leído todavía se publica. */
export const TECHO_SIN_TIPO = 0.05

/**
 * Por qué NO publicar un registro recién leído; vacío = se puede escribir.
 *
 * El adaptador es best-effort en la nocturna para que un cambio de forma del
 * PDF falle sin tumbar lo demás y deje en pie el snapshot anterior. Pero aquí
 * un cambio de forma no lanza nada: degrada. Con el PDF de julio el parser
 * siguió devolviendo filas —más que nunca, con trozos de otras—, y se
 * publicaron así casi tres meses. Esto convierte esa degradación en un fallo:
 * - un correo o un CIF dentro del nombre o del domicilio: columnas pegadas, y
 *   un correo en el nombre es un correo publicado (/datos pinta el nombre);
 * - más filas sin tipo que el techo: se movió la forma o el vocabulario;
 * - ninguna fila: el PDF no se leyó.
 */
export function motivosParaNoPublicar(doc: AsociacionesDoc): string[] {
  const filas = doc.asociaciones
  if (filas.length === 0) return ['ninguna fila leída del PDF']
  const motivos: string[] = []
  const pegadas = filas.flatMap((a, i) =>
    [a.nombre, a.domicilio ?? ''].some((v) => v.includes('@') || CIF_RE.test(v)) ? [i] : [],
  )
  if (pegadas.length > 0)
    motivos.push(
      `${pegadas.length} fila(s) con un correo o un CIF dentro del nombre o el domicilio (posiciones ${pegadas.join(', ')})`,
    )
  const sinTipo = filas.filter((a) => a.tipo === null).length
  if (sinTipo / filas.length > TECHO_SIN_TIPO)
    motivos.push(`${sinTipo} de ${filas.length} filas sin tipo (techo: ${TECHO_SIN_TIPO * 100} %)`)
  return motivos
}
