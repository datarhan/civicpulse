/**
 * El mapa de hablantes sacado del TEXTO de la transcripción publicada, sin audio.
 *
 * ## Por qué existe
 *
 * El mapa de `extract-speaker-map.ts` sale de Gemini con el audio adjunto, y vive
 * de un nivel gratuito de 20 peticiones al día. Del 18 al 20 de noviembre de 2026
 * no devolvió más que 503 «high demand» y luego 429, y `check:runs` se quedó en
 * rojo. Este camino reparte el trabajo en dos:
 *
 *   1. **Separar hablantes** ya está hecho: la transcripción publicada
 *      (`public/data/pleno-transcripts/<id>.txt`, OpenAI diarize) trae etiquetas
 *      `SPEAKER_NN`. O, como variante, una re-diarización de la sesión entera con
 *      pyannote local (`reetiquetarConTurnos`).
 *   2. **Nombrar** se lo pide a Claude por el cliente de texto ($0), que sólo
 *      escribe el «Bloque 2» del prompt de audio. Lo que devuelve pasa por el MISMO
 *      parser (`parseSpeakerMapResponse`) y las MISMAS puertas
 *      (`validateSpeakerMap`) que el de Gemini.
 *
 * ## Lo que NO cambia respecto al prompt de audio
 *
 * Un nombre o un partido sólo si una frase dicha en la sesión lo acredita, y la
 * frase va copiada como prueba. Nunca por el contenido ni por el partido que se
 * ataca. Ver `speaker-map-prompt.ts` — sus reglas 6 y 7 son las que aquí se
 * repiten, y por lo mismo.
 *
 * ## Lo que SÍ cambia, y por qué hay una puerta más
 *
 * Gemini escribía sus propios segmentos: la cita que daba como prueba estaba, por
 * construcción, en su transcripción. Aquí el texto es ajeno — es el publicado — y un
 * modelo de texto puede citar una frase que no está. Así que antes de las puertas
 * de siempre la cita tiene que aparecer, palabra a palabra, en el segmento que
 * dice citar (`citaEnTranscripcion`). Si el segundo apunta a otra línea pero la
 * cita está en UNA sola línea de quien la dice, se reubica allí; si está en varias o
 * en ninguna, se rechaza.
 *
 * Y una etiqueta con dos pruebas que llevan a dos personas distintas es una
 * etiqueta que mezcla a dos personas (un error del diarizador): no se nombra
 * (`etiqueta-en-conflicto`). Una atribución equivocada es grado difamación; una
 * abstención no hace daño.
 */
import { z } from 'zod'
import type { ClientConfig } from '../llm/client'
import type { BlocSeats, OfficialLike } from './corporation-seats'
import { findPartiesInText, normalizeParty } from '../lib/party-alias'
import { normaliseForQuoteMatch } from './quote-match'
import {
  parseSpeakerMapResponse,
  type RawSegment,
  type SpeakerCandidate,
  type SpeakerMapRow,
} from './speaker-map'
import { segmentAt, validateSpeakerMap, type RejectedCandidate } from './speaker-map-validate'

/**
 * Sube cuando cambie el prompt. Va en cada mapa como procedencia y en la clave de
 * caché de `callLLM`, así que una redacción nueva no sirve respuestas viejas.
 */
//
// v2 (2026-11-20): el campo del nombre lleva SÓLO las palabras de la cita que
// nombran. Con v1 el modelo escribía «Teresa, regidora d'Urbanisme» o «Rafael
// (Rafa)», y la puerta del nombre literal los rechazaba aunque la cita sí nombrara.
export const SPEAKER_MAP_TEXT_PROMPT_VERSION = 'speaker-map-texto-v2'

/**
 * Etiquetas reservadas por trozo en la transcripción publicada.
 *
 * `transcribe-pleno.sh` numera `SPEAKER_${chunkIdx * 20 + orden}`: las etiquetas
 * son únicas en la sesión, pero cada trozo de 1200 s es su propio espacio de
 * clústeres y la misma persona lleva otra etiqueta en el trozo siguiente. Si ese
 * script cambia el 20, esto tiene que cambiar con él.
 */
export const ETIQUETAS_POR_TROZO = 20

