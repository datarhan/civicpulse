import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeTrustIndicators,
  type ArticleTrustRow,
  type PressArticleLite,
  type TrustIndicatorsReport,
  type VerifiedClaimRow,
} from '../src/scraper/press-analytics'
import { CLAIM_VERDICTS, type ClaimVerdict } from '../src/scraper/claim-verdicts'

/**
 * «Coincide con datos municipales» es lo que dice un veredicto, no lo que hay en
 * la lista de evidencia.
 *
 * El 28-09-2026 la tarjeta de la nota municipal «Riba-roja de Túria impulsa la
 * sensorización de sus contenedores de residuos…» (`1lk4zls`, 25-09-2026)
 * encendía en verde «● Coincide con datos municipales», y era el único de los 45
 * titulares de la ventana que lo hacía: con él sumaba 6 puntos de fiabilidad de
 * 6. Su única fila de evidencia cuelga de «135.000 euros se financian con cargo
 * al PSTD…», que el verificador dejó `parcial`, y es un contrato de OTRA obra:
 * «Obras de Instalación de pérgolas con vegetación autóctona…», 131.336 €,
 * `stance: 'checked'`. Nada del artículo coincide con los datos municipales: se
 * encontró un expediente y se comparó.
 *
 * El indicador se encendía con CUALQUIER fila de evidencia, y una fila de
 * evidencia es un documento cotejado —la cabecera de press-verifier.ts lo dice:
 * el enum de `stance` no tiene `corroborates`—. La escala publicada en
 * /metodologia define «Verificado» como «coincide con el documento municipal» y
 * «Parcial» como «el detalle no coincide en su totalidad»: el indicador decía lo
 * contrario que la pastilla pintada dos líneas más arriba en la misma tarjeta.
 *
 * Y el círculo vacío mentía en la otra dirección. Cinco titulares salían «○» —se
 * cotejó y no coincide— sin que ninguna de sus afirmaciones se hubiera cotejado
 * contra nada (`checkedAgainst: []`). Sin cotejo el indicador no dice «no»: dice
 * «sin comprobar», igual que cuando no se extrajo ninguna afirmación.
 *
 * Las filas son las de producción del 28-09-2026 (los mismos fixtures que
 * tests/laboratorio-contador.test.jsx).
 */

const leer = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'))
const PRESS = leer('press_2026-09-28.json').items as PressArticleLite[]
const VERIFICADAS = leer('press-claims-verified_2026-09-28.json').items as VerifiedClaimRow[]
const AHORA = new Date('2026-09-29T09:00:00Z')

/** La afirmación de los 135.000 €: la única del artículo con evidencia. */
const PARCIAL_PERGOLAS = '1lk4zls-1-num'

const informe = (verified: VerifiedClaimRow[] = VERIFICADAS): TrustIndicatorsReport =>
  computeTrustIndicators({ press: PRESS, verified, now: AHORA })

function fila(r: TrustIndicatorsReport, id: string): ArticleTrustRow {
  const a = r.articles.find((x) => x.articleId === id)
  expect(a, `${id} no está en la ventana`).toBeDefined()
  return a!
}

/** Las filas reales con el veredicto de los 135.000 € cambiado; la evidencia, intacta. */
const conVeredicto = (verdict: ClaimVerdict): VerifiedClaimRow[] =>
  VERIFICADAS.map((v) =>
    v.claim.id === PARCIAL_PERGOLAS ? { ...v, verification: { ...v.verification, verdict } } : v,
  )

