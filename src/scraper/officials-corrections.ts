/**
 * Correcciones curadas del padrón de la corporación — validador y mezcla.
 *
 * `public/data/officials.json` se raspa cada noche de la página «Corporación
 * Municipal» de ribarroja.es, y esa página puede ir con retraso respecto a lo
 * que el propio Pleno ya acordó. El 05-09-2026 seguía listando a una concejala
 * que presentó su renuncia el 14-05-2025 —el Pleno tomó razón el 02-06-2025— y
 * no listaba a quien tomó posesión de su escaño el 07-07-2025. El sitio
 * heredaba la mora del ayuntamiento y la firmaba como «datos reales».
 *
 * Una edición a mano de `officials.json` no sirve: la nocturna siguiente la
 * pisa, y no deja rastro de quién decidió qué ni con qué acta. Así que la
 * corrección vive en su propio fichero, `officials-corrections.json`, que es
 * CURADO —lo escribe una persona a través de `npm run roster-correction`, nunca
 * la automatización— y se APLICA en tiempo de construcción, en
 * `scripts/scrape-officials.ts`, después de parsear la página. El fichero
 * publicado lleva así las dos cosas: lo que raspó, y lo que el acta corrige.
 *
 * ## Lo que este fichero puede y no puede decir
 *
 * Republica lo que el acta dice: que alguien dejó el cargo y por qué motivo
 * de los que la ley contempla, y que alguien tomó posesión con credencial de
 * la Junta Electoral Central. Cada entrada cita el acta literal (≥20
 * caracteres) y va firmada. **No tiene ningún campo donde quepa un juicio**, y
 * el validador rechaza a cualquier profundidad los mismos campos que rechaza
 * `competencias.ts`: nombra a personas vivas, así que la prosa valorativa no
 * tiene dónde vivir.
 *
 * ## Un centinela nunca es un valor
 *
 * Quien entra por aquí no tiene retrato en la página raspada. Eso se dice con
 * `photo: { estado: 'no-publicada', motivo }` y no con un `photoUrl: ''` a
 * secas, porque la cadena vacía no distingue «el ayuntamiento no lo publica»
 * de «la descarga falló» —que es la pareja `falta` / `enlazada` de
 * `check:competencias`—. La mezcla vuelca el motivo en `photoNote`, y la
 * ficha lo pinta junto a las iniciales. Igual con `email: null`: es explícito,
 * y la página lo lee como «sin correo publicado», nunca como el buzón de otro.
 *
 * ## Una corrección que ya no corrige es un error
 *
 * Aplicar una baja cuyo slug ya no está en el raspado, o un alta cuyo slug ya
 * está, LANZA. Las dos son la web poniéndose al día: la corrección sobra y hay
 * que retirarla con `--retirar`, para que el fichero no afirme una
 * discrepancia que ya no existe sobre una persona con nombre. Que no haga
 * nada en silencio sería el centinela otra vez.
 */
import { PARTIES, type Official, type Party } from './corporacion'
import { CAMPOS_PROHIBIDOS } from './competencias'
import { slugify } from './normalize'

/** Por qué alguien deja de ser concejal, en los términos de la LOREG. */
export const MOTIVOS_BAJA = ['renuncia', 'fallecimiento', 'perdida-condicion'] as const
export type MotivoBaja = (typeof MOTIVOS_BAJA)[number]

/** Estado del retrato de quien entra: hoy sólo cabe que la fuente no lo publique. */
export const ESTADOS_FOTO = ['no-publicada'] as const
export type EstadoFoto = (typeof ESTADOS_FOTO)[number]

export interface FuenteCorreccion {
  title: string
  url: string
  /** YYYY-MM-DD del documento citado. */
  date: string
  /** Literal del acta, ≥20 caracteres; la prueba lo busca en la fixture. */
  quote: string
}

export interface MencionPrensa {
  title: string
  url: string
  date: string
}

export interface Baja {
  slug: string
  name: string
  /** El día en que el Pleno tomó razón: desde entonces el escaño está vacante. */
  until: string
  reason: MotivoBaja
  /** `slug` de un alta de este mismo fichero, o `null` si el escaño sigue vacante. */
  replacedBy: string | null
  source: FuenteCorreccion
  alsoReported?: MencionPrensa[]
  curatedBy: string
  curatedAt: string
}

