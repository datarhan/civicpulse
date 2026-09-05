import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateOfficialsCorrections,
  applyOfficialsCorrections,
  rawFromPublished,
  composeOfficialsSnapshot,
  upsertCorrection,
  retireCorrection,
  OfficialsCorrectionsError,
  MOTIVOS_BAJA,
  type OfficialsCorrections,
} from '../src/scraper/officials-corrections'
import { quoteAppearsIn } from '../src/scraper/quote-match'
import type { Official } from '../src/scraper/corporacion'

/**
 * El padrón de `officials.json` se raspa cada noche de la web del ayuntamiento,
 * y esa web puede ir con retraso respecto a lo que el propio Pleno ya acordó:
 * el 05-09-2026 seguía listando a una concejala que renunció en mayo de 2025 y
 * no listaba a quien tomó posesión en julio. Una corrección curada tiene que
 * sobrevivir al raspado siguiente, citar el acta literal y dejar rastro.
 *
 * La fixture es el texto del acta (pdftotext) del Pleno del 07-07-2025: cada
 * cita de las correcciones publicadas ha de estar en ella, literal.
 */
const ROOT = join(__dirname, '..')
const FIXTURE = join(__dirname, 'fixtures', 'acta_pleno_ribarroja_2025-07-07.txt')
const CORRECTIONS = join(ROOT, 'public', 'data', 'officials-corrections.json')
const OFFICIALS = join(ROOT, 'public', 'data', 'officials.json')

const acta = readFileSync(FIXTURE, 'utf8')
const corrections = JSON.parse(readFileSync(CORRECTIONS, 'utf8')) as OfficialsCorrections
const published = JSON.parse(readFileSync(OFFICIALS, 'utf8')) as Parameters<
  typeof rawFromPublished
>[0]

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
/** El padrón tal como lo raspó el scraper, con las correcciones deshechas. */
const scraped = (): Official[] => rawFromPublished(clone(published))
const byParty = (list: Array<{ party: string }>) =>
  list.reduce<Record<string, number>>((acc, o) => {
    acc[o.party] = (acc[o.party] || 0) + 1
    return acc
  }, {})

describe('officials-corrections — la fixture del acta', () => {
  it('es el acta del Pleno del 07-07-2025 y no está vacía', () => {
    expect(acta.length).toBeGreaterThan(10_000)
    expect(acta).toContain('Expediente 3400/2025/GEN')
  })

  it('contiene literal cada cita de las correcciones publicadas', () => {
    const entries = [...corrections.bajas, ...corrections.altas]
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(quoteAppearsIn(e.source.quote, acta), `${e.slug}: «${e.source.quote}»`).toBe(true)
    }
  })
})

describe('officials-corrections — validador', () => {
  it('acepta el fichero publicado, con al menos una baja y un alta', () => {
    const v = validateOfficialsCorrections(corrections)
    expect(v.bajas.length).toBeGreaterThanOrEqual(1)
    expect(v.altas.length).toBeGreaterThanOrEqual(1)
    expect(MOTIVOS_BAJA).toContain('renuncia')
  })

  it('rechaza una cita de menos de 20 caracteres', () => {
    const bad = clone(corrections)
    bad.bajas[0].source.quote = 'corta'
    expect(() => validateOfficialsCorrections(bad)).toThrow(OfficialsCorrectionsError)
  })

  it('rechaza una fecha que no sea ISO', () => {
    const bad = clone(corrections)
    bad.bajas[0].until = '2 de junio de 2025'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/until/)
  })

  it('rechaza una URL de fuente relativa', () => {
    const bad = clone(corrections)
    bad.altas[0].source.url = '/files/acta.pdf'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/source\.url/)
  })

  it('rechaza un motivo de baja fuera del enum', () => {
    const bad = clone(corrections)
    ;(bad.bajas[0] as { reason: string }).reason = 'dimision'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/reason/)
  })

  it('rechaza una réplica sin texto', () => {
    const bad = clone(corrections)
    bad.replicas.push({ oficial: bad.bajas[0].slug, recibidaEl: '2026-09-05', texto: '' })
    expect(() => validateOfficialsCorrections(bad)).toThrow(/replicas\[0\]\.texto/)
  })

  it('rechaza un campo con forma de juicio a cualquier profundidad', () => {
    const bad = clone(corrections)
    ;(bad.altas[0].photo as Record<string, unknown>).valoracion = 'x'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/valoracion/)
  })

  it('rechaza un slug que no salga del nombre', () => {
    const bad = clone(corrections)
    bad.altas[0].slug = 'otro-slug'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/slug/)
  })

  it('rechaza el mismo slug en bajas y altas', () => {
    const bad = clone(corrections)
    bad.altas[0].slug = bad.bajas[0].slug
    bad.altas[0].name = bad.bajas[0].name
    expect(() => validateOfficialsCorrections(bad)).toThrow(/duplicad/)
  })

  it('rechaza un replacedBy que no sea un alta de este fichero', () => {
    const bad = clone(corrections)
    bad.bajas[0].replacedBy = 'nadie-conocido'
    expect(() => validateOfficialsCorrections(bad)).toThrow(/replacedBy/)
  })
})