describe('«Coincide con datos municipales» (press-trust.json)', () => {
  it('la premisa, medida: la única evidencia de 1lk4zls es un contrato de otra obra bajo una «parcial»', () => {
    const suyas = VERIFICADAS.filter((r) => r.claim.articleId === '1lk4zls')
    expect(suyas).toHaveLength(6)
    expect(suyas.some((r) => r.verification.verdict === 'verificado')).toBe(false)

    const conEvidencia = suyas.filter((r) => r.verification.evidence.length > 0)
    expect(conEvidencia.map((r) => r.claim.id)).toEqual([PARCIAL_PERGOLAS])
    const [unica] = conEvidencia
    expect(unica.claim.verbatim).toMatch(/^135\.000 euros se financian con cargo al PSTD/)
    expect(unica.verification.verdict).toBe('parcial')
    expect(unica.verification.evidence).toHaveLength(1)
    const [ev] = unica.verification.evidence
    expect(ev.kind).toBe('tender')
    expect(ev.stance).toBe('checked')
    expect(ev.snippet).toMatch(/pérgolas con vegetación autóctona/)
    expect(ev.snippet).toMatch(/131\.336 €/)
  })

  it('una fila de evidencia no es una coincidencia: 1lk4zls se cotejó y no coincide', () => {
    expect(fila(informe(), '1lk4zls').indicators.municipalSourceMatch).toBe(false)
  })

  it('con afirmaciones, pero ninguna cotejada contra un corpus, es «sin comprobar» y no «no»', () => {
    const r = informe()
    for (const id of ['k7sazb', '1gkikhf', '1cibswi', '1cj48hw', '2gr6xp']) {
      const suyas = VERIFICADAS.filter((v) => v.claim.articleId === id)
      // La premisa: hay afirmaciones, y ninguna se cotejó contra nada.
      expect(suyas.length, id).toBeGreaterThan(0)
      expect(
        suyas.every((v) => v.verification.checkedAgainst.length === 0),
        id,
      ).toBe(true)
      expect(fila(r, id).indicators.municipalSourceMatch, id).toBeNull()
    }
  })

  it('cotejadas y sin ninguna «verificado», el círculo sigue vacío: no se vuelve «sin comprobar»', () => {
    const r = informe()
    for (const id of ['1lk4zls', '3edbnb', '17wvv8s', '1s3psp4', '1a5f1pr', 'yfbsr']) {
      expect(fila(r, id).indicators.municipalSourceMatch, id).toBe(false)
    }
  })

  it('los tres estados, contados sobre la ventana entera', () => {
    // 45 titulares. 34 sin ninguna afirmación y 5 con afirmaciones sin cotejar:
    // 39 «sin comprobar». Los 6 cotejados, sin ninguna «verificado»: 6 «no». Y
    // ninguno enciende el verde, porque el 28-09 no había ni una verificada.
    const cuenta: Record<string, number> = { true: 0, false: 0, null: 0 }
    for (const a of informe().articles) cuenta[`${a.indicators.municipalSourceMatch}`] += 1
    expect(cuenta).toEqual({ true: 0, false: 6, null: 39 })
  })

  // Lo que la escala publicada dice de cada veredicto. Un veredicto nuevo sale
  // `undefined` aquí y la prueba falla hasta que alguien decida qué le toca.
  const ENCIENDE: Record<ClaimVerdict, boolean> = {
    verificado: true,
    parcial: false,
    contradicho: false,
    'sin-datos': false,
    'promesa-repetida': false,
  }

  it.each(CLAIM_VERDICTS)(
    'la misma fila, con su contrato de pérgolas, y el veredicto «%s»',
    (verdict) => {
      const r = informe(conVeredicto(verdict))
      expect(fila(r, '1lk4zls').indicators.municipalSourceMatch).toBe(ENCIENDE[verdict])
    },
  )

  it('una «verificado» sin ningún corpus detrás no enciende el verde', () => {
    // La forma de las filas de pasadas retiradas de los plenos (claim-verdicts.ts):
    // un veredicto fuerte cuyo `checkedAgainst` sólo lleva la marca de la pasada.
    const verified = VERIFICADAS.map((v) =>
      v.claim.id === PARCIAL_PERGOLAS
        ? {
            ...v,
            verification: {
              ...v.verification,
              verdict: 'verificado' as const,
              checkedAgainst: ['llm-second-pass'],
            },
          }
        : v,
    )
    // Las otras afirmaciones de 1lk4zls sí se cotejaron, y ninguna volvió «verificado».
    expect(fila(informe(verified), '1lk4zls').indicators.municipalSourceMatch).toBe(false)
  })

  it('el punto de fiabilidad sigue al indicador: sólo «verificado» lo gana', () => {
    const real = fila(informe(), '1lk4zls').score
    const verificada = fila(informe(conVeredicto('verificado')), '1lk4zls').score
    expect(verificada - real).toBe(1)
  })
})
