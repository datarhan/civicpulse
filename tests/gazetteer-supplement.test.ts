import { describe, it, expect } from 'vitest'
import {
  validateGazetteerSupplement,
  supplementToGazetteerInput,
} from '../src/scraper/gazetteer-supplement'
import {
  buildGazetteer,
  resolvePlace,
  foldTitle,
  matchNameToGazetteer,
} from '../src/scraper/place-resolver'

const entry = (over: Record<string, unknown> = {}) => ({
  slug: 'mercat-municipal',
  name: 'Mercat Municipal',
  kind: 'poi',
  point: [39.544, -0.575],
  source: { osmType: 'way', osmId: 123456 },
  ...over,
})

const snap = (entries: unknown[]) => ({
  updatedAt: '2026-07-14T00:00:00.000Z',
  entries,
})

describe('validateGazetteerSupplement', () => {
  it('accepts a well-formed snapshot (osm or url provenance)', () => {
    expect(() =>
      validateGazetteerSupplement(
        snap([
          entry(),
          entry({
            slug: 'urb-gallipont',
            name: 'Urbanización Gallipont',
            kind: 'urbanizacion',
            point: [39.52, -0.52],
            aliases: ['Gallipont'],
            source: { url: 'https://www.ribarroja.es/some-official-page' },
          }),
        ]),
      ),
    ).not.toThrow()
  })

  it('rejects a point outside the municipality bbox (fabricated-coordinate guard)', () => {
    expect(() => validateGazetteerSupplement(snap([entry({ point: [40.42, -3.7] })]))).toThrow(
      /point/i,
    )
  })

  it('rejects an entry without provenance — every curated point must cite a source', () => {
    expect(() => validateGazetteerSupplement(snap([entry({ source: undefined })]))).toThrow(
      /source/i,
    )
  })

  it('rejects duplicate slugs and the barrio kind (OSM zones stay canonical)', () => {
    expect(() => validateGazetteerSupplement(snap([entry(), entry()]))).toThrow(/slug/i)
    expect(() => validateGazetteerSupplement(snap([entry({ kind: 'barrio' })]))).toThrow(/kind/i)
  })
})

describe('supplementToGazetteerInput → buildGazetteer integration', () => {
  const supplement = snap([
    entry(), // poi: Mercat Municipal
    entry({
      slug: 'castell-de-riba-roja',
      name: 'Castell de Riba-roja',
      kind: 'poi',
      point: [39.5442, -0.5735],
      aliases: ['Castillo de Riba-roja'],
    }),
    entry({
      slug: 'urb-gallipont',
      name: 'Urbanización Gallipont',
      kind: 'urbanizacion',
      point: [39.52, -0.52],
      aliases: ['Gallipont'],
      source: { url: 'https://www.ribarroja.es/x' },
    }),
    entry({
      slug: 'cami-dels-pagos',
      name: 'Camino els Pagos',
      kind: 'street',
      point: [39.5, -0.55],
    }),
  ])
  validateGazetteerSupplement(supplement)
  const input = supplementToGazetteerInput(supplement)
  const candidates = buildGazetteer(input)

  it('maps kinds onto the gazetteer input buckets (alias fan-out included)', () => {
    expect(input.pois.length).toBe(3) // 2 pois + 1 alias row
    expect(input.streets.length).toBe(1)
    expect(input.zones.length).toBe(1)
    expect(input.zoneAliases['urb-gallipont']).toContain('Gallipont')
  })

  it('a supplement POI resolves a contract title via resolvePlace', () => {
    const m = resolvePlace(
      foldTitle('Reforma del Mercat Municipal por procedimiento abierto'),
      candidates,
    )
    expect(m?.name).toBe('Mercat Municipal')
    expect(m?.point).toEqual([39.544, -0.575])
  })

  it('an alias resolves through matchNameToGazetteer (the LLM name path)', () => {
    const m = matchNameToGazetteer('Castillo de Riba-roja', candidates)
    expect(m?.point).toEqual([39.5442, -0.5735])
  })

  it('a supplement urbanización resolves via its alias needle', () => {
    const m = resolvePlace(foldTitle('obras de alumbrado en Gallipont fase 2'), candidates)
    expect(m?.kind).toBe('urbanizacion')
    expect(m?.point).toEqual([39.52, -0.52])
  })
})
