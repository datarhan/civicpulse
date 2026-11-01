import { describe, it, expect } from 'vitest'
import {
  cotejarCompose,
  ESTADOS_COMPOSE,
  evidenciaSuficiente,
  applyOverlayEntries,
  type EstadoCompose,
} from '../src/scraper/verified-merge'
import { huellaDelBase } from '../scripts/lib/cotejo-compose'

/**
 * El invariante que `verified-rebuild.ts` ya documenta en su cabecera:
 *
 *   > generatedAt is preserved from the base
 *
 * es decir, lo publicado lleva SIEMPRE el sello del base del que se compuso.
 * Si los dos sellos no coinciden, lo publicado no es la composición del base
 * que hay en disco.
 *
 * Y el desajuste NO es un fallo. La nocturna
 * (`.github/workflows/nightly-scrape.yml`) y `scrape-all.sh` corren
 * `verify:pleno-claims -- --base-only` a propósito —«CI necesita que el fichero
 * EXISTA, no republicar»—, porque republicar un veredicto es un acto humano.
 * Lo que faltaba no era la puerta: era el AVISO de que la puerta tiene cola.
 *
 * Por eso cuatro desenlaces y no dos. Con dos, «el base avanzó y nadie ha
 * republicado» —que es lo normal y lo correcto— saldría en rojo todas las
 * noches, y una guarda que grita cuando no pasa nada es una guarda que alguien
 * apaga. Es la misma lección de `check:eficiencia-findings`.
 */