export interface Alta {
  slug: string
  name: string
  honorific: 'Sr.' | 'Sra.'
  /** Una sustitución nunca trae un alcalde: eso es otra clase de acto. */
  role: 'concejal'
  party: Party
  portfolios: string[]
  /** El día de la toma de posesión ante el Pleno. */
  since: string
  credencial: { emitidaPor: string; fecha: string }
  /** Explícito: `null` se pinta como «sin correo publicado». */
  email: string | null
  photo: { estado: EstadoFoto; motivo: string }
  cvUrl: string | null
  source: FuenteCorreccion
  curatedBy: string
  curatedAt: string
}

/** Derecho de réplica de las personas que este fichero nombra. */
export interface ReplicaPadron {
  oficial: string
  recibidaEl: string
  texto: string
}

export interface OfficialsCorrections {
  generatedAt: string
  mandate: string
  note: string
  bajas: Baja[]
  altas: Alta[]
  replicas: ReplicaPadron[]
}

export class OfficialsCorrectionsError extends Error {}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new OfficialsCorrectionsError(msg)
}

const esTexto = (v: unknown, min = 1): v is string =>
  typeof v === 'string' && v.trim().length >= min
const esFecha = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const esUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/\S+$/.test(v)
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** Recorre todo el fichero: un campo prohibido no se admite ni escondido. */
function barrerProhibidos(v: unknown, donde: string, errores: string[]): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => barrerProhibidos(x, `${donde}[${i}]`, errores))
    return
  }
  if (!esObjeto(v)) return
  for (const [k, x] of Object.entries(v)) {
    const ruta = donde ? `${donde}.${k}` : k
    if (CAMPOS_PROHIBIDOS.has(k)) errores.push(`${ruta}: campo con forma de juicio, prohibido`)
    barrerProhibidos(x, ruta, errores)
  }
}

function validarFuente(f: unknown, donde: string, errores: string[]): void {
  if (!esObjeto(f)) {
    errores.push(`${donde} debe ser un objeto {title, url, date, quote}`)
    return
  }
  if (!esTexto(f.title, 10)) errores.push(`${donde}.title vacío (≥10 caracteres)`)
  if (!esUrl(f.url)) errores.push(`${donde}.url debe ser una URL absoluta`)
  if (!esFecha(f.date)) errores.push(`${donde}.date debe ser YYYY-MM-DD`)
  if (!esTexto(f.quote, 20)) errores.push(`${donde}.quote: cita literal del acta (≥20 caracteres)`)
}

function validarFirma(x: Record<string, unknown>, donde: string, errores: string[]): void {
  if (!esTexto(x.curatedBy)) errores.push(`${donde}.curatedBy vacío: esto nombra a una persona`)
  if (!esFecha(x.curatedAt)) errores.push(`${donde}.curatedAt debe ser YYYY-MM-DD`)
}

