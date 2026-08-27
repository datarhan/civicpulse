import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAIM_VERDICTS,
  resumirSinDatos,
  corpusReales,
  clasificarProcedencia,
  CORPUS_IDS,
  PASADAS,
} from '../src/scraper/claim-verdicts'
import type { ClaimVerification } from '../src/scraper/claim-verifier'

const ROOT = join(__dirname, '..')

/**
 * `sin-datos` estaba publicando dos hechos de tamaño muy distinto bajo un solo
 * número:
 *
 *   · se consultaron corpus y la afirmación no aparece en ninguno
 *   · no se consultó NADA, porque para ese tipo de afirmación no tenemos corpus
 *
 * El segundo no dice nada sobre la afirmación: dice algo sobre nosotros. El
 * verificador ya lo distingue —deja `checkedAgainst` vacío a propósito, y esa
 * puerta es la que frena las acusaciones léxicas— pero al publicar los dos
 * caían en la misma casilla, que es el mismo defecto que la agregación de
 * `falta` en DeclaracionEntregas («rindió pero no declaró este servicio» y «no
 * rindió» saliendo como la misma raya) y que el centinela `Otro`.
 *
 * El desglose se DERIVA de `checkedAgainst`; no se guarda un campo nuevo. El
 * enum de veredictos no se toca: alimenta `isDowngrade`, el validador del
 * overlay y las CLI de curación, y ampliarlo por esto sería mover media
 * tubería para nada.
 */
function v(
  verdict: ClaimVerification['verdict'],
  checkedAgainst: string[] | undefined,
): ClaimVerification {
  return {
    claimId: `c-${verdict}-${(checkedAgainst ?? []).join('+') || 'vacio'}`,
    verdict,
    summary: 'x',
    evidence: [],
    ...(checkedAgainst === undefined ? {} : { checkedAgainst }),
  } as ClaimVerification
}

describe('resumirSinDatos · dos desenlaces donde había uno', () => {
  it('separa «no se consultó nada» de «se consultó y no aparece»', () => {
    const r = resumirSinDatos([
      v('sin-datos', []), // nada consultado
      v('sin-datos', []), // nada consultado
      v('sin-datos', ['tenders', 'bdns']), // consultado, sin coincidencia
    ])
    expect(r.sinCorpus).toBe(2)
    expect(r.comprobadoSinHallar).toBe(1)
  })

  it('sólo mira las filas `sin-datos`', () => {
    // Un `verificado` con checkedAgainst vacío sería raro, pero contarlo aquí
    // inflaría el desglose con filas que no son sin-datos y rompería la suma.
    const r = resumirSinDatos([
      v('verificado', []),
      v('parcial', []),
      v('contradicho', ['tenders']),
      v('sin-datos', []),
    ])
    expect(r.sinCorpus).toBe(1)
    expect(r.comprobadoSinHallar).toBe(0)
  })

  it('un checkedAgainst ausente cuenta como «no se consultó nada»', () => {
    const r = resumirSinDatos([v('sin-datos', undefined)])
    expect(r.sinCorpus).toBe(1)
  })

  /**
   * El defecto que se coló el 27-ago y que cazó `review:surfaces` de rebote:
   * `checkedAgainst` mezcla corpus con marcas de pasada, y contar la longitud
   * cruda hacía que una fila cotejada contra NADA —sólo revisada por el
   * segundo paso— saliera como «comprobada». Eran 1.014 de 4.675 publicadas,
   * y la portada del laboratorio decía 59,8 % de cobertura donde la verdad era
   * 38,1 %.
   *
   * Es exactamente la sobreafirmación que esa página existe para no cometer, y
   * yo mismo había escrito `esMarcaDePasada` para el pintado y me lo dejé en
   * la cuenta.
   */
  it('una marca de pasada NO es un corpus: cuenta como sin corpus', () => {
    const r = resumirSinDatos([
      v('sin-datos', ['llm-second-pass']),
      v('sin-datos', ['verdict-engine']),
      v('sin-datos', ['verdict-engine', 'tenders']),
      v('sin-datos', ['bdns']),
    ])
    expect(r.sinCorpus).toBe(2)
    expect(r.comprobadoSinHallar).toBe(2)
  })

  it('corpusReales filtra las marcas y deja los corpus', () => {
    expect(corpusReales(['tenders', 'llm-second-pass', 'bdns', 'verdict-engine'])).toEqual([
      'tenders',
      'bdns',
    ])
    expect(corpusReales(['curator-downgrade'])).toEqual([])
    expect(corpusReales(undefined)).toEqual([])
  })

  it('sin filas, dos ceros — y no revienta', () => {
    expect(resumirSinDatos([])).toEqual({ sinCorpus: 0, comprobadoSinHallar: 0 })
  })

  it('el enum se exporta, no se recita', () => {
    // Regla 1 de docs/DATA_INTEGRITY.md. Seis pruebas de este repositorio
    // copiaron una forma a mano y siguieron verdes mientras producción no
    // casaba con nada.
    expect([...CLAIM_VERDICTS].sort()).toEqual(
      ['contradicho', 'parcial', 'promesa-repetida', 'sin-datos', 'verificado'].sort(),
    )
  })
})

