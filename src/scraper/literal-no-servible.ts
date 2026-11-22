/**
 * ¿Es el literal de una declaración lo que se dijo en el pleno?
 *
 * `claim-provenance.ts` pregunta si el literal CONSTA en alguna transcripción
 * nuestra, y la puerta retiene el que no consta en ninguna. Esto pregunta otra
 * cosa: si constar basta. Hay dos casos en que no.
 *
 * ── literal-traducido ──────────────────────────────────────────────────────
 *
 * Medido el 22-11-2026 (editorial/citas-sin-transcripcion/informe.md): trece
 * sesiones se re-transcribieron el 1 y 2 de agosto de 2026 y nadie volvió a
 * extraer sus declaraciones. La transcripción sustituida era de Whisper, que
 * TRADUCÍA al castellano lo que se hablaba en valenciano; la vigente —la que
 * /plenos/:id sirve al lado— recoge el valenciano. Cientos de declaraciones
 * publicadas como cita literal eran la traducción de una máquina, y algunas con
 * las cifras cambiadas:
 *
 *   publicado  «que acaban de pagar ahora mil millones de euros al Centro de Buenestar»
 *   vigente    «que acaben de pagar vora mig milió d'euros al centre Bonestar»
 *   (qz6weg-228-afi-27aa5a)
 *
 * El literal «consta» —en la sustituida—, así que la puerta de procedencia lo
 * dejaba pasar. No es el literal de lo que nuestra transcripción recoge.
 *
 * La regla, y por qué es tan estrecha: el literal NO está en la vigente, SÍ en
 * una sustituida, la línea sustituida está en castellano, y la vigente, en el
 * mismo tramo de la sesión, está en valenciano y no recoge sus palabras; y si
 * casa en varios sitios, en todos. Todas las condiciones, o nada. No se exige que la vigente diga «lo mismo»: si la
 * transcripción que servimos dice en valenciano algo que la cita da en
 * castellano, la cita no es el literal de lo que publicamos que se dijo, diga
 * lo que diga.
 *
 * ── literal-alucinado ──────────────────────────────────────────────────────
 *
 * Whisper rellena el silencio con títulos y coletillas que no se dijeron («La
 * Lucha por la Vida», «Subtítulos realizados por la comunidad de Amara.org») y
 * entra en bucles («el día 23 de febrero, el día 23 de febrero, …»). Un
 * literal hecho de eso no es una declaración, conste donde conste.
 *
 * ── Lo que esto NO hace ────────────────────────────────────────────────────
 *
 * Sólo RETIENE (DATA_INTEGRITY regla 4: lo automático sólo baja). No corrige
 * el literal ni elige otro: re-extraer la sesión es lo que lo arregla, y
 * entonces la regla deja de casar sola. Y no juzga a ciegas: cuando la lengua
 * de un lado no se puede decir —pocas palabras función, una línea de
 * interjecciones— devuelve `noJuzgable` con el porqué, que el llamador cuenta.
 * «No pude juzgarla» no es «está bien» (regla 2).
 */
import { normaliseForQuoteMatch, prepararHeno, quoteAppearsInPrepared } from './quote-match'

/**
 * Los dos motivos, como valor: la puerta y sus rótulos se construyen sobre esta
 * lista y dejan de compilar si aparece un tercero (regla 1).
 */
export const MOTIVOS_LITERAL_NO_SERVIBLE = ['literal-traducido', 'literal-alucinado'] as const
export type MotivoLiteralNoServible = (typeof MOTIVOS_LITERAL_NO_SERVIBLE)[number]

/** Por qué no se pudo juzgar si un literal es traducción. */
export const RAZONES_NO_JUZGABLE = [
  'fuente-sin-lengua',
  'sin-linea-sustituida',
  'vigente-sin-lengua',
] as const
export type RazonNoJuzgable = (typeof RAZONES_NO_JUZGABLE)[number]

export type JuicioDeLiteral =
  | { motivo: MotivoLiteralNoServible }
  | { motivo: null }
  | { motivo: null; noJuzgable: RazonNoJuzgable }

/**
 * Margen, en segundos, alrededor del tramo sustituido donde está el literal. El
 * tramo ya es un bloque de Whisper de 30 s (o dos, si el literal cae a caballo).
 * Medido el 22-11-2026 sobre lo servido: con 0 s retiene 611, con 10 s 593, con
 * 30 s 509 y con 90 s 425 — cada segundo de más mete en la ventana a otro
 * hablante, en otra lengua, y la mezcla sale «no juzgable». Cero.
 */