/** Líneas de contexto a cada lado de una ventana: una cesión de turno en la costura. */
export const LINEAS_DE_CONTEXTO = 15

/** Tope de una ventana cuando las etiquetas son globales (pyannote) y no marcan trozos. */
export const SEGUNDOS_POR_VENTANA = 1200

/**
 * Qué camino construye el mapa. Por defecto, Gemini con el audio.
 *
 * `texto` delega en `extract-speaker-map-texto.ts`: Claude ($0) sobre la
 * transcripción publicada, sin audio. Existe porque el nivel gratuito de Gemini
 * (20 peticiones/día) pasó del 18 al 20 de noviembre de 2026 devolviendo sólo 503
 * y 429. NO es el predeterminado: cambiarlo en el nocturno es decisión del usuario
 * y la medida está en `editorial/mapa-hablantes-texto/`. Un valor desconocido
 * para la pasada en vez de caer en silencio al camino de pago en cuota.
 */
export function caminoDelMapa(valor: string | undefined): 'gemini' | 'texto' | null {
  if (!valor || valor === 'gemini') return 'gemini'
  if (valor === 'texto') return 'texto'
  return null
}

/** De dónde salen las etiquetas que el modelo nombra. */
export type Separacion =
  /** La transcripción publicada tal cual: clústeres por trozo de 1200 s. */
  | 'openai-diarize-por-trozo'
  /** Una pasada de pyannote sobre la sesión entera: clústeres globales. */
  | 'pyannote-sesion'

/** Lo que el modelo devuelve: el bloque 2 como texto, para el parser de siempre. */
export const RespuestaTextoSchema = z.object({
  hablantes: z.string(),
})

/** El trozo de la transcripción publicada al que pertenece una etiqueta. */
export function trozoDeEtiqueta(label: string): number | null {
  const m = /^SPEAKER_(\d+)$/.exec(label)
  return m ? Math.floor(Number(m[1]) / ETIQUETAS_POR_TROZO) : null
}

/** Una ventana: el rango de segmentos `[desde, hasta)` que se le enseña al modelo. */
export interface Ventana {
  indice: number
  desde: number
  hasta: number
}

/**
 * Las ventanas en que se parte la sesión, una llamada al modelo cada una.
 *
 * Con la transcripción publicada, una por trozo (lo que marcan las etiquetas). Con
 * etiquetas globales, por tiempo. En los dos casos son rangos contiguos que cubren
 * todos los segmentos una sola vez.
 */
export function ventanas(
  segments: readonly RawSegment[],
  separacion: Separacion,
  segundos = SEGUNDOS_POR_VENTANA,
): Ventana[] {
  const out: Ventana[] = []
  if (segments.length === 0) return out
  const claveDe = (s: RawSegment): number =>
    separacion === 'openai-diarize-por-trozo'
      ? (trozoDeEtiqueta(s.speaker) ?? -1)
      : Math.floor(s.start / segundos)
  let desde = 0
  let clave = claveDe(segments[0])
  for (let i = 1; i < segments.length; i++) {
    const k = claveDe(segments[i])
    // Sólo se corta hacia delante: una línea suelta con etiqueta de un trozo
    // anterior no abre una ventana nueva hacia atrás.
    if (k > clave) {
      out.push({ indice: out.length, desde, hasta: i })
      desde = i
      clave = k
    }
  }
  out.push({ indice: out.length, desde, hasta: segments.length })
  return out
}

const linea = (s: RawSegment) =>
  `[${s.start.toFixed(1)} → ${s.end.toFixed(1)}] (${s.speaker}) ${s.text}`

