/**
 * Las dos preguntas de procedencia sobre el corpus de declaraciones, en un solo
 * decisor: ¿consta su literal en alguna transcripción nuestra
 * (`sinProcedencia`)? y, si consta, ¿es lo que se dijo, o lo tradujo un motor
 * que sustituimos, o se lo inventó (`literalNoServible`,
 * src/scraper/literal-no-servible.ts)?
 *
 * Vivía dentro de `chunk-pleno-claims.ts`, y sólo el troceador la preguntaba.
 * El 22-11-2026 (#580) eso dejó a /declaraciones reteniendo 560 literales que
 * la curación automática de /hallazgos (`selectBundles`) podía convertir en
 * citas de una ficha nueva, porque consultaba la puerta sin estas respuestas,
 * y sin ellas la puerta dice «se sirve».
 * Dos decisores sobre la misma pregunta es como empiezan a discrepar una
 * página y la de al lado; aquí hay uno, y lee los ficheros del disco una vez.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  motivoDeRetencion,
  type ClaimVisibilityInput,
  type OpcionesDeProcedenciaPorId,
} from '../../src/scraper/claim-public-gate'
import {
  classifyClaimProvenancePreparado,
  procedenciaDeDeclaracion,
  type ProvenanceOutcome,
} from '../../src/scraper/claim-provenance'
import {
  indexarTranscripcion,
  motivoDeLiteral,
  RAZONES_NO_JUZGABLE,
  type MotivoLiteralNoServible,
  type RazonNoJuzgable,
  type TranscripcionIndexada,
} from '../../src/scraper/literal-no-servible'
import {
  sessionIsComparable,
  vigenteEsDudosa,
  type QuoteProvenanceStatus,
} from '../../src/scraper/quote-provenance'
import { prepararHeno, type HenoPreparado } from '../../src/scraper/quote-match'
import { loadSupersededTexts, TRANSCRIPTS_DIR } from './transcript-corpus'

/**
 * Techo de retirada por falta de procedencia, como fracción del corpus.
 *
 * La regla de la puerta es correcta y su modo de fallo es catastrófico: si un
 * fichero de transcripción no está —un checkout a medias, un `superseded/`
 * podado, el sparse-checkout ajeno que ya se llevó `docs/` entero una vez—
 * TODAS las citas de esa sesión pasan a «sin rastro» y el sitio se publicaría
 * sin ellas, en silencio y con la comprobación en verde, porque la comprobación
 * lee lo publicado.
 *
 * Así que se para. 1.582 de las 4.664 declaraciones publicadas viven hoy sólo
 * en una sustituida: perder esa carpeta retiraría un tercio del corpus. El techo
 * está donde separa «unas cuantas frases que el extractor parafraseó» de
 * «faltan ficheros»: el 23-11-2026 eran 2 de 8.493, un 0,02 %.
 *
 * Es la regla 1 de DATA_INTEGRITY —toda aserción de enum con su techo de
 * respaldo— aplicada a una puerta que RETIRA en vez de coercer.
 */
export const TECHO_SIN_PROCEDENCIA = 0.02

/**
 * El motivo por el que NO se debe escribir, o `null` si se puede.
 *
 * Función aparte para que la guarda se pueda probar sin montar un corpus en
 * disco: una guarda que sólo existe dentro de un `if` en mitad de una escritura
 * es una guarda que nadie ejercita, y este repositorio ya ha tenido dos que
 * estaban verdes por no ejecutarse nunca.
 */
export function excesoDeRetirada(sinProcedencia: number, total: number): string | null {
  // Un corpus vacío no se juzga por porcentaje: 0/0 no es «todo bien», pero
  // tampoco es esta guarda quien lo dice — de eso ya se ocupa el monolito
  // ausente de más arriba.
  if (total <= 0) return null
  const cuota = sinProcedencia / total
  if (cuota <= TECHO_SIN_PROCEDENCIA) return null
  return (
    `[chunk-claims] ${sinProcedencia} de ${total} declaraciones ` +
    `(${(cuota * 100).toFixed(1)} %) no constan en ninguna transcripción — por encima del ` +
    `techo del ${(TECHO_SIN_PROCEDENCIA * 100).toFixed(0)} %. Eso no es prosa parafraseada, ` +
    `son transcripciones que faltan: comprueba public/data/pleno-transcripts/ y su carpeta ` +
    `superseded/ (npm run check:sparse) ANTES de publicar un corpus recortado.`
  )
}