export const MARGEN_SEGUNDOS = 0

// ── Lengua ─────────────────────────────────────────────────────────────────

/*
 * Palabras función de cada lengua, sin acentos (el normalizador los quita). Se
 * cuentan marcadores y no se «detecta idioma», por lo mismo que en
 * transcript-sanity.ts: en este pleno se cambia de lengua a mitad de frase, y
 * lo que hay que separar es una frase en valenciano de su traducción.
 */
const PALABRAS_VA =
  'amb i els dels als aixo vostes nosaltres tambe molt hem aquest aquesta eixe eixa ens tots ' +
  'fer tenim estem doncs ara aci aco nostre seua seu uns ja anys pel pels hui gracies moltes han ' +
  'hi vam van son som sera fet dit ho li seus seues aquells vosaltres perque tindre ' +
  'tenen podem volem estan vull crec nomes sense fins des despres abans mentre aixi gent ' +
  'ajuntament poble regidor regidora govern'
const PALABRAS_ES =
  'con y los del al esto ustedes nosotros tambien muy hemos este ese esa nos mas todos hacer ' +
  'tenemos estamos pues ahora aqui nuestro su unos ya anos el hoy gracias muchas han hay fue ' +
  'fueron son somos sera hecho dicho lo le las sus aquellos vosotros porque tener tienen podemos ' +
  'queremos estan quiero creo solo sin hasta desde despues antes mientras asi gente ayuntamiento ' +
  'pueblo concejal concejala gobierno'

function marcadores(): { va: Set<string>; es: Set<string> } {
  const va = new Set(PALABRAS_VA.split(' '))
  const es = new Set(PALABRAS_ES.split(' '))
  // Las que valen para las dos lenguas no informan de ninguna.
  for (const w of [...va]) {
    if (!es.has(w)) continue
    va.delete(w)
    es.delete(w)
  }
  return { va, es }
}
const { va: VA, es: ES } = marcadores()

/*
 * Fuera de las listas a propósito: «les», «ha», «va» y «mes» son también
 * castellano («les recuerdo», «ha dicho», «va a», «el mes»),
 * y «Generalitat» se dice igual en las dos lenguas, así que su «-itat» no
 * informa. Con las dos dentro, una intervención en castellano sobre la
 * Generalitat salía «no juzgable» (medido en la prueba).
 */
const NO_INFORMAN = new Set(['generalitat'])

/** Los apóstrofos del valenciano dejan letras sueltas al normalizar («d'euros» → «d euros»). */
const CLITICOS_VA = new Set(['d', 'l', 's', 'n', 'm'])

function lenguaDeTokens(tokens: readonly string[]): 'va' | 'es' | null {
  let va = 0
  let es = 0
  for (const t of tokens) {
    if (NO_INFORMAN.has(t)) continue
    if (VA.has(t)) va += 1
    else if (ES.has(t)) es += 1
    else if (CLITICOS_VA.has(t)) va += 1
    else if (t.length >= 6) {
      if (/(?:cio|itat|itats|ment|ments|atge)$/.test(t)) va += 1
      else if (/(?:cion|ciones|idad|idades|miento|mientos|mente)$/.test(t)) es += 1
    }
  }
  if (va + es < 2) return null
  if (va >= 2 * es) return 'va'
  if (es >= 2 * va) return 'es'
  return null
}

/** La lengua de un texto, o `null` si no trae marcadores bastantes para decirla. */
export function lenguaDeTexto(texto: string): 'va' | 'es' | null {
  return lenguaDeTokens(normaliseForQuoteMatch(texto).split(' ').filter(Boolean))
}

// ── Alucinación ────────────────────────────────────────────────────────────

const MARCADORES_ALUCINACION: readonly RegExp[] = [
  /\balimmenta com\b/,
  /\bsuscribete al canal\b/,
  /\bgracias por ver el video\b/,
  /\bsubtitulos (?:realizados )?(?:por la comunidad(?: de amara org)?)?\b/,
  /\bamara org\b/,
  /\biglesia de jesucristo de los santos\b/,
  /\bjunta de extremadura\b/,
  // Títulos que este corpus repite en bloques de 30 s de silencio.
  /\bla lucha de los malditos\b/,
  /\bla lucha por la vida\b/,
]

