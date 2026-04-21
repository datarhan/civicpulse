import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePvpc,
  parseCarburantesMunicipio,
  parseEcbSdmxObservations,
  parseInIpc,
  parseAemetAvisosHtml,
  parseDgtDatex2,
} from '../src/scraper/spain-ticker'

const FIX = join(__dirname, 'fixtures', 'spain-ticker')
const read = (f: string) => readFileSync(join(FIX, f), 'utf8')

describe('spain-ticker · REE PVPC (Luz)', () => {
  it('parses the 24-hour PVPC curve from a real REE payload', () => {
    const today = parsePvpc(read('ree_pvpc_2026-04-21.json'))
    expect(today.ok).toBe(true)
    expect(today.hourlyCurve).toBeDefined()
    expect(today.hourlyCurve!.length).toBe(24)
    // REE returns €/MWh — the parser converts to €/kWh (divide by 1000)
    for (const v of today.hourlyCurve!) {
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(2) // €/kWh sanity bound
    }
  })

  it('reports the min + max of the day + a current-hour value', () => {
    const snap = parsePvpc(read('ree_pvpc_2026-04-21.json'))
    expect(snap.dayMin).toBeGreaterThan(0)
    expect(snap.dayMax).toBeGreaterThan(snap.dayMin!)
    expect(snap.currentValue).toBeGreaterThan(0)
    expect(snap.currentHour).toBeGreaterThanOrEqual(0)
    expect(snap.currentHour).toBeLessThan(24)
  })

  it('computes a day-over-day average delta when passed yesterday + today', () => {
    const snap = parsePvpc(read('ree_pvpc_2026-04-21.json'), {
      previousDayRaw: read('ree_pvpc_2026-04-20.json'),
    })
    expect(typeof snap.deltaVsYesterdayPct).toBe('number')
    expect(Number.isFinite(snap.deltaVsYesterdayPct!)).toBe(true)
  })

  it('reports ok:false when the payload has no PVPC series', () => {
    const snap = parsePvpc('{"included":[]}')
    expect(snap.ok).toBe(false)
    expect(snap.error).toBeTruthy()
  })
})

describe('spain-ticker · Carburantes (Gasolina / Diésel)', () => {
  it('extracts the per-municipio price list from Minetur JSON', () => {
    const snap = parseCarburantesMunicipio(read('carburantes_riba-roja_2026-04-21.json'))
    expect(snap.ok).toBe(true)
    expect(snap.stationCount).toBeGreaterThanOrEqual(2)
  })

  it('averages Gasolina 95 E5 across stations with prices (comma decimal honored)', () => {
    const snap = parseCarburantesMunicipio(read('carburantes_riba-roja_2026-04-21.json'))
    // real prices around 1.5 €/L — bound the sanity range
    expect(snap.gasolina95!).toBeGreaterThan(1.0)
    expect(snap.gasolina95!).toBeLessThan(2.5)
  })

  it('averages Gasoleo A with a reasonable bound', () => {
    const snap = parseCarburantesMunicipio(read('carburantes_riba-roja_2026-04-21.json'))
    expect(snap.diesel!).toBeGreaterThan(1.0)
    expect(snap.diesel!).toBeLessThan(2.5)
  })

  it('handles empty municipality result gracefully', () => {
    const snap = parseCarburantesMunicipio(
      '{"Fecha":"21/04/2026","ListaEESSPrecio":[],"ResultadoConsulta":"OK"}',
    )
    expect(snap.ok).toBe(false)
    expect(snap.stationCount).toBe(0)
  })
})

