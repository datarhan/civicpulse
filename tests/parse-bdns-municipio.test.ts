import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  parseBdnsConvocatorias,
  ubicarConvocatoria,
  separarPorMunicipio,
  rechazoDeLaCorrida,
  LUGARES,
  type BdnsItem,
  type PruebasDeLugar,
} from '../src/scraper/bdns'

/**
 * La búsqueda «riba-roja» de la BDNS trae también Riba-roja d'Ebre.
 *
 * El raspador pide las convocatorias cuya descripción dice «riba-roja» y las
 * publicaba todas: las que convoca el Ayuntamiento (`granted`) y las que
 * convoca otro organismo y nombran el municipio (`received`). Entre las
 * segundas, el 06-10-2026 había cuatro de Riba-roja d'Ebre, en Tarragona:
 * 792222, 732847, 702610 y 668659, que el sitio daba como subvenciones que
 * había recibido Riba-roja de Túria. La 668659 ni siquiera dice «Ebre» —«SN
 * AYUNTAMIENTO DE RIBAROJA»—: un filtro por el nombre la habría dejado pasar.
 *
 * La fila de búsqueda no dice a quién va la subvención. Lo dicen dos campos
 * estructurados de la propia BDNS, medidos sobre las 18 recibidas de ese día:
 *
 *  · La concesión (/concesiones/busqueda) trae el NIF del beneficiario. El del
 *    Ayuntamiento es P4621600H; NO P4621400C, el que sale de pegar el INE 46214
 *    a la P, que es el del Ayuntamiento de Real. 7 de nuestras 14 traen una
 *    concesión a P4621600H; las otras 7 son anteriores al registro de
 *    concesiones o van a una entidad del pueblo (la 425925, a una falla).
 *  · La ficha (/convocatorias?numConv=) trae la región NUTS. Esas 7 están en
 *    ES523 (Valencia) o ES52 (Comunitat Valenciana); las cuatro de d'Ebre, en
 *    ES51 (Cataluña) o ES514 (Tarragona). La 858224 dice «ES - ESPAÑA», que
 *    contiene a los dos municipios: a ésa sólo la sitúa el NIF.
 *
 * Lo que ninguno de los dos sitúa no se publica: la regla del place-resolver,
 * un fallo honesto antes que una atribución falsa.
 */
const FX = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/bdns_municipio_2026-10-06.json'), 'utf8'),
) as {
  busqueda: Record<string, unknown>[]
  fichas: Record<string, unknown>
  concesionesDelAyuntamiento: Record<string, unknown>
  concesionDeReal: unknown
}

const ITEMS = parseBdnsConvocatorias(JSON.stringify(FX.busqueda))

const fila = (codigo: string): BdnsItem => {
  const f = ITEMS.find((i) => i.bdnsCode === codigo)
  if (!f) throw new Error(`la fixture no trae la ${codigo}`)
  return f
}

const pruebasDe = (codigo: string): PruebasDeLugar => ({
  ficha: FX.fichas[codigo],
  concesiones: FX.concesionesDelAyuntamiento[codigo],
})

const TODAS = new Map(Object.keys(FX.fichas).map((c) => [c, pruebasDe(c)]))

const OTORGADA = '931666'
const DE_TURIA = ['858224', '810154', '324291', '425925']
const DE_EBRE = ['792222', '668659', '702610', '732847']

const codigos = (filas: { bdnsCode: string }[]) => filas.map((f) => f.bdnsCode).sort()

describe('la premisa: la fixture trae las dos Riba-roja', () => {
  it('una convocada por el Ayuntamiento y ocho recibidas, cuatro de cada municipio', () => {
    expect(codigos(ITEMS)).toEqual([OTORGADA, ...DE_TURIA, ...DE_EBRE].sort())
    expect(fila(OTORGADA).direction).toBe('granted')
    for (const c of [...DE_TURIA, ...DE_EBRE]) expect(fila(c).direction).toBe('received')
  })

  it('la 668659 no dice «Ebre»: el nombre no la distingue', () => {
    expect(fila('668659').description).toMatch(/RIBAROJA/)
    expect(fila('668659').description).not.toMatch(/ebre/i)
  })
})

