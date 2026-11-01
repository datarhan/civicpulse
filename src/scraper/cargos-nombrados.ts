/**
 * ¿Nombra este texto a un cargo? La pregunta que hacen los procesos que publican
 * sin que nadie firme, antes de publicar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * /metodologia decía que lo que nombra a una persona lleva siempre firma humana,
 * y dos procesos publicaban sin comprobarlo: la auto-curación de /promesas y la
 * del laboratorio de prensa. El 04-07-2026 (`f59de8b1`) la primera publicó sola
 * una cita con el apellido de un cargo, que tardó casi tres meses en corregirse.
 * `decideAutomation` no servía de puerta: niega toda clase sin medición, así que
 * habría parado los dos procesos por un caso que hoy no da ninguna fila publicada.
 * Esta puerta mira sólo los nombres, fila a fila.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CUENTA COMO NOMBRAR
 *
 *   · **Un apellido** de quien tiene o ha tenido cargo en este mandato, escrito
 *     con mayúscula. Mayúscula porque en esta corporación hay apellidos que son
 *     palabras: el `pla` de «pla d'ocupació». Un apellido idéntico al de otra
 *     persona, o una palabra capitalizada igual, retiene de más, y es a propósito:
 *     aquí equivocarse cuesta que alguien lo lea; acertar de menos, publicar solo.
 *   · **Un oficio que sólo tiene una persona**: alcaldía, una concejalía nombrada
 *     («la concejala de Cultura»), la portavocía de un grupo. Es la misma lógica
 *     que un grupo de un escaño. El oficio sin más («los concejales») son 21
 *     personas y no nombra a nadie; «la Concejalía de Fiestas» es un área.
 *   · **Un grupo de un escaño**, en su etiqueta o en la prosa
 *     (`singleSeatAttributions`): nombra a su concejal por eliminación.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ NO CUENTA, Y HAY QUE DECIRLO
 *
 * Es una puerta de **cargos**, no de personas: no sabe de un vecino, de un
 * funcionario ni de un empresario, porque no hay ninguna lista de ellos. Un
 * nombre de pila solo tampoco cuenta: «José» o «María» retendrían cualquier
 * cosa. Quien describa esta puerta en /metodologia tiene que decir «cargo».
 *
 * Sin plantilla la respuesta es `null`, nunca `[]`: «no lo sé» no puede leerse
 * como «no nombra a nadie» (DATA_INTEGRITY, regla 2).
 */
import { oneSeatBlocsOf, singleSeatAttributions, type OfficialsDoc } from './corporation-seats'
import { stripDiacritics } from './normalize'

/** Lo que un proceso va a publicar, tal como se publicaría. */
export interface Publicable {
  /** Grupo al que se atribuye: la etiqueta de una cita, el partido de una promesa. */
  etiquetas?: ReadonlyArray<string | null | undefined>
  textos: ReadonlyArray<string | null | undefined>
}

export interface Mencion {
  tipo: 'apellido' | 'oficio' | 'grupo'
  /** Tal como aparece en el texto; va a la cola de un curador, nunca al sitio. */
  valor: string
}

export const PLANTILLA_DESCONOCIDA = 'plantilla-desconocida'

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'i', 'y'])

/** Sobre texto en minúscula y sin diacríticos. */
const OFICIOS: readonly RegExp[] = [
  /\b(?:ex)?alcald(?:e|esa|essa|ia)\b/g,
  /\b(?:concejala?|regidora?|edila?)(?: delegad[oa]| delegat)? (?:del?\b|d['’]|responsable\b)/g,
  /\b(?:portavoz|portaveu)\b/g,
]

const clave = (palabra: string) => stripDiacritics(palabra.toLowerCase())

/** Los apellidos de un nombre completo: lo último, sin el nombre de pila ni partículas. */
function apellidosDe(nombre: string): string[] {
  const partes = nombre.split(/\s+/).filter((p) => p && !PARTICULAS.has(clave(p)))
  return partes.slice(1).slice(-2).map(clave)
}

/**
 * A quién nombra lo publicable, sin repetir, o `null` si la plantilla no permite
 * saberlo. Quien decide qué se publica solo debe tratar `null` como «retener».
 */
export function cargosNombrados(
  publicable: Publicable,
  doc: OfficialsDoc | null | undefined,
): Mencion[] | null {
  const cargos = [...(doc?.officials ?? []), ...(doc?.formerOfficials ?? [])]
  const unEscano = oneSeatBlocsOf(doc)
  if ((doc?.officials ?? []).length === 0 || unEscano === null) return null

  const apellidos = new Set(cargos.flatMap((c) => apellidosDe(c.name)))
  const textos = publicable.textos.filter((t): t is string => Boolean(t))
  const menciones = new Map<string, Mencion>()
  const anota = (tipo: Mencion['tipo'], valor: string) => {
    const k = `${tipo}:${clave(valor)}`
    if (!menciones.has(k)) menciones.set(k, { tipo, valor })
  }

  for (const texto of textos) {
    for (const palabra of texto.normalize('NFC').match(/\p{L}+/gu) ?? []) {
      if (/^\p{Lu}/u.test(palabra) && apellidos.has(clave(palabra))) anota('apellido', palabra)
    }
    const plano = clave(texto)
    for (const oficio of OFICIOS) {
      for (const [hallado] of plano.matchAll(oficio)) anota('oficio', hallado)
    }
  }
  const grupos = singleSeatAttributions(
    {
      quotes: (publicable.etiquetas ?? []).map((speakerGroup) => ({ speakerGroup })),
      title: textos.join('\n'),
    },
    unEscano,
  )
  for (const grupo of grupos) anota('grupo', grupo)
  return [...menciones.values()]
}

/**
 * Por qué no puede salir solo, en una palabra por motivo; vacío si puede. Un
 * proceso que publica pregunta esto: no hay forma de leer `null` como permiso.
 */
export function motivosDeRetencion(
  publicable: Publicable,
  doc: OfficialsDoc | null | undefined,
): string[] {
  const menciones = cargosNombrados(publicable, doc)
  if (menciones === null) return [PLANTILLA_DESCONOCIDA]
  return menciones.map((m) => `${m.tipo}:${m.valor}`)
}