export function validateOfficialsCorrections(json: unknown): OfficialsCorrections {
  must(esObjeto(json), 'officials-corrections: debe ser un objeto')
  const r = json
  const errores: string[] = []

  if (!esTexto(r.generatedAt) || Number.isNaN(Date.parse(r.generatedAt)))
    errores.push('generatedAt debe ser una fecha ISO')
  if (!esTexto(r.mandate, 4)) errores.push('mandate vacío')
  if (!esTexto(r.note, 20)) errores.push('note: explica qué es este fichero (≥20 caracteres)')
  barrerProhibidos(r, '', errores)

  const bajas = Array.isArray(r.bajas) ? (r.bajas as unknown[]) : null
  const altas = Array.isArray(r.altas) ? (r.altas as unknown[]) : null
  if (!bajas) errores.push('bajas debe ser un array')
  if (!altas) errores.push('altas debe ser un array')

  // (Aquí vivía `altaSlugs`, el conjunto contra el que se validaba
  // `replacedBy`. Esa comprobación se mudó a `applyOfficialsCorrections`, que sí
  // ve el padrón compuesto; el conjunto se quedó sin usar.)
  const slugs = new Set<string>()
  const registrar = (slug: unknown) => {
    if (!esTexto(slug)) return
    if (slugs.has(slug)) errores.push(`slug duplicado entre bajas y altas: ${slug}`)
    slugs.add(slug)
  }

  bajas?.forEach((b, i) => {
    const donde = `bajas[${i}]`
    if (!esObjeto(b)) {
      errores.push(`${donde} debe ser un objeto`)
      return
    }
    if (!esTexto(b.slug)) errores.push(`${donde}.slug vacío`)
    if (!esTexto(b.name, 5)) errores.push(`${donde}.name vacío`)
    if (esTexto(b.slug) && esTexto(b.name) && b.slug !== slugify(b.name))
      errores.push(`${donde}.slug «${b.slug}» no sale del nombre (sería «${slugify(b.name)}»)`)
    if (!esFecha(b.until)) errores.push(`${donde}.until debe ser YYYY-MM-DD`)
    if (!MOTIVOS_BAJA.includes(b.reason as MotivoBaja))
      errores.push(`${donde}.reason fuera del enum (${MOTIVOS_BAJA.join(' | ')})`)
    // `replacedBy` se valida como SLUG aquí, y su integridad referencial se
    // comprueba en `applyOfficialsCorrections`, contra el padrón compuesto.
    //
    // Exigía ser un alta DE ESTE FICHERO, y eso se rompió solo el 8-09-2026:
    // cuando la web se puso al día, el alta quedó absorbida y hubo que
    // retirarla — con lo que el validador tumbaba el fichero entero y la única
    // salida era borrar el relevo. Pero a quién sustituyó lo dice el acta y
    // sigue siendo verdad; lo que cambia es dónde vive el sustituto, que pasa
    // del fichero al raspado.
    //
    // Comprobarlo contra el padrón es además MÁS fuerte que la regla vieja:
    // antes bastaba con que el slug estuviera en `altas`, aunque nadie ocupase
    // el escaño.
    if (b.replacedBy !== null && !(esTexto(b.replacedBy) && b.replacedBy === slugify(b.replacedBy)))
      errores.push(
        `${donde}.replacedBy «${String(b.replacedBy)}» debe ser un slug (o null); ` +
          'que ocupe escaño se comprueba al componer el padrón',
      )
    validarFuente(b.source, `${donde}.source`, errores)
    if (b.alsoReported !== undefined) {
      if (!Array.isArray(b.alsoReported)) errores.push(`${donde}.alsoReported debe ser un array`)
      else
        b.alsoReported.forEach((m, j) => {
          const d = `${donde}.alsoReported[${j}]`
          if (!esObjeto(m)) errores.push(`${d} debe ser un objeto`)
          else {
            if (!esTexto(m.title, 10)) errores.push(`${d}.title vacío`)
            if (!esUrl(m.url)) errores.push(`${d}.url debe ser una URL absoluta`)
            if (!esFecha(m.date)) errores.push(`${d}.date debe ser YYYY-MM-DD`)
          }
        })
    }
    validarFirma(b, donde, errores)
    registrar(b.slug)
  })

  altas?.forEach((a, i) => {
    const donde = `altas[${i}]`
    if (!esObjeto(a)) {
      errores.push(`${donde} debe ser un objeto`)
      return
    }
    if (!esTexto(a.slug)) errores.push(`${donde}.slug vacío`)
    if (!esTexto(a.name, 5)) errores.push(`${donde}.name vacío`)
    if (esTexto(a.slug) && esTexto(a.name) && a.slug !== slugify(a.name))
      errores.push(`${donde}.slug «${a.slug}» no sale del nombre (sería «${slugify(a.name)}»)`)
    if (a.honorific !== 'Sr.' && a.honorific !== 'Sra.')
      errores.push(`${donde}.honorific debe ser Sr. o Sra.`)
    if (a.role !== 'concejal')
      errores.push(`${donde}.role: un alta por sustitución siempre es «concejal»`)
    if (!PARTIES.includes(a.party as Party) || a.party === 'Otro')
      errores.push(`${donde}.party fuera del enum, o el centinela «Otro»`)
    if (!Array.isArray(a.portfolios) || !a.portfolios.every((p) => esTexto(p)))
      errores.push(`${donde}.portfolios debe ser un array de textos (puede estar vacío)`)
    if (!esFecha(a.since)) errores.push(`${donde}.since debe ser YYYY-MM-DD`)
    if (!esObjeto(a.credencial)) errores.push(`${donde}.credencial debe ser un objeto`)
    else {
      if (!esTexto(a.credencial.emitidaPor, 3)) errores.push(`${donde}.credencial.emitidaPor vacío`)
      if (!esFecha(a.credencial.fecha))
        errores.push(`${donde}.credencial.fecha debe ser YYYY-MM-DD`)
    }
    if (a.email !== null && !(esTexto(a.email) && a.email.includes('@')))
      errores.push(`${donde}.email debe ser null (sin correo publicado) o un correo`)
    if (!esObjeto(a.photo)) errores.push(`${donde}.photo debe ser {estado, motivo}`)
    else {
      if (!ESTADOS_FOTO.includes(a.photo.estado as EstadoFoto))
        errores.push(`${donde}.photo.estado fuera del enum (${ESTADOS_FOTO.join(' | ')})`)
      if (!esTexto(a.photo.motivo, 20))
        errores.push(`${donde}.photo.motivo: por qué no hay retrato (≥20 caracteres)`)
    }
    if (a.cvUrl !== null && !esUrl(a.cvUrl))
      errores.push(`${donde}.cvUrl debe ser null o una URL absoluta`)
    validarFuente(a.source, `${donde}.source`, errores)
    validarFirma(a, donde, errores)
    registrar(a.slug)
  })

  const replicas = Array.isArray(r.replicas) ? (r.replicas as unknown[]) : null
  if (!replicas) errores.push('replicas debe ser un array (vacío si nadie ha replicado)')
  else
    replicas.forEach((p, i) => {
      const donde = `replicas[${i}]`
      if (!esObjeto(p)) {
        errores.push(`${donde} debe ser un objeto`)
        return
      }
      if (!esTexto(p.oficial) || !slugs.has(p.oficial))
        errores.push(`${donde}.oficial debe ser una persona que este fichero nombre`)
      if (!esFecha(p.recibidaEl)) errores.push(`${donde}.recibidaEl debe ser YYYY-MM-DD`)
      if (!esTexto(p.texto, 20)) errores.push(`${donde}.texto vacío (≥20 caracteres)`)
    })

  if (errores.length)
    throw new OfficialsCorrectionsError(
      `officials-corrections inválido:\n  - ${errores.join('\n  - ')}`,
    )
  return r as unknown as OfficialsCorrections
}