describe('separarPorMunicipio', () => {
  it("aparta las cuatro de Riba-roja d'Ebre y publica las cinco nuestras", () => {
    const { propias, descartadas } = separarPorMunicipio(ITEMS, TODAS)
    expect(codigos(propias)).toEqual([OTORGADA, ...DE_TURIA].sort())
    expect(codigos(descartadas)).toEqual([...DE_EBRE].sort())
    for (const d of descartadas) expect(d.lugar).toBe('ajeno')
  })

  it('cada apartada dice qué región la sacó', () => {
    const { descartadas } = separarPorMunicipio(ITEMS, TODAS)
    const motivo = new Map(descartadas.map((d) => [d.bdnsCode, d.motivo]))
    expect(motivo.get('702610')).toMatch(/ES514/)
    for (const c of ['792222', '668659', '732847']) expect(motivo.get(c)).toMatch(/ES51\b/)
  })

  it('sin pruebas no se publica ninguna recibida; la convocada por el Ayuntamiento, sí', () => {
    const { propias, descartadas } = separarPorMunicipio(ITEMS, new Map())
    expect(codigos(propias)).toEqual([OTORGADA])
    expect(codigos(descartadas)).toEqual([...DE_TURIA, ...DE_EBRE].sort())
    for (const d of descartadas) expect(d.lugar).toBe('sin-determinar')
  })

  it('el lugar de cada apartada es uno de LUGARES, y nunca «propio»', () => {
    const { descartadas } = separarPorMunicipio(ITEMS, new Map([...TODAS].slice(0, 5)))
    expect(descartadas.length).toBeGreaterThan(0)
    for (const d of descartadas) {
      expect(LUGARES).toContain(d.lugar)
      expect(d.lugar).not.toBe('propio')
    }
  })
})

describe('ubicarConvocatoria: qué campo decide', () => {
  it('a la convocada por el Ayuntamiento la sitúa su órgano, sin ficha', () => {
    expect(ubicarConvocatoria(fila(OTORGADA)).lugar).toBe('propio')
  })

  it('858224: la región es toda España; la sitúa la concesión a P4621600H', () => {
    const u = ubicarConvocatoria(fila('858224'), pruebasDe('858224'))
    expect(u.lugar).toBe('propio')
    expect(u.motivo).toMatch(/P4621600H/)
  })

  it('858224 sin esa concesión no se puede situar, y no se publica', () => {
    // Las concesiones de la 792222 al NIF del Ayuntamiento: una respuesta real y vacía.
    const sinConcesion = {
      ficha: FX.fichas['858224'],
      concesiones: FX.concesionesDelAyuntamiento['792222'],
    }
    expect(ubicarConvocatoria(fila('858224'), sinConcesion).lugar).toBe('sin-determinar')
  })

  it('una concesión a P4621400C, el Ayuntamiento de Real, no la sitúa aquí', () => {
    const deReal = { ficha: FX.fichas['858224'], concesiones: FX.concesionDeReal }
    expect(ubicarConvocatoria(fila('858224'), deReal).lugar).toBe('sin-determinar')
  })

  it('sin concesión, decide la región: ES523 y ES52 son de Riba-roja de Túria', () => {
    expect(ubicarConvocatoria(fila('324291'), pruebasDe('324291')).lugar).toBe('propio')
    expect(ubicarConvocatoria(fila('425925'), pruebasDe('425925')).lugar).toBe('propio')
  })

  it('una región sin su código NUTS no decide nada', () => {
    // Forma que la fuente NO emite hoy: la ficha real de la 324291 con la región
    // rotulada sin código. Si un día la emite, la fila no se puede situar; no
    // se da por ajena ni por propia.
    const ficha = {
      ...(FX.fichas['324291'] as object),
      regiones: [{ descripcion: 'Valencia / València' }],
    }
    const pruebas = { ficha, concesiones: FX.concesionesDelAyuntamiento['324291'] }
    expect(ubicarConvocatoria(fila('324291'), pruebas).lugar).toBe('sin-determinar')
  })
})