describe('spain-ticker · ECB SDMX (Euribor 12m & BCE MRO)', () => {
  it('extracts the latest observation from a real Euribor 12m SDMX payload', () => {
    const snap = parseEcbSdmxObservations(read('ecb_euribor_12m_2026-04-21.json'))
    expect(snap.ok).toBe(true)
    expect(snap.value).toBeGreaterThan(-1)
    expect(snap.value).toBeLessThan(10)
    expect(snap.asOf).toMatch(/^\d{4}-\d{2}/)
  })

  it('extracts the latest BCE main refinancing rate', () => {
    const snap = parseEcbSdmxObservations(read('ecb_mro_2026-04-21.json'))
    expect(snap.ok).toBe(true)
    // MRO is currently around 2.15%, bound loosely
    expect(snap.value).toBeGreaterThan(-1)
    expect(snap.value).toBeLessThan(10)
  })

  it('reports ok:false on a malformed SDMX payload', () => {
    expect(parseEcbSdmxObservations('{"dataSets":[]}').ok).toBe(false)
    expect(parseEcbSdmxObservations('not json').ok).toBe(false)
  })

  it('returns a small recent history series for sparklines', () => {
    const snap = parseEcbSdmxObservations(read('ecb_euribor_12m_2026-04-21.json'))
    expect(Array.isArray(snap.history)).toBe(true)
    expect(snap.history!.length).toBeGreaterThanOrEqual(6)
  })
})

describe('spain-ticker · INE IPC', () => {
  it('parses the latest IPC interanual observation', () => {
    const snap = parseInIpc(read('ine_ipc_2026-04-21.json'))
    expect(snap.ok).toBe(true)
    expect(snap.yoyChange).toBeGreaterThan(-5)
    expect(snap.yoyChange).toBeLessThan(20)
    expect(snap.period).toMatch(/^\d{4}-\d{2}$/)
  })

  it('returns a history array for sparkline rendering', () => {
    const snap = parseInIpc(read('ine_ipc_2026-04-21.json'))
    expect(Array.isArray(snap.history)).toBe(true)
    expect(snap.history!.length).toBeGreaterThanOrEqual(6)
    for (const p of snap.history!) {
      expect(p.period).toMatch(/^\d{4}-\d{2}$/)
      expect(typeof p.value).toBe('number')
    }
  })

  it('reports ok:false when no data', () => {
    expect(parseInIpc('{"Data":[]}').ok).toBe(false)
  })
})

describe('spain-ticker · AEMET avisos Valencia', () => {
  it('detects whether warnings are active for the province', () => {
    const snap = parseAemetAvisosHtml(read('aemet_valencia_2026-04-21.xml'))
    expect(snap.ok).toBe(true)
    // fixture captured on 2026-04-21 with active yellow warnings
    expect(snap.active).toBe(true)
    expect(['amarillo', 'naranja', 'rojo']).toContain(snap.highestLevel)
  })

  it('counts warnings per level', () => {
    const snap = parseAemetAvisosHtml(read('aemet_valencia_2026-04-21.xml'))
    expect(snap.counts).toBeDefined()
    expect(snap.counts!.amarillo + snap.counts!.naranja + snap.counts!.rojo).toBeGreaterThan(0)
  })

  it('returns active:false on an empty/no-warnings page', () => {
    const snap = parseAemetAvisosHtml(
      '<html><body><div>No hay avisos meteorológicos.</div></body></html>',
    )
    expect(snap.active).toBe(false)
    expect(snap.highestLevel).toBe(null)
  })
})

describe('spain-ticker · DGT DATEX II (tráfico)', () => {
  it('extracts incidents on Valencia-area roads', () => {
    const snap = parseDgtDatex2(read('dgt_datex2_2026-04-21.xml'), {
      roads: ['A-3', 'A-7', 'CV-35', 'V-30', 'V-31', 'V-11'],
    })
    expect(snap.ok).toBe(true)
    expect(snap.incidents.length).toBeGreaterThan(0)
    // every incident must carry a road name and a description
    for (const i of snap.incidents) {
      expect(i.road.length).toBeGreaterThan(0)
      expect(i.description.length).toBeGreaterThan(0)
    }
  })

  it('filters out incidents on unrelated roads', () => {
    const snap = parseDgtDatex2(read('dgt_datex2_2026-04-21.xml'), {
      roads: ['A-3', 'V-30'],
    })
    for (const i of snap.incidents) {
      expect(['A-3', 'V-30']).toContain(i.road)
    }
  })

  it('returns ok:true with empty list when no roads match', () => {
    const snap = parseDgtDatex2(read('dgt_datex2_2026-04-21.xml'), {
      roads: ['NONEXISTENT-999'],
    })
    expect(snap.ok).toBe(true)
    expect(snap.incidents.length).toBe(0)
  })
})
