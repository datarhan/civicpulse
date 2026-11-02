import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseRibalicitaContracts, sinAdjudicacionesRepetidas } from '../src/scraper/tenders'
import {
  validateContractCorrections,
  retirarRepeticiones,
  evaluarRepeticiones,
  type ContractCorrections,
  type RepeticionContrato,
} from '../src/scraper/contract-corrections'
import { procurementStatusKind } from '../src/lib/contract-status.js'

/**
 * 196/2023: una adjudicación que Gobierto publica en dos filas que no dicen lo mismo.
 *
 * El taller de fotografía de la escuela de adultos, derivado del sistema dinámico
 * ESDA2/2022, sale en dos filas con el mismo enlace, adjudicataria (una persona
 * física) e importe, 1.000 € sin IVA: `contract_id` 4398563 trae el lote 3, ninguna
 * fecha de adjudicación y un plazo de 1.095 días; `contract_id` 10554489, el lote en
 * blanco, la adjudicación del 19-04-2023 y 30 días. La regla automática no las funde
 * a propósito, porque difieren en el lote, el plazo y el inicio.
 *
 * El anuncio, leído el 2026-11-02 en la Plataforma, es el único documento del
 * expediente y trae UN resultado: 1.000 € a esa persona, «1 Mes(es)», «30 horas a
 * desarrollar en el curso escolar de 2022-2023». Lo archiva bajo la categoría
 * 80000000 del sistema dinámico, que el mismo anuncio numera como la 3: el «lote 3»
 * de Gobierto es la categoría de esta adjudicación, no un segundo lote. Y 1.088,30 €
 * de presupuesto base no caben dos adjudicaciones de 1.000 €.
 *
 * Así que una de las dos filas se retira, y como nombra a una persona y lo decide
 * alguien con el anuncio delante, la retira una entrada firmada de
 * `contract-corrections.json`, no la regla. Las fixtures del anuncio son el texto y
 * un extracto del XML tal cual, salvo el NIF de la adjudicataria, que se quita.
 */
const CSV = readFileSync(resolve('tests/fixtures/ribalicita_contratos_2026-11-01.csv'), 'utf8')
const AVISO = readFileSync(
  resolve('tests/fixtures/placsp_196-2023_adjudicacion_2026-11-02.txt'),
  'utf8',
)
const XML = readFileSync(
  resolve('tests/fixtures/placsp_196-2023_adjudicacion_2026-11-02.xml'),
  'utf8',
)
const ENLACE =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=NhvbGm6OZ9xvYnTkQN0%2FZA%3D%3D'
const llano = (s: string) => s.replace(/\s+/g, ' ').trim()

const contratos = parseRibalicitaContracts(CSV)
const trasLaRegla = sinAdjudicacionesRepetidas(contratos).contratos
const porClave = (lista: typeof contratos, clave: string) =>
  lista.find((c) => c.sourceRowId === clave)
const [LOTE_3, EN_BLANCO] = [porClave(contratos, '4398563')!, porClave(contratos, '10554489')!]

function repeticion(parcial: Partial<RepeticionContrato> = {}): RepeticionContrato {
  return {
    permalink: ENLACE,
    lote: 3,
    sourceRowId: '4398563',
    id: '1794430#4398563',
    queda: { lote: 0, sourceRowId: '10554489', id: '1794430#10554489' },
    importeSinIva: 1000,
    assignee: 'Fernando Dario Cardozo',
    motivo:
      'El anuncio trae una sola adjudicación, bajo la categoría 3 del sistema dinámico, y Gobierto la publica también como lote 3 sin fecha y con otro plazo.',
    source: {
      title: 'PLACSP · Anuncio de adjudicación, expediente 196/2023',
      url: ENLACE,
      date: '2023-04-19',
      quote: 'Importe total ofertado (sin impuestos) 1.000 EUR.',
    },
    curatedBy: 'Curadora de prueba',
    curatedAt: '2026-11-02',
    ...parcial,
  }
}
const fichero = (...r: RepeticionContrato[]): ContractCorrections => ({
  note: 'Correcciones de prueba del registro de contratos.',
  corrections: [],
  repeticiones: r,
})

