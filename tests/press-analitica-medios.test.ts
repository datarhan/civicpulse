import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LOCAL_HOSTS,
  computeTrustIndicators,
  computeTriangulation,
  type ArticleTrustRow,
  type PressArticleLite,
  type TrustIndicatorsReport,
  type VerifiedClaimRow,
} from '../src/scraper/press-analytics'
import { esFuenteOficial } from '../src/scraper/press-fuente-oficial'
import { corpusReales } from '../src/scraper/claim-verdicts'
import type { ExtraccionArticulo } from '../src/scraper/press-extraccion'

/**
 * Seis defectos de la analítica de prensa de /laboratorio, medidos el 19-10-2026
 * sobre el press-trust.json publicado ese día. Las filas son las de producción:
 * press.json y press-claims-verified.json de ese día, copiados tal cual.
 *
 *   1. «Verificado» dividía entre TODAS las afirmaciones del medio, también las
 *      que nunca se cotejaron contra ningún corpus (`checkedAgainst: []`). La
 *      fila del Ayuntamiento decía «0 % · 0 de 26 afirm.» y 21 de esas 26 no se
 *      habían buscado en ningún dato: el divisor es lo cotejado.
 *   2. «Afirmaciones contrastables» salía «○» —se miró y no hay— en 38 titulares
 *      que el extractor nunca había procesado, debajo de la frase de la misma
 *      tarjeta que dice «Este titular aún no ha pasado por el extractor». Regla 2:
 *      «no corrió» no es «no encontró».
 *   3. «Cobertura cruzada» contaba la nota de prensa del Ayuntamiento y el
 *      periódico que la reproduce como dos medios que se corroboran: siete de los
 *      ocho grupos publicados eran eso. Una administración no corrobora a nadie.
 *   4. «Cobertura cruzada» publicaba «○» cuando el agrupado por título NO
 *      encontraba otro medio, y ese agrupado no reconoce la misma historia en
 *      valenciano y en castellano: el choque en la A-3 lo contaron Europa Press y
 *      el Periòdic, y los dos salían «sin cobertura cruzada». No encontrarla no
 *      prueba que no la haya: es «sin comprobar».
 *   5. «Cobertura local» se definía como medios del Camp de Túria, y la lista
 *      metía Levante-EMV, Las Provincias, Valencia Plaza, elDiario.es, la Cadena
 *      SER y el propio dominio del Ayuntamiento.
 *   6. La tabla por medio agrupaba por el nombre de Google News, y fotocasa.es
 *      salía en dos filas, «Fotocasa» (11) y «Fotocasa.es» (1). El medio es el
 *      host, como ya decidió el recuento de cobertura cruzada.
 */

const leer = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'))
const PRESS = leer('press_2026-10-19.json').items as PressArticleLite[]
const VERIF = leer('press-claims-verified_2026-10-19.json') as {
  items: VerifiedClaimRow[]
  extraccion: { articulos: ExtraccionArticulo[] }
}
/** El `generatedAt` del press-trust.json publicado el 19-10-2026. */
const AHORA = new Date('2026-10-19T10:20:18.644Z')

const informe = (): TrustIndicatorsReport =>
  computeTrustIndicators({
    press: PRESS,
    verified: VERIF.items,
    extraccion: VERIF.extraccion.articulos,
    now: AHORA,
  })

function fila(r: TrustIndicatorsReport, id: string): ArticleTrustRow {
  const a = r.articles.find((x) => x.articleId === id)
  expect(a, `${id} no está en la ventana`).toBeDefined()
  return a!
}

describe('control: la ventana es la publicada', () => {
  it('65 titulares, como el press-trust.json del 19-10-2026', () => {
    expect(informe().articles).toHaveLength(65)
  })
})