export function buildTextSpeakerMapPrompt(): string {
  return `Eres un analista forense de sesiones plenarias municipales españolas. Trabajas sobre la TRANSCRIPCIÓN de un pleno del Ayuntamiento de Riba-roja de Túria (Comunitat Valenciana), no sobre el audio. Los intervinientes alternan entre castellano y valencià.

La transcripción ya está separada por hablantes con etiquetas anónimas \`SPEAKER_NN\`. Tu único trabajo es decir QUIÉN es cada etiqueta, y sólo cuando la propia sesión lo acredita con una frase que se puede citar.

La transcripción es automática: los nombres propios y las frases cortas en valencià suelen salir deformados («Compromís, Rafa» puede aparecer como «compromiso, razón»). No corrijas nada: si la frase no se lee tal cual en el texto, no sirve de prueba.

## Salida

En el campo \`hablantes\`, una línea por prueba, con CINCO campos separados por \`|\`:

SPEAKER_NN | nombre o cargo | partido | QUIEN_LO_DICE @SEGUNDO "cita literal" | rel: TIPO

- \`QUIEN_LO_DICE\` es la etiqueta de la línea donde está la cita, que casi nunca es la misma que identifica. Obligatorio.
- \`@SEGUNDO\` es el número que abre esa línea, copiado tal cual: la línea \`[561.0 → 561.3] (SPEAKER_00) David.\` se cita \`SPEAKER_00 @561.0 "David."\`.
- La cita se copia LITERAL de esa única línea, sin corregir ni completar. Puede ser un trozo de la línea.
- \`TIPO\` es uno de:
  - \`turn-grant\` — la cita cede la palabra al hablante identificado, que habla en la línea JUSTO SIGUIENTE. Ej: la presidencia dice «Compromís, Rafa».
  - \`reply\` — la cita responde o agradece al hablante identificado, que ha hablado en la línea JUSTO ANTERIOR. Ej: «Sí, gràcies, alcalde».
  - \`back-reference\` — la cita nombra al hablante a cualquier distancia. Ej: «l'exposició de motius que ha plantejat David».
- \`nombre\`: SÓLO las palabras de la cita que nombran a la persona, copiadas tal cual («Teresa», «José Ángel», «Juan»). Nunca el cargo, nunca un nombre completado, nunca paréntesis. Si la cita sólo da un cargo («alcalde», «regidora d'Urbanisme»), la línea no sirve: omítela.
- \`partido\`: sólo si está escrito en la cita. Si no, \`sin identificar\`.
- Puedes dar varias líneas para la misma etiqueta si hay varias pruebas.
- Una etiqueta sin ninguna acreditación NO aparece. Si ninguna la tiene, deja el campo vacío.

## Reglas, en orden de importancia

1. **NOMBRES: sólo si la sesión los da.** Atribuye un nombre a un SPEAKER_NN sólo si una frase de la transcripción lo acredita, y cópiala como prueba. No deduzcas la identidad por el contenido, por el partido que se menciona, ni por el tema del que se habla. Un nombre que no se ha pronunciado no puede aparecer.

2. **EL PARTIDO, IGUAL.** Sólo si la cita lo dice. «Compromís, Rafa» acredita partido y nombre. Una intervención que critica al PSOE no acredita NADA sobre quien habla: en un debate, el partido que se nombra suele ser aquel al que se ataca.

3. **IDENTIFICA SÓLO LAS ETIQUETAS DE LA VENTANA.** Las líneas marcadas como contexto están para que veas una cesión de turno en la costura; puedes CITARLAS como prueba, pero no identifiques etiquetas que sólo aparecen en el contexto.

4. **SI DUDAS, OMITE.** Una etiqueta sin identificar no hace daño. Una mal identificada pone las palabras de una persona en boca de otra.`
}

/** El mensaje de una ventana: contexto, ventana, contexto. */
export function buildUserPromptVentana(
  segments: readonly RawSegment[],
  v: Ventana,
  contexto = LINEAS_DE_CONTEXTO,
): string {
  const antes = segments.slice(Math.max(0, v.desde - contexto), v.desde)
  const dentro = segments.slice(v.desde, v.hasta)
  const despues = segments.slice(v.hasta, Math.min(segments.length, v.hasta + contexto))
  const partes: string[] = []
  if (antes.length) partes.push('=== CONTEXTO ANTERIOR ===', ...antes.map(linea))
  partes.push('=== VENTANA ===', ...dentro.map(linea), '=== FIN DE LA VENTANA ===')
  if (despues.length) partes.push('=== CONTEXTO POSTERIOR ===', ...despues.map(linea))
  const etiquetas = [...new Set(dentro.map((s) => s.speaker))].join(', ')
  return `${partes.join('\n')}\n\nEtiquetas de la ventana: ${etiquetas}\n\n¿Quién es cada una, cuando la transcripción lo acredita?`
}

