import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  composeFinding,
  descartarLotesYaPublicados,
  type BundleCandidate,
  type VerifiedPressItem,
} from '../src/scraper/press-auto-curate'
import type { PressFinding } from '../src/scraper/press-finding'

/**
 * El resumen de cada hallazgo automático empezaba «Los datos municipales contrastan
 * con la cobertura citada», también en un lote cuyas tres afirmaciones volvieron
 * `sin-datos` —el de la Cuenta General, publicado el 19-10-2026 como
 * pf-2026-10-19-140oi31+—: no se contrastó nada con éxito, y dos de las tres ni se
 * buscaron en un dato. Y el curador volvía a publicar el mismo lote cada vez que
 * corría: 17 filas de 5 lotes en press-findings.json.
 *
 * Las afirmaciones son las de press-claims-verified.json del 19-10-2026, tal cual.
 */

const leer = (f: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'))
const VERIF = leer('press-claims-verified_2026-10-19.json').items as VerifiedPressItem[]
const HALLAZGOS = leer('press-findings_2026-10-19.json').items as PressFinding[]

const VACIO = { verificado: 0, parcial: 0, contradicho: 0, 'sin-datos': 0, 'promesa-repetida': 0 }

function lote(claimIds: string[], fingerprint: string): BundleCandidate {
  const items = VERIF.filter((r) => claimIds.includes(r.claim.id))
  const verdictMix = { ...VACIO }
  for (const it of items) verdictMix[it.verification.verdict] += 1
  const fechas = items.map((i) => i.claim.articleDate.slice(0, 10)).sort()
  return {
    fingerprint,
    articleIds: [...new Set(items.map((i) => i.claim.articleId))],
    attributedOutlets: [...new Set(items.map((i) => i.claim.articleSource))].sort(),
    topic: items[0].claim.topic,
    items,
    verdictMix,
    score: 2,
    earliestDate: fechas[0],
    latestDate: fechas[fechas.length - 1],
  }
}

const CUENTA_GENERAL = ['pqxb2e-0-dat', '140oi31-1-num', '140oi31-2-num']

describe('composeFinding — el resumen dice lo que pasó', () => {
  it('un lote sólo «sin-datos» no dice que los datos «contrastan»', () => {
    const b = lote(CUENTA_GENERAL, '140oi31+pqxb2e')
    expect(b.items.length).toBe(3)
    const f = composeFinding({ bundle: b, publishedAt: '2026-10-19' })
    expect(f.summary).not.toMatch(/contrastan/)
    expect(f.summary).toMatch(/^Ninguna de las 3 afirmaciones del lote encontró registro/)
    // Cuántas ni se buscaron: pqxb2e-0-dat tiene `checkedAgainst: []`.
    expect(f.summary).toContain('1 no se llegó a buscar en ningún dato')
    expect(f.summary).toContain('no lo ha revisado una persona')
  })

  it('con una verificada, lo cuenta sobre el total del lote', () => {
    const verificado: VerifiedPressItem = {
      ...VERIF.find((r) => r.claim.id === '140oi31-1-num')!,
    }
    verificado.verification = { ...verificado.verification, verdict: 'verificado' }
    const otros = VERIF.filter((r) => ['pqxb2e-0-dat', '140oi31-2-num'].includes(r.claim.id))
    const b = { ...lote(CUENTA_GENERAL, 'fp'), items: [verificado, ...otros] }
    b.verdictMix = { ...VACIO, verificado: 1, 'sin-datos': 2 }
    const f = composeFinding({ bundle: b, publishedAt: '2026-10-19' })
    expect(f.summary).toMatch(
      /^1 de las 3 afirmaciones del lote coincide con un registro municipal/,
    )
  })
})

describe('descartarLotesYaPublicados — el mismo lote no se publica dos veces', () => {
  it('el lote de la Cuenta General, recompuesto otro lunes, ya está publicado', () => {
    const f = composeFinding({
      bundle: lote(CUENTA_GENERAL, '140oi31+pqxb2e'),
      publishedAt: '2026-10-26',
    })
    expect(f.id).toBe('pf-2026-10-26-140oi31+')
    expect(descartarLotesYaPublicados([f], HALLAZGOS)).toEqual([])
  })

  it('si el lote gana una afirmación, es otro lote y se publica', () => {
    const b = lote([...CUENTA_GENERAL, 'pqxb2e-1-dat'], '140oi31+pqxb2e')
    const f = composeFinding({ bundle: b, publishedAt: '2026-10-26' })
    expect(descartarLotesYaPublicados([f], HALLAZGOS)).toEqual([f])
  })
})
