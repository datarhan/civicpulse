/**
 * ¿Es el literal de una declaración lo que se dijo, o lo que un motor tradujo
 * o se inventó? Las líneas son reales: la sustituida de qz6weg (Whisper, que
 * traducía al castellano) y la vigente (el valenciano que se habló), a la
 * misma hora de la sesión.
 */
import { describe, expect, it } from 'vitest'

import {
  indexarTranscripcion,
  lenguaDeTexto,
  literalAlucinado,
  motivoDeLiteral,
} from '../src/scraper/literal-no-servible'

const SUSTITUIDA = [
  '[11580.0 → 11610.0] Y uno de ellos, casualmente, son casualidades, empezaron en la legislatura.',
  '[11610.0 → 11640.0] en la legislatura esta, legislatura que voy a recordar que gobierna en Valencia, y no voy a decir todo lo que nos dio la Generalitat Valenciana en el contrato programa, que acaban de pagar ahora mil millones de euros al Centro de Buenestar, en la casa del abogado',
  '[11640.0 → 11670.0] eso no interesa. Ahora bien, que la Generalitat del Partido Popular tenga una morosidad de más de 12 meses, eso no es problema.',
].join('\n')

const VIGENTE = [
  '[11606.2 → 11611.2] (SPEAKER_183) Casualment, són casualitats, és començaren en la legislatura esta.',
  '[11612.1 → 11619.9] (SPEAKER_183) Legislatura que vaig a recordar que governa en València i no vaig a dir tot el que mos deu la Generalitat Valenciana en el contrato programa,',
  "[11620.1 → 11623.8] (SPEAKER_183) que acaben de pagar vora mig milió d'euros al centre Bonestar,",
  "[11624.6 → 11628.8] (SPEAKER_183) en la casa de l'advocat, que duguem més de mig milió d'euros i encara no hem rebut res,",
  '[11641.2 → 11642.7] (SPEAKER_183) això no interessa.',
  '[11643.8 → 11652.0] (SPEAKER_183) que la Generalitat del Partit Popular tinga una morositat de més de 12 mesos, això no és problema.',
].join('\n')

// Una sesión hablada en castellano: la vigente dice lo mismo con otras palabras.
const VIGENTE_CASTELLANA = [
  '[11612.1 → 11619.9] (SPEAKER_12) en esta legislatura, que les recuerdo que gobierna en Valencia, y no les voy a decir lo que nos debe la Generalitat',
  '[11620.1 → 11623.8] (SPEAKER_12) que han pagado ahora casi medio millón de euros al centro de bienestar,',
].join('\n')

const LITERAL = 'que acaban de pagar ahora mil millones de euros al Centro de Buenestar'

describe('lenguaDeTexto', () => {
  it('distingue el valenciano del castellano por sus palabras función', () => {
    expect(
      lenguaDeTexto("que acaben de pagar vora mig milió d'euros al centre, això no interessa"),
    ).toBe('va')
    expect(
      lenguaDeTexto('eso no interesa, ahora bien, que tenga una morosidad de más de 12 meses'),
    ).toBe('es')
  })

  it('no juzga lo que no trae marcadores: null, nunca un castellano por defecto', () => {
    expect(lenguaDeTexto('Gracias.')).toBeNull()
    expect(lenguaDeTexto('')).toBeNull()
  })
})

describe('literalAlucinado', () => {
  it('reconoce los títulos y las coletillas que Whisper repite', () => {
    expect(literalAlucinado('La Lucha por la Vida')).toBe(true)
    expect(literalAlucinado('Subtítulos realizados por la comunidad de Amara.org')).toBe(true)
  })

  it('reconoce un bucle dentro de la frase', () => {
    expect(
      literalAlucinado(
        'a 23 de febrero, el día 23 de febrero, el día 23 de febrero, el día 23 de febrero, el día 23 de febrero',
      ),
    ).toBe(true)
  })

  it('deja en paz una frase normal, aunque repita una palabra', () => {
    expect(
      literalAlucinado('la liquidación del ejercicio 2025 arroja un superávit de 4.596.000 euros'),
    ).toBe(false)
    expect(literalAlucinado('sí, sí, a favor')).toBe(false)
  })

  it('no toma por inventada una frase dicha que contiene un marcador o una repetición', () => {
    expect(
      literalAlucinado('la Junta de Extremadura ha pagado más que nosotros por el mismo servicio'),
    ).toBe(false)
    expect(literalAlucinado('sí o no, sí o no, sí o no, sí o no, contésteme')).toBe(false)
  })
})