/** Las candidatas que trae el campo `hablantes`, con el parser del camino de audio. */
export function candidatasDeRespuesta(hablantes: string): SpeakerCandidate[] {
  return parseSpeakerMapResponse(`=== HABLANTES ===\n${hablantes ?? ''}`).candidates
}

/** Motivos de rechazo propios de este camino, aparte de los del validador. */
export type MotivoTexto =
  'quote-not-in-transcript' | 'etiqueta-en-conflicto' | 'nombre-no-literal' | 'nombre-no-casa'

export interface RechazoTexto {
  label: string
  reason: RejectedCandidate['reason'] | MotivoTexto
  detail: string
}

/**
 * ¿Está la cita, palabra a palabra, en el segmento que dice citar?
 *
 * Devuelve la candidata con `at` puesto al INICIO del segmento donde la cita está,
 * o `null` si no está en ninguno de forma única. Reubicar es determinista: sólo se
 * mueve a una línea de quien la dice, y sólo cuando es la única de la sesión que la
 * contiene. Las puertas posicionales se juzgan después sobre esa posición real.
 */
export function citaEnTranscripcion(
  c: SpeakerCandidate,
  segments: readonly RawSegment[],
): { candidata: SpeakerCandidate; reubicada: boolean } | null {
  const ev = c.evidence
  if (!ev) return null
  const cita = normaliseForQuoteMatch(ev.quote)
  if (!cita) return null
  const contiene = (s: RawSegment) => ` ${normaliseForQuoteMatch(s.text)} `.includes(` ${cita} `)
  const i = segmentAt(segments, ev.at)
  if (i >= 0 && segments[i].speaker === ev.spokenBy && contiene(segments[i])) {
    return { candidata: c, reubicada: false }
  }
  const donde = segments.flatMap((s, j) => (s.speaker === ev.spokenBy && contiene(s) ? [j] : []))
  if (donde.length !== 1) return null
  const s = segments[donde[0]]
  return { candidata: { ...c, evidence: { ...ev, at: s.start } }, reubicada: true }
}

const FUERZA: Record<string, number> = { 'turn-grant': 0, reply: 1, 'back-reference': 2 }

/** Plegado para comparar palabras: sin tildes, minúsculas, sólo letras y dígitos. */
const tokens = (s: string): string[] => normaliseForQuoteMatch(s).split(' ').filter(Boolean)

/**
 * Dónde tiene que estar el nombre en la línea que lo dice.
 *
 * Una cesión de turno nombra al final («…passem al punt tres. Compromís, Rafa.»);
 * una respuesta, al principio («Gràcies, alcalde, bona vesprada…»). Sin esto la
 * puerta posicional sólo mira quién habla después, y un «José» dicho a mitad de
 * una intervención larga, seguido por casualidad de otra persona, pasaba por
 * cesión.
 */
export const PALABRAS_DE_BORDE = 8

/**
 * Alias de partido que en el habla corriente casi nunca son el partido.
 *
 * `party-alias.js` los acepta porque allí reconcilia papeletas y actas. En una frase
 * dicha en un pleno, «no ho podem acceptar» y «el bloc de pisos» son verbos y
 * nombres comunes — y EU-Podem tiene un escaño, así que leerlos como partido nombra
 * a una persona por eliminación. Este camino no los cuenta como acreditación.
 */
export const ALIAS_DEBILES = ['podem', 'bloc'] as const

/** Los partidos que una cita acredita, sin los alias débiles sueltos. */
export function partidosAcreditados(cita: string): string[] {
  const palabras = tokens(cita)
  const limpia = palabras
    .map((w, i) => {
      if (!(ALIAS_DEBILES as readonly string[]).includes(w)) return w
      // «unides podem», «esquerra unida podem», «coalicio compromis» siguen valiendo.
      const prev = palabras[i - 1]
      return prev === 'unides' || prev === 'unida' ? w : '_'
    })
    .join(' ')
  return findPartiesInText(limpia) as string[]
}

/** ¿Están TODAS las palabras del nombre, enteras, en la cita? «Paula» no está en «salvar la pau». */
export function nombreLiteralEn(nombre: string, cita: string): boolean {
  const n = tokens(nombre)
  if (n.length === 0) return false
  const c = new Set(tokens(cita))
  return n.every((w) => c.has(w))
}