/** La marca de procedencia de una fila que NO salió del raspado. */
export interface CorreccionMarca {
  tipo: 'alta'
  since: string
  source: FuenteCorreccion
}

export type CorrectedOfficial = Official & {
  correccion?: CorreccionMarca
  /** Sólo cuando la fuente no publica retrato: el porqué, para pintarlo. */
  photoNote?: string
}

export interface FormerOfficial extends Official {
  estado: 'cesado'
  until: string
  reason: MotivoBaja
  replacedBy: string | null
  source: FuenteCorreccion
}

export interface ApplyResult {
  officials: CorrectedOfficial[]
  formerOfficials: FormerOfficial[]
  applied: { bajas: number; altas: number }
}

/**
 * Mezcla las correcciones sobre el padrón RASPADO (nunca sobre uno ya
 * corregido: ver `rawFromPublished`). Lanza cuando una corrección ya no
 * corrige nada, a propósito.
 */
export function applyOfficialsCorrections(
  parsed: Official[],
  corrections: OfficialsCorrections | null,
): ApplyResult {
  if (!corrections) {
    return {
      officials: parsed.map((o) => ({ ...o })),
      formerOfficials: [],
      applied: { bajas: 0, altas: 0 },
    }
  }
  const c = validateOfficialsCorrections(corrections)
  const officials: CorrectedOfficial[] = parsed.map((o) => ({ ...o }))
  const formerOfficials: FormerOfficial[] = []

  for (const b of c.bajas) {
    const i = officials.findIndex((o) => o.slug === b.slug)
    must(
      i >= 0,
      `baja ${b.slug}: no está en el raspado — la corrección es vieja o errónea; ` +
        'retírala con `npm run roster-correction -- --retirar ' +
        b.slug +
        '`',
    )
    const [o] = officials.splice(i, 1)
    formerOfficials.push({
      ...o,
      estado: 'cesado',
      until: b.until,
      reason: b.reason,
      replacedBy: b.replacedBy,
      source: b.source,
    })
  }

  for (const a of c.altas) {
    must(
      !officials.some((o) => o.slug === a.slug),
      `alta ${a.slug}: ya figura en el raspado — la web se puso al día; ` +
        'retira la corrección con `npm run roster-correction -- --retirar ' +
        a.slug +
        '`',
    )
    // El logo es del partido, no de la persona: se toma del compañero de grupo.
    const partyLogoUrl = officials.find((o) => o.party === a.party)?.partyLogoUrl ?? ''
    const row: CorrectedOfficial = {
      slug: a.slug,
      name: a.name,
      honorific: a.honorific,
      role: a.role,
      party: a.party,
      portfolios: [...a.portfolios],
      email: a.email,
      photoUrl: '',
      partyLogoUrl,
      cvUrl: a.cvUrl,
      photoNote: a.photo.motivo,
      correccion: { tipo: 'alta', since: a.since, source: a.source },
    }
    // Se sienta detrás del último de su grupo, como en la página del ayuntamiento;
    // sin compañeros, al final.
    let at = officials.length
    for (let i = officials.length - 1; i >= 0; i -= 1) {
      if (officials[i].party === a.party) {
        at = i + 1
        break
      }
    }
    officials.splice(at, 0, row)
  }

  // La integridad referencial de `replacedBy`, ahora contra el padrón de
  // verdad: quien sustituye tiene que ocupar un escaño. Se comprueba AQUÍ y no
  // en el validador porque el sustituto puede venir de un alta curada o del
  // raspado, y el fichero solo, por definición, no ve lo segundo.
  const sentados = new Set(officials.map((o) => o.slug))
  for (const b of c.bajas) {
    if (b.replacedBy === null) continue
    must(
      sentados.has(b.replacedBy),
      `baja ${b.slug}: replacedBy «${b.replacedBy}» no ocupa ningún escaño del padrón compuesto — ` +
        'o el relevo está mal escrito, o quien lo ocupa se ha caído del raspado',
    )
  }

  return {
    officials,
    formerOfficials,
    applied: { bajas: c.bajas.length, altas: c.altas.length },
  }
}