/**
 * De lista NEGRA a lista BLANCA, que es una inversión de la dirección del
 * fallo, no un detalle.
 *
 * Con lista negra, un nombre no declarado contaba como corpus: el día que
 * corrió NLI —cuya marca `nli-grounding` no estaba en la lista— la cobertura
 * se habría inflado sola y en silencio. Ya pasó en pequeño: la marca faltaba y
 * la cazó la prueba de la puerta el mismo día.
 *
 * Con lista blanca, lo no declarado NO cuenta como corpus: la cifra se queda
 * corta, que en una página cuyo argumento entero es no afirmar de más es la
 * dirección segura. Y no desaparece: sale por `desconocidos` para que alguien
 * lo declare de un lado o del otro.
 */
describe('clasificarProcedencia · corpus, pasadas y lo que no sabemos', () => {
  it('separa las tres cosas', () => {
    const c = clasificarProcedencia(['tenders', 'llm-second-pass', 'bdns', 'una-cosa-nueva'])
    expect(c.corpus).toEqual(['tenders', 'bdns'])
    expect(c.pasadas).toEqual(['llm-second-pass'])
    expect(c.desconocidos).toEqual(['una-cosa-nueva'])
  })

  it('un nombre sin declarar NO cuenta como corpus', () => {
    // La inversión. Con lista negra esto daba `['corpus-del-futuro']`.
    expect(corpusReales(['corpus-del-futuro'])).toEqual([])
    expect(clasificarProcedencia(['corpus-del-futuro']).desconocidos).toEqual(['corpus-del-futuro'])
  })

  it('las marcas de pasada conocidas nunca cuentan como corpus', () => {
    for (const marca of PASADAS) {
      expect(corpusReales([marca]), `marca ${marca}`).toEqual([])
    }
  })

  it('todos los corpus declarados sí cuentan', () => {
    for (const id of CORPUS_IDS) {
      expect(corpusReales([id]), `corpus ${id}`).toEqual([id])
    }
  })

  it('los dos enum son disjuntos', () => {
    // Si un nombre estuviera en los dos, la clasificación dependería del orden
    // en que se pregunte, que es como se cuelan estas cosas.
    const cruce = CORPUS_IDS.filter((c) => (PASADAS as readonly string[]).includes(c))
    expect(cruce).toEqual([])
  })

  it('aguanta basura sin reventar', () => {
    expect(clasificarProcedencia(undefined).corpus).toEqual([])
    expect(clasificarProcedencia([null, 3, {}, 'tenders'] as never).corpus).toEqual(['tenders'])
  })
})

describe('resumirSinDatos · contra lo PUBLICADO', () => {
  /**
   * Contra el manifiesto de trozos, NO contra el monolito.
   *
   * `pleno-claims-verified.json` lleva 6.919 afirmaciones, pero está en
   * `.vercelignore`: nunca se sirve, porque incluye el verbatim de acusaciones
   * `sin-datos` que la puerta editorial retiene a propósito. Lo que el lector
   * recibe son los trozos ya pasados por `gateItemsForPublic`, y el desglose
   * tiene que describir ESE universo o no cuadrará con las cifras que tiene al
   * lado en la página.
   */
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'public/data/pleno-claims/index.json'), 'utf8'),
  ) as {
    totals: {
      byVerdict: Record<string, number>
      sinDatosPorque?: { sinCorpus: number; comprobadoSinHallar: number }
    }
  }

  it('el manifiesto publica el desglose, no sólo el total', () => {
    expect(manifest.totals.sinDatosPorque).toBeDefined()
  })

  it('las dos partes suman exactamente el sin-datos publicado', () => {
    const d = manifest.totals.sinDatosPorque!
    expect(d.sinCorpus + d.comprobadoSinHallar).toBe(manifest.totals.byVerdict['sin-datos'])
  })

  /**
   * El techo de reserva que pide la regla 1: emparejar toda afirmación sobre un
   * enum con un tope que cace la degeneración. Si un fallo dejara
   * `checkedAgainst` vacío en todas las filas, la suma de arriba seguiría
   * cuadrando y el desglose sería una sola casilla con otro nombre.
   */
  it('el desglose no es degenerado: las dos casillas tienen filas de verdad', () => {
    const d = manifest.totals.sinDatosPorque!
    expect(d.sinCorpus).toBeGreaterThan(0)
    expect(d.comprobadoSinHallar).toBeGreaterThan(0)
  })

  it('el desglose del manifiesto coincide con recontar los trozos servidos', () => {
    // Que el manifiesto lo diga no prueba que sea verdad: se recuenta desde los
    // ficheros que el lector se descarga.
    const dir = join(ROOT, 'public/data/pleno-claims')
    const servidos = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .flatMap(
        (f) =>
          (
            JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
              items: Array<{ verification: ClaimVerification }>
            }
          ).items,
      )
      .map((i) => i.verification)
    expect(servidos.length).toBeGreaterThan(0) // que el recuento haya evaluado algo
    expect(resumirSinDatos(servidos)).toEqual(manifest.totals.sinDatosPorque)
  })
})
