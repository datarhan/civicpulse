/**
 * La fila de un contrato en la subida firmada dice qué es cada cifra y cada
 * fecha: una concesión no se «adjudica por» su valor estimado, el «con IVA»
 * sólo sale si el registro distingue los dos importes, y la fecha es la del
 * anuncio de adjudicación en la Plataforma, no la del acuerdo.
 *
 * El caso, en /declaraciones el 19-10-2026: la declaración k4olcs-101-cit-ddd6c4
 * (la aceptación de la propuesta de la mesa de contratación del agua) llevaba
 * la fila «adjudicado a HIDRAQUA … por 55.685.178,79 € con IVA el 06-08-2026».
 * Las tres cosas eran falsas como se leían:
 *
 *  · 55.685.178,79 € es el valor estimado de una concesión de 17 años (la
 *    ficha de PLACSP lo da como «Valor estimado del contrato», igual que el
 *    presupuesto base sin impuestos); impreso como precio de adjudicación se
 *    lee como un pago puntual mayor que el presupuesto municipal de un año.
 *  · El registro da el mismo número con IVA y sin IVA, así que «con IVA» no lo
 *    dice el registro.
 *  · El 06-08-2026 es el día en que se publicó el anuncio de adjudicación en la
 *    Plataforma (06/08/2026 10:55:01). El Pleno acordó adjudicar el 27-07-2026
 *    (public/data/reportajes/coste-efectivo.json, con el acta enlazada).
 *    Cotejado el 19-10-2026 en siete fichas de PLACSP de 2018 a 2026 (46717,
 *    4415701, 5054473, 54281, 962109, 1216657, 1794430): en las siete
 *    `awardDate` es el día de publicación del anuncio de adjudicación, y
 *    `formalizedDate` el del anuncio de formalización.
 *
 * Con las filas reales (tests/fixtures/subida-firmada-concesion_2026-10-19.json
 * y la de la concesión del 04-10-2026 en subida-firmada-registros_2026-10-04.json).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contractTermYears, isConcession } from '../src/lib/contract-status'
import { evidenciaDelRegistro, registroDeLaSubida } from '../src/scraper/subida-firmada'

const leer = (f: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', f), 'utf8'))

const HOY = leer('subida-firmada-concesion_2026-10-19.json')
const OCTUBRE = leer('subida-firmada-registros_2026-10-04.json')
const CORPUS_HOY = { tenders: HOY.tenders, bdns: HOY.bdns }
const CORPUS_OCTUBRE = { tenders: OCTUBRE.tenders, bdns: OCTUBRE.bdns }

const NBSP = ' '
const AGUA =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=pK1YW0Z3femXQV0WE7lYPw%3D%3D'
/** 31/2021, teatro inclusivo: el registro da 10.008 € con IVA y sin IVA. */
const TEATRO =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=2ICh5yiBO%2B17h85%2Fpmmsfw%3D%3D'
/** 36/2026, juegos del Parque Asunción: 40.727,10 € con IVA, 33.658,76 € sin IVA. */
const JUEGOS =
  'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=Dsw60vrWRmm5HQrHoP3G5A%3D%3D'

const filaReal = (corpus: { tenders: { contracts: { id: string }[] } }, id: string) => {
  const r = corpus.tenders.contracts.find((c) => c.id === id)
  if (!r) throw new Error(`la fila ${id} no está en el fixture`)
  return r
}

describe('la concesión del agua (46717) es una concesión, por su tipo', () => {
  it('el predicado que usa la fila la reconoce en la fila real, la de hoy y la del 04-10', () => {
    expect(isConcession(filaReal(HOY, '46717'))).toBe(true)
    expect(isConcession(filaReal(OCTUBRE, '46717'))).toBe(true)
    expect(contractTermYears(filaReal(HOY, '46717'))).toBe(17)
  })

  it('ningún otro contrato de los fixtures lo es', () => {
    const otros = [...HOY.tenders.contracts, ...OCTUBRE.tenders.contracts].filter(
      (r: { id: string }) => r.id !== '46717',
    )
    expect(otros.length).toBeGreaterThan(5)
    expect(otros.filter(isConcession)).toEqual([])
  })
})