describe('el anuncio: una sola adjudicación', () => {
  it('mide algo: las dos filas están en la fixture de Gobierto', () => {
    expect(LOTE_3).toBeDefined()
    expect(EN_BLANCO).toBeDefined()
  })

  it('el XML trae un único resultado, de 1.000 € sin IVA', () => {
    expect(XML.match(/<cac:TenderResult\b/g)).toHaveLength(1)
    expect(XML).toMatch(/<cbc:TaxExclusiveAmount currencyID="EUR">1000<\/cbc:TaxExclusiveAmount>/)
  })

  it('el «lote 3» de Gobierto es la categoría bajo la que el anuncio archiva esa adjudicación', () => {
    const categoria = XML.match(
      /<cbc:ProcurementProjectDPSCategoryID>(\d+)<\/cbc:ProcurementProjectDPSCategoryID>/,
    )![1]
    const numeros = [
      ...XML.matchAll(/<cbc:ID schemeName="NUM_CATEGORIA">(\d+)<\/cbc:ID>\s*<cbc:Name>(\d+)-/g),
    ].map(([, n, cpv]) => [cpv, Number(n)])
    expect(numeros).toHaveLength(3)
    expect(new Map(numeros as [string, number][]).get(categoria)).toBe(LOTE_3.batchNumber)
  })

  it('el plazo del anuncio es el de la fila fechada, no el de la del lote 3', () => {
    expect(llano(AVISO)).toContain('Plazo de Ejecución 1 Mes(es)')
    expect(llano(AVISO)).toContain('30 horas a desarrollar en el curso escolar de 2022-2023')
    expect(EN_BLANCO.duration).toBe(30)
    expect(LOTE_3.duration).toBe(1095)
  })

  it('el presupuesto base no da para dos adjudicaciones de esas', () => {
    expect(llano(AVISO)).toContain('Importe (sin impuestos) 1.088,3 EUR.')
    expect(LOTE_3.finalAmountNoTaxes + EN_BLANCO.finalAmountNoTaxes).toBeGreaterThan(1088.3)
  })

  it('las dos filas: mismo enlace, adjudicataria, importe y estado comprometido', () => {
    for (const c of [LOTE_3, EN_BLANCO]) {
      expect(c.permalink).toBe(ENLACE)
      expect(llano(AVISO)).toContain(c.assignee!)
      expect(c.finalAmountNoTaxes).toBe(1000)
      expect(procurementStatusKind(c.status)).toBe('committed')
    }
  })

  it('la regla automática no las funde: eso lo decide una persona', () => {
    expect(porClave(trasLaRegla, '4398563')).toBeDefined()
    expect(porClave(trasLaRegla, '10554489')).toBeDefined()
  })
})

describe('el validador, con repeticiones', () => {
  it('admite una repetición citada y firmada', () => {
    expect(() => validateContractCorrections(fichero(repeticion()))).not.toThrow()
  })

  it('un fichero sin lista de repeticiones sigue valiendo', () => {
    const { repeticiones: _, ...sinLista } = fichero()
    expect(() => validateContractCorrections(sinLista)).not.toThrow()
  })

  it('exige la cita del anuncio, la clave de las dos filas y la firma', () => {
    const sinCita = repeticion()
    sinCita.source = { ...sinCita.source, quote: 'corta' }
    expect(() => validateContractCorrections(fichero(sinCita))).toThrow(/quote/)
    expect(() => validateContractCorrections(fichero(repeticion({ sourceRowId: '' })))).toThrow(
      /sourceRowId/,
    )
    const sinQueda = repeticion({ queda: { lote: 0, sourceRowId: '', id: 'x' } })
    expect(() => validateContractCorrections(fichero(sinQueda))).toThrow(/queda/)
    expect(() => validateContractCorrections(fichero(repeticion({ curatedBy: '' })))).toThrow(
      /curatedBy/,
    )
  })

  it('la que queda no puede ser la que se retira', () => {
    const misma = repeticion({ queda: { lote: 3, sourceRowId: '4398563', id: '1794430#4398563' } })
    expect(() => validateContractCorrections(fichero(misma))).toThrow(/queda/)
  })

  it('exige el importe que repiten, mayor que cero', () => {
    expect(() => validateContractCorrections(fichero(repeticion({ importeSinIva: 0 })))).toThrow(
      /importeSinIva/,
    )
  })

  it('no tiene dónde poner un juicio', () => {
    const conJuicio = { ...repeticion(), severity: 'alta' }
    expect(() => validateContractCorrections(fichero(conJuicio as never))).toThrow(/juicio/)
  })

  it('no retira dos veces la misma fila, ni la que otra entrada deja en pie', () => {
    expect(() => validateContractCorrections(fichero(repeticion(), repeticion()))).toThrow(
      /duplicada/,
    )
    const encadenada = repeticion({
      sourceRowId: '10554489',
      id: '1794430#10554489',
      lote: 0,
      queda: { lote: 0, sourceRowId: '999', id: '1794430#999' },
    })
    expect(() => validateContractCorrections(fichero(repeticion(), encadenada))).toThrow(
      /queda en pie/,
    )
  })
})