describe('1 · «Verificado» divide entre lo cotejado', () => {
  it('el Ayuntamiento: 26 afirmaciones, 5 cotejadas, 0 verificadas', () => {
    const ayto = informe().outlets.find((o) => o.outletHost === 'ribarroja.es')!
    expect(ayto.verdictCounts['sin-datos']).toBe(26)
    expect(ayto.checkedClaims).toBe(5)
    expect(ayto.verifiedRatio).toBe(0)
  })

  it('cada medio: verificadas entre cotejadas, y null cuando no se cotejó ninguna', () => {
    const r = informe()
    const hostDe = new Map(r.articles.map((a) => [a.articleId, a.outletHost]))
    let conAlgunaSinCotejar = 0
    for (const o of r.outlets) {
      const suyas = VERIF.items.filter((v) => hostDe.get(v.claim.articleId) === o.outletHost)
      const cotejadas = suyas.filter((v) => corpusReales(v.verification.checkedAgainst).length > 0)
      expect(o.checkedClaims, o.outlet).toBe(cotejadas.length)
      if (suyas.length > cotejadas.length) conAlgunaSinCotejar += 1
      if (cotejadas.length === 0) expect(o.verifiedRatio, o.outlet).toBeNull()
      else
        expect(o.verifiedRatio, o.outlet).toBe(
          cotejadas.filter((v) => v.verification.verdict === 'verificado').length /
            cotejadas.length,
        )
    }
    // Que la comprobación de arriba recorra el caso que importa: medios con
    // afirmaciones que nadie cotejó.
    expect(conAlgunaSinCotejar).toBeGreaterThan(0)
  })

  it('un medio con afirmaciones y ninguna cotejada no publica «0 %»', () => {
    // elperiodic.com: 2 afirmaciones, las 2 con `checkedAgainst: []`.
    const o = informe().outlets.find((x) => x.outletHost === 'elperiodic.com')!
    expect(o.verdictCounts['sin-datos']).toBe(2)
    expect(o.checkedClaims).toBe(0)
    expect(o.verifiedRatio).toBeNull()
  })
})

describe('2 · «Afirmaciones contrastables» no dice «no» de lo que nadie procesó', () => {
  it('los 38 titulares sin desenlace del extractor salen null, no false', () => {
    const r = informe()
    const filas = new Map(VERIF.extraccion.articulos.map((a) => [a.articleId, a]))
    const nunca = r.articles.filter((a) => {
      const f = filas.get(a.articleId)
      return !f || f.fingerprint !== a.articleFingerprint
    })
    expect(nunca).toHaveLength(38)
    for (const a of nunca) expect(a.indicators.factualClaimsPresent, a.articleId).toBeNull()
  })

  it('lo procesado conserva su valor: descartado o vacío → false; con afirmaciones → true', () => {
    const r = informe()
    const filas = new Map(VERIF.extraccion.articulos.map((a) => [a.articleId, a]))
    const por = { true: 0, false: 0 }
    for (const a of r.articles) {
      const f = filas.get(a.articleId)
      if (!f || f.fingerprint !== a.articleFingerprint) continue
      if (f.desenlace === 'extraido') {
        expect(a.indicators.factualClaimsPresent, a.articleId).toBe(true)
        por.true += 1
      } else {
        expect(a.indicators.factualClaimsPresent, a.articleId).toBe(false)
        por.false += 1
      }
    }
    expect(por).toEqual({ true: 16, false: 11 })
  })

  it('sin bloque de extracción (un snapshot anterior), un titular sin afirmaciones es null', () => {
    const r = computeTrustIndicators({ press: PRESS, verified: VERIF.items, now: AHORA })
    // `loiujc` (Levante-EMV, «Resiliencias»): descartado en triaje, sin afirmaciones.
    // Con el bloque es false; sin él no se sabe si se procesó.
    expect(fila(r, 'loiujc').indicators.factualClaimsPresent).toBeNull()
    expect(fila(informe(), 'loiujc').indicators.factualClaimsPresent).toBe(false)
  })
})