/**
 * Dónde consta el literal de cada declaración: el desenlace de la escalera de
 * `classifyClaimProvenancePreparado` y si su sesión es comparable
 * (`sessionIsComparable`, en palabras, contra la sustituida PRINCIPAL — la que
 * lee /hallazgos para sus citas, así que una sesión lleva la misma marca en
 * las dos páginas). Una sola pasada sirve a la puerta que retiene
 * (`idsSinProcedencia`) y a la marca que se estampa (`procedenciaDelLiteral`):
 * dos pasadas sobre la misma pregunta es como empiezan a discrepar.
 *
 * `leerSustituidas` devuelve la principal primero (`archivosDe`); si sólo
 * quedaran versiones etiquetadas, la primera de ellas hace de principal.
 */
export function desenlacesDeProcedencia(
  items: readonly { claim?: { id?: string; plenoId?: string; verbatim?: string } }[],
  leerVigente: (plenoId: string) => string | null,
  leerSustituidas: (plenoId: string) => string[],
): Map<string, { desenlace: ProvenanceOutcome; comparable: boolean; vigenteDudosa: boolean }> {
  // Los textos se normalizan UNA vez por sesión, no una por declaración:
  // normalizar es el 100 % del coste del emparejador (6,11 ms por
  // transcripción de 274 KB frente a 0,04 ms de búsqueda, medido), así que
  // hacerlo dentro del bucle costaba 42 s de los 46 que tardaba esta pasada.
  const sesiones = new Map<
    string,
    {
      vigente: HenoPreparado | null
      sustituidas: HenoPreparado[]
      comparable: boolean
      vigenteDudosa: boolean
    }
  >()
  const out = new Map<
    string,
    { desenlace: ProvenanceOutcome; comparable: boolean; vigenteDudosa: boolean }
  >()
  for (const it of items) {
    const c = it.claim
    if (!c?.id || !c.plenoId || !c.verbatim) continue
    let s = sesiones.get(c.plenoId)
    if (s === undefined) {
      const t = leerVigente(c.plenoId)
      const sust = leerSustituidas(c.plenoId)
      s = {
        vigente: t === null ? null : prepararHeno(t),
        sustituidas: sust.map(prepararHeno),
        comparable: sessionIsComparable({ current: t, superseded: sust[0] ?? null }),
        vigenteDudosa: vigenteEsDudosa(t),
      }
      sesiones.set(c.plenoId, s)
    }
    const desenlace = classifyClaimProvenancePreparado({
      verbatim: c.verbatim,
      current: s.vigente,
      superseded: s.sustituidas,
    })
    out.set(c.id, { desenlace, comparable: s.comparable, vigenteDudosa: s.vigenteDudosa })
  }
  return out
}

/**
 * Los ids cuyo literal no consta en ninguna transcripción que tengamos.
 *
 * Mismo emparejador y mismos textos que `check:claim-provenance`, a propósito:
 * dos decisores sobre la misma pregunta es como empiezan a discrepar la puerta
 * y el parte. `sin-transcripcion` NO entra — eso es «no lo hemos mirado».
 */
export function idsSinProcedencia(
  items: readonly { claim?: { id?: string; plenoId?: string; verbatim?: string } }[],
  leerVigente: (plenoId: string) => string | null,
  leerSustituidas: (plenoId: string) => string[],
): Set<string> {
  return idsSinRastro(desenlacesDeProcedencia(items, leerVigente, leerSustituidas))
}

function idsSinRastro(
  desenlaces: ReadonlyMap<string, { desenlace: ProvenanceOutcome }>,
): Set<string> {
  const out = new Set<string>()
  for (const [id, d] of desenlaces) if (d.desenlace === 'sin-rastro') out.add(id)
  return out
}