describe('la fila de una concesión: valor estimado por todo su plazo, nunca precio de adjudicación', () => {
  it('la fila de hoy, entera', () => {
    const e = evidenciaDelRegistro({ enlace: AGUA, lote: null }, CORPUS_HOY)
    expect(e.snippet.length).toBeLessThanOrEqual(240)
    expect(
      e.snippet.endsWith(
        ' · expediente 27/2018 · concesión adjudicada a HIDRAQUA S.A.U · ' +
          `valor estimado por todo su plazo (17 años): 55.685.178,79${NBSP}€ · ` +
          'adjudicación publicada el 06-08-2026',
      ),
    ).toBe(true)
    expect(e.snippet).toMatch(/^contrato de concesión del servicio público de abastecimiento/)
  })

  it('no dice «por N €», ni «con IVA», ni «sin IVA», ni «adjudicado … el» con la fecha del anuncio', () => {
    for (const corpus of [CORPUS_HOY, CORPUS_OCTUBRE]) {
      const { snippet } = evidenciaDelRegistro({ enlace: AGUA, lote: null }, corpus)
      expect(snippet).not.toMatch(/ por [\d.,]+/)
      expect(snippet).not.toMatch(/IVA/)
      expect(snippet).not.toMatch(/adjudicad[oa][^·]* el 06-08-2026/)
      expect(snippet).toContain('adjudicación publicada el 06-08-2026')
      expect(snippet).toContain(`valor estimado por todo su plazo (17 años): 55.685.178,79${NBSP}€`)
    }
  })

  it('la fila del 04-10-2026 (adjudicataria con espacios dobles) dice lo mismo con su nombre', () => {
    const e = evidenciaDelRegistro({ enlace: AGUA, lote: null }, CORPUS_OCTUBRE)
    expect(e.snippet).toContain(
      'concesión adjudicada a HIDRAQUA GESTIÓN INTEGRAL DE AGUAS DE LEVANTE, S.A. · ' +
        `valor estimado por todo su plazo (17 años): 55.685.178,79${NBSP}€`,
    )
  })

  it('dice un importe —el valor estimado—, así que cuenta como registro con cifra', () => {
    expect(registroDeLaSubida({ enlace: AGUA, lote: null }, CORPUS_HOY).diceImporte).toBe(true)
  })

  it('en un lote, el valor estimado es el del expediente entero: la fila no dice importe', () => {
    // La fila real, partida en dos lotes: en un expediente con lotes Gobierto
    // repite el valor estimado de todo el expediente en cada uno (136/2025).
    const real = filaReal(HOY, '46717')
    const lotes = {
      tenders: {
        contracts: [
          { ...real, batchNumber: 1 },
          { ...real, id: '46717#1', batchNumber: 2 },
        ],
        tenders: HOY.tenders.tenders,
      },
      bdns: HOY.bdns,
    }
    const r = registroDeLaSubida({ enlace: AGUA, lote: 2 }, lotes)
    expect(r.fila.snippet).toContain('lote 2 del expediente 27/2018 · concesión adjudicada a')
    expect(r.fila.snippet).not.toMatch(/€/)
    expect(r.diceImporte).toBe(false)
  })
})

describe('«con IVA» sólo si el registro distingue los dos importes', () => {
  it('distintos: el importe con IVA, rotulado', () => {
    const e = evidenciaDelRegistro({ enlace: JUEGOS, lote: null }, CORPUS_OCTUBRE)
    expect(e.snippet).toContain(
      `adjudicado a URBEADAPTA S. L. por 40.727,10${NBSP}€ con IVA · adjudicación publicada el 08-09-2026`,
    )
  })

  it('iguales: la cifra sin rótulo de IVA', () => {
    const e = evidenciaDelRegistro({ enlace: TEATRO, lote: null }, CORPUS_HOY)
    expect(
      e.snippet.endsWith(
        ` · expediente 31/2021 · adjudicado a TOT ANIMACIÓ S.L. por 10.008,00${NBSP}€ · ` +
          'adjudicación publicada el 07-10-2021',
      ),
    ).toBe(true)
    expect(e.snippet).not.toMatch(/IVA/)
  })

  it('con uno solo de los dos: la cifra sin rótulo de IVA', () => {
    const real = filaReal(HOY, '1500923')
    for (const falta of ['finalAmount', 'finalAmountNoTaxes']) {
      const corpus = {
        tenders: {
          contracts: [{ ...real, [falta]: null }],
          tenders: HOY.tenders.tenders,
        },
        bdns: HOY.bdns,
      }
      const { snippet } = evidenciaDelRegistro({ enlace: TEATRO, lote: null }, corpus)
      expect(snippet).toContain(`por 10.008,00${NBSP}€ · adjudicación publicada el 07-10-2021`)
      expect(snippet).not.toMatch(/IVA/)
    }
  })
})

describe('la fecha es la del anuncio de adjudicación, y lo dice', () => {
  it('ninguna fila de contrato pega una fecha a «adjudicado … el»', () => {
    const corpus = CORPUS_OCTUBRE
    const enlaces = new Set<string>()
    for (const r of corpus.tenders.contracts as { permalink: string }[]) enlaces.add(r.permalink)
    let leidas = 0
    for (const enlace of enlaces) {
      let snippet: string
      try {
        snippet = evidenciaDelRegistro({ enlace, lote: null }, corpus).snippet
      } catch {
        continue // varios lotes, una licitación, un estado sin comprometer: lo prueba subida-firmada.test.ts
      }
      leidas++
      expect(snippet).not.toMatch(/adjudicad[oa][^·]* el \d\d-\d\d-\d{4}/)
      expect(snippet).toMatch(/ · adjudicación publicada el \d\d-\d\d-\d{4}$/)
    }
    // Que la prueba evaluó filas, y no salió verde por no leer ninguna.
    expect(leidas).toBeGreaterThanOrEqual(4)
  })
})