describe('cotejarCompose · el sello de lo publicado contra el de su base', () => {
  const T1 = '2026-08-18T18:44:05.129Z'
  const T2 = '2026-08-24T13:54:07.361Z' // posterior a T1

  it('coincide cuando lo publicado lleva el sello de su base', () => {
    const c = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('coincide')
    expect(c.motivo).toBeNull()
  })

  it('pendiente-de-republicar cuando el base es MÁS NUEVO — aviso, no fallo', () => {
    const c = cotejarCompose({ baseGeneratedAt: T2, publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('pendiente-de-republicar')
    // El motivo tiene que nombrar la causa esperada, o quien lo lea a las 3 de
    // la mañana creerá que algo se ha roto.
    expect(c.motivo).toMatch(/base-only|republicar/i)
  })

  it('contradice cuando lo publicado es MÁS NUEVO que su base — eso es imposible', () => {
    const c = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: T2 })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  it('sin-base cuando el base no está — clon nuevo o CI', () => {
    const c = cotejarCompose({ baseGeneratedAt: null, publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('sin-base')
  })

  it('contradice si falta lo publicado, que es el fichero que SÍ está comiteado', () => {
    const c = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: null })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  it('contradice ante un sello ilegible, en vez de tragárselo como que coincide', () => {
    const c = cotejarCompose({ baseGeneratedAt: 'ayer por la tarde', publicadoGeneratedAt: T1 })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  /**
   * La puerta que este repositorio ya pagó dos veces: `sin-base` NO es un
   * visto bueno. Un clon recién hecho no tiene base —está gitignorado— y una
   * guarda que devuelve «coincide» ahí imprime su propio todo-en-orden sin
   * haber comprobado nada. Tiene que quedar DISTINGUIBLE de `coincide`, y por
   * eso se comprueba aquí y no sólo en el guion.
   */
  it('sin-base es un desenlace propio, jamás un alias de coincide', () => {
    const sinBase = cotejarCompose({ baseGeneratedAt: null, publicadoGeneratedAt: T1 })
    const coincide = cotejarCompose({ baseGeneratedAt: T1, publicadoGeneratedAt: T1 })
    expect(sinBase.estado).not.toBe(coincide.estado)
  })

  it('el enum se exporta, no se recita', () => {
    // Regla 1 de docs/DATA_INTEGRITY.md. Si esta prueba escribiera la lista a
    // mano, podría seguir verde mientras producción emite otra cosa.
    expect([...ESTADOS_COMPOSE].sort()).toEqual(
      ['coincide', 'contradice', 'pendiente-de-republicar', 'sin-base'].sort(),
    )
    for (const entrada of [
      { baseGeneratedAt: T1, publicadoGeneratedAt: T1 },
      { baseGeneratedAt: T2, publicadoGeneratedAt: T1 },
      { baseGeneratedAt: T1, publicadoGeneratedAt: T2 },
      { baseGeneratedAt: null, publicadoGeneratedAt: T1 },
    ]) {
      expect(ESTADOS_COMPOSE).toContain(cotejarCompose(entrada).estado)
    }
  })

  it('lleva los dos sellos consigo, para que el parte pueda imprimirlos', () => {
    const c = cotejarCompose({ baseGeneratedAt: T2, publicadoGeneratedAt: T1 })
    expect(c.baseGeneratedAt).toBe(T2)
    expect(c.publicadoGeneratedAt).toBe(T1)
  })
})

/**
 * El linaje por CONTENIDO. El base está gitignorado, así que cada copia del
 * repositorio tiene el suyo: una sesión que rederiva en su worktree publica con
 * el sello de SU base, y el checkout principal —con un base de otro día— leía
 * «lo publicado es más nuevo que su base» y salía `contradice` (20-10-2026,
 * merge 9d574475) sin que una sola cifra estuviera mal. La huella dice si lo
 * publicado sale de ESTE contenido, sin importar en qué copia ni a qué hora se
 * generó.
 */
describe('cotejarCompose · la huella del base manda sobre los sellos', () => {
  const T1 = '2026-10-19T07:43:22.017Z'
  const T2 = '2026-10-20T06:45:10.098Z' // posterior a T1
  const T3 = '2026-10-21T10:44:40.789Z' // posterior a T2

  it('misma huella → coincide aunque los sellos difieran (base regenerado en otra copia)', () => {
    for (const [b, p] of [
      [T3, T2],
      [T1, T2],
    ]) {
      const c = cotejarCompose({
        baseGeneratedAt: b,
        publicadoGeneratedAt: p,
        huellaBase: 'abc123',
        huellaPublicada: 'abc123',
      })
      expect(c.estado).toBe<EstadoCompose>('coincide')
    }
  })

  it('huella distinta con el base más nuevo → pendiente-de-republicar', () => {
    const c = cotejarCompose({
      baseGeneratedAt: T3,
      publicadoGeneratedAt: T2,
      huellaBase: 'nuevo',
      huellaPublicada: 'viejo',
    })
    expect(c.estado).toBe<EstadoCompose>('pendiente-de-republicar')
  })

  it('huella distinta con el base más viejo → contradice, y el motivo dice cómo sanarlo', () => {
    const c = cotejarCompose({
      baseGeneratedAt: T1,
      publicadoGeneratedAt: T2,
      huellaBase: 'viejo',
      huellaPublicada: 'nuevo',
    })
    expect(c.estado).toBe<EstadoCompose>('contradice')
    expect(c.motivo).toMatch(/base-only/)
  })

  it('un publicado sin huella (anterior a ella) se juzga por los sellos, como antes', () => {
    const c = cotejarCompose({
      baseGeneratedAt: T1,
      publicadoGeneratedAt: T2,
      huellaBase: 'abc',
      huellaPublicada: null,
    })
    expect(c.estado).toBe<EstadoCompose>('contradice')
  })

  it('la huella no rescata un base ausente: sin-base sigue siendo SALTADO', () => {
    const c = cotejarCompose({
      baseGeneratedAt: null,
      publicadoGeneratedAt: T2,
      huellaBase: null,
      huellaPublicada: 'abc',
    })
    expect(c.estado).toBe<EstadoCompose>('sin-base')
  })
})

describe('huellaDelBase · depende del contenido, no del sello', () => {
  const items = [{ claim: { id: 'a' }, verification: { verdict: 'sin-datos' } }]

  it('dos bases con el mismo contenido y distinto generatedAt tienen la misma huella', () => {
    expect(huellaDelBase({ generatedAt: 'x', items })).toBe(
      huellaDelBase({ generatedAt: 'y', items }),
    )
  })

  it('un cambio en un veredicto cambia la huella', () => {
    const otra = [{ claim: { id: 'a' }, verification: { verdict: 'parcial' } }]
    expect(huellaDelBase({ items })).not.toBe(huellaDelBase({ items: otra }))
  })

  it('el orden de las claves no la mueve (lo escrito y lo releído de disco casan)', () => {
    const reordenado = [{ verification: { verdict: 'sin-datos' }, claim: { id: 'a' } }]
    expect(huellaDelBase({ items })).toBe(huellaDelBase({ items: reordenado }))
  })
})

/**
 * El suelo de evidencia.
 *
 * Un veredicto por encima de `sin-datos` afirma que algo respalda la
 * afirmación. Hasta hoy nada obligaba a que ese algo existiera: 92 filas
 * publicadas llevaban `parcial` o `verificado` sin nombrar un solo corpus, 87
 * de ellas escritas por una pasada retirada.
 *
 * El suelo va en la ESCRITURA del overlay, no en su lectura: `validateOverlay`
 * corre en cada lectura y hacerlo estallar allí rompería la tubería entera por
 * las 87 que ya están. Lo existente lo saca `check:veredictos`; lo nuevo no
 * llega a escribirse.
 *
 * Lo que se puede exigir desde el objeto publicado, y ni una coma más: que
 * nombre un corpus DE VERDAD y que traiga alguna fila de evidencia. Si funda o
 * sólo se le parece es un juicio que este esquema no guarda —las filas no
 * fundantes se anotan dentro del verificador y no salen del módulo— y
 * fingirlo aquí sería afirmar de más.
 */
describe('evidenciaSuficiente · un veredicto fuerte tiene que apoyarse en algo', () => {
  const ev = [{ kind: 'tender', ref: 'x', snippet: 'y' }]

  it('sin-datos no necesita nada', () => {
    expect(evidenciaSuficiente({ verdict: 'sin-datos', checkedAgainst: [], evidence: [] })).toBe(
      true,
    )
  })

  it('un veredicto fuerte sin corpus real NO se sostiene', () => {
    expect(
      evidenciaSuficiente({
        verdict: 'parcial',
        checkedAgainst: ['llm-second-pass'],
        evidence: ev,
      }),
    ).toBe(false)
    expect(evidenciaSuficiente({ verdict: 'verificado', checkedAgainst: [], evidence: ev })).toBe(
      false,
    )
  })

  it('un veredicto fuerte sin evidencia tampoco', () => {
    expect(
      evidenciaSuficiente({ verdict: 'verificado', checkedAgainst: ['tenders'], evidence: [] }),
    ).toBe(false)
  })

  it('con corpus y evidencia, sí', () => {
    expect(
      evidenciaSuficiente({ verdict: 'parcial', checkedAgainst: ['tenders'], evidence: ev }),
    ).toBe(true)
  })

  it('la escritura del overlay rechaza una entrada que no llega al suelo', () => {
    expect(() =>
      applyOverlayEntries(
        { version: 1, generatedAt: 'x', entries: {} },
        [
          {
            claimId: 'c1',
            source: 'nli',
            verification: {
              claimId: 'c1',
              verdict: 'parcial',
              summary: 's',
              evidence: ev,
              checkedAgainst: ['nli-grounding'],
            },
          },
        ] as never,
        '2026-08-27T00:00:00.000Z',
      ),
    ).toThrow(/suelo de evidencia|no nombra ning/i)
  })

  it('la que sí llega no la para el suelo; si es una subida de NLI, la para la firma', () => {
    // Hasta el 29-09-2026 esta entrada se escribía: llegar al suelo bastaba.
    // Hoy el anclaje sólo propone (lo automático sólo baja, regla 4), así que
    // el overlay la rechaza igual — pero por la firma que le falta, no por el
    // corpus, y el mensaje tiene que decir cuál de las dos cosas es.
    const intento = () =>
      applyOverlayEntries(
        { version: 1, generatedAt: 'x', entries: {} },
        [
          {
            claimId: 'c2',
            source: 'nli',
            verification: {
              claimId: 'c2',
              verdict: 'parcial',
              summary: 's',
              evidence: ev,
              checkedAgainst: ['tenders'],
            },
          },
        ] as never,
        '2026-08-27T00:00:00.000Z',
      )
    expect(intento).toThrow(/firma/)
    expect(intento).not.toThrow(/suelo de evidencia/)
  })
})
