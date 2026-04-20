import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  classifyQueja,
  routeQueja,
  LEGAL_CATALOG,
  ESCALATION_PROFILES,
  type OfficialsSnapshot,
  type QuejaInput,
} from '../src/scraper/queja-router'

const officials: OfficialsSnapshot = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/officials.json'), 'utf8')
)

describe('queja-router — classifyQueja', () => {
  it('classifies pothole/bache → via_publica', () => {
    const c = classifyQueja({
      title: 'Bache profundo',
      detail: 'Hay un bache enorme en la calle San Vicente que lleva meses sin arreglar',
    })
    expect(c.category).toBe('via_publica')
    expect(c.confidence).toBe('high')
  })

  it('classifies overflowing bin → limpieza', () => {
    const c = classifyQueja({
      title: 'Contenedor desbordado',
      detail: 'Los contenedores de la calle Mayor llevan 3 días desbordados',
    })
    expect(c.category).toBe('limpieza')
  })

  it('classifies broken streetlight → alumbrado', () => {
    const c = classifyQueja({
      title: 'Farola averiada',
      detail: 'La farola del parque lleva 2 semanas fundida',
    })
    expect(c.category).toBe('alumbrado')
  })

  it('classifies noise complaint → ruido', () => {
    const c = classifyQueja({
      title: 'Ruido nocturno',
      detail: 'Un local genera ruidos por la noche que impiden dormir',
    })
    expect(c.category).toBe('ruido')
  })

  it('classifies transparency request → transparencia', () => {
    const c = classifyQueja({
      title: 'Solicitud de acceso a información pública',
      detail: 'He pedido copia de los contratos de limpieza y no me contestan',
    })
    expect(c.category).toBe('transparencia')
  })

  it('classifies licencia de obra → urbanismo', () => {
    const c = classifyQueja({
      title: 'Licencia de obra menor',
      detail: 'Solicito licencia de obra menor para reforma de cocina',
    })
    expect(c.category).toBe('urbanismo')
  })

  it('classifies park request → zonas_verdes', () => {
    const c = classifyQueja({
      title: 'Parque descuidado',
      detail: 'El parque del Cid tiene el césped seco y los juegos infantiles rotos',
    })
    expect(c.category).toBe('zonas_verdes')
  })

  it('falls back to otros when no keyword matches', () => {
    const c = classifyQueja({
      title: 'Asunto genérico',
      detail: 'Me gustaría comentar un tema variopinto sin categoría clara',
    })
    expect(c.category).toBe('otros')
    expect(c.confidence).toBe('low')
  })

  it('respects explicit category override', () => {
    const c = classifyQueja({
      title: 'Bache',
      detail: 'bache en la calle',
      category: 'limpieza',
    })
    expect(c.category).toBe('limpieza')
    expect(c.confidence).toBe('high')
  })
})