/** ¿Las palabras del nombre oído son palabras enteras del nombre oficial? */
export function nombreCasaConOficial(nombre: string, oficial: string): boolean {
  const n = tokens(nombre)
  const o = new Set(tokens(oficial))
  return n.length > 0 && n.every((w) => o.has(w))
}

/**
 * ¿Sostiene la posición lo que la relación afirma?
 *
 * La de `validateSpeakerMap` (quién habla antes o después) MÁS dónde cae el nombre
 * en su línea: en las últimas `PALABRAS_DE_BORDE` para una cesión, en las primeras
 * para una respuesta. Una retro-referencia no tiene posición que comprobar.
 */
export function posicionSostiene(c: SpeakerCandidate, segments: readonly RawSegment[]): boolean {
  const ev = c.evidence
  if (!ev || !c.heardAs) return false
  const i = segmentAt(segments, ev.at)
  if (i < 0) return false
  if (ev.relation === 'back-reference') return true
  const vecino = ev.relation === 'turn-grant' ? segments[i + 1] : segments[i - 1]
  if (vecino?.speaker !== c.label) return false
  const linea = tokens(segments[i].text)
  const borde =
    ev.relation === 'turn-grant'
      ? linea.slice(Math.max(0, linea.length - PALABRAS_DE_BORDE))
      : linea.slice(0, PALABRAS_DE_BORDE)
  const enBorde = new Set(borde)
  return tokens(c.heardAs).every((w) => enBorde.has(w))
}

export interface ConstruirFilasOptions {
  candidatas: readonly SpeakerCandidate[]
  /** Los segmentos de TODA la sesión: una cesión en la costura se juzga entera. */
  segments: readonly RawSegment[]
  separacion: Separacion
  officials: readonly OfficialLike[]
  seats: readonly BlocSeats[]
}

export interface FilasTexto {
  rows: SpeakerMapRow[]
  rejected: RechazoTexto[]
  /** Citas movidas a la única línea que las contiene. Se cuentan, no se esconden. */
  reubicadas: number
}

/** Dos identidades oídas son compatibles si un nombre contiene al otro y no chocan los partidos. */
function compatibles(
  a: { nombre: string[]; partido: string | null },
  b: { nombre: string[]; partido: string | null },
): boolean {
  if (a.partido && b.partido && a.partido !== b.partido) return false
  const sa = new Set(a.nombre)
  const sb = new Set(b.nombre)
  return a.nombre.every((w) => sb.has(w)) || b.nombre.every((w) => sa.has(w))
}

/**
 * Las candidatas de todas las ventanas → filas que el mapa avala.
 *
 * Puertas, en orden, todas además de las de `validateSpeakerMap`:
 *
 *   0. la cita está, literal, en una línea de quien la dice (`citaEnTranscripcion`);
 *   1. hay un NOMBRE, y está entero en la cita — el partido solo nunca basta, ni
 *      siquiera para un bloque de un escaño: en texto, «no ho podem acceptar» se
 *      lee como EU-Podem y nombraría a su único concejal (`nombre-no-literal`);
 *   2. el partido sólo cuenta si la cita lo acredita sin alias débiles;
 *   3. la posición sostiene la relación, nombre en el borde de su línea;
 *   4. si dos pruebas posicionalmente válidas de UNA etiqueta oyen identidades
 *      incompatibles, la etiqueta no se nombra (`etiqueta-en-conflicto`) — aunque
 *      una de ellas no llegue a resolver: una cesión ambigua a «José» contradice
 *      igual una cesión a «Raquel»;
 *   5. el concejal resuelto tiene que llevar, enteras, las palabras oídas
 *      (`nombre-no-casa`): `validateSpeakerMap` resuelve un bloque de un escaño por
 *      el partido y no mira el nombre.
 *
 * Se valida por GRUPO de etiquetas que son un mismo espacio de clústeres: el trozo
 * de la transcripción publicada, o la sesión entera con pyannote. Validar la sesión
 * publicada de golpe haría colisionar al alcalde del trozo 0 con el del trozo 1.
 */