/**
 * Techo de retención por literal no servible, sobre lo evaluado (lo que la
 * puerta serviría, con transcripción vigente y procedencia).
 *
 * Esta regla no se infla porque falte un fichero —sin vigente no se juzga, sin
 * sustituida la cita cae en `sinProcedencia`—, pero sí si se estropea el
 * detector de lengua o si un día se re-transcriben todas las sesiones a la vez
 * sin re-extraer. El 23-11-2026 la regla marcaba un 10,5 % de lo evaluado, todo en
 * las trece sesiones re-transcritas el 1 y 2 de agosto sin volver a extraer. Un
 * cuarto del corpus es otra cosa, y se para a mirarla antes de retirarla.
 */
export const TECHO_LITERAL_NO_SERVIBLE = 0.25

export function excesoDeLiteralNoServible(retenidas: number, evaluadas: number): string | null {
  if (evaluadas <= 0) return null
  const cuota = retenidas / evaluadas
  if (cuota <= TECHO_LITERAL_NO_SERVIBLE) return null
  return (
    `[chunk-claims] ${retenidas} de ${evaluadas} declaraciones evaluadas ` +
    `(${(cuota * 100).toFixed(1)} %) tienen un literal traducido o alucinado — por encima del ` +
    `techo del ${(TECHO_LITERAL_NO_SERVIBLE * 100).toFixed(0)} %. Comprueba src/scraper/literal-no-servible.ts ` +
    `y qué sesiones se re-transcribieron ANTES de retirar tanto.`
  )
}

/**
 * Los ids cuyo literal consta en alguna transcripción pero no es lo que se
 * dijo: lo tradujo un motor que sustituimos, o es texto que se inventó
 * (src/scraper/literal-no-servible.ts). Sólo retiene; lo que no se pudo juzgar
 * se cuenta aparte, por su razón, y se publica: «no juzgable» no es «está bien».
 *
 * Una que tampoco consta en ninguna transcripción se queda en `sinProcedencia`
 * y no entra aquí: cada retenida cuenta una sola vez, y el techo de arriba
 * sigue midiendo sólo ficheros que faltan.
 */
export function literalesNoServibles(
  items: readonly { claim?: { id?: string; plenoId?: string; verbatim?: string } }[],
  sinProcedencia: ReadonlySet<string>,
  leerVigente: (plenoId: string) => string | null,
  leerSustituidas: (plenoId: string) => string[],
): {
  porId: Map<string, MotivoLiteralNoServible>
  evaluadas: number
  sinVigente: number
  noJuzgables: Record<RazonNoJuzgable, number>
} {
  const vigentes = new Map<string, TranscripcionIndexada | null>()
  const sustituidas = new Map<string, TranscripcionIndexada[]>()
  const porId = new Map<string, MotivoLiteralNoServible>()
  const noJuzgables = Object.fromEntries(RAZONES_NO_JUZGABLE.map((r) => [r, 0])) as Record<
    RazonNoJuzgable,
    number
  >
  let evaluadas = 0
  let sinVigente = 0
  for (const it of items) {
    const c = it.claim
    if (!c?.id || !c.plenoId || !c.verbatim || sinProcedencia.has(c.id)) continue
    if (!vigentes.has(c.plenoId)) {
      const t = leerVigente(c.plenoId)
      vigentes.set(c.plenoId, t === null ? null : indexarTranscripcion(t))
      sustituidas.set(c.plenoId, leerSustituidas(c.plenoId).map(indexarTranscripcion))
    }
    const vigente = vigentes.get(c.plenoId) ?? null
    // Sin transcripción vigente no hay «lo que servimos al lado»: no se juzga.
    if (vigente === null) {
      sinVigente += 1
      continue
    }
    evaluadas += 1
    const r = motivoDeLiteral({
      verbatim: c.verbatim,
      vigente,
      sustituidas: sustituidas.get(c.plenoId) ?? [],
    })
    if (r.motivo !== null) porId.set(c.id, r.motivo)
    else if ('noJuzgable' in r) noJuzgables[r.noJuzgable] += 1
  }
  return { porId, evaluadas, sinVigente, noJuzgables }
}

export interface ProcedenciaDelCorpus extends Required<OpcionesDeProcedenciaPorId> {
  sinProcedencia: Set<string>
  literalNoServible: Map<string, MotivoLiteralNoServible>
  literales: ReturnType<typeof literalesNoServibles>
}