describe('3 · una nota institucional no es cobertura cruzada', () => {
  it('el predicado: ayuntamientos y Generalitat sí; los periódicos no', () => {
    const de = (id: string) => PRESS.find((p) => p.id === id)!
    expect(esFuenteOficial(de('8hij1g'))).toBe(true) // Ayuntamiento de Riba-roja, ribarroja.es
    expect(esFuenteOficial(de('1jh9cu0'))).toBe(true) // Ayuntamiento de Cheste, cheste.es
    expect(esFuenteOficial({ source: 'Comunica GVA', sourceHost: 'comunica.gva.es' })).toBe(true)
    expect(esFuenteOficial({ source: 'Ajuntament de Llíria', sourceHost: 'lliria.es' })).toBe(true)
    expect(esFuenteOficial(de('95mxd4'))).toBe(false) // Valencia Plaza
    expect(esFuenteOficial(de('w4u7tv'))).toBe(false) // Levante-EMV
    // Un TITULAR que nombra a la Diputació no hace oficial al medio.
    expect(esFuenteOficial(de('3lfz44'))).toBe(false) // Actualidad Valencia
  })

  it('nota del Ayuntamiento + un periódico: ni grupo ni «●»', () => {
    // Turismo inteligente: la nota municipal (8hij1g) y Valencia Plaza (95mxd4).
    const r = informe()
    expect(fila(r, '8hij1g').indicators.corroboratedAcrossOutlets).not.toBe(true)
    expect(fila(r, '95mxd4').indicators.corroboratedAcrossOutlets).not.toBe(true)
    const t = computeTriangulation({ press: PRESS, verified: VERIF.items, now: AHORA })
    expect(t.clusters.find((c) => c.articleIds.includes('95mxd4'))).toBeUndefined()
  })

  it('la Mancomunidad A3: dos periódicos sí corroboran, y la nota de Cheste va aparte', () => {
    const t = computeTriangulation({ press: PRESS, verified: VERIF.items, now: AHORA })
    expect(t.clusters).toHaveLength(1)
    const [g] = t.clusters
    expect(g.articleIds).toEqual(['1icj1ls', '1jh9cu0', 'hkahd4'])
    expect(g.outlets).toEqual(['El Periódico de Aquí', 'elperiodic.com'])
    expect(g.fuentesOficiales).toEqual(['Ayuntamiento de Cheste'])
    expect(t.stats.triangulated3Plus).toBe(0)
    const r = informe()
    for (const id of g.articleIds)
      expect(fila(r, id).indicators.corroboratedAcrossOutlets, id).toBe(true)
  })
})

describe('4 · no encontrar otro medio no es «○»', () => {
  it('el choque en la A-3, contado por Europa Press y por el Periòdic: sin comprobar', () => {
    const r = informe()
    expect(fila(r, '1qo0wdk').indicators.corroboratedAcrossOutlets).toBeNull()
    expect(fila(r, 'mqpaug').indicators.corroboratedAcrossOutlets).toBeNull()
  })

  it('ningún titular publica «false»: o se encontró otro medio, o no se sabe', () => {
    const valores = new Set(informe().articles.map((a) => a.indicators.corroboratedAcrossOutlets))
    expect(valores).toEqual(new Set([true, null]))
  })
})

describe('5 · «Cobertura local» es el Camp de Túria', () => {
  it('el conjunto exportado no lleva el dominio del Ayuntamiento ni los regionales', () => {
    for (const h of [
      'ribarroja.es',
      'levante-emv.com',
      'lasprovincias.es',
      'valenciaplaza.com',
      'eldiario.es',
      'cadenaser.com',
    ])
      expect(LOCAL_HOSTS.has(h), h).toBe(false)
    expect(LOCAL_HOSTS.has('infoturia.com')).toBe(true)
  })

  it('las filas: el Periòdic es local; el Ayuntamiento, Levante y Valencia Plaza no', () => {
    const r = informe()
    expect(fila(r, 'mqpaug').indicators.localCoverage).toBe(true) // Periòdic
    expect(fila(r, '8hij1g').indicators.localCoverage).toBe(false) // Ayuntamiento
    expect(fila(r, 'w4u7tv').indicators.localCoverage).toBe(false) // Levante-EMV
    expect(fila(r, '95mxd4').indicators.localCoverage).toBe(false) // Valencia Plaza
  })
})

describe('6 · un medio es un host, no un nombre', () => {
  it('fotocasa.es es una fila de 12, no «Fotocasa» (11) y «Fotocasa.es» (1)', () => {
    const r = informe()
    const foto = r.outlets.filter((o) => o.outletHost === 'fotocasa.es')
    expect(foto).toHaveLength(1)
    expect(foto[0].articleCount).toBe(12)
    expect(foto[0].outlet).toBe('Fotocasa')
  })

  it('ningún host sale en dos filas', () => {
    const hosts = informe()
      .outlets.map((o) => o.outletHost)
      .filter((h) => h !== null)
    expect(new Set(hosts).size).toBe(hosts.length)
  })
})