export function construirFilas(opts: ConstruirFilasOptions): FilasTexto {
  const { segments, officials, seats } = opts
  const rejected: RechazoTexto[] = []
  const rechaza = (label: string, reason: RechazoTexto['reason'], detail: string) =>
    rejected.push({ label, reason, detail })
  let reubicadas = 0

  const verificadas: SpeakerCandidate[] = []
  const vistas = new Set<string>()
  for (const c of opts.candidatas) {
    // Puerta 0 · la cita está en la transcripción.
    const r = citaEnTranscripcion(c, segments)
    if (!r) {
      rechaza(
        c.label,
        'quote-not-in-transcript',
        `«${c.evidence?.quote ?? ''}» no está en una línea de ${c.evidence?.spokenBy ?? '—'} (@${c.evidence?.at ?? '—'})`,
      )
      continue
    }
    const ev = r.candidata.evidence!
    // Puerta 1 · un nombre, entero en la cita.
    if (!c.heardAs || !nombreLiteralEn(c.heardAs, ev.quote)) {
      rechaza(
        c.label,
        'nombre-no-literal',
        c.heardAs ? `«${c.heardAs}» no está entero en «${ev.quote}»` : 'sin nombre en la cita',
      )
      continue
    }
    // Puerta 2 · el partido, sólo si la cita lo acredita sin alias débiles.
    const reclamado = c.party ? normalizeParty(c.party) : null
    const party = reclamado && partidosAcreditados(ev.quote).includes(reclamado) ? reclamado : null
    const clave = `${c.label}|${ev.spokenBy}|${ev.at}|${normaliseForQuoteMatch(ev.quote)}|${ev.relation}|${normaliseForQuoteMatch(c.heardAs)}`
    // Dos ventanas pueden ver la misma prueba en su contexto: cuenta una vez.
    if (vistas.has(clave)) continue
    vistas.add(clave)
    if (r.reubicada) reubicadas += 1
    verificadas.push({ ...r.candidata, party })
  }

  // Puerta 3 · la posición.
  const posicionales: SpeakerCandidate[] = []
  for (const c of verificadas) {
    if (posicionSostiene(c, segments)) posicionales.push(c)
    else
      rechaza(
        c.label,
        'relation-contradicted',
        `${c.evidence!.relation} @${c.evidence!.at}: el vecino no es ${c.label} o «${c.heardAs}» no está en el borde de la línea`,
      )
  }

  // Puerta 4 · una etiqueta, una identidad oída.
  const porEtiqueta = new Map<string, SpeakerCandidate[]>()
  for (const c of posicionales) porEtiqueta.set(c.label, [...(porEtiqueta.get(c.label) ?? []), c])
  const limpias: SpeakerCandidate[] = []
  for (const [label, cs] of porEtiqueta) {
    const ids = cs.map((c) => ({ nombre: tokens(c.heardAs!), partido: c.party }))
    const choque = ids.some((a, i) => ids.some((b, j) => j > i && !compatibles(a, b)))
    if (choque) {
      rechaza(
        label,
        'etiqueta-en-conflicto',
        `pruebas incompatibles: ${cs.map((c) => `«${c.heardAs}»${c.party ? ` (${c.party})` : ''}`).join(' / ')}`,
      )
      continue
    }
    limpias.push(...cs)
  }

  const grupoDe = (label: string): string =>
    opts.separacion === 'openai-diarize-por-trozo' ? String(trozoDeEtiqueta(label)) : 'sesion'
  const porGrupo = new Map<string, SpeakerCandidate[]>()
  for (const c of limpias) {
    const g = grupoDe(c.label)
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), c])
  }

  const oficialDe = new Map(officials.map((o) => [o.slug, o]))
  const rows: SpeakerMapRow[] = []
  for (const candidatas of porGrupo.values()) {
    // Cada prueba, sola: así la puerta 5 del validador no confunde dos pruebas de
    // UNA etiqueta con dos etiquetas que dicen ser la misma persona.
    const filasDe = new Map<string, Array<{ row: SpeakerMapRow; c: SpeakerCandidate }>>()
    for (const c of candidatas) {
      const v = validateSpeakerMap({ candidates: [c], segments, officials, seats })
      for (const rj of v.rejected) rejected.push(rj)
      for (const row of v.rows) {
        // Puerta 5 · el concejal resuelto lleva las palabras oídas.
        const o = row.slug ? oficialDe.get(row.slug) : undefined
        if (!o || !nombreCasaConOficial(c.heardAs!, o.name)) {
          rechaza(
            row.label,
            'nombre-no-casa',
            `«${c.heardAs}» no son palabras de ${o?.name ?? row.slug ?? '—'}`,
          )
          continue
        }
        filasDe.set(row.label, [...(filasDe.get(row.label) ?? []), { row, c }])
      }
    }
    const elegidas: SpeakerCandidate[] = []
    for (const [label, fs] of filasDe) {
      const personas = new Set(fs.map((f) => f.row.slug))
      if (personas.size > 1) {
        rechaza(
          label,
          'etiqueta-en-conflicto',
          `sus pruebas resuelven a ${[...personas].join(' y ')}`,
        )
        continue
      }
      fs.sort((a, b) => FUERZA[a.row.evidence[0].relation] - FUERZA[b.row.evidence[0].relation])
      elegidas.push(fs[0].c)
    }
    // Ahora sí, todas juntas: la puerta 5 del validador entre etiquetas del grupo.
    const v = validateSpeakerMap({ candidates: elegidas, segments, officials, seats })
    for (const rj of v.rejected) rejected.push(rj)
    rows.push(...v.rows)
  }
  return { rows, rejected, reubicadas }
}

