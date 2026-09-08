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