describe('el órgano convocante se compara entero', () => {
  it("un Ayuntamiento de Riba-roja d'Ebre no convoca como el nuestro", () => {
    // Hipotético: el catálogo de órganos LOCAL de la BDNS no tiene hoy a Riba-roja
    // d'Ebre. La fila es la real de la 931666 con el órgano cambiado; con
    // `nivel2.includes('RIBA-ROJA')` contaba como convocada por el nuestro.
    const real = FX.busqueda.find((r) => r.numeroConvocatoria === OTORGADA)
    const otra = {
      ...real,
      nivel2: "RIBA-ROJA D'EBRE",
      nivel3: "AYUNTAMIENTO DE RIBA-ROJA D'EBRE",
    }
    expect(parseBdnsConvocatorias(JSON.stringify([otra]))[0].direction).toBe('received')
  })
})

describe('rechazoDeLaCorrida: el filtro no puede vaciar el snapshot en silencio', () => {
  it('con las pruebas reales, la corrida vale', () => {
    expect(rechazoDeLaCorrida(separarPorMunicipio(ITEMS, TODAS))).toBeNull()
  })

  it('si no pudo situar las recibidas, la rechaza', () => {
    expect(rechazoDeLaCorrida(separarPorMunicipio(ITEMS, new Map()))).toEqual(expect.any(String))
  })

  it('si las aparta todas, aunque sea por ajenas, la rechaza', () => {
    // Las ocho recibidas con la ficha de la 792222 (ES51) y sin concesión al NIF.
    const ajenas = new Map(
      Object.keys(FX.fichas).map((c) => [c, pruebasDe('792222')] as [string, PruebasDeLugar]),
    )
    const separacion = separarPorMunicipio(ITEMS, ajenas)
    expect(separacion.descartadas.every((d) => d.lugar === 'ajeno')).toBe(true)
    expect(rechazoDeLaCorrida(separacion)).toEqual(expect.any(String))
  })
})

describe('el snapshot publicado', () => {
  const d = JSON.parse(readFileSync(resolve('public/data/bdns.json'), 'utf8')) as {
    stats: { total: number; granted: number; received: number; descartadas: number }
    items: BdnsItem[]
    descartadas: { bdnsCode: string; lugar: string; motivo: string }[]
  }

  it("no publica ninguna de Riba-roja d'Ebre", () => {
    const publicadas = new Set(d.items.map((i) => i.bdnsCode))
    for (const c of DE_EBRE) expect(publicadas.has(c), c).toBe(false)
  })

  it('las lleva apartadas, con su motivo', () => {
    expect(Array.isArray(d.descartadas), 'el snapshot no trae `descartadas`').toBe(true)
    const apartada = new Map(d.descartadas.map((x) => [x.bdnsCode, x]))
    for (const c of DE_EBRE) {
      expect(apartada.get(c)?.lugar, c).toBe('ajeno')
      expect(apartada.get(c)?.motivo, c).toMatch(/ES51/)
    }
  })

  it('suelo: el filtro no lo vació', () => {
    expect(d.stats.total).toBe(d.items.length)
    expect(d.stats.granted + d.stats.received).toBe(d.stats.total)
    expect(d.stats.descartadas).toBe(d.descartadas.length)
    // 14 recibidas y 160 convocadas por el Ayuntamiento el 06-10-2026.
    expect(d.stats.received).toBeGreaterThanOrEqual(10)
    expect(d.stats.granted).toBeGreaterThanOrEqual(100)
    expect(rechazoDeLaCorrida({ propias: d.items, descartadas: d.descartadas as never })).toBeNull()
  })
})
