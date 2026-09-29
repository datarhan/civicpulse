import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pressLabSummary } from '../src/lib/press-lab'

const ROOT = join(__dirname, '..')
const AHORA = Date.parse('2026-08-13T09:00:00Z')
const hace = (d) => new Date(AHORA - d * 86_400_000).toISOString()

const claim = (articleId, verdict) => ({ claim: { articleId }, verification: { verdict } })

describe('los escalares de /laboratorio no se contradicen entre sí', () => {
  it('cuenta como auditado el artículo cuya afirmación NO se verificó', () => {
    // El defecto exacto que lo motivó: un artículo, una claim, veredicto
    // `sin-datos`. La página decía «1 · con ≥1 afirmación verificada» justo
    // encima de «TASA DE VERIFICACIÓN 0% · 0 de 1». `auditedIds` mete el
    // articleId de toda fila del corpus sin mirar el veredicto, así que el
    // recuento estaba bien y la etiqueta —y el comentario del código— mal.
    const s = pressLabSummary(
      { press: [{ date: hace(2) }], verified: [claim('a1', 'sin-datos')] },
      AHORA,
    )
    expect(s.auditedCount).toBe(1)
    expect(s.verificadoClaims).toBe(0)
    expect(s.verificadoRatio).toBe(0)
  })

  it('no cuenta dos veces un artículo con varias afirmaciones', () => {
    const s = pressLabSummary(
      { press: [], verified: [claim('a1', 'verificado'), claim('a1', 'contradicho')] },
      AHORA,
    )
    expect(s.auditedCount).toBe(1)
    expect(s.totalClaims).toBe(2)
    expect(s.verificadoClaims).toBe(1)
    expect(s.contradichoClaims).toBe(1)
  })

  it('deja las tasas en null cuando no hay nada que dividir', () => {
    // «0 %» y «no hay datos» no son lo mismo; el módulo ya lo tenía resuelto y
    // esto lo fija para que no vuelva.
    const s = pressLabSummary({ press: [{ date: hace(1) }], verified: [] }, AHORA)
    expect(s.totalClaims).toBe(0)
    expect(s.verificadoRatio).toBeNull()
    expect(s.contradichoRatio).toBeNull()
    expect(s.hasEditorialContent).toBe(false)
  })

  it('un corpus entero sin resolver NO publica una tasa de discrepancia del 0 %', () => {
    // El estado real de /laboratorio el 2026-08-29: 63 filas, las 63
    // `sin-datos`. La página publicaba «TASA DE DISCREPANCIA 0 %» al lado de
    // «TASA DE VERIFICACIÓN 0 %», sobre las mismas 63.
    //
    // Las dos tasas NO son simétricas, y ahí estaba el defecto. «0 de 63
    // verificadas» es una COBERTURA y es verdad: quien la lee concluye
    // exactamente lo que pasa. «0 % de discrepancia» es un HALLAZGO, y sobre un
    // corpus que nadie ha examinado se lee «hemos mirado y no hay
    // discrepancias» cuando lo cierto es «no se ha mirado». Es el cero que en
    // realidad es un centinela.
    //
    // Y el aviso que existe para decirlo —«Extracción pendiente»— no podía
    // dispararse, porque su guarda preguntaba si había FILAS en vez de si había
    // VEREDICTOS.
    const verified = Array.from({ length: 63 }, (_, i) => claim(`a${i}`, 'sin-datos'))
    const s = pressLabSummary({ press: [{ date: hace(2) }], verified }, AHORA)

    expect(s.totalClaims).toBe(63)
    expect(s.contradichoRatio, 'una discrepancia del 0 % sobre nada examinado').toBeNull()
    expect(s.verificadoRatio, '0 de 63 verificadas sí es un hecho').toBe(0)
    expect(s.hasEditorialContent, 'el aviso de extracción pendiente tiene que salir').toBe(false)
  })

  it('con un solo veredicto resuelto la discrepancia vuelve a ser medible', () => {
    // La otra mitad de la guarda: en cuanto UNA fila se resuelve, la tasa
    // existe otra vez. Sin esto, la corrección de arriba podría apagar la cifra
    // para siempre y nadie lo notaría — que es el mismo defecto al revés.
    const s = pressLabSummary(
      {
        press: [{ date: hace(2) }],
        verified: [claim('a1', 'verificado'), claim('a2', 'sin-datos')],
      },
      AHORA,
    )
    expect(s.contradichoRatio).toBe(0)
    expect(s.hasEditorialContent).toBe(true)
  })

  it('la discrepancia se divide entre lo RESUELTO, no entre todo el corpus', () => {
    // El estado real del 7-09-2026: 36 filas, 1 verificada, 1 parcial, 34
    // sin-datos. La guarda de arriba pregunta si hay CERO resueltas, y con una
    // sola se abre — así que la página publicaba
    //
    //   TASA DE DISCREPANCIA · 0% · 0 de 36 claims
    //
    // que se lee «hemos examinado 36 y ninguna falla». Se examinó UNA. El
    // centinela no estaba en el 0 sino en el DENOMINADOR: 35 filas que nadie
    // resolvió engordaban una tasa de hallazgo como si las hubiéramos mirado.
    //
    // La de VERIFICACIÓN sí se divide entre el total, y debe seguir así: es una
    // cobertura, y «1 de 36» es exactamente el hecho que cuenta.
    const verified = [
      claim('a0', 'verificado'),
      claim('a1', 'parcial'),
      ...Array.from({ length: 34 }, (_, i) => claim(`b${i}`, 'sin-datos')),
    ]
    const s = pressLabSummary({ press: [{ date: hace(2) }], verified }, AHORA)

    expect(s.totalClaims).toBe(36)
    expect(s.resueltasClaims, 'sólo la verificada resuelve; `parcial` no').toBe(1)
    expect(s.verificadoRatio, 'cobertura sobre el corpus entero').toBeCloseTo(1 / 36)
    expect(s.contradichoRatio, 'hallazgo sobre lo examinado').toBe(0)
  })

  it('cuenta las parciales aparte: no resuelven, pero la página las pinta', () => {
    // El 28-09-2026 había 31 filas: 30 `sin-datos` y 1 `parcial`. La entradilla
    // decía «ninguna ha llegado a un veredicto» encima de una tarjeta con la
    // pastilla «1 Parcial». Para nombrarlas hay que contarlas, y sin que entren
    // en el divisor de la discrepancia.
    const verified = [
      claim('a0', 'verificado'),
      claim('a1', 'parcial'),
      claim('a2', 'parcial'),
      claim('a3', 'sin-datos'),
    ]
    const s = pressLabSummary({ press: [], verified }, AHORA)

    expect(s.parcialClaims).toBe(2)
    expect(s.resueltasClaims, 'una parcial no entra en el divisor').toBe(1)
  })

  it('monitorizados y auditados son cuentas distintas', () => {
    // Confundirlas exagera el trabajo hecho, que es lo que dice el docstring
    // del módulo: «a page reading 70 auditados / 0% verificado is
    // self-contradictory».
    const press = Array.from({ length: 5 }, () => ({ date: hace(3) }))
    const s = pressLabSummary({ press, verified: [claim('a1', 'sin-datos')] }, AHORA)
    expect(s.monitoredCount).toBe(5)
    expect(s.auditedCount).toBe(1)
  })

  it('la etiqueta de la página no promete un veredicto que el recuento no exige', () => {
    // Se comprueba sobre el JSX porque el defecto vivía ahí y no en el cálculo:
    // el `hint` del KPI decía «con ≥1 afirmación verificada» mientras el número
    // contaba analizadas. Una cifra correcta con un rótulo que afirma de más es
    // la familia de defectos que este sitio lleva todo el día persiguiendo.
    const jsx = readFileSync(join(ROOT, 'src/pages/Laboratorio.jsx'), 'utf8')
    expect(jsx).not.toContain('con ≥1 afirmación verificada')
    expect(jsx).toContain('con ≥1 afirmación analizada')
  })
})

