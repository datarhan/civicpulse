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
 * Plataforma las ocho que hay: cada expediente tiene un solo anuncio de
 * adjudicación y ningún lote, así que son una adjudicación, no dos contratos.
 * Sumaban 137.209,58 € sin IVA de más, a tres personas físicas entre ellas. La
 * octava, 153/2025 BSDA, difiere en el lote: uno de sus dos renglones lo trae en
 * blanco, y el anuncio no nombra ninguno.
 *
 * Otras dos, 13/2026 BSDA y 110/2026 BSDA, difieren en la fecha: una fila sin
 * `id` de Gobierto, sin licitación y sin fecha de adjudicación, con una etiqueta
 * CPV por título, y la otra igual a ella en todo lo demás. Cotejadas el
 * 2026-11-02: un solo anuncio de adjudicación cada una (25-05-2026 y 01-07-2026)
 * y ningún lote. Sumaban 27.453,39 € sin IVA más.
 *
 * La lista de abajo va escrita a mano a propósito: es lo que se cotejó, y una
 * regla que empiece a fundir otra cosa tiene que ponerse roja aquí.
 */
const CSV = readFileSync(join(__dirname, 'fixtures', 'ribalicita_contratos_2026-11-01.csv'), 'utf8')
const CONTRATOS = parseRibalicitaContracts(CSV)

/** `clave` es la `contract_id` de la retirada cuando su id no la lleva dentro. */
const COTEJADAS: { expediente: string; queda: string; retirada: string; clave?: string }[] = [
  { expediente: '43/2025 BSDA', queda: '1794430#8998505', retirada: '1794430#9062945' },
  { expediente: '95/2026 BSDA', queda: '4889055#10281213', retirada: '4889055#10278551' },
  { expediente: '88M/2025', queda: '9012998', retirada: '9023884' },
  { expediente: '103/2026 BSDA', queda: '4889055#10188881', retirada: '4889055#10184487' },
  { expediente: '98/2026 BSDA', queda: '4889055#10201361', retirada: '4889055#10198807' },
  { expediente: '86/2026 BSDA', queda: '1794430#10201842', retirada: '1794430#10198485' },
  { expediente: '102/2026', queda: '4889055#10259025', retirada: '4889055#10254997' },
  { expediente: '153/2025 BSDA', queda: '1794430#9807364', retirada: '1794430#10560849' },
  {
    expediente: '13/2026 BSDA',
    queda: '1794430#10156778',
    retirada: 'auto-mse4o8',
    clave: '10149063',
  },
  {
    expediente: '110/2026 BSDA',
    queda: '1794430#10389866',
    retirada: 'auto-nnc0ia',
    clave: '10388860',
  },
]
const SIN_FECHA = COTEJADAS.filter((p) => p.clave)

const porRetirada = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
const ESPERADAS = COTEJADAS.map((p) => ({
  id: p.retirada,
  sourceRowId: p.clave ?? p.retirada.split('#').pop(),
  queda: p.queda,
})).sort(porRetirada)
const fila = (id: string) => CONTRATOS.find((c) => c.id === id)!