/**
 * Deshace la mezcla: el padrón tal como lo raspó el scraper. Es lo que permite
 * recomponer `officials.json` sin volver a raspar (`--apply`) y comprobar que
 * el publicado es un punto fijo (`check:officials-corrections`).
 */
export function rawFromPublished(snap: {
  officials: CorrectedOfficial[]
  formerOfficials?: FormerOfficial[]
}): Official[] {
  const scraped = (snap.officials ?? [])
    .filter((o) => !o.correccion)
    .map((o) => {
      const rest = { ...o }
      delete rest.correccion
      delete rest.photoNote
      return rest as Official
    })
  const restored = (snap.formerOfficials ?? []).map((f) => {
    const rest: Partial<FormerOfficial> = { ...f }
    delete rest.estado
    delete rest.until
    delete rest.reason
    delete rest.replacedBy
    delete rest.source
    return rest as Official
  })
  return [...scraped, ...restored]
}

/**
 * Devuelve al padrón crudo los cesados que ya estaban publicados.
 *
 * Una baja EXIGE que la persona esté en el raspado, porque su trabajo es
 * quitarla. Mientras la web iba con retraso eso se cumplía solo. Cuando la web
 * se pone al día —el 8-09-2026, con la mudanza del portal— deja de cumplirse, y
 * el adaptador entero se cae pidiendo que se retire la corrección.
 *
 * Retirarla sería la respuesta equivocada: la baja es lo ÚNICO que construye
 * `formerOfficials`, así que quitarla borra del padrón publicado a alguien que
 * sí fue concejala, con el acta que lo documenta — y hay informes, encargos y
 * un `souls/…md` que siguen apuntando a ese slug. El registro de quién ocupó un
 * escaño no se borra porque la fuente haya dejado de repetirlo.
 *
 * Gana siempre la fila raspada: si la web vuelve a listar a alguien, ésa es la
 * reciente y el arrastre no la duplica.
 *
 * Esto NO afloja la guarda. Una baja que nombre a quien no está ni en el
 * raspado ni entre los cesados publicados sigue reventando, que es el caso que
 * la guarda venía a cazar: una corrección vieja o inventada.
 */