describe('la ventana de /laboratorio: las tarjetas que la lista pinta', () => {
  // El contador de la lista decía «46 de 45»: el numerador contaba las tarjetas
  // FUERA DEL FEED y el total no. Ahora el total ES esa lista, y la página filtra
  // la misma que se cuenta. Ver tests/laboratorio-contador.test.jsx, con las
  // filas reales del 28-09-2026.
  const fila = (articleId, articleDate, verdict = 'sin-datos') => ({
    claim: {
      articleId,
      articleDate,
      articleSource: 'Medio',
      articleUrl: `https://medio.test/${articleId}`,
      verbatim: `cita de ${articleId}`,
    },
    verification: { verdict },
  })

  it('cuenta una vez el artículo fuera del feed, aunque tenga varias afirmaciones', () => {
    const s = pressLabSummary(
      {
        press: [{ id: 'p1', date: hace(1) }],
        verified: [fila('o1', hace(2)), fila('o1', hace(2), 'parcial')],
      },
      AHORA,
    )
    expect(s.monitoredCount).toBe(2)
    expect(s.fueraDelFeedCount).toBe(1)
    expect(s.articulos.map((a) => a.id).sort()).toEqual(['o1', 'p1'])
    expect(s.articulos.find((a) => a.id === 'o1')).toMatchObject({
      orphan: true,
      source: 'Medio',
      link: 'https://medio.test/o1',
    })
  })

  it('un artículo del feed con afirmaciones no se duplica como «fuera del feed»', () => {
    const s = pressLabSummary(
      { press: [{ id: 'p1', date: hace(1) }], verified: [fila('p1', hace(1))] },
      AHORA,
    )
    expect(s.monitoredCount).toBe(1)
    expect(s.fueraDelFeedCount).toBe(0)
  })

  it('lo que cae fuera de la ventana no cuenta, venga del feed o de las afirmaciones', () => {
    const s = pressLabSummary(
      {
        press: [{ id: 'p1', date: hace(31) }],
        verified: [fila('o1', hace(31)), fila('o2', undefined)],
      },
      AHORA,
    )
    expect(s.articulos).toEqual([])
    expect(s.monitoredCount).toBe(0)
    expect(s.fueraDelFeedCount).toBe(0)
  })

  it('una fecha ilegible no entra ni en la lista ni en el total', () => {
    // La lista comparaba CADENAS y el total, números: «not-a-date» >= «2026-…» es
    // cierto como cadena, así que esa tarjeta salía en la lista y no en el total.
    const s = pressLabSummary(
      {
        press: [
          { id: 'x', date: 'not-a-date' },
          { id: 'p1', date: hace(1) },
        ],
        verified: [],
      },
      AHORA,
    )
    expect(s.articulos.map((a) => a.id)).toEqual(['p1'])
    expect(s.monitoredCount).toBe(1)
  })
})