describe('officials-corrections — aplicadas sobre el padrón raspado', () => {
  const result = applyOfficialsCorrections(scraped(), corrections)

  it('deja la corporación en 21 escaños con la composición de 2023', () => {
    expect(result.officials.length).toBe(21)
    expect(byParty(result.officials)).toEqual({
      PSOE: 11,
      PP: 7,
      VOX: 1,
      'EU-Podem': 1,
      Compromís: 1,
    })
  })

  it('pasa a la concejala que renunció a formerOfficials, con su fecha de cese', () => {
    expect(result.officials.some((o) => o.slug === 'soraya-trejo-delgado')).toBe(false)
    const former = result.formerOfficials.find((o) => o.slug === 'soraya-trejo-delgado')
    expect(former?.estado).toBe('cesado')
    expect(former?.until).toBe('2025-06-02')
    expect(former?.reason).toBe('renuncia')
    expect(former?.replacedBy).toBe('pedro-tortajada-raga')
    expect(former?.source.url).toMatch(/^https:\/\//)
  })

  it('añade al sustituto con huecos honestos y una marca de procedencia', () => {
    const alta = result.officials.find((o) => o.slug === 'pedro-tortajada-raga')
    expect(alta).toBeDefined()
    expect(alta?.party).toBe('PP')
    expect(alta?.role).toBe('concejal')
    expect(alta?.portfolios).toEqual([])
    expect(alta?.email).toBeNull()
    expect(alta?.cvUrl).toBeNull()
    // Sin retrato en la fuente: cadena vacía MÁS el porqué, para que las
    // iniciales no se lean como una imagen que falló.
    expect(alta?.photoUrl).toBe('')
    expect(typeof alta?.photoNote).toBe('string')
    expect(alta?.photoNote?.length).toBeGreaterThan(20)
    expect(alta?.correccion?.tipo).toBe('alta')
    expect(alta?.correccion?.since).toBe('2025-07-07')
    // El logo es del partido, no de la persona: se copia del compañero de grupo.
    const pp = scraped().find((o) => o.party === 'PP')
    expect(alta?.partyLogoUrl).toBe(pp?.partyLogoUrl)
  })

  it('sienta al sustituto justo detrás del último raspado de su grupo', () => {
    const slugs = result.officials.map((o) => o.slug)
    const i = slugs.indexOf('pedro-tortajada-raga')
    expect(result.officials[i - 1].party).toBe('PP')
    expect(result.officials[i + 1]?.party ?? 'FIN').not.toBe('PP')
  })

  it('dice lo que hizo', () => {
    expect(result.applied).toEqual({ bajas: 1, altas: 1 })
  })

  it('es un punto fijo a través de rawFromPublished', () => {
    const again = applyOfficialsCorrections(rawFromPublished(result), corrections)
    expect(again).toEqual(result)
  })

  it('lanza si una baja nombra a alguien que el raspado no trae (corrección vieja o errónea)', () => {
    const c = clone(corrections)
    c.bajas[0].slug = 'alguien-que-no-existe'
    c.bajas[0].name = 'Alguien Que No Existe'
    expect(() => applyOfficialsCorrections(scraped(), c)).toThrow(/no está en el raspado/)
  })

  it('lanza si un alta ya figura en el raspado (la web se puso al día: retírala)', () => {
    const roster = scraped()
    const alta = corrections.altas[0]
    roster.push({
      slug: alta.slug,
      name: alta.name,
      honorific: alta.honorific,
      role: 'concejal',
      party: alta.party,
      portfolios: [],
      email: null,
      photoUrl: '',
      partyLogoUrl: '',
      cvUrl: null,
    })
    expect(() => applyOfficialsCorrections(roster, corrections)).toThrow(/ya figura en el raspado/)
  })

  it('sin fichero de correcciones deja el padrón intacto y lo dice', () => {
    const r = applyOfficialsCorrections(scraped(), null)
    expect(r.officials).toEqual(scraped())
    expect(r.formerOfficials).toEqual([])
    expect(r.applied).toEqual({ bajas: 0, altas: 0 })
  })

  it('composeOfficialsSnapshot deriva count y composition sólo de los vigentes', () => {
    const snap = composeOfficialsSnapshot(scraped(), corrections, {
      generatedAt: '2026-09-02T08:54:41.421Z',
      source: 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal',
      correctionsFile: '/data/officials-corrections.json',
    })
    expect(snap.count).toBe(21)
    expect(snap.composition).toEqual(byParty(snap.officials))
    expect(snap.formerOfficials.length).toBe(corrections.bajas.length)
    expect(snap.corrections).toEqual({
      file: '/data/officials-corrections.json',
      generatedAt: corrections.generatedAt,
      bajas: corrections.bajas.length,
      altas: corrections.altas.length,
    })
    // El sello del padrón es el del RASPADO: recomponer no es volver a raspar.
    expect(snap.generatedAt).toBe('2026-09-02T08:54:41.421Z')
  })
})

describe('officials-corrections — la mitad pura del CLI', () => {
  it('upsertCorrection añade una entrada validada y mueve el sello', () => {
    const base = clone(corrections)
    const entry = clone(corrections.bajas[0])
    entry.slug = 'juan-boix-martinez'
    entry.name = 'Juan Boix Martínez'
    entry.replacedBy = null
    const next = upsertCorrection(base, 'baja', entry)
    expect(next.bajas.map((b) => b.slug)).toContain('juan-boix-martinez')
    expect(next.generatedAt > base.generatedAt).toBe(true)
    // El original no se toca: el CLI escribe lo que devuelve, no lo que recibió.
    expect(base.bajas.map((b) => b.slug)).not.toContain('juan-boix-martinez')
  })

  it('upsertCorrection rechaza un slug ya presente', () => {
    expect(() => upsertCorrection(clone(corrections), 'baja', clone(corrections.bajas[0]))).toThrow(
      /duplicad/,
    )
  })

  it('retireCorrection quita una entrada por slug y rechaza una desconocida', () => {
    const base = clone(corrections)
    const next = retireCorrection(base, corrections.bajas[0].slug)
    expect(next.bajas.map((b) => b.slug)).not.toContain(corrections.bajas[0].slug)
    expect(next.generatedAt > base.generatedAt).toBe(true)
    expect(() => retireCorrection(clone(corrections), 'nadie-conocido')).toThrow(/nadie-conocido/)
  })

  it('retireCorrection se niega a dejar una baja apuntando a un alta que ya no existe', () => {
    // La baja dice «sustituida por X»; quitar X sin tocar la baja dejaría el
    // fichero afirmando una sustitución que ya no documenta.
    expect(() => retireCorrection(clone(corrections), corrections.altas[0].slug)).toThrow(
      /replacedBy/,
    )
  })
})