describe('queja-router — routeQueja concejalía matching', () => {
  it('routes via_publica to Urbanismo/Obra Pública (Teresa Pozuelo)', () => {
    const r = routeQueja(
      { title: 'Bache profundo', detail: 'Bache en la avenida principal' },
      officials
    )
    expect(r.concejalia.responsible?.name).toMatch(/Teresa Pozuelo/)
    expect(r.concejalia.area.toLowerCase()).toMatch(/obra|urbanismo/)
  })

  it('routes transparencia to Participación y transparencia (María Esther Gómez)', () => {
    const r = routeQueja(
      {
        title: 'Solicitud de acceso a información',
        detail: 'Pido copia de los contratos de alumbrado',
      },
      officials
    )
    expect(r.concejalia.responsible?.name).toMatch(/María Esther Gómez/)
    expect(r.concejalia.area.toLowerCase()).toMatch(/transparencia/)
  })

  it('routes limpieza/residuos to Servicios públicos (Rafael Gómez)', () => {
    const r = routeQueja(
      { title: 'Basura acumulada', detail: 'Contenedores desbordados toda la semana' },
      officials
    )
    expect(r.concejalia.responsible?.name).toMatch(/Rafael Gómez/)
  })

  it('routes ruido to Seguridad (Raquel Pamblanco)', () => {
    const r = routeQueja(
      { title: 'Ruido nocturno', detail: 'Local con música alta por la noche' },
      officials
    )
    expect(r.concejalia.responsible?.name).toMatch(/Raquel Pamblanco/)
  })

  it('falls back to the alcalde when no portfolio matches', () => {
    // Pass a synthetic officials snapshot with only an alcalde.
    const minimal: OfficialsSnapshot = {
      generatedAt: officials.generatedAt,
      source: officials.source,
      count: 1,
      composition: { PSOE: 1 },
      officials: [officials.officials.find((o) => o.role === 'alcalde')!],
    }
    const r = routeQueja(
      { title: 'Algo raro', detail: 'Un tema sin encaje en ninguna concejalía conocida' },
      minimal
    )
    expect(r.concejalia.responsible?.role).toBe('alcalde')
    expect(r.concejalia.alcaldeFallback.name).toMatch(/Robert Raga/)
  })

  it('always exposes the alcaldeFallback for accountability', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    expect(r.concejalia.alcaldeFallback.name).toMatch(/Robert Raga/)
  })
})

describe('queja-router — legal basis', () => {
  it('cites LPACAP art. 21.3 for the 3-month default', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache en la calle' }, officials)
    const art213 = r.legalBasis.find((l) => l.article.includes('21.3'))
    expect(art213).toBeDefined()
    expect(art213?.url).toMatch(/boe\.es.*BOE-A-2015-10565/)
  })

  it('cites LPACAP art. 21.4 for the 10-day acuse', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache en la calle' }, officials)
    const art214 = r.legalBasis.find((l) => l.article.includes('21.4'))
    expect(art214).toBeDefined()
  })

  it('cites Ley 19/2013 art. 20 for transparencia', () => {
    const r = routeQueja(
      {
        title: 'Derecho de acceso',
        detail: 'Solicito copia de los contratos de obras del 2025',
      },
      officials
    )
    const art20 = r.legalBasis.find((l) =>
      l.law.includes('19/2013') && l.article.includes('20')
    )
    expect(art20).toBeDefined()
    expect(art20?.url).toMatch(/BOE-A-2013-12887/)
  })

  it('cites LRBRL art. 18 for vecino rights on any queja', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const a18 = r.legalBasis.find((l) => l.law.includes('7/1985') && l.article.includes('18'))
    expect(a18).toBeDefined()
  })
})

describe('queja-router — time limits and silencio', () => {
  it('returns 10d acuse + 90d (3 meses) resolución for standard quejas', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const acuse = r.timeLimits.find((t) => t.kind === 'acuse')
    const res = r.timeLimits.find((t) => t.kind === 'resolucion')
    expect(acuse?.days).toBe(10)
    expect(res?.days).toBe(90)
  })

  it('defaults silencio to negativo for a bare queja (art. 24 LPACAP)', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    expect(r.silencio).toBe('negativo')
  })

  it('returns 30d resolución for transparencia (1 mes art. 20 Ley 19/2013)', () => {
    const r = routeQueja(
      { title: 'Acceso a información pública', detail: 'pido copia de contratos' },
      officials
    )
    const res = r.timeLimits.find((t) => t.kind === 'resolucion')
    expect(res?.days).toBe(30)
  })

  it('silencio positivo for licencia de obra menor', () => {
    const r = routeQueja(
      { title: 'Licencia de obra menor', detail: 'pido licencia para reforma interior' },
      officials
    )
    expect(r.silencio).toBe('positivo')
  })
})

