import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRibalicitaContracts, sinAdjudicacionesRepetidas } from '../src/scraper/tenders'
import { esTituloCpv } from '../src/scraper/etiqueta-de-contrato'
import { registrarIdentidad, sinFilasRetiradas } from '../src/scraper/identidad-de-filas'

/**
 * Una adjudicación publicada dos veces se cuenta una.
 *
 * Gobierto repite algunas adjudicaciones en dos filas: mismo enlace, lote, fecha,
 * importe y adjudicataria, y distinta `contract_id`. Casi siempre una lleva el
 * objeto oficial y la otra una etiqueta CPV. Cotejadas el 2026-11-01 en la
 * Plataforma las siete que hay: cada expediente tiene un solo anuncio de
 * adjudicación y ningún lote, así que son una adjudicación, no dos contratos.
 * Sumaban 122.969,58 € sin IVA de más, a dos personas físicas entre ellas.
 *
 * La lista de abajo va escrita a mano a propósito: es lo que se cotejó, y una
 * regla que empiece a fundir otra cosa tiene que ponerse roja aquí.
 */
const CSV = readFileSync(join(__dirname, 'fixtures', 'ribalicita_contratos_2026-11-01.csv'), 'utf8')
const CONTRATOS = parseRibalicitaContracts(CSV)

const COTEJADAS = [
  { expediente: '43/2025 BSDA', queda: '1794430#8998505', retirada: '1794430#9062945' },
  { expediente: '95/2026 BSDA', queda: '4889055#10281213', retirada: '4889055#10278551' },
  { expediente: '88M/2025', queda: '9012998', retirada: '9023884' },
  { expediente: '103/2026 BSDA', queda: '4889055#10188881', retirada: '4889055#10184487' },
  { expediente: '98/2026 BSDA', queda: '4889055#10201361', retirada: '4889055#10198807' },
  { expediente: '86/2026 BSDA', queda: '1794430#10201842', retirada: '1794430#10198485' },
  { expediente: '102/2026', queda: '4889055#10259025', retirada: '4889055#10254997' },
]

const porRetirada = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
const ESPERADAS = COTEJADAS.map((p) => ({
  id: p.retirada,
  sourceRowId: p.retirada.split('#').pop(),
  queda: p.queda,
})).sort(porRetirada)
const fila = (id: string) => CONTRATOS.find((c) => c.id === id)!

describe('sinAdjudicacionesRepetidas — sobre el registro real', () => {
  const { contratos, repetidas } = sinAdjudicacionesRepetidas(CONTRATOS)

  it('mide algo: las siete parejas están en la fixture', () => {
    expect(CONTRATOS).toHaveLength(814)
    for (const p of COTEJADAS) {
      expect(fila(p.queda), p.queda).toBeDefined()
      expect(fila(p.retirada), p.retirada).toBeDefined()
    }
  })

  it('retira exactamente las siete cotejadas en la Plataforma', () => {
    expect([...repetidas].sort(porRetirada)).toEqual(ESPERADAS)
    expect(contratos).toHaveLength(CONTRATOS.length - COTEJADAS.length)
  })

  it('el dinero que sobraba es el que se midió', () => {
    const sobra = repetidas.reduce((s, r) => s + fila(r.id).finalAmountNoTaxes, 0)
    expect(sobra).toBeCloseTo(122969.58, 2)
  })

  it('se queda con el objeto oficial, no con la etiqueta CPV', () => {
    for (const p of COTEJADAS) expect(esTituloCpv(fila(p.queda).title), p.queda).toBe(false)
    const conEtiqueta = COTEJADAS.filter((p) => esTituloCpv(fila(p.retirada).title))
    expect(conEtiqueta).toHaveLength(5)
  })

  it('lo demás queda intacto y en su orden', () => {
    const retiradas = new Set(repetidas.map((r) => r.id))
    expect(contratos).toEqual(CONTRATOS.filter((c) => !retiradas.has(c.id)))
  })

  it('no depende del orden de las filas', () => {
    const alReves = sinAdjudicacionesRepetidas([...CONTRATOS].reverse())
    expect([...alReves.repetidas].sort(porRetirada)).toEqual(ESPERADAS)
  })

  it('pasarla dos veces no retira nada más', () => {
    expect(sinAdjudicacionesRepetidas(contratos).repetidas).toEqual([])
  })
})

