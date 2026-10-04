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
 * Cuentas y rótulos del proyecto: detrás puede haber una persona, pero la
 * firma no dice cuál.
 */
const PALABRAS_DE_CUENTA: ReadonlySet<string> = new Set([
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
])

/** Procesos, modelos y asistentes: lo que firma una decisión que no tomó una persona. */
const PALABRAS_DE_PROCESO: ReadonlySet<string> = new Set([
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

/**
 * Palabras que en una firma dicen una cuenta, un rol, un proceso o un modelo.
 * Se comparan sin tildes y en minúsculas, cada parte de una palabra compuesta
 * por separado (`civicpulse-curator` → `civicpulse`, `curator`).
 */
const PALABRAS_DE_ROL: ReadonlySet<string> = new Set([
  ...PALABRAS_DE_CUENTA,
  ...PALABRAS_DE_PROCESO,
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL HUECO SIN RELLENAR
 *
 * La pregunta pequeña, la de toda vía que publica una firma: ¿es esto el hueco
 * de una orden preparada que nadie rellenó? La cola de excepción compone
 * `--editor "<nombre y apellidos>"`; otras colas, `"<tu nombre>"`; las órdenes
 * de votos e indicadores, `"…"`. Con el motivo relleno y la firma no,
 * `correct-pleno-finding --field/--redact/--remove`, `retract-finding`,
 * `reclassify-claim` y la bajada de siempre de `downgrade-verdict` escribían
 * el hueco como firmante de una corrección publicada (visto el 30-09-2026).
 *
 * No pide una persona: esas vías las firma el operador con la cuenta de rol
 * (`civicpulse-curator`), y esa convención es suya. Rechaza sólo lo que no
 * firma nada —una firma sin una sola letra, la sintaxis de un hueco (`<…>`) o
 * una palabra de PALABRAS_DE_MARCADOR—, así que todo lo que rechaza lo rechaza
 * también `rechazoDeFirma`.
 */
const SINTAXIS_DE_HUECO = /[<>]/

/** Por qué esta firma es el hueco de una orden sin rellenar, o `null` si firma algo. */
export function rechazoDeMarcador(editor: string): string | null {
  const firma =
    typeof editor === 'string' ? editor.normalize('NFC').replace(/\s+/g, ' ').trim() : ''
  if (!/\p{L}/u.test(firma)) {
    return firma
      ? `«${firma}» no tiene ni una letra, es el hueco de una orden preparada: escribe quién firma`
      : 'la firma está vacía: escribe quién firma'
  }
  if (SINTAXIS_DE_HUECO.test(firma)) {
    return `«${firma}» es el hueco de una orden preparada, sin rellenar: escribe quién firma`
  }
  const marcador = llana(firma)
    .split(/[^\p{L}]+/u)
    .find((p) => PALABRAS_DE_MARCADOR.has(p))
  if (marcador) {
    return `«${firma}» es el marcador de una orden sin rellenar («${marcador}»), no una firma: escribe quién firma`
  }
  return null
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN DECIDIÓ, SEGÚN LA FIRMA
 *
 * La otra pregunta que se le hace a una firma, la de las bajadas de veredicto:
 * `downgrade-verdict` es la vía del curador, pero la han usado también una
 * revisión con un modelo (`ai-gold-review`, 24-06-2026) y sesiones de Claude,
 * cada una con su firma. Medido el 30-09-2026: de las 69 bajadas del overlay,
 * 47 no las firma una persona, y la tarjeta las rotulaba todas «corregido por
 * un curador».
 *
 * Tres respuestas, no dos. Lo que no nombra a una persona no es por eso de una
 * máquina: «sergei», el `curator` que la CLI pone por defecto o la cuenta de
 * rol no dicen quién decidió, y llamarlas automáticas sería afirmar lo que no
 * sabemos (docs/DATA_INTEGRITY.md, regla 3). Sólo es `automatica` la firma que
 * nombra un proceso o un modelo.
 */
export const CLASES_DE_FIRMA = ['persona', 'automatica', 'no-consta'] as const

export type ClaseDeFirma = (typeof CLASES_DE_FIRMA)[number]

export function claseDeFirma(editor: unknown): ClaseDeFirma {
  if (typeof editor !== 'string') return 'no-consta'
  if (rechazoDeFirma(editor) === null) return 'persona'
  // Partida por todo lo que no es letra: «claude-fable-5.1» y «Claude
  // (revisión 17-08…)» nombran el modelo aunque `rechazoDeFirma` los pare antes
  // por las cifras.
  const partes = llana(editor).split(/[^\p{L}]+/u)
  return partes.some((p) => PALABRAS_DE_PROCESO.has(p)) ? 'automatica' : 'no-consta'
}