describe('sinAdjudicacionesRepetidas — sobre el registro real', () => {
  const { contratos, repetidas } = sinAdjudicacionesRepetidas(CONTRATOS)

  it('mide algo: las diez parejas están en la fixture', () => {
    expect(CONTRATOS).toHaveLength(814)
    for (const p of COTEJADAS) {
      expect(fila(p.queda), p.queda).toBeDefined()
      expect(fila(p.retirada), p.retirada).toBeDefined()
    }
  })

  it('retira exactamente las diez cotejadas en la Plataforma', () => {
    expect([...repetidas].sort(porRetirada)).toEqual(ESPERADAS)
    expect(contratos).toHaveLength(CONTRATOS.length - COTEJADAS.length)
  })

  it('el dinero que sobraba es el que se midió', () => {
    const sobra = repetidas.reduce((s, r) => s + fila(r.id).finalAmountNoTaxes, 0)
    expect(sobra).toBeCloseTo(137209.58 + 27453.39, 2)
  })

  it('se queda con el objeto oficial, no con la etiqueta CPV', () => {
    for (const p of COTEJADAS) expect(esTituloCpv(fila(p.queda).title), p.queda).toBe(false)
    const conEtiqueta = COTEJADAS.filter((p) => esTituloCpv(fila(p.retirada).title))
    expect(conEtiqueta).toHaveLength(7)
  })

  it('una fila sin fecha se funde con su gemela fechada, igual a ella en todo lo demás', () => {
    for (const p of SIN_FECHA) {
      const [queda, retirada] = [fila(p.queda), fila(p.retirada)]
      expect(retirada.awardDate, p.retirada).toBeNull()
      expect(queda.awardDate, p.queda).not.toBeNull()
      const resto = (c: typeof queda) => ({
        ...c,
        id: '',
        sourceRowId: '',
        title: '',
        awardDate: '',
      })
      expect(resto(retirada), p.expediente).toEqual(resto(queda))
    }
  })

  it('lo demás queda intacto y en su orden', () => {
    const retiradas = new Set(repetidas.map((r) => r.id))
    expect(contratos).toEqual(CONTRATOS.filter((c) => !retiradas.has(c.id)))
  })

  it('entre un lote en blanco y uno numerado queda el numerado, aunque su id ordene después', () => {
    // Los lotes 1, 2 y 4 de 153/2025 BSDA siguen publicados: el expediente se lee entero.
    const { id, batchNumber } = fila('1794430#9807364')
    expect(id.localeCompare('1794430#10560849')).toBeGreaterThan(0)
    expect(batchNumber).toBe(3)
    expect(contratos.find((c) => c.id === id)?.batchNumber).toBe(3)
  })

  it('no depende del orden de las filas', () => {
    const alReves = sinAdjudicacionesRepetidas([...CONTRATOS].reverse())
    expect([...alReves.repetidas].sort(porRetirada)).toEqual(ESPERADAS)
  })

  it('pasarla dos veces no retira nada más', () => {
    expect(sinAdjudicacionesRepetidas(contratos).repetidas).toEqual([])
  })
})

describe('sinAdjudicacionesRepetidas — sobre lo publicado', () => {
  // Las cifras de /contratos, el mapa y las adjudicatarias salen de este fichero:
  // si lo escribió una pasada sin la regla, la cuenta doble ya está publicada.
  const PUBLICADO = JSON.parse(
    readFileSync(join(__dirname, '..', 'public', 'data', 'tenders.json'), 'utf8'),
  ) as {
    contracts: typeof CONTRATOS
    contractCorrections: { adjudicacionesRepetidas: { id: string }[] }
  }

  it('mide algo: hay contratos y filas comprometidas sin fecha entre ellos', () => {
    expect(PUBLICADO.contracts.length).toBeGreaterThan(0)
    expect(PUBLICADO.contracts.some((c) => c.status === 'awarded' && !c.awardDate)).toBe(true)
  })

  it('no guarda nada que la regla retiraría todavía', () => {
    expect(sinAdjudicacionesRepetidas(PUBLICADO.contracts).repetidas).toEqual([])
  })

  it('lo que dice haber retirado no sigue en el registro', () => {
    const ids = new Set(PUBLICADO.contracts.map((c) => c.id))
    const retiradas = PUBLICADO.contractCorrections.adjudicacionesRepetidas
    expect(retiradas.length).toBeGreaterThan(0)
    for (const r of retiradas) expect(ids.has(r.id), r.id).toBe(false)
  })
})