describe('motivoDeLiteral', () => {
  const sustituidas = [indexarTranscripcion(SUSTITUIDA)]

  it('retiene el literal castellano que sólo está en la sustituida cuando la vigente, a esa hora, es valenciano', () => {
    const r = motivoDeLiteral({
      verbatim: LITERAL,
      vigente: indexarTranscripcion(VIGENTE),
      sustituidas,
    })
    expect(r).toEqual({ motivo: 'literal-traducido' })
  })

  it('no retiene si la vigente a esa hora también es castellano: es la misma lengua oída de otra manera', () => {
    const r = motivoDeLiteral({
      verbatim: LITERAL,
      vigente: indexarTranscripcion(VIGENTE_CASTELLANA),
      sustituidas,
    })
    expect(r).toEqual({ motivo: null })
  })

  it('no retiene un literal que consta en la vigente', () => {
    const r = motivoDeLiteral({
      verbatim: "que acaben de pagar vora mig milió d'euros al centre Bonestar",
      vigente: indexarTranscripcion(VIGENTE),
      sustituidas,
    })
    expect(r).toEqual({ motivo: null })
  })

  it('dice «no juzgable» cuando la vigente no tiene nada a esa hora, en vez de callar', () => {
    const r = motivoDeLiteral({
      verbatim: LITERAL,
      vigente: indexarTranscripcion('[10.0 → 12.0] (SPEAKER_1) Bon dia a tots i a totes.'),
      sustituidas,
    })
    expect(r).toEqual({ motivo: null, noJuzgable: 'vigente-sin-lengua' })
  })

  it('no retiene una frase dicha en castellano entre valenciano: la vigente la recoge con las mismas palabras', () => {
    const vigenteMixta = [
      '[11612.1 → 11619.9] (SPEAKER_183) Legislatura que vaig a recordar que governa en València i no vaig a dir tot el que mos deu la Generalitat,',
      '[11620.1 → 11623.8] (SPEAKER_9) que acaban de pagar, digo, ahora mil millones, eh, de euros al centro, de Buenestar,',
      "[11624.6 → 11628.8] (SPEAKER_183) en la casa de l'advocat, que duguem més de mig milió d'euros i encara no hem rebut res,",
    ].join('\n')
    // La vigente la corta con muletillas: ninguna ventana de ocho palabras casa,
    // pero sus palabras largas están ahí, a esa hora.
    const r = motivoDeLiteral({
      verbatim: 'que acaban de pagar ahora mil millones de euros al Centro de Bienestar Social',
      vigente: indexarTranscripcion(vigenteMixta),
      sustituidas: [indexarTranscripcion(SUSTITUIDA.replace('Buenestar', 'Bienestar Social'))],
    })
    expect(r).toEqual({ motivo: null })
  })

  it('sólo retiene si todos los sitios donde casa el literal dicen lo mismo', () => {
    const otraHora =
      '[20000.0 → 20030.0] y ya está, que acaban de pagar ahora mil millones de euros al Centro de Buenestar, lo dijo él'
    const vigenteConCastellano =
      VIGENTE +
      '\n[20001.0 → 20029.0] (SPEAKER_7) y ya está, lo dijo él en el pleno, eso es así y no hay más'
    const r = motivoDeLiteral({
      verbatim: LITERAL,
      vigente: indexarTranscripcion(vigenteConCastellano),
      sustituidas: [indexarTranscripcion(SUSTITUIDA + '\n' + otraHora)],
    })
    expect(r).toEqual({ motivo: null })
  })

  it('retiene el texto alucinado consté donde conste', () => {
    const r = motivoDeLiteral({
      verbatim: 'La Lucha por la Vida',
      vigente: indexarTranscripcion('[0.0 → 30.0] La Lucha por la Vida'),
      sustituidas: [],
    })
    expect(r).toEqual({ motivo: 'literal-alucinado' })
  })
})