describe('queja-router — escalation path', () => {
  it('standard quejas escalate to Síndic de Greuges CV', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const sindic = r.escalation.find((e) => e.who.includes('Síndic'))
    expect(sindic).toBeDefined()
    expect(sindic?.template).toMatch(/elsindic\.com/)
  })

  it('standard quejas offer recurso contencioso-administrativo at 90d + 2m', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    const contencioso = r.escalation.find((e) => e.action.includes('contencioso'))
    expect(contencioso).toBeDefined()
    expect(contencioso?.basis.law).toMatch(/29\/1998|LJCA/)
  })

  it('transparencia escalates to the CTBG (reclamación especial)', () => {
    const r = routeQueja(
      { title: 'Acceso a información pública', detail: 'pido contratos' },
      officials
    )
    const ctbg = r.escalation.find((e) => e.who.includes('CTBG') || e.who.includes('Consell'))
    expect(ctbg).toBeDefined()
  })

  it('every escalation step cites a BOE or official institution URL', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    for (const step of r.escalation) {
      expect(step.basis.url).toMatch(
        /boe\.es|elsindic\.com|consejodetransparencia\.es|defensordelpueblo\.es|gva\.es/
      )
    }
  })

  it('escalation steps are ordered by whenDays ascending', () => {
    const r = routeQueja({ title: 'Bache', detail: 'bache' }, officials)
    for (let i = 1; i < r.escalation.length; i++) {
      expect(r.escalation[i].whenDays).toBeGreaterThanOrEqual(r.escalation[i - 1].whenDays)
    }
  })
})

describe('queja-router — legal catalog integrity', () => {
  it('every LEGAL_CATALOG entry has a BOE URL', () => {
    for (const art of Object.values(LEGAL_CATALOG)) {
      expect(art.url).toMatch(/boe\.es|elsindic\.com|consejodetransparencia\.es/)
    }
  })

  it('every ESCALATION_PROFILE has at least one step', () => {
    for (const profile of Object.values(ESCALATION_PROFILES)) {
      expect(profile.length).toBeGreaterThan(0)
    }
  })
})

describe('queja-router — Spanish explanation', () => {
  it('produces a human-readable multi-paragraph explanation', () => {
    const r = routeQueja(
      { title: 'Bache profundo en Av. Primera', detail: 'Bache sin reparar desde hace 3 meses' },
      officials
    )
    expect(r.explanationEs.length).toBeGreaterThan(300)
    // name of responsible + deadline + escalation body all appear
    expect(r.explanationEs).toMatch(/Teresa Pozuelo/)
    expect(r.explanationEs).toMatch(/3 meses|90 días/)
    expect(r.explanationEs).toMatch(/Síndic/)
  })

  it('never includes editorial adjectives (ineficaz, corrupto, negligente)', () => {
    const r = routeQueja(
      { title: 'Bache', detail: 'bache en la calle' },
      officials
    )
    expect(r.explanationEs.toLowerCase()).not.toMatch(
      /ineficaz|incompetente|negligente|corrupto|prevaricador|mentiroso/
    )
  })
})

describe('queja-router — end-to-end shape', () => {
  it('returns a fully-populated QuejaRouting object', () => {
    const queja: QuejaInput = {
      title: 'Bache peligroso en Sector 14',
      detail: 'Lleva 2 meses sin arreglar y ya ha causado una caída',
    }
    const r = routeQueja(queja, officials)
    expect(r.queja).toEqual(queja)
    expect(r.category).toBeTruthy()
    expect(r.confidence).toMatch(/low|medium|high/)
    expect(r.concejalia.area).toBeTruthy()
    expect(r.concejalia.alcaldeFallback).toBeTruthy()
    expect(Array.isArray(r.legalBasis)).toBe(true)
    expect(r.legalBasis.length).toBeGreaterThan(0)
    expect(Array.isArray(r.timeLimits)).toBe(true)
    expect(r.timeLimits.length).toBeGreaterThan(0)
    expect(['positivo', 'negativo']).toContain(r.silencio)
    expect(Array.isArray(r.escalation)).toBe(true)
    expect(r.escalation.length).toBeGreaterThan(0)
    expect(typeof r.explanationEs).toBe('string')
  })
})