describe('sinAdjudicacionesRepetidas — lo que no funde', () => {
  const ids = new Set(sinAdjudicacionesRepetidas(CONTRATOS).contratos.map((c) => c.id))

  it('lotes de igual precio: mismo enlace, fecha, importe y adjudicataria', () => {
    // 12/2018 y 182/2025 son lotes reales. 153/2025 BSDA (lote 3 y lote en blanco)
    // es dudoso y sin cotejar: distinto lote, así que aquí no se funde.
    const claves = ['125441', '125442', '8843225', '8843227', '8843228', '8843229']
    claves.push('9807364', '10560849')
    const lotes = CONTRATOS.filter((c) => claves.includes(c.id.split('#').pop() ?? c.id))
    expect(lotes).toHaveLength(claves.length)
    for (const c of lotes) expect(ids.has(c.id), c.id).toBe(true)
  })

  it('tres filas desiertas con un mismo enlace: no hay adjudicación que repetir', () => {
    for (const id of ['1794430#9116384', '1794430#9116385', '1794430#9116387']) {
      expect(fila(id).awardDate).toBeNull()
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('dos estados distintos no son la misma adjudicación', () => {
    const una = fila('4889055#10281213')
    const otra = { ...fila('4889055#10278551'), status: 'void' as const }
    expect(sinAdjudicacionesRepetidas([una, otra]).repetidas).toEqual([])
  })

  it('una adjudicataria escrita distinto tampoco: la regla se queda corta antes que fundir', () => {
    const una = fila('4889055#10281213')
    const otra = { ...fila('4889055#10278551'), assignee: 'OTRA EMPRESA SL' }
    expect(sinAdjudicacionesRepetidas([una, otra]).repetidas).toEqual([])
  })
})

describe('identidad de filas — lo que esta pasada retira no lo ha quitado la fuente', () => {
  const { contratos, repetidas } = sinAdjudicacionesRepetidas(CONTRATOS)
  const AYER = '2026-11-01T00:00:00.000Z'
  const HOY = '2026-11-02T00:00:00.000Z'

  it('mide algo: comparada tal cual, cada retirada sale como una baja', () => {
    const r = registrarIdentidad({ generatedAt: AYER, contracts: CONTRATOS }, HOY, contratos)
    expect(r.ultima).toMatchObject({ medida: true, bajas: COTEJADAS.length })
    expect(r.movimientos).toHaveLength(1)
  })

  it('la primera pasada tras retirarlas no anota ningún movimiento', () => {
    const anterior = sinFilasRetiradas({ generatedAt: AYER, contracts: CONTRATOS }, repetidas)
    const r = registrarIdentidad(anterior, HOY, contratos)
    expect(r.ultima).toMatchObject({
      medida: true,
      comparables: contratos.length,
      conservan: contratos.length,
      cambian: 0,
      bajas: 0,
      altas: 0,
    })
    expect(r.movimientos).toEqual([])
  })

  describe('si la gemela que queda pasa a ser la otra', () => {
    // La fila publicada pierde su objeto oficial y la retirada lo gana: quedan
    // las mismas dos filas de la fuente, y ninguna ha cambiado de clave.
    const [publicada, retirada] = ['4889055#10281213', '4889055#10278551']
    const titulos = new Map([
      [publicada, '71241000-Estudio de viabilidad.'],
      [retirada, 'Objeto oficial del contrato'],
    ])
    const siguiente = sinAdjudicacionesRepetidas(
      CONTRATOS.map((c) => ({ ...c, title: titulos.get(c.id) ?? c.title })),
    )
    const anterior = { generatedAt: AYER, contracts: contratos }

    it('mide algo: comparada tal cual, se lee como un cambio de clave', () => {
      expect(siguiente.repetidas.map((r) => r.id)).toContain(publicada)
      const r = registrarIdentidad(anterior, HOY, siguiente.contratos)
      expect(r.ultima).toMatchObject({ medida: true, cambian: 1 })
    })

    it('no desmiente la clave ni anota un movimiento', () => {
      const r = registrarIdentidad(
        sinFilasRetiradas(anterior, siguiente.repetidas),
        HOY,
        siguiente.contratos,
      )
      expect(r.ultima).toMatchObject({ medida: true, cambian: 0, bajas: 0, altas: 1 })
      expect(r.movimientos).toEqual([])
    })
  })

  it('conserva lo demás del snapshot, con su historial', () => {
    const doc = {
      generatedAt: AYER,
      contracts: CONTRATOS,
      identidadDeFilas: registrarIdentidad(null, AYER, CONTRATOS),
    }
    const r = sinFilasRetiradas(doc, repetidas)
    expect(r?.generatedAt).toBe(AYER)
    expect(r?.identidadDeFilas).toBe(doc.identidadDeFilas)
    expect(r?.contracts).toHaveLength(CONTRATOS.length - COTEJADAS.length)
  })

  it('sin snapshot anterior sigue sin haber con qué comparar', () => {
    expect(sinFilasRetiradas(null, repetidas)).toBeNull()
  })

  it('una fila sin clave no se toma por una retirada sin clave', () => {
    const contracts = [{ ...fila('9012998'), sourceRowId: null }]
    expect(sinFilasRetiradas({ contracts }, [{ sourceRowId: null }])?.contracts).toEqual(contracts)
  })

  it('scrape-tenders le pasa a la medida el snapshot sin las retiradas', () => {
    const script = readFileSync(join(__dirname, '..', 'scripts', 'scrape-tenders.ts'), 'utf8')
    expect(script).toMatch(/registrarIdentidad\(\s*sinFilasRetiradas\(/)
  })
})

describe('esTituloCpv', () => {
  it('reconoce la etiqueta y deja pasar un título', () => {
    expect(
      esTituloCpv('71241000-Estudio de viabilidad, servicios de asesoramiento, análisis.'),
    ).toBe(true)
    expect(esTituloCpv('Contrato para el servicio de redacción de los estudios previos')).toBe(
      false,
    )
    expect(esTituloCpv('')).toBe(false)
    expect(esTituloCpv(null)).toBe(false)
  })
})