type ItemConClaim = ClaimVisibilityInput & {
  claim?: { id?: string; plenoId?: string; verbatim?: string } | null
}

/** Los lectores de siempre: la transcripción vigente y las sustituidas, del disco. */
export function lectoresDeDisco(): {
  leerVigente: (plenoId: string) => string | null
  leerSustituidas: (plenoId: string) => string[]
} {
  return {
    leerVigente: (id) => {
      const p = resolve(TRANSCRIPTS_DIR, `${id}.txt`)
      return existsSync(p) ? readFileSync(p, 'utf8') : null
    },
    leerSustituidas: (id) => loadSupersededTexts(id),
  }
}

/**
 * Las respuestas para todo el corpus, con sus dos techos: si alguno salta,
 * LANZA — una retirada masiva es un fichero que falta o un detector roto, y
 * ningún llamador debe publicar ni comparar contra eso.
 *
 * También lanza si no pudo juzgar NINGUNA: eso no es «ningún literal
 * traducido», es que no leyó ninguna transcripción vigente (otra carpeta de
 * trabajo, un checkout podado), y devolver conjuntos vacíos dejaría pasar
 * justo lo que esta función existe para retener.
 *
 * `literalNoServible` se pregunta sólo sobre lo que la puerta serviría por lo
 * demás: una acusación ya retenida conserva su motivo y no se cuenta aquí.
 * `incluirContradichas` añade al mapa las contradichas, sin contarlas en el
 * techo ni en `literales`: la curación las manda a la cuarentena aunque la
 * puerta las retenga, así que necesita saber también de ellas si su literal
 * es lo que se dijo. El troceador no lo pide, y su salida no cambia.
 */
export function procedenciaDelCorpus(
  items: readonly ItemConClaim[],
  lectores = lectoresDeDisco(),
  { incluirContradichas = false }: { incluirContradichas?: boolean } = {},
): ProcedenciaDelCorpus {
  const desenlaces = desenlacesDeProcedencia(
    items as never,
    lectores.leerVigente,
    lectores.leerSustituidas,
  )
  const sinProcedencia = idsSinRastro(desenlaces)
  const exceso = excesoDeRetirada(sinProcedencia.size, items.length)
  if (exceso !== null) throw new Error(exceso)
  const servibles = items.filter(
    (it) =>
      motivoDeRetencion(it, { sinProcedencia: sinProcedencia.has(it?.claim?.id ?? '') }) === null,
  )
  const literales = literalesNoServibles(
    servibles as never,
    sinProcedencia,
    lectores.leerVigente,
    lectores.leerSustituidas,
  )
  const excesoLiteral = excesoDeLiteralNoServible(literales.porId.size, literales.evaluadas)
  if (excesoLiteral !== null) throw new Error(excesoLiteral)
  if (servibles.length > 0 && literales.evaluadas === 0) {
    throw new Error(
      `[procedencia] ninguna de ${servibles.length} declaraciones se pudo juzgar: no se leyó ` +
        `ninguna transcripción vigente (${TRANSCRIPTS_DIR}). Ejecuta desde la raíz del ` +
        `repositorio y comprueba public/data/pleno-transcripts/ (npm run check:sparse).`,
    )
  }
  const literalNoServible = new Map(literales.porId)
  if (incluirContradichas) {
    const contradichas = items.filter((it) => it?.verification?.verdict === 'contradicho')
    const extra = literalesNoServibles(
      contradichas as never,
      sinProcedencia,
      lectores.leerVigente,
      lectores.leerSustituidas,
    )
    for (const [id, m] of extra.porId) literalNoServible.set(id, m)
  }
  // La marca de cada declaración cuyo literal consta en algún sitio. Las
  // `sin-rastro` no llevan: la puerta las retiene.
  const procedenciaDelLiteral = new Map<string, QuoteProvenanceStatus>()
  for (const [id, d] of desenlaces) {
    const p = procedenciaDeDeclaracion(d.desenlace, d.comparable, d.vigenteDudosa)
    if (p !== null) procedenciaDelLiteral.set(id, p)
  }
  return { sinProcedencia, literalNoServible, procedenciaDelLiteral, literales }
}