/**
 * Lo que tiene que ocupar del literal la parte sospechosa para que cuente. Un
 * marcador o un bucle DENTRO de una frase dicha («la Junta de Extremadura ha
 * pagado más que nosotros», «sí o no, sí o no…» en un rifirrafe) no la hace
 * inventada; un literal que ES eso, sí. Lo señaló la revisión del 22-11-2026.
 */
export const PARTE_MINIMA_SOSPECHOSA = 0.6

/**
 * Palabras del literal dentro de un bucle: el mismo grupo de k palabras (k de 1
 * a 8) seguido, ≥8 veces si es una palabra y ≥4 si son más. Un grupo de menos
 * de 10 letras no cuenta: «sí o no» se repite de verdad en un pleno.
 */
function palabrasEnBucle(w: readonly string[]): number {
  let mejor = 0
  for (let k = 1; k <= 8; k += 1) {
    const min = k === 1 ? 8 : 4
    for (let i = 0; i + k * min <= w.length; i += 1) {
      const patron = w.slice(i, i + k).join(' ')
      if (k > 1 && patron.replace(/ /g, '').length < 10) continue
      let rep = 1
      while (
        i + (rep + 1) * k <= w.length &&
        w.slice(i + rep * k, i + (rep + 1) * k).join(' ') === patron
      )
        rep += 1
      if (rep >= min) mejor = Math.max(mejor, rep * k)
    }
  }
  return mejor
}

/** ¿Tiene este literal la forma del texto que un motor inventa sobre un silencio? */
export function literalAlucinado(verbatim: string): boolean {
  const norm = normaliseForQuoteMatch(verbatim)
  if (!norm) return false
  const w = norm.split(' ')
  for (const re of MARCADORES_ALUCINACION) {
    const m = re.exec(norm)
    if (m && m[0].split(' ').length / w.length >= PARTE_MINIMA_SOSPECHOSA) return true
  }
  return palabrasEnBucle(w) / w.length >= PARTE_MINIMA_SOSPECHOSA
}

// ── Transcripciones indexadas ──────────────────────────────────────────────

interface LineaIndexada {
  t0: number
  t1: number
  norm: string
}

export interface TranscripcionIndexada {
  readonly heno: ReturnType<typeof prepararHeno>
  readonly lineas: readonly LineaIndexada[]
}

const LINEA = /^\[(\d+(?:\.\d+)?)\s*→\s*(\d+(?:\.\d+)?)\]\s*(.*)$/

/**
 * Una transcripción, normalizada UNA vez. Las líneas sin marca de tiempo (un
 * acta) entran en el heno pero no en `lineas`: sin hora no hay «misma hora».
 */
export function indexarTranscripcion(texto: string): TranscripcionIndexada {
  const lineas: LineaIndexada[] = []
  for (const cruda of texto.split('\n')) {
    const m = LINEA.exec(cruda.trim())
    if (!m) continue
    const norm = normaliseForQuoteMatch(m[3])
    if (norm) lineas.push({ t0: Number(m[1]), t1: Number(m[2]), norm })
  }
  return { heno: prepararHeno(texto), lineas }
}

/** Ventana de palabras con la que se sitúa el literal en una línea. */
const VENTANA = 8

interface Tramo {
  desde: number
  hasta: number
  /** Las palabras de las líneas sustituidas de alrededor (la del literal ±1). */
  fuente: string[]
}

/**
 * Cada sitio de `t` donde está el literal. Mira cada línea con su siguiente,
 * porque un bloque de 30 s corta frases; y los devuelve TODOS, porque un
 * literal corto puede casar en varios sitios y la regla sólo retiene si todos
 * dicen lo mismo.
 */
function tramosDelLiteral(qTokens: readonly string[], t: TranscripcionIndexada): Tramo[] {
  const n = Math.min(VENTANA, qTokens.length)
  if (n === 0) return []
  const ventanas: string[] = []
  for (let i = 0; i + n <= qTokens.length; i += 1) ventanas.push(qTokens.slice(i, i + n).join(' '))
  const out: Tramo[] = []
  for (let i = 0; i < t.lineas.length; i += 1) {
    const l = t.lineas[i]
    const sola = ventanas.some((v) => l.norm.includes(v))
    const siguiente = t.lineas[i + 1]
    const par =
      sola || !siguiente ? false : ventanas.some((v) => (l.norm + ' ' + siguiente.norm).includes(v))
    if (!sola && !par) continue
    const fin = par ? siguiente : l
    const fuente = t.lineas
      .slice(Math.max(0, i - 1), i + (par ? 3 : 2))
      .flatMap((x) => x.norm.split(' '))
    out.push({ desde: l.t0, hasta: fin.t1, fuente })
  }
  return out
}

