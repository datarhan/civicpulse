import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBackendChain, claudeEnvelopeToRaw, loadConfigFromEnv } from '../src/llm/client'
import {
  seatsFromOfficials,
  singleSeatBlocs,
  type OfficialLike,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'
import { normaliseForQuoteMatch } from '../src/scraper/quote-match'
import type { RawSegment, SpeakerCandidate } from '../src/scraper/speaker-map'
import {
  acotarATramos,
  buildTextSpeakerMapPrompt,
  buildUserPromptVentana,
  caminoDelMapa,
  candidatasDeRespuesta,
  citaEnTranscripcion,
  configTexto,
  construirFilas,
  ETIQUETAS_POR_TROZO,
  nombreLiteralEn,
  partidosAcreditados,
  reetiquetarConTurnos,
  RespuestaTextoSchema,
  SEGUNDOS_MAXIMOS_DE_VENTANA,
  trozoDeEtiqueta,
  ventanas,
  ventanasDemasiadoLargas,
} from '../src/scraper/speaker-map-texto'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

/**
 * Contrato del mapa de hablantes por TEXTO (Claude sobre la transcripción publicada).
 *
 * Las fixtures son reales y del mismo día:
 *   · un tramo (1100–3420 s) de la transcripción publicada de 11025xk, y
 *   · el sobre JSON que `claude -p` (Sonnet, `speaker-map-texto-v2`) devolvió para
 *     cada una de las tres ventanas de ese tramo, sin tocar salvo `session_id`,
 *     `uuid` y `credential_expires_at`, que identifican la sesión y no la respuesta.
 * La corporación es la real (`public/data/officials.json`), como en
 * `speaker-map-validate.test.ts`: no se reescribe aquí.
 */
const doc = JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')) as OfficialsDoc
const OFFICIALS = (doc.officials ?? []) as OfficialLike[]
const SEATS = seatsFromOfficials(doc)

const TRAMO = parseDiarizedTranscript(
  readFileSync(resolve('tests/fixtures/pleno-transcript-11025xk-tramo_2026-11-20.txt'), 'utf8'),
)
const SOBRES = [0, 1, 2].map((k) =>
  JSON.parse(
    readFileSync(
      resolve(`tests/fixtures/claude-sobre-speaker-map-texto-11025xk-v${k}_2026-11-20.json`),
      'utf8',
    ),
  ),
)
/** Del sobre a las candidatas por el MISMO camino que `callLLM`: envelope → JSON → zod → parser. */
const CANDIDATAS = SOBRES.flatMap((e) =>
  candidatasDeRespuesta(RespuestaTextoSchema.parse(JSON.parse(claudeEnvelopeToRaw(e)!)).hablantes),
)

const filas = (candidatas: readonly SpeakerCandidate[], segments: readonly RawSegment[] = TRAMO) =>
  construirFilas({
    candidatas,
    segments,
    separacion: 'openai-diarize-por-trozo',
    officials: OFFICIALS,
    seats: SEATS,
  })

describe('caminoDelMapa — el interruptor, Gemini por defecto', () => {
  it('sin valor o «gemini» es Gemini; «texto» es texto', () => {
    expect(caminoDelMapa(undefined)).toBe('gemini')
    expect(caminoDelMapa('')).toBe('gemini')
    expect(caminoDelMapa('gemini')).toBe('gemini')
    expect(caminoDelMapa('texto')).toBe('texto')
  })
  it('un valor desconocido NO cae a ninguno de los dos', () => {
    expect(caminoDelMapa('claude')).toBeNull()
  })
})

describe('configTexto — nunca un backend de pago', () => {
  const guardado = { ...process.env }
  afterEach(() => {
    process.env = { ...guardado }
  })
  it('con claves de OpenAI y Anthropic en el entorno, la cadena es sólo claude-code', () => {
    process.env.OPENAI_API_KEY = 'sk-prueba'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba'
    process.env.LLM_BACKEND = 'openai'
    expect(buildBackendChain(configTexto(loadConfigFromEnv()))).toEqual(['claude-code'])
  })
})

describe('trozoDeEtiqueta — atado al esquema del transcriptor', () => {
  it('el 20 es el del transcriptor, no una copia', () => {
    // Regla 1 de DATA_INTEGRITY: si el transcriptor cambia el número, esto se pone
    // rojo. Hoy vive en transcribe-pleno.sh; la PR #567 lo mueve a
    // src/scraper/trozo-diarizado.ts con este mismo nombre — cuando llegue, este
    // módulo debe IMPORTARLO de allí y este test, desaparecer.
    const ts = resolve('src/scraper/trozo-diarizado.ts')
    if (existsSync(ts)) {
      expect(readFileSync(ts, 'utf8')).toContain(`ETIQUETAS_POR_TROZO = ${ETIQUETAS_POR_TROZO}`)
    } else {
      const sh = readFileSync(resolve('scripts/transcribe-pleno.sh'), 'utf8')
      expect(sh).toContain(`chunkIdx * ${ETIQUETAS_POR_TROZO} + order.indexOf(sp)`)
    }
  })
  it('SPEAKER_43 es del trozo 2; lo que no es etiqueta, de ninguno', () => {
    expect(trozoDeEtiqueta('SPEAKER_00')).toBe(0)
    expect(trozoDeEtiqueta('SPEAKER_19')).toBe(0)
    expect(trozoDeEtiqueta('SPEAKER_43')).toBe(2)
    expect(trozoDeEtiqueta('SPEAKER_105')).toBe(5)
    expect(trozoDeEtiqueta('UNKNOWN')).toBeNull()
  })
})

describe('ventanas', () => {
  it('por trozo: contiguas, sin huecos ni solapes, una familia de etiquetas cada una', () => {
    const vs = ventanas(TRAMO, 'openai-diarize-por-trozo')
    expect(vs.length).toBe(3)
    expect(vs[0].desde).toBe(0)
    expect(vs[vs.length - 1].hasta).toBe(TRAMO.length)
    for (let i = 1; i < vs.length; i++) expect(vs[i].desde).toBe(vs[i - 1].hasta)
    for (const v of vs) {
      const trozos = new Set(TRAMO.slice(v.desde, v.hasta).map((s) => trozoDeEtiqueta(s.speaker)))
      expect(trozos.size).toBe(1)
    }
    expect(ventanasDemasiadoLargas(TRAMO, vs)).toEqual([])
  })
  it('una ventana más larga que un trozo se denuncia: el esquema de aguas arriba cambió', () => {
    const largo: RawSegment[] = [
      { start: 0, end: 5, speaker: 'SPEAKER_00', text: 'a' },
      {
        start: SEGUNDOS_MAXIMOS_DE_VENTANA + 10,
        end: SEGUNDOS_MAXIMOS_DE_VENTANA + 15,
        speaker: 'SPEAKER_01',
        text: 'b',
      },
    ]
    expect(ventanasDemasiadoLargas(largo, ventanas(largo, 'openai-diarize-por-trozo')).length).toBe(
      1,
    )
  })
  it('con etiquetas globales (pyannote): por tiempo', () => {
    const vs = ventanas(TRAMO, 'pyannote-sesion', 600)
    expect(vs.length).toBeGreaterThan(3)
    for (const v of vs) {
      const tramos = new Set(TRAMO.slice(v.desde, v.hasta).map((s) => Math.floor(s.start / 600)))
      expect(tramos.size).toBe(1)
    }
  })
  it('el mensaje marca el contexto y lista SÓLO las etiquetas de la ventana', () => {
    const [, v1] = ventanas(TRAMO, 'openai-diarize-por-trozo')
    const p = buildUserPromptVentana(TRAMO, v1)
    expect(p).toContain('=== CONTEXTO ANTERIOR ===')
    expect(p).toContain('=== VENTANA ===')
    expect(p).toContain('=== CONTEXTO POSTERIOR ===')
    const lista = p.split('Etiquetas de la ventana: ')[1].split('\n')[0].split(', ')
    for (const l of lista) expect(trozoDeEtiqueta(l)).toBe(1)
  })
  it('el prompt conserva las reglas del de audio y pide el nombre SIN cargo', () => {
    const p = buildTextSpeakerMapPrompt()
    expect(p).toContain('No deduzcas la identidad por el contenido')
    expect(p).toContain('el partido que se nombra suele ser aquel al que se ataca')
    expect(p).toContain('Nunca el cargo')
    for (const rel of ['turn-grant', 'reply', 'back-reference']) expect(p).toContain(rel)
  })
})

describe('los sobres reales pasan por el parser del camino de audio', () => {
  it('seis líneas en tres ventanas, seis candidatas, ninguna medio leída', () => {
    expect(CANDIDATAS.length).toBe(6)
    for (const c of CANDIDATAS) expect(c.evidence).not.toBeNull()
  })
  it('con v2 ningún nombre lleva cargo ni paréntesis', () => {
    for (const c of CANDIDATAS) expect(c.heardAs ?? '').not.toMatch(/[(),]|regidor|alcalde/i)
  })
  it('un campo vacío es «nadie acreditado», no un error', () => {
    expect(candidatasDeRespuesta('')).toEqual([])
  })
})

describe('citaEnTranscripcion — la puerta que el camino de audio no necesitaba', () => {
  const por = (label: string) => CANDIDATAS.find((c) => c.label === label)!

  it('una cita que está en su línea pasa sin moverse', () => {
    const raquel = por('SPEAKER_04')
    expect(citaEnTranscripcion(raquel, TRAMO)).toEqual({ candidata: raquel, reubicada: false })
  })
  it('un segundo que apunta a otra línea se reubica en la ÚNICA que contiene la cita', () => {
    // v1 citó @3306.9 (dentro de otra línea); «¿Más palabras? Ah, Juan.» abre en 3305.3.
    const juan = por('SPEAKER_40')
    const corrido = { ...juan, evidence: { ...juan.evidence!, at: 3306.9 } }
    const r = citaEnTranscripcion(corrido, TRAMO)!
    expect(r.reubicada).toBe(true)
    expect(r.candidata.evidence!.at).toBe(3305.3)
  })
  it('una cita que no está en la transcripción no pasa', () => {
    const raquel = por('SPEAKER_04')
    const inventada = {
      ...raquel,
      evidence: { ...raquel.evidence!, quote: 'Té la paraula Raquel, del PSOE.' },
    }
    expect(citaEnTranscripcion(inventada, TRAMO)).toBeNull()
  })
  it('la cita tiene que estar en una línea de QUIEN la dice', () => {
    const raquel = por('SPEAKER_04')
    const otro = { ...raquel, evidence: { ...raquel.evidence!, spokenBy: 'SPEAKER_01' } }
    expect(citaEnTranscripcion(otro, TRAMO)).toBeNull()
  })
})

describe('construirFilas sobre los sobres reales', () => {
  const r = filas(CANDIDATAS)
  const por = (label: string) => r.rows.find((x) => x.label === label)

  it('cesiones de turno que la transcripción sostiene → filas', () => {
    expect(por('SPEAKER_04')?.slug).toBe('raquel-pamblanco-paredes')
    expect(por('SPEAKER_40')?.bloc).toBe('PP')
  })
  it('la misma persona en dos trozos NO colisiona: son espacios de clústeres distintos', () => {
    const r2 = filas([
      ...CANDIDATAS,
      {
        label: 'SPEAKER_20',
        heardAs: 'Raquel',
        party: null,
        evidence: {
          spokenBy: 'SPEAKER_21',
          at: 2069.3,
          quote: 'Raquel, según intervención.',
          relation: 'turn-grant',
        },
      },
    ])
    expect(r2.rows.find((x) => x.label === 'SPEAKER_20')?.slug).toBe('raquel-pamblanco-paredes')
    expect(r2.rows.find((x) => x.label === 'SPEAKER_04')?.slug).toBe('raquel-pamblanco-paredes')
  })
  it('un nombre que acoge a varios concejales falla cerrado', () => {
    expect(por('SPEAKER_42')).toBeUndefined()
    expect(r.rejected.find((x) => x.label === 'SPEAKER_42')?.reason).toBe('ambiguous')
  })
  it('toda fila descansa en una cita que está, literal, en la transcripción', () => {
    expect(r.rows.length).toBeGreaterThan(0)
    for (const row of r.rows) {
      const ev = row.evidence[0]
      const s = TRAMO.find((x) => ev.at >= x.start && ev.at < x.end)!
      expect(s.speaker).toBe(ev.spokenBy)
      expect(normaliseForQuoteMatch(s.text)).toContain(normaliseForQuoteMatch(ev.quote))
    }
  })
})

describe('el partido sólo con alias fuertes', () => {
  it('«podem» y «bloc» sueltos son un verbo y un nombre común, no un partido', () => {
    expect(partidosAcreditados('no ho podem acceptar')).toEqual([])
    expect(partidosAcreditados('el bloc de pisos del carrer Major')).toEqual([])
  })
  it('las formas largas siguen valiendo', () => {
    expect(partidosAcreditados('Esquerra Unida Podem, endavant')).toContain('EU-Podem')
    expect(partidosAcreditados('Unides Podem')).toContain('EU-Podem')
    expect(partidosAcreditados('Compromís, Rafa.')).toContain('Compromís')
  })
  it('un nombre se compara por palabras ENTERAS: «Paula» no está en «salvar la pau»', () => {
    expect(nombreLiteralEn('Paula', 'per salvar la pau')).toBe(false)
    expect(nombreLiteralEn('José Ángel', 'José Ángel.')).toBe(true)
  })
})

describe('un bloque de un escaño no se nombra por el partido solo', () => {
  const bloc = singleSeatBlocs(SEATS)[0]
  const quien = OFFICIALS.find((o) => o.party === bloc)!
  const segs = (frase: string): RawSegment[] => [
    { start: 0, end: 3, speaker: 'SPEAKER_00', text: frase },
    { start: 3, end: 10, speaker: 'SPEAKER_05', text: 'Moltes gràcies, bona vesprada.' },
  ]
  const grant = (heardAs: string | null, quote: string): SpeakerCandidate => ({
    label: 'SPEAKER_05',
    heardAs,
    party: bloc,
    evidence: { spokenBy: 'SPEAKER_00', at: 0, quote, relation: 'turn-grant' },
  })

  it('hay al menos un bloque de un escaño que probar', () => {
    expect(bloc).toBeTruthy()
    expect(quien).toBeTruthy()
  })
  it('sin nombre en la cita, nada', () => {
    const r = filas([grant(null, `${bloc}.`)], segs(`${bloc}.`))
    expect(r.rows).toEqual([])
    expect(r.rejected[0].reason).toBe('nombre-no-literal')
  })
  it('con un nombre que no es de su concejal, nada: el validador resuelve por el partido y no lo mira', () => {
    const r = filas([grant('Zacarías', `${bloc}, Zacarías.`)], segs(`${bloc}, Zacarías.`))
    expect(r.rows).toEqual([])
    expect(r.rejected.map((x) => x.reason)).toContain('nombre-no-casa')
  })
  it('con su nombre, sí — y la fila dice que nombra a una persona', () => {
    const nombre = quien.name.split(' ')[0]
    const r = filas([grant(nombre, `${bloc}, ${nombre}.`)], segs(`${bloc}, ${nombre}.`))
    expect(r.rows[0]?.slug).toBe(quien.slug)
    expect(r.rows[0]?.namesIndividual).toBe(true)
  })
})

describe('la posición: el nombre en el borde de su línea', () => {
  const larga =
    'Raquel ha dicho antes que el contrato de basuras se ha prorrogado tres veces sin licitación y eso no puede ser'
  const segs: RawSegment[] = [
    { start: 0, end: 9, speaker: 'SPEAKER_00', text: larga },
    { start: 9, end: 20, speaker: 'SPEAKER_05', text: 'Gràcies.' },
  ]
  it('un nombre al principio de una línea larga no es una cesión al que habla después', () => {
    const r = filas(
      [
        {
          label: 'SPEAKER_05',
          heardAs: 'Raquel',
          party: null,
          evidence: { spokenBy: 'SPEAKER_00', at: 0, quote: larga, relation: 'turn-grant' },
        },
      ],
      segs,
    )
    expect(r.rows).toEqual([])
    expect(r.rejected[0].reason).toBe('relation-contradicted')
  })
})

describe('una etiqueta, una persona', () => {
  // Una etiqueta que el diarizador ha mezclado: la presidencia da la palabra a dos
  // personas distintas y las dos intervenciones caen bajo SPEAKER_05.
  const segs: RawSegment[] = [
    { start: 0, end: 2, speaker: 'SPEAKER_00', text: 'José.' },
    { start: 2, end: 10, speaker: 'SPEAKER_05', text: 'Moltes gràcies, bona vesprada.' },
    { start: 10, end: 12, speaker: 'SPEAKER_00', text: 'Raquel.' },
    { start: 12, end: 20, speaker: 'SPEAKER_05', text: 'Gràcies.' },
  ]
  const g = (at: number, nombre: string): SpeakerCandidate => ({
    label: 'SPEAKER_05',
    heardAs: nombre,
    party: null,
    evidence: { spokenBy: 'SPEAKER_00', at, quote: `${nombre}.`, relation: 'turn-grant' },
  })

  it('dos pruebas incompatibles → la etiqueta no se nombra, aunque una sea ambigua', () => {
    // «José» solo es ambiguo (varios concejales) y no resolvería; aun así contradice a «Raquel».
    const r = filas([g(0, 'José'), g(10, 'Raquel')], segs)
    expect(r.rows).toEqual([])
    expect(r.rejected.map((x) => x.reason)).toContain('etiqueta-en-conflicto')
  })
  it('dos pruebas de la MISMA persona → una fila, no una colisión consigo misma', () => {
    const r = filas([g(10, 'Raquel'), g(10, 'Raquel')], segs)
    expect(r.rows.length).toBe(1)
    expect(r.rejected.map((x) => x.reason)).not.toContain('label-collision')
  })
})

describe('reetiquetarConTurnos — la variante pyannote', () => {
  const pub: RawSegment[] = [
    { start: 0, end: 4, speaker: 'SPEAKER_00', text: 'uno' },
    { start: 4, end: 10, speaker: 'SPEAKER_00', text: 'dos' },
    { start: 50, end: 52, speaker: 'SPEAKER_20', text: 'tres' },
    { start: 60, end: 64, speaker: 'SPEAKER_20', text: 'cuatro' },
  ]
  const r = reetiquetarConTurnos(pub, [
    { start: 0, end: 5, speaker: 'SPEAKER_A' },
    { start: 5, end: 12, speaker: 'SPEAKER_B' },
    { start: 60, end: 61, speaker: 'SPEAKER_A' },
    { start: 62, end: 63, speaker: 'SPEAKER_B' },
  ])
  it('cada línea toma el clúster que cubre al menos la mitad; si ninguno, UNKNOWN', () => {
    expect(r.map((s) => s.speaker)).toEqual(['SPEAKER_A', 'SPEAKER_B', 'UNKNOWN', 'UNKNOWN'])
  })
  it('el texto y los tiempos no se tocan', () => {
    expect(r.map((s) => [s.start, s.end, s.text])).toEqual(pub.map((s) => [s.start, s.end, s.text]))
  })
})

describe('acotarATramos — una prueba nombra un tramo, no la etiqueta entera', () => {
  // SPEAKER_05 es un clúster que el diarizador ha llenado con dos personas: Juan
  // (tras la cesión) y, más tarde, otra intervención que nadie ha identificado.
  const segs: RawSegment[] = [
    { start: 0, end: 2, speaker: 'SPEAKER_00', text: 'Juan.' },
    { start: 2, end: 8, speaker: 'SPEAKER_05', text: 'Gràcies, alcalde. La moció que presentem.' },
    { start: 8, end: 14, speaker: 'SPEAKER_05', text: 'Demanem que es licite el contracte.' },
    { start: 14, end: 16, speaker: 'SPEAKER_00', text: 'Més paraules?' },
    {
      start: 16,
      end: 30,
      speaker: 'SPEAKER_05',
      text: 'Populisme d’extrema dreta, això és el que és.',
    },
  ]
  const fila = (
    spokenBy: string,
    at: number,
    relation: 'turn-grant' | 'reply' | 'back-reference',
  ) => ({
    label: 'SPEAKER_05',
    bloc: 'PP',
    slug: 'x',
    heardAs: 'Juan',
    evidence: [{ spokenBy, at, quote: 'Juan.', relation }],
    namesIndividual: false,
    weak: relation === 'back-reference',
  })

  it('la cesión nombra las líneas que abre, hasta que habla otro; el resto de la etiqueta queda sin nombre', () => {
    const r = acotarATramos([fila('SPEAKER_00', 0, 'turn-grant')], segs)
    expect(r.rows.map((x) => x.label)).toEqual(['SPEAKER_05~2.0'])
    expect(r.segments.map((s) => s.speaker)).toEqual([
      'SPEAKER_00',
      'SPEAKER_05~2.0',
      'SPEAKER_05~2.0',
      'SPEAKER_00',
      'SPEAKER_05',
    ])
    // El texto no se toca.
    expect(r.segments.map((s) => s.text)).toEqual(segs.map((s) => s.text))
  })
  it('una respuesta nombra el tramo que cierra', () => {
    const conRespuesta: RawSegment[] = [
      ...segs.slice(0, 3),
      { start: 14, end: 16, speaker: 'SPEAKER_00', text: 'Gràcies, Juan.' },
    ]
    const r = acotarATramos([fila('SPEAKER_00', 14, 'reply')], conRespuesta)
    expect(r.segments.map((s) => s.speaker).slice(1, 3)).toEqual([
      'SPEAKER_05~2.0',
      'SPEAKER_05~2.0',
    ])
  })
  it('una etiqueta que se da la palabra a sí misma es la presidencia fundida: no se nombra', () => {
    const r = acotarATramos([fila('SPEAKER_05', 2, 'turn-grant')], segs)
    expect(r.rows).toEqual([])
    expect(r.rejected[0].reason).toBe('etiqueta-preside')
  })
  it('una retro-referencia no tiene tramo: la fila queda débil y no avala', () => {
    const r = acotarATramos([fila('SPEAKER_00', 0, 'back-reference')], segs)
    expect(r.rows[0].weak).toBe(true)
    expect(r.segments.map((s) => s.speaker)).toEqual(segs.map((s) => s.speaker))
  })
  it('el tramo sigue siendo del trozo de su etiqueta', () => {
    expect(trozoDeEtiqueta('SPEAKER_43~2597.7')).toBe(2)
  })
})