describe('retirar una repetición firmada', () => {
  it('retira el lote 3 y deja la fila fechada, con la marca de la corrección', () => {
    const r = retirarRepeticiones(trasLaRegla, fichero(repeticion()))
    expect(r.contracts).toHaveLength(trasLaRegla.length - 1)
    expect(porClave(r.contracts, '4398563')).toBeUndefined()
    expect(porClave(r.contracts, '10554489')).toEqual(porClave(trasLaRegla, '10554489'))
    expect(r.retiradas).toEqual([
      {
        id: LOTE_3.id,
        sourceRowId: '4398563',
        queda: EN_BLANCO.id,
        url: ENLACE,
        motivo: repeticion().motivo,
        curatedAt: '2026-11-02',
      },
    ])
    expect(r.sobran).toEqual([])
  })

  it('lo demás queda intacto y en su orden, y no muta la entrada', () => {
    const antes = trasLaRegla.length
    const r = retirarRepeticiones(trasLaRegla, fichero(repeticion()))
    expect(r.contracts).toEqual(trasLaRegla.filter((c) => c.sourceRowId !== '4398563'))
    expect(trasLaRegla).toHaveLength(antes)
  })

  it('busca por la clave de la fuente, no por el id, que puede cambiar', () => {
    const reetiquetadas = trasLaRegla.map((c) =>
      c.sourceRowId === '4398563' ? { ...c, id: 'otro-id#4398563' } : c,
    )
    const r = retirarRepeticiones(reetiquetadas, fichero(repeticion()))
    expect(r.retiradas.map((x) => x.id)).toEqual(['otro-id#4398563'])
  })

  it('sin correcciones no retira nada', () => {
    expect(retirarRepeticiones(trasLaRegla, null).contracts).toEqual(trasLaRegla)
  })

  it('si la fila ya no está, sobra', () => {
    const sin = trasLaRegla.filter((c) => c.sourceRowId !== '4398563')
    const r = retirarRepeticiones(sin, fichero(repeticion()))
    expect(r.sobran.map((s) => s.porque)).toEqual(['sin-fila'])
    expect(r.contracts).toEqual(sin)
  })

  it('si falta la que queda, no retira nada: la adjudicación no puede quedarse sin fila', () => {
    const sin = trasLaRegla.filter((c) => c.sourceRowId !== '10554489')
    const r = retirarRepeticiones(sin, fichero(repeticion()))
    expect(r.sobran.map((s) => s.porque)).toEqual(['sin-la-que-queda'])
    expect(r.contracts).toEqual(sin)
  })

  describe('si las filas ya no repiten lo firmado, no retira nada', () => {
    const cambia = (clave: string, cambio: Partial<(typeof contratos)[number]>) =>
      trasLaRegla.map((c) => (c.sourceRowId === clave ? { ...c, ...cambio } : c))
    const casos: [string, typeof trasLaRegla][] = [
      ['otro importe en la que se retira', cambia('4398563', { finalAmountNoTaxes: 900 })],
      ['otro importe en la que queda', cambia('10554489', { finalAmountNoTaxes: 900 })],
      ['otra adjudicataria', cambia('4398563', { assignee: 'OTRA PERSONA' })],
      ['otro lote', cambia('4398563', { batchNumber: 2 })],
      ['la que queda, en otro lote', cambia('10554489', { batchNumber: 1 })],
      ['un estado no comprometido', cambia('10554489', { status: 'void' })],
      ['otro enlace', cambia('4398563', { permalink: 'https://x/otro' })],
    ]
    for (const [caso, filas] of casos)
      it(caso, () => {
        const r = retirarRepeticiones(filas, fichero(repeticion()))
        expect(r.retiradas).toEqual([])
        expect(r.contracts).toEqual(filas)
        expect(r.sobran.map((s) => s.porque)).toEqual([
          caso === 'otro enlace' ? 'sin-fila' : 'ya-no-repiten',
        ])
      })
  })
})