/** Un turno de la diarización por sesión (pyannote): etiqueta global y tramo. */
export interface Turno {
  start: number
  end: number
  speaker: string
}

/** Parte mínima de una línea que un clúster tiene que cubrir para quedársela. */
export const SOLAPE_MINIMO = 0.5

/**
 * Re-etiqueta la transcripción publicada con los clústeres globales de pyannote.
 *
 * Cada línea toma el clúster que cubre al menos la MITAD de su duración. Si
 * ninguno llega, queda `UNKNOWN`, que nada valida: una línea a caballo entre dos
 * voces es justo la que mezclaría a dos personas, y mejor sin etiqueta que con la
 * de al lado. El TEXTO no se toca — sigue siendo el publicado, así que la
 * alineación posterior es texto idéntico.
 */
export function reetiquetarConTurnos(
  published: readonly RawSegment[],
  turnos: readonly Turno[],
): RawSegment[] {
  const orden = [...turnos].sort((a, b) => a.start - b.start)
  return published.map((s) => {
    const solape = new Map<string, number>()
    for (const t of orden) {
      if (t.start >= s.end) break
      const o = Math.min(s.end, t.end) - Math.max(s.start, t.start)
      if (o > 0) solape.set(t.speaker, (solape.get(t.speaker) ?? 0) + o)
    }
    let mejor = 'UNKNOWN'
    let max = 0
    for (const [k, o] of solape) {
      if (o > max) {
        max = o
        mejor = k
      }
    }
    return { ...s, speaker: max >= SOLAPE_MINIMO * (s.end - s.start) ? mejor : 'UNKNOWN' }
  })
}

/** Más allá de esto, una «ventana» por trozo ya no es un trozo de 1200 s: algo cambió aguas arriba. */
export const SEGUNDOS_MAXIMOS_DE_VENTANA = 1500

/** Las ventanas que exceden `SEGUNDOS_MAXIMOS_DE_VENTANA`. El llamante falla con ellas. */
export function ventanasDemasiadoLargas(
  segments: readonly RawSegment[],
  vs: readonly Ventana[],
): Ventana[] {
  return vs.filter(
    (v) => segments[v.hasta - 1].end - segments[v.desde].start > SEGUNDOS_MAXIMOS_DE_VENTANA,
  )
}

/**
 * La config de este camino: claude-code y SÓLO claude-code.
 *
 * Forzada, no heredada del entorno: este camino existe para no gastar, y una
 * cadena que cayera a openai de pago lo haría en silencio. `zeroCostOnly` saca los
 * backends de pago de `buildBackendChain` aunque haya claves en el entorno.
 */
export function configTexto(base: ClientConfig): ClientConfig {
  return { ...base, backend: 'claude-code', zeroCostOnly: true }
}
