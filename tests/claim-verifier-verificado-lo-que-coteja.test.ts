import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { verifyClaim } from '../src/scraper/claim-verifier'
import { resumenVerificado } from '../src/scraper/claim-verdicts'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * Lo que un `verificado` automático dice de sí mismo, y lo que lo funda.
 *
 * La revisión lectora del 27-10-2026 leyó en /plenos/k4olcs, pestaña
 * Declaraciones, una tarjeta «Verificado» con la explicación «Cita encontrada
 * con coincidencia fuerte en los datos municipales.» y, en la única fila de
 * evidencia, «parecido con lo citado 0,85 · no mide si lo confirma». Un vecino
 * concluye que los datos confirman la cita; la tarjeta dice que el único
 * número que enseña no mide eso, y no dice qué la confirma.
 *
 * El veredicto era bueno —el contrato 32/2024 imprime 80.666,66 €, la cifra
 * dicha, y su título nombra entero el sistema del salón de plenos—, pero:
 *
 *   · la explicación no decía lo que se cotejó, que es la cifra y el objeto;
 *   · el 0,85 no era el parecido de la fila que se enseña: era el de la
 *     LICITACIÓN del mismo expediente, puntuada con sus 70.157,72 € de
 *     presupuesto base sin IVA. La fila que se cita imprime la cifra dicha y
 *     puntúa 1.
 *
 * Y medido sobre la base entera (7.946 citas), el otro `verificado` automático
 * —rmtyr-033-afi-219148, «una partida de 25.000 euros» para las actividades
 * del ECA— casaba con un contrato de RIBAJOVE de 24.975 € por UNA palabra,
 * «actividades»: «eca» no llega a las cuatro letras de `distintivos`. Sólo no
 * se publicó porque el motor lo retractó el 05-10-2026. La excepción de la
 * palabra suelta existe para una cifra que identifica por sí sola (940.520 €
 * contra un anuncio TED, claim-verifier-recall.test.ts); una cifra redonda no
 * identifica nada.
 *
 * Las citas reales salen de pleno-claims-suggestions.json y los registros de
 * los ficheros servidos, como en claim-verifier-cifra-impresa.test.ts.
 */

const ROOT = join(__dirname, '..')
const leer = (p: string) => JSON.parse(readFileSync(join(ROOT, 'public/data', p), 'utf8'))

const DATOS = {
  tenders: leer('tenders.json'),
  tendersTed: leer('tenders-ted.json'),
  bdns: leer('bdns.json'),
  budget: leer('budget.json'),
  promises: leer('promises.json'),
}
const CITAS = (leer('pleno-claims-suggestions.json') as { items: PlenoClaim[] }).items
const cita = (id: string) => {
  const c = CITAS.find((x) => x.id === id)
  expect(c, id).toBeDefined()
  return c!
}

describe('verificado · la explicación dice lo que se cotejó', () => {
  it('k4olcs-019-cit-b9b013: un contrato imprime la cifra citada y nombra el objeto', () => {
    const v = verifyClaim({ claim: cita('k4olcs-019-cit-b9b013'), ...DATOS })
    expect(v.verdict).toBe('verificado')
    expect(v.summary).toBe(resumenVerificado('tender'))
  })

  it('la frase nombra la cifra y el objeto, y no habla de una «cita encontrada»', () => {
    for (const kind of ['tender', 'bdns'] as const) {
      const frase = resumenVerificado(kind)
      expect(frase).toMatch(/imprime la cifra citada/)
      expect(frase).toMatch(/mismo objeto/)
      expect(frase).not.toMatch(/Cita encontrada/)
    }
    expect(resumenVerificado('tender')).toMatch(/contrato/)
    expect(resumenVerificado('bdns')).toMatch(/subvención/)
  })
})

describe('verificado · la fila imprime SU parecido, no el de otra fila del expediente', () => {
  it('k4olcs-019-cit-b9b013: la adjudicación que imprime 80.666,66 € puntúa 1, no el 0,85 de la licitación', () => {
    const v = verifyClaim({ claim: cita('k4olcs-019-cit-b9b013'), ...DATOS })
    const filas = v.evidence.filter((e) => e.kind === 'tender')
    expect(filas).toHaveLength(1)
    expect(filas[0].snippet).toMatch(/80\.667 €$/)
    // 80.666 frente a 80.666,66 —un parecido de importe de 0,99998— y el objeto
    // entero en el título: 0,6 × 0,99998 + 0,4 × 1, redondeado a centésimas.
    expect(filas[0].similarity).toBe(1)
  })

  it('un parecido mayor en la fila citada NO sube el veredicto (los automáticos sólo bajan)', () => {
    // La licitación —primer importe, el base sin IVA— y la adjudicación del
    // mismo expediente, que imprime la cifra dicha con IVA. El objeto casa a
    // medias (Jaccard 0,5), así que la licitación, la elegida, deja la cita en
    // `parcial`; la adjudicación, puntuada con la cifra que imprime, pasaría de
    // 0,8. Enseñar su parecido es decir la verdad de la fila; usarlo para subir
    // a `verificado` sería un ascenso automático, y eso lo firma una persona
    // (`subir-veredicto`).
    const permalink = 'https://contrataciondelestado.es/expediente-de-prueba'
    const titulo = 'suministro contenedores soterrados'
    const v = verifyClaim({
      claim: {
        id: 'sube-no',
        plenoId: 'p1',
        type: 'afirmacion_numerica',
        topic: 'medio-ambiente',
        speakerGroup: null,
        verbatim: 'x'.repeat(30),
        context: '',
        entities: { amountEuros: 121_000, referencedEntity: 'suministro contenedores carga' },
        confidence: 0.9,
      } as never,
      tenders: {
        tenders: [{ title: titulo, permalink, initialAmountNoTaxes: 100_000 }],
        contracts: [{ title: titulo, permalink, finalAmountNoTaxes: 80_000, finalAmount: 121_000 }],
      },
    })
    expect(v.verdict).toBe('parcial')
    const fila = v.evidence.find((e) => e.kind === 'tender')!
    expect(fila.snippet).toMatch(/121\.000 €$/)
    expect(fila.similarity).toBeGreaterThanOrEqual(0.8)
  })
})

describe('verificado · una palabra suelta sólo funda con una cifra que identifica', () => {
  it('rmtyr-033-afi-219148: 25.000 € «del ECA» no se verifica con un contrato de RIBAJOVE de 24.975 €', () => {
    const c = cita('rmtyr-033-afi-219148')
    expect(c.entities.amountEuros).toBe(25000)
    const v = verifyClaim({ claim: c, ...DATOS })
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence.filter((e) => e.kind === 'tender')).toEqual([])
  })

  it('una cifra redonda y una palabra no casan; la misma palabra con 940.520 € sí (control)', () => {
    const titulo = 'Servicio de actividades de ocio sociocultural'
    const conCifra = (amountEuros: number, finalAmount: number) =>
      verifyClaim({
        claim: {
          id: 'una-palabra',
          plenoId: 'p1',
          type: 'afirmacion_numerica',
          topic: 'cultura',
          speakerGroup: null,
          verbatim: 'x'.repeat(30),
          context: '',
          entities: { amountEuros, referencedEntity: 'actividades del eca' },
          confidence: 0.9,
        } as never,
        tenders: { contracts: [{ title: titulo, finalAmount }] },
      })
    expect(conCifra(25_000, 24_975).verdict).toBe('sin-datos')
    expect(conCifra(1_500_000, 1_490_000).verdict).toBe('sin-datos')
    expect(conCifra(940_520, 940_519.6).verdict).toBe('verificado')
  })
})
