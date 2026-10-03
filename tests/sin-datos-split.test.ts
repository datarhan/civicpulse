import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLAIM_VERDICTS,
  CLASE_DE_PASADA,
  DESENLACES_DE_COTEJO,
  resumirSinDatos,
  desenlaceDeCotejo,
  corpusReales,
  clasificarProcedencia,
  CORPUS_IDS,
  PASADAS,
} from '../src/scraper/claim-verdicts'
import { fuentesComprobadas } from '../src/lib/claim-provenance.js'
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
 *
 * Y dos se quedaron cortos (2026-09-29). Una pasada que rehace el veredicto
 * SUSTITUYE la lista: `verificacionDeBajada` escribe sólo
 * `['curator-downgrade']`, y el motor, su marca o el corpus de una evidencia
 * que en una retractación no hay. Esas filas caían en «sin corpus que
 * consultar» aunque el motor hubiera repasado una lista corta de contratos
 * candidatos —su propia explicación lo cuenta— y el curador hubiera leído uno:
 * 875 de las 2.901 del 2026-09-30. No es que no hubiera con qué; es que no
 * consta con qué. La línea «Fuentes comprobadas» de cada tarjeta ya lo decía
 * («ninguna» / «no constan»), y el recuento tiene que decir lo mismo.
 */
function v(
  verdict: ClaimVerification['verdict'],
  checkedAgainst: string[] | undefined,
  anotado: { derivedBy?: string[]; source?: string } = {},
): ClaimVerification {
  return {
    claimId: `c-${verdict}-${(checkedAgainst ?? []).join('+') || 'vacio'}`,
    verdict,
    summary: 'x',
    evidence: [],
    ...(checkedAgainst === undefined ? {} : { checkedAgainst }),
    ...anotado,
  } as ClaimVerification
}