describe('la guarda, con repeticiones', () => {
  const r = retirarRepeticiones(trasLaRegla, fichero(repeticion()))
  const snap = (generatedAt: string, extra: Record<string, unknown> = {}) => ({
    generatedAt,
    contracts: r.contracts,
    contractCorrections: { repeticionesRetiradas: r.retiradas, repeticionesSobrantes: r.sobran },
    ...extra,
  })

  it('aplicada', () => {
    const [e] = evaluarRepeticiones(fichero(repeticion()), snap('2026-11-03T03:00:00Z'))
    expect(e.desenlace).toBe('aplicada')
  })

  it('antes de la primera pasada posterior a la firma: pendiente, no rojo', () => {
    const viejo = { generatedAt: '2026-11-01T09:00:00Z', contracts: trasLaRegla }
    const [e] = evaluarRepeticiones(fichero(repeticion()), viejo)
    expect(e.desenlace).toBe('pendiente')
  })

  it('una pasada posterior que no la retiró: no-aplicada', () => {
    const sinCapa = { generatedAt: '2026-11-03T03:00:00Z', contracts: trasLaRegla }
    const [e] = evaluarRepeticiones(fichero(repeticion()), sinCapa)
    expect(e.desenlace).toBe('no-aplicada')
  })

  it('la que dice retirada pero sigue en el registro: no-aplicada', () => {
    const [e] = evaluarRepeticiones(
      fichero(repeticion()),
      snap('2026-11-03T03:00:00Z', { contracts: trasLaRegla }),
    )
    expect(e.desenlace).toBe('no-aplicada')
  })

  it('la que la pasada declaró sobrante: sobra', () => {
    const sobrante = retirarRepeticiones(
      trasLaRegla.filter((c) => c.sourceRowId !== '4398563'),
      fichero(repeticion()),
    )
    const [e] = evaluarRepeticiones(
      fichero(repeticion()),
      snap('2026-11-03T03:00:00Z', {
        contracts: sobrante.contracts,
        contractCorrections: { repeticionesRetiradas: [], repeticionesSobrantes: sobrante.sobran },
      }),
    )
    expect(e).toMatchObject({ desenlace: 'sobra', detalle: 'sin-fila' })
  })
})

describe('el fichero curado comiteado', () => {
  // Hasta que una persona la firme no hay entrada: la prueba sale «skipped», no verde.
  const curado = validateContractCorrections(
    JSON.parse(readFileSync(resolve('public/data/contract-corrections.json'), 'utf8')),
  )
  const firmada = (curado.repeticiones ?? []).find((r) => r.permalink === ENLACE)

  it.skipIf(!firmada)(
    'la de 196/2023 cita literalmente su anuncio y nombra a su adjudicataria',
    () => {
      expect(llano(AVISO)).toContain(llano(firmada!.source.quote))
      expect(llano(AVISO)).toContain(llano(firmada!.assignee))
    },
  )

  it.skipIf(!firmada)('retira el lote 3 y deja la fila fechada, en la fixture de Gobierto', () => {
    const r = retirarRepeticiones(trasLaRegla, curado)
    expect(r.retiradas.map((x) => x.sourceRowId)).toEqual(['4398563'])
    expect(r.retiradas[0].queda).toBe(EN_BLANCO.id)
    expect(r.sobran).toEqual([])
  })
})

describe('scrape-tenders', () => {
  const script = readFileSync(resolve('scripts/scrape-tenders.ts'), 'utf8')

  it('retira las repeticiones firmadas y las publica en su bloque', () => {
    expect(script).toMatch(/retirarRepeticiones\(/)
    expect(script).toMatch(/repeticionesRetiradas:/)
    expect(script).toMatch(/repeticionesSobrantes:/)
  })

  it('la medida de identidad no las cuenta como bajas de la fuente', () => {
    expect(script).toMatch(
      /sinFilasRetiradas\(\s*await snapshotAnterior\(\),\s*\[\s*\.\.\.repetidas,\s*\.\.\.firmadas\.retiradas\s*\]/,
    )
  })
})
