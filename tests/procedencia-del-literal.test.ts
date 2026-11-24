/**
 * La marca de procedencia de cada declaración servida: dónde consta su literal.
 *
 * Hasta el 23-11-2026 /declaraciones y el registro de /plenos/:id imprimían
 * entre comillas 995 literales que sólo constaban en la transcripción que se
 * sustituyó, sin marca, mientras /hallazgos marcaba la misma condición en sus
 * citas. Ahora la puerta estampa el estado en cada servida, con el vocabulario
 * de /hallazgos, y una que no esté en la vigente deja de destacarse como fundada.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { procedenciaDelCorpus } from '../scripts/lib/procedencia-del-corpus'
import {
  classifyClaimVisibility,
  gateItemsForPublic,
  type ClaimVisibility,
} from '../src/scraper/claim-public-gate'
import { procedenciaDeDeclaracion, type ProvenanceOutcome } from '../src/scraper/claim-provenance'
import { assessTranscriptSanity } from '../src/scraper/transcript-sanity'
import {
  QUOTE_PROVENANCE_STATUS_IDS,
  type QuoteProvenanceStatus,
} from '../src/scraper/quote-provenance'

describe('procedenciaDeDeclaracion', () => {
  it('traduce cada desenlace al vocabulario de /hallazgos', () => {
    const casos: [ProvenanceOutcome, boolean, boolean, QuoteProvenanceStatus | null][] = [
      ['vigente', true, false, 'en-vigente'],
      ['vigente', false, false, 'en-vigente'],
      ['solo-superseded', true, false, 'solo-en-sustituida'],
      ['solo-superseded', false, false, 'sin-determinar'],
      ['sin-transcripcion', true, false, 'sin-determinar'],
      ['sin-rastro', true, false, null],
      // Vigente dudosa: lo que consta en algún sitio no se coteja contra ella.
      ['vigente', true, true, 'transcripcion-dudosa'],
      ['solo-superseded', true, true, 'transcripcion-dudosa'],
      ['solo-superseded', false, true, 'transcripcion-dudosa'],
      // Lo que no consta en ninguna se sigue reteniendo, dudosa o no.
      ['sin-rastro', true, true, null],
    ]
    for (const [d, comparable, dudosa, esperado] of casos) {
      expect(procedenciaDeDeclaracion(d, comparable, dudosa)).toBe(esperado)
    }
  })
})

describe('procedenciaDelCorpus · procedenciaDelLiteral', () => {
  const LITERAL = 'que el polideportivo se terminará antes del verano según el contrato firmado'
  const OTRA = 'el pleno aprobó por unanimidad la moción sobre el transporte escolar de la comarca'
  const relleno = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')
  const item = (id: string, plenoId: string, verbatim: string) => ({
    claim: { id, plenoId, verbatim, type: 'cita_obra' },
    verification: { verdict: 'sin-datos' },
  })
  // La vigente de «corta» pesa MÁS en bytes (marcas de diarización, «·» de dos
  // bytes) y dice MENOS palabras que su sustituida: con bytes saldría comparable.
  const CORTA_VIGENTE = `[1.0 → 2.0] (SPEAKER_00) ${OTRA} ${'·'.repeat(150)}`
  const CORTA_SUSTITUIDA = `${OTRA} ${LITERAL} ${relleno(6)}`
  const textos: Record<string, { vigente: string | null; sustituidas: string[] }> = {
    larga: { vigente: `${OTRA} ${relleno(80)}`, sustituidas: [`${LITERAL} ${OTRA}`] },
    corta: { vigente: CORTA_VIGENTE, sustituidas: [CORTA_SUSTITUIDA] },
    nada: { vigente: null, sustituidas: [LITERAL] },
  }
  const lectores = {
    leerVigente: (p: string) => textos[p]?.vigente ?? null,
    leerSustituidas: (p: string) => textos[p]?.sustituidas ?? [],
  }

  it('marca cada declaración según dónde consta, y deja sin marca la que no consta', () => {
    expect(Buffer.byteLength(CORTA_VIGENTE)).toBeGreaterThan(Buffer.byteLength(CORTA_SUSTITUIDA))
    const items = [
      item('larga-1', 'larga', OTRA),
      item('larga-2', 'larga', LITERAL),
      item('corta-1', 'corta', LITERAL),
      item('nada-1', 'nada', LITERAL),
      // Relleno que consta en la vigente: el techo de retirada mide sobre el
      // corpus, y una sola sin rastro entre cinco lo dispararía.
      ...Array.from({ length: 60 }, (_, i) => item(`larga-r${i}`, 'larga', OTRA)),
      item('larga-3', 'larga', 'esto no lo dijo nadie en ninguna de las dos pasadas del pleno'),
    ]
    const r = procedenciaDelCorpus(items, lectores)
    expect(r.procedenciaDelLiteral.get('larga-1')).toBe('en-vigente')
    expect(r.procedenciaDelLiteral.get('larga-2')).toBe('solo-en-sustituida')
    expect(r.procedenciaDelLiteral.get('corta-1')).toBe('sin-determinar')
    expect(r.procedenciaDelLiteral.get('nada-1')).toBe('sin-determinar')
    // La sin rastro la retiene la puerta: no lleva marca.
    expect(r.sinProcedencia.has('larga-3')).toBe(true)
    expect(r.procedenciaDelLiteral.has('larga-3')).toBe(false)
  })

  it('una sesión cuya vigente no pasa la guarda de calidad marca dudosas las que constan', () => {
    // La forma real de 1237hbp: bloques de 30 s sin hablantes, con «La Lucha de
    // los Malditos» repetida, y el literal ahí dentro, palabra por palabra.
    const lineas = [
      ...Array.from(
        { length: 20 },
        (_, i) => `[${i * 30}.0 → ${i * 30 + 30}.0] La Lucha de los Malditos`,
      ),
      ...Array.from(
        { length: 40 },
        (_, i) => `[${600 + i * 30}.0 → ${630 + i * 30}.0] ${relleno(12)} ${i}`,
      ),
      `[2000.0 → 2030.0] ${LITERAL}`,
      `[2030.0 → 2060.0] ${OTRA}`,
    ]
    const dudosa = lineas.join('\n')
    expect(assessTranscriptSanity(dudosa).ok).toBe(false)
    const conDudosa = {
      leerVigente: (p: string) => (p === 'dudosa' ? dudosa : lectores.leerVigente(p)),
      leerSustituidas: (p: string) => (p === 'dudosa' ? [OTRA] : lectores.leerSustituidas(p)),
    }
    const items = [
      item('dudosa-1', 'dudosa', LITERAL),
      item('dudosa-2', 'dudosa', OTRA),
      ...Array.from({ length: 60 }, (_, i) => item(`larga-r${i}`, 'larga', OTRA)),
    ]
    const r = procedenciaDelCorpus(items, conDudosa)
    expect(r.procedenciaDelLiteral.get('dudosa-1')).toBe('transcripcion-dudosa')
    expect(r.procedenciaDelLiteral.get('dudosa-2')).toBe('transcripcion-dudosa')
    // El par de control: la otra sesión, con vigente sana, no cambia.
    expect(r.procedenciaDelLiteral.get('larga-r0')).toBe('en-vigente')
  })
})

describe('la puerta con la procedencia del literal', () => {
  const fundada = (id: string) =>
    ({
      claim: { id, plenoId: 'a', type: 'cita_obra', verbatim: 'lo que se dijo aquella tarde' },
      verification: { verdict: 'verificado', confidence: 0.9, checkedAgainst: ['tenders'] },
    }) as never

  it('una fundada sólo se destaca si su literal está en la vigente', () => {
    // El par de control: la MISMA fila se destaca con `en-vigente` y sin respuesta.
    expect(classifyClaimVisibility(fundada('a-1'))).toBe<ClaimVisibility>('shown')
    expect(
      classifyClaimVisibility(fundada('a-1'), { procedenciaDelLiteral: 'en-vigente' }),
    ).toBe<ClaimVisibility>('shown')
    for (const p of ['solo-en-sustituida', 'sin-determinar', 'transcripcion-dudosa'] as const) {
      expect(classifyClaimVisibility(fundada('a-1'), { procedenciaDelLiteral: p })).toBe('toggle')
    }
  })

  it('estampa la marca en cada servida y se niega a servir una sin marca', () => {
    const items = [fundada('a-1'), fundada('a-2')]
    const mapa = new Map<string, QuoteProvenanceStatus>([
      ['a-1', 'en-vigente'],
      ['a-2', 'solo-en-sustituida'],
    ])
    const out = gateItemsForPublic(items, { procedenciaDelLiteral: mapa })
    expect(out.map((i) => [i.claim.id, i.visibility, i.procedencia])).toEqual([
      ['a-1', 'shown', 'en-vigente'],
      ['a-2', 'toggle', 'solo-en-sustituida'],
    ])
    expect(() =>
      gateItemsForPublic(items, { procedenciaDelLiteral: new Map([['a-1', 'en-vigente']]) }),
    ).toThrow(/a-2/)
  })
})

describe('lo publicado lleva la marca', () => {
  const DIR = 'public/data/pleno-claims'
  const manifest = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8'))
  const items = readdirSync(DIR)
    .filter((f) => f !== 'index.json' && f.endsWith('.json'))
    .flatMap(
      (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')).items as Record<string, unknown>[],
    )

  it('cada servida lleva un estado del vocabulario, y el recuento del manifiesto es el de los trozos', () => {
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBe(manifest.totals.items)
    const cuenta: Record<string, number> = {}
    for (const it of items) {
      expect(QUOTE_PROVENANCE_STATUS_IDS).toContain(it.procedencia)
      cuenta[it.procedencia as string] = (cuenta[it.procedencia as string] ?? 0) + 1
    }
    expect(cuenta).toEqual(manifest.totals.procedenciaDelLiteral)
  })

  it('ninguna se destaca como fundada sin estar en la vigente', () => {
    const destacadas = items.filter((it) => it.visibility === 'shown')
    expect(destacadas.length).toBeGreaterThan(0)
    expect(destacadas.filter((it) => it.procedencia !== 'en-vigente')).toEqual([])
  })
})