export function arrastraCesados(parsed: Official[], formerOfficials: FormerOfficial[]): Official[] {
  const vistos = new Set(parsed.map((o) => o.slug))
  const restaurados = (formerOfficials ?? [])
    .filter((f) => !vistos.has(f.slug))
    .map((f) => {
      const rest: Partial<FormerOfficial> = { ...f }
      delete rest.estado
      delete rest.until
      delete rest.reason
      delete rest.replacedBy
      delete rest.source
      return rest as Official
    })
  return restaurados.length === 0 ? parsed : [...parsed, ...restaurados]
}

export interface OfficialsSnapshot {
  generatedAt: string
  source: string
  count: number
  composition: Record<string, number>
  officials: CorrectedOfficial[]
  formerOfficials: FormerOfficial[]
  corrections: {
    file: string
    generatedAt: string
    bajas: number
    altas: number
  } | null
}

/**
 * El fichero publicado, en un solo sitio: lo llama el scraper tras parsear y
 * lo llama `--apply` cuando no se puede raspar. `count` y `composition` salen
 * SÓLO de los vigentes; los cesados van aparte y no cuentan escaño.
 */
export function composeOfficialsSnapshot(
  parsed: Official[],
  corrections: OfficialsCorrections | null,
  meta: { generatedAt: string; source: string; correctionsFile: string },
): OfficialsSnapshot {
  const { officials, formerOfficials, applied } = applyOfficialsCorrections(parsed, corrections)
  const composition = officials.reduce<Record<string, number>>((acc, o) => {
    acc[o.party] = (acc[o.party] || 0) + 1
    return acc
  }, {})
  return {
    generatedAt: meta.generatedAt,
    source: meta.source,
    count: officials.length,
    composition,
    officials,
    formerOfficials,
    corrections: corrections
      ? {
          file: meta.correctionsFile,
          generatedAt: corrections.generatedAt,
          bajas: applied.bajas,
          altas: applied.altas,
        }
      : null,
  }
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** Añade una entrada, mueve el sello y re-valida el fichero ENTERO. */
export function upsertCorrection(
  snap: OfficialsCorrections,
  kind: 'baja' | 'alta',
  entry: Baja | Alta,
): OfficialsCorrections {
  const next = clone(snap)
  const all = [...next.bajas, ...next.altas]
  must(
    !all.some((e) => e.slug === entry.slug),
    `slug duplicado: ${entry.slug} ya tiene una corrección; retírala antes de reescribirla`,
  )
  if (kind === 'baja') next.bajas.push(entry as Baja)
  else next.altas.push(entry as Alta)
  next.generatedAt = new Date().toISOString()
  return validateOfficialsCorrections(next)
}

/** Quita una entrada por slug (la web se puso al día), mueve el sello y re-valida. */
export function retireCorrection(snap: OfficialsCorrections, slug: string): OfficialsCorrections {
  const next = clone(snap)
  const antes = next.bajas.length + next.altas.length
  next.bajas = next.bajas.filter((b) => b.slug !== slug)
  next.altas = next.altas.filter((a) => a.slug !== slug)
  must(next.bajas.length + next.altas.length < antes, `no hay ninguna corrección para ${slug}`)
  next.generatedAt = new Date().toISOString()
  return validateOfficialsCorrections(next)
}

/** Añade una réplica de una persona nombrada; re-valida el fichero entero. */
export function addReplica(
  snap: OfficialsCorrections,
  replica: ReplicaPadron,
): OfficialsCorrections {
  const next = clone(snap)
  next.replicas.push(replica)
  next.generatedAt = new Date().toISOString()
  return validateOfficialsCorrections(next)
}
