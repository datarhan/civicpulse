/**
 * ¿Nombra esta firma a una persona?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARA QUÉ
 *
 * La bitácora de /hallazgos lleva firmas de varias clases: el nombre de quien
 * corrigió, la cuenta de rol con la que firma el operador (`civicpulse-curator`),
 * identificadores de modelo (`claude-opus-5`, `claude-fable-5.1`) y, en la lista
 * de retiradas, un proceso (`retirada-pasada-llm`). Para casi todo eso basta con
 * saber que lo publicó el proyecto: `finding-authorship.ts` cuenta como humana la
 * cuenta de rol, y con razón, porque responde a si lo decidió una persona o un
 * proceso.
 *
 * Enmendar el MOTIVO de una corrección ya publicada es otra cosa. Reescribe la
 * explicación que la página dio de un cambio sobre un grupo político con nombre,
 * semanas después y sin dejar legible la anterior. Eso lo firma alguien a quien
 * se le puedan pedir cuentas por su nombre, y una cuenta de rol es la misma se
 * siente quien se siente delante.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ MIRA, Y QUÉ NO
 *
 * La FORMA de la firma: un nombre y al menos un apellido, cada uno con mayúscula
 * inicial, sin cifras ni signos de identificador, y sin ninguna palabra que diga
 * una cuenta, un rol, un proceso, un modelo o el marcador de una orden sin
 * rellenar.
 *
 * No sabe si el nombre es de verdad el de quien ejecuta la orden, ni si esa
 * persona existe: eso no lo puede saber una función, y fingir que sí sería peor
 * que no mirar. Lo que hace imposible es el despiste común —firmar con la cuenta
 * de rol, con el identificador de un modelo o con el `<nombre y apellidos>` que
 * traía la orden preparada—, que es exactamente lo que pasaría si una sesión
 * automática ejecutara una orden pensada para que la firme una persona.
 *
 * Es estricta a propósito: rechaza un nombre en mayúsculas o en minúsculas. La
 * firma se publica tal cual, y quien firma puede escribirla bien.
 */

/** Unen apellidos o nombres compuestos; no cuentan como nombre por sí solas. */
const PARTICULAS: ReadonlySet<string> = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'i',
  'e',
  'da',
  'das',
  'do',
  'dos',
  'di',
  'du',
  'van',
  'von',
  'der',
  'den',
  'le',
])

/**
 * Palabras que en una firma dicen una cuenta, un rol, un proceso o un modelo.
 * Se comparan sin tildes y en minúsculas, cada parte de una palabra compuesta
 * por separado (`civicpulse-curator` → `civicpulse`, `curator`).
 */
const PALABRAS_DE_ROL: ReadonlySet<string> = new Set([
  // Cuentas y rótulos del proyecto.
  'civicpulse',
  'munigraph',
  'curator',
  'curation',
  'curador',
  'curadora',
  'curaduria',
  'editor',
  'editora',
  'redaccion',
  'redactor',
  'redactora',
  'equipo',
  'team',
  'admin',
  'administrador',
  'administradora',
  'operador',
  'operadora',
  'proyecto',
  'project',
  // Procesos.
  'auto',
  'automatico',
  'automatica',
  'sistema',
  'system',
  'bot',
  'script',
  'pipeline',
  'cron',
  'proceso',
  'pasada',
  // Modelos y asistentes.
  'claude',
  'opus',
  'sonnet',
  'haiku',
  'fable',
  'anthropic',
  'gemini',
  'gpt',
  'chatgpt',
  'openai',
  'llm',
  'ia',
  'ai',
  'agente',
  'agent',
  'asistente',
  'assistant',
  'modelo',
  'model',
  'copilot',
  'codex',
])

/** Lo que queda en una orden preparada cuando nadie la ha rellenado. */
const PALABRAS_DE_MARCADOR: ReadonlySet<string> = new Set([
  'nombre',
  'nombres',
  'apellido',
  'apellidos',
  'firma',
  'persona',
  'usuario',
  'usuaria',
  'anonimo',
  'anonima',
  'desconocido',
  'desconocida',
  'name',
  'user',
])

/** Cifras y signos que no aparecen en un nombre y sí en un identificador o un marcador. */
const SIGNOS_DE_IDENTIFICADOR = /[\d<>[\]{}@/\\_#|:=]/

const llana = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** «Pérez», «d’Alòs», «O'Neill», «McDonald»: mayúscula inicial y alguna minúscula. */
const parteDeNombre = (p: string) =>
  /^(?:[dDlLO]['’])?\p{Lu}[\p{L}\p{M}]*$/u.test(p) && /\p{Ll}/u.test(p)

const esNombre = (palabra: string) => palabra.split('-').every(parteDeNombre)

/** «J.»: se admite entre el nombre y los apellidos, pero no cuenta como uno. */
const esInicial = (palabra: string) => /^\p{Lu}\.$/u.test(palabra)

/**
 * Por qué esta firma no nombra a una persona, o `null` si lo hace. El texto se
 * enseña tal cual al curador, así que dice qué falla y cómo se escribe bien.
 */
export function rechazoDeFirma(editor: string): string | null {
  if (typeof editor !== 'string' || editor.trim() === '') {
    return 'la firma está vacía o no es texto'
  }
  const firma = editor.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (SIGNOS_DE_IDENTIFICADOR.test(firma)) {
    return `«${firma}» parece un marcador o un identificador, no el nombre de una persona`
  }
  const palabras = firma.split(' ')
  for (const palabra of palabras) {
    for (const parte of palabra.split(/[-'’.]/)) {
      const p = llana(parte)
      if (PALABRAS_DE_MARCADOR.has(p)) {
        return `«${firma}» es el marcador de una orden sin rellenar, no un nombre: escribe el tuyo`
      }
      if (PALABRAS_DE_ROL.has(p)) {
        return `«${firma}» es una cuenta, un rol o un proceso («${parte}»), no una persona`
      }
    }
  }
  const extraña = palabras.find((w) => !PARTICULAS.has(w) && !esInicial(w) && !esNombre(w))
  if (extraña) {
    return (
      `«${extraña}» no tiene forma de nombre propio: la firma se escribe ` +
      '«Nombre Apellido», con mayúscula inicial y el resto en minúsculas'
    )
  }
  const nombres = palabras.filter((w) => !PARTICULAS.has(w) && !esInicial(w))
  if (nombres.length < 2) {
    return `«${firma}» no basta: hace falta el nombre y al menos un apellido`
  }
  return null
}

export const nombraAUnaPersona = (editor: string): boolean => rechazoDeFirma(editor) === null
