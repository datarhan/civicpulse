import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeTrustIndicators,
  computeTriangulation,
  corpusMunicipales,
  CORPUS_NO_MUNICIPALES,
  type PressArticleLite,
  type VerifiedClaimRow,
} from '../src/scraper/press-analytics'
import { esAnuncioClasificado, PORTALES_DE_ANUNCIOS } from '../src/scraper/press-clasificado'
import { CORPUS_IDS } from '../src/scraper/claim-verdicts'
import { pressLabSummary } from '../src/lib/press-lab'
import type { ExtraccionArticulo } from '../src/scraper/press-extraccion'

/**
 * Dos defectos del corpus de /laboratorio, medidos el 19-10-2026 sobre las filas
 * de producción (press.json y press-claims-verified.json de ese día, tal cual):
 *
 *   · 12 de los 68 «Titulares monitorizados» eran anuncios de Fotocasa («1 Casas y
 *     pisos en Calle Serrans, Riba-roja de Túria»): contaban como prensa en el KPI,
 *     en la tabla por medio y en el vocabulario de las lagunas de cobertura.
 *   · «○ Coincide con datos municipales» salía en 1w1lf6k y o3xjg4 (las canteras),
 *     cuyas únicas afirmaciones cotejadas lo fueron contra `promises`. El catálogo
 *     de promesas de los partidos no es un dato municipal: lo que se cotejó contra
 *     él no dice nada de si el titular coincide con el Ayuntamiento.
 */

const leer = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'))
const PRESS = leer('press_2026-10-19.json').items as PressArticleLite[]
const VERIF = leer('press-claims-verified_2026-10-19.json') as {
  items: VerifiedClaimRow[]
  extraccion: { articulos: ExtraccionArticulo[] }
}
/** El `generatedAt` del press-trust.json publicado el 19-10-2026. */
const AHORA = new Date('2026-10-19T10:20:18.644Z')

const trust = () =>
  computeTrustIndicators({
    press: PRESS,
    verified: VERIF.items,
    extraccion: VERIF.extraccion.articulos,
    now: AHORA,
  })

describe('anuncios clasificados — un portal inmobiliario no es un medio', () => {
  it('los 13 anuncios de fotocasa.es del feed son anuncios, y nada más lo es', () => {
    const anuncios = PRESS.filter((p) => esAnuncioClasificado(p))
    expect(anuncios.length).toBe(13)
    for (const a of anuncios) expect(a.title).toMatch(/Casas y pisos/)
    expect(PRESS.filter((p) => p.sourceHost === 'fotocasa.es').length).toBe(13)
  })

  it('la regla es el dominio del portal, con sus subdominios', () => {
    expect(PORTALES_DE_ANUNCIOS).toContain('fotocasa.es')
    expect(esAnuncioClasificado({ source: 'Fotocasa.es', sourceHost: 'www.fotocasa.es' })).toBe(
      true,
    )
    expect(esAnuncioClasificado({ source: 'Levante-EMV', sourceHost: 'levante-emv.com' })).toBe(
      false,
    )
    // Un nombre sin host no basta para descartar: el nombre lo pone el agregador.
    expect(esAnuncioClasificado({ source: 'Fotocasa', sourceHost: null })).toBe(false)
  })

  it('la tabla por medio no tiene fila de Fotocasa y ningún titular suyo puntúa', () => {
    const r = trust()
    expect(r.outlets.some((o) => o.outletHost === 'fotocasa.es')).toBe(false)
    expect(r.articles.some((a) => a.outletHost === 'fotocasa.es')).toBe(false)
    // 65 titulares del feed en la ventana, 12 de ellos anuncios.
    expect(r.articles.length).toBe(53)
  })

  it('la triangulación tampoco agrupa anuncios', () => {
    const r = computeTriangulation({ press: PRESS, verified: VERIF.items, now: AHORA })
    const ids = new Set(PRESS.filter((p) => esAnuncioClasificado(p)).map((p) => p.id))
    for (const c of r.clusters) for (const id of c.articleIds) expect(ids.has(id)).toBe(false)
  })

  it('«Titulares monitorizados» ya no cuenta los 12 anuncios: 68 → 56', () => {
    const s = pressLabSummary({ press: PRESS, verified: VERIF.items }, AHORA.getTime())
    expect(s.monitoredCount).toBe(56)
    expect(s.articulos.some((a) => a.sourceHost === 'fotocasa.es')).toBe(false)
    expect(s.fueraDelFeedCount).toBe(3)
  })
})

describe('«Coincide con datos municipales» — el catálogo de promesas no es un dato municipal', () => {
  it('cada corpus excluido es un corpus declarado (regla 1: el enum exportado, no una copia)', () => {
    for (const c of CORPUS_NO_MUNICIPALES) expect(CORPUS_IDS).toContain(c)
    expect(CORPUS_NO_MUNICIPALES).toContain('promises')
    expect(corpusMunicipales(['promises'])).toEqual([])
    expect(corpusMunicipales(['tenders', 'promises', 'verdict-engine'])).toEqual(['tenders'])
  })

  it('las canteras (1w1lf6k, o3xjg4), cotejadas sólo contra promesas, salen «sin comprobar», no «○»', () => {
    const porId = new Map(trust().articles.map((a) => [a.articleId, a]))
    for (const id of ['1w1lf6k', 'o3xjg4']) {
      const cotejos = VERIF.items
        .filter((r) => r.claim.articleId === id)
        .map((r) => r.verification.checkedAgainst ?? [])
        .filter((c) => c.length > 0)
      // Lo que tiene cada una: alguna afirmación cotejada, y sólo contra promesas.
      expect(cotejos.length).toBeGreaterThan(0)
      for (const c of cotejos) expect(c).toEqual(['promises'])
      expect(porId.get(id)!.indicators.municipalSourceMatch).toBeNull()
    }
  })

  it('la tabla por medio sigue contando como cotejada la que se buscó en promesas', () => {
    // «Cotejada» es cualquier corpus; «municipal» es la pregunta del indicador.
    const ayto = trust().outlets.find((o) => o.outletHost === 'ribarroja.es')!
    expect(ayto.checkedClaims).toBe(5)
  })
})