function palabrasDeLaVigenteEn(t: TranscripcionIndexada, tramo: Tramo): string[] {
  const tokens: string[] = []
  for (const l of t.lineas) {
    if (l.t1 < tramo.desde - MARGEN_SEGUNDOS || l.t0 > tramo.hasta + MARGEN_SEGUNDOS) continue
    tokens.push(...l.norm.split(' '))
  }
  return tokens
}

/** Palabras largas: las que no se repiten por ser función, y que una traducción cambia. */
const LARGA = 5

/**
 * Parte del literal que la vigente recoge con las MISMAS palabras, a esa hora.
 * Una frase dicha en castellano junto a otras en valenciano la recoge igual:
 * eso no es una traducción, es la misma frase oída otra vez. Medido por la
 * revisión del plan (22-11-2026): sin esta guarda, unas 32 caían en el saco.
 */
function coincidenciaExacta(qTokens: readonly string[], vigente: readonly string[]): number {
  const largas = qTokens.filter((w) => w.length >= LARGA)
  if (largas.length === 0) return 0
  const hay = new Set(vigente)
  return largas.filter((w) => hay.has(w)).length / largas.length
}

/** Desde esta parte del literal en la vigente, es la misma frase y no se retiene. */
export const UMBRAL_MISMA_FRASE = 0.5

type JuicioDeTramo = 'traducido' | 'no' | RazonNoJuzgable

function juzgarTramo(
  qTokens: readonly string[],
  tramo: Tramo,
  vigente: TranscripcionIndexada,
): JuicioDeTramo {
  // La lengua de la fuente se mira en la línea sustituida y sus vecinas, no en
  // el literal: un literal corto rara vez trae dos palabras función, y la línea
  // de la que salió sí.
  const lenguaFuente = lenguaDeTokens(tramo.fuente)
  if (lenguaFuente === null) return 'fuente-sin-lengua'
  if (lenguaFuente !== 'es') return 'no'
  const palabras = palabrasDeLaVigenteEn(vigente, tramo)
  // Antes que la lengua: si la vigente recoge a esa hora las mismas palabras,
  // es la misma frase, sea cual sea la lengua de lo que la rodea.
  if (coincidenciaExacta(qTokens, palabras) >= UMBRAL_MISMA_FRASE) return 'no'
  const lenguaVigente = lenguaDeTokens(palabras)
  if (lenguaVigente === null) return 'vigente-sin-lengua'
  return lenguaVigente === 'va' ? 'traducido' : 'no'
}

/**
 * El juicio sobre UN literal. `vigente` es la transcripción que se sirve;
 * `sustituidas`, las que reemplazó una re-transcripción.
 */
export function motivoDeLiteral(input: {
  verbatim: string
  vigente: TranscripcionIndexada
  sustituidas: readonly TranscripcionIndexada[]
}): JuicioDeLiteral {
  const { verbatim, vigente, sustituidas } = input
  if (literalAlucinado(verbatim)) return { motivo: 'literal-alucinado' }
  // Consta en la vigente: lo que servimos dice eso. No es asunto de esta regla.
  if (quoteAppearsInPrepared(verbatim, vigente.heno)) return { motivo: null }
  const fuentes = sustituidas.filter((s) => quoteAppearsInPrepared(verbatim, s.heno))
  // Ni en la vigente ni en ninguna sustituida: eso es `sin-procedencia`, otra puerta.
  if (fuentes.length === 0) return { motivo: null }
  const qTokens = normaliseForQuoteMatch(verbatim).split(' ').filter(Boolean)
  const tramos = fuentes.flatMap((f) => tramosDelLiteral(qTokens, f))
  if (tramos.length === 0) return { motivo: null, noJuzgable: 'sin-linea-sustituida' }
  const juicios = tramos.map((t) => juzgarTramo(qTokens, t, vigente))
  // Basta un sitio donde no es traducción para no retenerla: la regla sólo baja
  // cuando todos los sitios donde casa dicen lo mismo.
  if (juicios.includes('no')) return { motivo: null }
  if (juicios.every((j) => j === 'traducido')) return { motivo: 'literal-traducido' }
  const razon = juicios.find((j): j is RazonNoJuzgable => j !== 'traducido')!
  return { motivo: null, noJuzgable: razon }
}