describe('sinAdjudicacionesRepetidas — lo que no funde', () => {
  const ids = new Set(sinAdjudicacionesRepetidas(CONTRATOS).contratos.map((c) => c.id))

  it('lotes de igual precio: mismo enlace, fecha, importe y adjudicataria', () => {
    // 12/2018 y 182/2025 son lotes reales, todos numerados.
    const claves = ['125441', '125442', '8843225', '8843227', '8843228', '8843229']
    const lotes = CONTRATOS.filter((c) => claves.includes(c.id.split('#').pop() ?? c.id))
    expect(lotes).toHaveLength(claves.length)
    for (const c of lotes) expect(ids.has(c.id), c.id).toBe(true)
  })

  describe('un lote en blanco junto a lotes numerados', () => {
    const [lote2, lote3] = [fila('67336#125441'), fila('67336#125442')]
    const enBlanco = (base: typeof lote2, sufijo: string) => ({
      ...base,
      id: `${base.id}-${sufijo}`,
      sourceRowId: sufijo,
      batchNumber: 0,
    })

    it('con dos candidatos no se sabe de cuál es la repetición: no funde ninguno', () => {
      const filas = [lote2, lote3, enBlanco(lote2, 'x')]
      expect(sinAdjudicacionesRepetidas(filas).repetidas).toEqual([])
    })

    it('con un solo candidato se funde, y dos en blanco se funden con él', () => {
      const filas = [lote2, enBlanco(lote2, 'x'), enBlanco(lote2, 'y')]
      const { contratos, repetidas } = sinAdjudicacionesRepetidas(filas)
      expect(contratos).toEqual([lote2])
      expect(repetidas.map((r) => r.queda)).toEqual([lote2.id, lote2.id])
    })

    it('el objeto oficial pesa más que el número de lote', () => {
      const etiquetado = { ...lote2, title: '71241000-Estudio de viabilidad.' }
      const blanco = enBlanco(lote2, 'x')
      const { contratos } = sinAdjudicacionesRepetidas([etiquetado, blanco])
      expect(contratos).toEqual([blanco])
    })

    it('con otro importe no es la misma adjudicación', () => {
      const otra = { ...enBlanco(lote2, 'x'), finalAmountNoTaxes: lote2.finalAmountNoTaxes + 1 }
      expect(sinAdjudicacionesRepetidas([lote2, otra]).repetidas).toEqual([])
    })
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

  describe('una fila sin fecha de adjudicación', () => {
    const [fechada, sinFecha] = [fila('1794430#10156778'), fila('auto-mse4o8')]

    it('196/2023: mismo enlace, importe y adjudicataria, pero otro lote, otro plazo y otro inicio', () => {
      // Un anuncio de adjudicación y 1.088,30 € de presupuesto para dos filas de
      // 1.000 €: huele a repetición, pero las filas no dicen lo mismo, y eso lo
      // decide una persona con el anuncio delante.
      const [lote3, enBlanco] = [fila('1794430#4398563'), fila('1794430#10554489')]
      expect(lote3.awardDate).toBeNull()
      expect([lote3.permalink, lote3.assignee, lote3.finalAmountNoTaxes]).toEqual([
        enBlanco.permalink,
        enBlanco.assignee,
        enBlanco.finalAmountNoTaxes,
      ])
      expect(lote3.duration).not.toBe(enBlanco.duration)
      expect(ids.has(lote3.id)).toBe(true)
      expect(ids.has(enBlanco.id)).toBe(true)
    })

    it('distinta en un solo campo más que la fecha no se funde', () => {
      const otra = { ...sinFecha, endDate: '2028-05-19' }
      expect(sinAdjudicacionesRepetidas([fechada, otra]).repetidas).toEqual([])
    })

    it('con dos gemelas de fechas distintas no se sabe cuál repite: no funde ninguna', () => {
      const otraFecha = { ...fechada, id: 'otra', sourceRowId: 'otra', awardDate: '2026-06-01' }
      expect(sinAdjudicacionesRepetidas([fechada, otraFecha, sinFecha]).repetidas).toEqual([])
    })

    it('dos sin fecha y ninguna fechada: no hay adjudicación con la que compararlas', () => {
      const gemela = { ...sinFecha, id: 'auto-otra', sourceRowId: 'otra' }
      expect(sinAdjudicacionesRepetidas([sinFecha, gemela]).repetidas).toEqual([])
    })

    it('entre dos objetos iguales queda la fechada, aunque su id ordene después', () => {
      const conObjeto = { ...sinFecha, id: '0-sin-fecha', title: fechada.title }
      expect(conObjeto.id.localeCompare(fechada.id)).toBeLessThan(0)
      const { contratos } = sinAdjudicacionesRepetidas([conObjeto, fechada])
      expect(contratos).toEqual([fechada])
    })
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