describe('resumirSinDatos · tres desenlaces donde había uno', () => {
  it('separa «no se consultó nada» de «se consultó y no aparece»', () => {
    const r = resumirSinDatos([
      v('sin-datos', []), // nada consultado
      v('sin-datos', []), // nada consultado
      v('sin-datos', ['tenders', 'bdns']), // consultado, sin coincidencia
    ])
    expect(r).toEqual({ sinCorpus: 2, comprobadoSinHallar: 1, noConsta: 0 })
  })

  it('sólo mira las filas `sin-datos`', () => {
    // Un `verificado` con checkedAgainst vacío sería raro, pero contarlo aquí
    // inflaría el desglose con filas que no son sin-datos y rompería la suma.
    // La bajada a `parcial` de un curador tampoco entra: sigue siendo parcial.
    const r = resumirSinDatos([
      v('verificado', []),
      v('parcial', []),
      v('parcial', ['curator-downgrade'], { source: 'curator-downgrade' }),
      v('contradicho', ['tenders']),
      v('sin-datos', []),
    ])
    expect(r).toEqual({ sinCorpus: 1, comprobadoSinHallar: 0, noConsta: 0 })
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
   *
   * El arreglo de entonces dejó la marca en la casilla de al lado, que tampoco
   * era la suya: «sin corpus que consultar» afirma que no había con qué, y la
   * marca sólo dice que otra pasada rehízo el veredicto sin dejar constancia
   * de contra qué.
   */
  it('una marca de pasada no es un corpus, ni tampoco «nada»: no consta qué se consultó', () => {
    const r = resumirSinDatos([
      v('sin-datos', ['llm-second-pass']),
      v('sin-datos', ['verdict-engine']),
      v('sin-datos', ['verdict-engine', 'tenders']),
      v('sin-datos', ['bdns']),
    ])
    expect(r).toEqual({ sinCorpus: 0, comprobadoSinHallar: 2, noConsta: 2 })
  })

  /**
   * Filas de verdad, recortadas de los trozos servidos el 2026-09-30
   * (10yl550-001-afi-9b7243 y 15000go-096-cit-e013c8). Las dos salían en
   * «sin corpus que consultar»: la primera cuenta qué candidatos examinó, y la
   * segunda, qué contrato leyó el curador.
   */
  it('las dos filas servidas que lo destaparon: no consta, no «sin corpus»', () => {
    const retractacionDelMotor = {
      claimId: '10yl550-001-afi-9b7243',
      verdict: 'sin-datos',
      summary:
        'Analicé cada candidato: son contratos (tenders) adjudicados por procedimientos formales y una subvención nominativa, no reconocimientos extrajudiciales de crédito.',
      evidence: [],
      checkedAgainst: ['verdict-engine'],
      confidence: 0.2,
      source: 'verdict-engine',
    }
    const bajadaDeCurador = {
      claimId: '15000go-096-cit-e013c8',
      verdict: 'sin-datos',
      summary:
        'La única evidencia es el contrato de videovigilancia del polígono Masía Baló: coincide el topónimo, no la tramitación del PAI ni el informe a la Diputació que la cita afirma.',
      evidence: [],
      checkedAgainst: ['curator-downgrade'],
      source: 'curator-downgrade',
    }
    expect(resumirSinDatos([retractacionDelMotor, bajadaDeCurador])).toEqual({
      sinCorpus: 0,
      comprobadoSinHallar: 0,
      noConsta: 2,
    })
  })

  it('corpusReales filtra las marcas y deja los corpus', () => {
    expect(corpusReales(['tenders', 'llm-second-pass', 'bdns', 'verdict-engine'])).toEqual([
      'tenders',
      'bdns',
    ])
    expect(corpusReales(['curator-downgrade'])).toEqual([])
    expect(corpusReales(undefined)).toEqual([])
  })

  it('sin filas, tres ceros — y no revienta', () => {
    expect(resumirSinDatos([])).toEqual({ sinCorpus: 0, comprobadoSinHallar: 0, noConsta: 0 })
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
 * Fila a fila, la misma pregunta que la línea «Fuentes comprobadas» de la
 * tarjeta: ¿qué consta de lo que se consultó?
 *
 *   · un corpus declarado → se cotejó (`con-corpus`);
 *   · nada anotado en ningún sitio → no había con qué (`sin-corpus`);
 *   · algo anotado que no es un corpus —una pasada en `checkedAgainst`, en
 *     `derivedBy` o como `source`, o un nombre sin declarar— → `no-consta`.
 *
 * La tercera es la que faltaba, y es la dirección segura: «no consta» afirma
 * menos que «no había con qué».
 */
describe('desenlaceDeCotejo · qué consta de lo consultado, fila a fila', () => {
  it('nada anotado: no había corpus que consultar', () => {
    const vacias = [{}, { checkedAgainst: [] }, { checkedAgainst: [], derivedBy: [] }, null]
    for (const vacia of [...vacias, undefined]) {
      expect(desenlaceDeCotejo(vacia), JSON.stringify(vacia)).toBe('sin-corpus')
    }
  })

  // Contra el enum exportado, con la clase de cada pasada en el mensaje: ni el
  // motor, ni NLI, ni un curador dejan la fila en «sin corpus». Es un
  // `Record<Pasada, …>`, así que una pasada nueva entra en la prueba sola.
  for (const [pasada, clase] of Object.entries(CLASE_DE_PASADA)) {
    it(`una pasada de clase ${clase} («${pasada}») sin corpus: no consta, la anote donde la anote`, () => {
      expect(desenlaceDeCotejo({ checkedAgainst: [pasada] })).toBe('no-consta')
      expect(desenlaceDeCotejo({ checkedAgainst: [], derivedBy: [pasada] })).toBe('no-consta')
      expect(desenlaceDeCotejo({ checkedAgainst: [], source: pasada })).toBe('no-consta')
    })
  }

  it('un corpus declarado es un cotejo, lleve al lado la pasada que lleve', () => {
    for (const corpus of CORPUS_IDS) {
      expect(desenlaceDeCotejo({ checkedAgainst: [corpus] }), corpus).toBe('con-corpus')
      for (const pasada of PASADAS) {
        const conPasada = { checkedAgainst: [corpus, pasada], derivedBy: [pasada], source: pasada }
        expect(desenlaceDeCotejo(conPasada), `${corpus} + ${pasada}`).toBe('con-corpus')
      }
    }
  })

  it('un nombre sin declarar no es un corpus, pero tampoco es «nada»', () => {
    // Lista blanca: no cuenta como cotejo. Pero algo se anotó, y decir que no
    // había con qué sería afirmar de más.
    expect(desenlaceDeCotejo({ checkedAgainst: ['corpus-del-futuro'] })).toBe('no-consta')
    expect(desenlaceDeCotejo({ checkedAgainst: [], derivedBy: ['pasada-nueva'] })).toBe('no-consta')
  })

  it('ningún desenlace del enum es una casilla muerta', () => {
    // Modo 9 de DATA_INTEGRITY: una casilla que nada puede alcanzar se pinta
    // igual, a cero, y parece una medida.
    const alcanzados = new Set(
      [{ checkedAgainst: ['tenders'] }, {}, { checkedAgainst: ['verdict-engine'] }].map((x) =>
        desenlaceDeCotejo(x),
      ),
    )
    expect([...alcanzados].sort()).toEqual([...DESENLACES_DE_COTEJO].sort())
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
  type Casilla = { total: number; sinCorpus: number; comprobadoSinHallar: number; noConsta: number }
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'public/data/pleno-claims/index.json'), 'utf8'),
  ) as {
    totals: {
      byVerdict: Record<string, number>
      sinDatosPorque?: { sinCorpus: number; comprobadoSinHallar: number; noConsta: number }
      cobertura: {
        porTipo: Record<string, Casilla>
        porTema: Record<string, Casilla>
        porClaseDocumental: { total: number }
      }
    }
  }

  // Que el manifiesto lo diga no prueba que sea verdad: se recuenta desde los
  // ficheros que el lector se descarga.
  const dir = join(ROOT, 'public/data/pleno-claims')
  const servidos = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .flatMap(
      (f) =>
        (
          JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
            items: Array<{ verification: ClaimVerification & { source?: string } }>
          }
        ).items,
    )
    .map((i) => i.verification)

  /** Lo que dice la línea «Fuentes comprobadas» de la tarjeta, en tres. */
  const linea = (x: unknown): 'ninguna' | 'no constan' | 'corpus' => {
    const f = fuentesComprobadas(x)
    return f === 'ninguna' || f === 'no constan' ? f : 'corpus'
  }

  it('el manifiesto publica el desglose, no sólo el total', () => {
    expect(manifest.totals.sinDatosPorque).toBeDefined()
  })

  it('las tres partes suman exactamente el sin-datos publicado', () => {
    const d = manifest.totals.sinDatosPorque!
    expect(d.sinCorpus + d.comprobadoSinHallar + d.noConsta).toBe(
      manifest.totals.byVerdict['sin-datos'],
    )
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
    expect(servidos.length).toBeGreaterThan(0) // que el recuento haya evaluado algo
    expect(resumirSinDatos(servidos)).toEqual(manifest.totals.sinDatosPorque)
  })

  it('ninguna fila con una pasada anotada cuenta como «sin corpus que consultar»', () => {
    const esPasada = (n: unknown) => (PASADAS as readonly unknown[]).includes(n)
    const conPasada = servidos.filter((x) =>
      [x.source, ...(x.derivedBy ?? []), ...(x.checkedAgainst ?? [])].some(esPasada),
    )
    expect(conPasada.length, 'que la prueba haya evaluado alguna fila con pasada').toBeGreaterThan(
      0,
    )
    expect(resumirSinDatos(conPasada).sinCorpus).toBe(0)
  })

  /**
   * La tarjeta y el recuento, sobre las mismas filas. La tarjeta decía «no
   * constan» debajo de una retractación del motor y el recuento de al lado la
   * contaba entre las que no tenían corpus donde buscar: dos respuestas a la
   * misma pregunta en la misma página.
   */
  it('cada casilla cuenta lo que la línea «Fuentes comprobadas» dice de sus filas', () => {
    const sinDatos = servidos.filter((x) => x.verdict === 'sin-datos')
    const cuantas = (k: ReturnType<typeof linea>) => sinDatos.filter((x) => linea(x) === k).length
    expect(cuantas('no constan'), 'que haya filas «no constan» que medir').toBeGreaterThan(0)
    expect(resumirSinDatos(sinDatos)).toEqual({
      sinCorpus: cuantas('ninguna'),
      comprobadoSinHallar: cuantas('corpus'),
      noConsta: cuantas('no constan'),
    })
  })

  it('la tabla de cobertura reparte en tres y cada celda suma su total', () => {
    const cob = manifest.totals.cobertura
    for (const eje of ['porTipo', 'porTema'] as const) {
      for (const [k, c] of Object.entries(cob[eje])) {
        expect(c.sinCorpus + c.comprobadoSinHallar + c.noConsta, `${eje}.${k}`).toBe(c.total)
      }
    }
    // Sobre TODAS las filas servidas, no sólo las sin-datos: la cobertura
    // pregunta contra qué se pudo cotejar cualquier declaración.
    const suma = (campo: keyof Casilla) =>
      Object.values(cob.porTipo).reduce((a, c) => a + c[campo], 0)
    expect(suma('sinCorpus')).toBe(servidos.filter((x) => linea(x) === 'ninguna').length)
    expect(suma('noConsta')).toBe(servidos.filter((x) => linea(x) === 'no constan').length)
    expect(suma('comprobadoSinHallar')).toBe(servidos.filter((x) => linea(x) === 'corpus').length)
  })

  it('el documento que nombran se cuenta sobre la misma población que «sin corpus»', () => {
    // «Declaraciones que dependen» de un documento, en /laboratorio/cobertura,
    // y la carta que se registra: si su población fuera otra que la columna de
    // al lado, la página enseñaría dos universos con el mismo rótulo.
    const cob = manifest.totals.cobertura
    const sinCorpus = Object.values(cob.porTipo).reduce((a, c) => a + c.sinCorpus, 0)
    expect(cob.porClaseDocumental.total).toBe(sinCorpus)
  })
})
