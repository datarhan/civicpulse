import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  parseBdnsConcesiones,
  resumirConcesiones,
  rechazoDeLasConcesiones,
  INSTRUMENTO_SUBVENCION,
  NIF_AYUNTAMIENTO,
  TECHO_CAIDA_CONCESIONES,
  type BdnsItem,
  type ConcesionRecibida,
} from '../src/scraper/bdns'

/**
 * Lo que el Ayuntamiento RECIBE, leído por su NIF y no por su nombre.
 *
 * La búsqueda de convocatorias por «riba-roja» trae lo que el texto de la
 * convocatoria nombra. Una convocatoria de la Generalitat o de la Diputación
 * para todos los municipios no nombra a ninguno, y el Ayuntamiento la cobra
 * igual: el 11-10-2026 la BDNS registraba 148 concesiones a P4621600H en 121
 * convocatorias, por 46,3 M€, y el snapshot publicaba 14 recibidas, de las que
 * sólo 7 estaban entre esas 121 (las otras 7 son anteriores a 2022, y la
 * consulta por NIF no devuelve nada antes: 2015–2021 da 0).
 *
 * El contrato:
 *  · Una fila de `concesiones` es una CONCESIÓN: una resolución con su importe.
 *    Una convocatoria puede tener varias (la 754381, el Plan Abierto de
 *    Inversiones de la Diputación, ocho). Los euros se suman ahí y sólo ahí.
 *  · Sus convocatorias NO entran en `items`, que es lo que lee el verificador.
 *    Medido el 11-10-2026: con ellas dentro, el tramo determinista subía 14
 *    afirmaciones de pleno de `sin-datos` a `parcial`, varias por solapamiento
 *    de palabras. Un veredicto automático no sube sin precisión medida.
 *  · Las convocadas por el Ayuntamiento (`granted`) y las recibidas por nombre
 *    no se tocan.
 */
const FX = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/bdns_concesiones_nif_2026-10-11.json'), 'utf8'),
) as {
  paginas: { totalElements: number; content: Record<string, unknown>[] }[]
}
const LEIDAS = parseBdnsConcesiones(JSON.stringify(FX.paginas))
const C = LEIDAS.concesiones

/** Una fila real con un campo cambiado: la forma la pone la fuente, no el test. */
const filaReal = (cambios: Record<string, unknown>) => ({ ...FX.paginas[0].content[0], ...cambios })

describe('la premisa: lo que la BDNS registra a nombre del Ayuntamiento', () => {
  it('148 concesiones en 121 convocatorias, todas a P4621600H', () => {
    expect(C).toHaveLength(148)
    expect(LEIDAS.declaradas).toBe(148)
    expect(LEIDAS.ajenas).toBe(0)
    expect(new Set(C.map((c) => c.bdnsCode)).size).toBe(121)
    expect(new Set(C.map((c) => c.id)).size).toBe(148)
  })

  it('el nombre del beneficiario varía nueve veces; el NIF, ninguna', () => {
    const nombres = new Set(
      FX.paginas.flatMap((p) => p.content.map((r) => String(r.beneficiario).trim())),
    )
    expect(nombres.size).toBeGreaterThan(5)
    for (const n of nombres) expect(n.split(/\s+/)[0]).toBe(NIF_AYUNTAMIENTO)
  })

  it('una concesión lleva su convocatoria, su fecha, su importe y su enlace', () => {
    const c = C.find((x) => x.codConcesion === 'SB150837107') as ConcesionRecibida
    expect(c).toMatchObject({
      bdnsCode: '754381',
      convocatoria: 'Plan Abierto de Inversiones 2024 - 2027',
      fecha: '2026-04-30T00:00:00.000Z',
      importe: 1097520.9,
      level1: 'LOCAL',
      organ: 'LOCAL · DIPUTACIÓN PROV. DE VALENCIA · DIPUTACIÓN PROVINCIAL DE VALENCIA',
      sourceUrl: 'https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/754381',
    })
  })

  it('van de la más reciente a la más antigua', () => {
    const fechas = C.map((c) => c.fecha)
    expect(fechas).toEqual([...fechas].sort().reverse())
  })
})

describe('el instrumento: sólo se suman subvenciones', () => {
  it('las 148 son «subvención y entrega dineraria»: no hay préstamos ni reintegros', () => {
    expect(C.every((c) => c.esSubvencion)).toBe(true)
    expect(C.every((c) => (c.importe ?? 0) > 0)).toBe(true)
  })

  it('techo: menos del 10 % cae fuera del instrumento conocido', () => {
    // La regla nº 1: el enum exportado, y al lado su techo. Si la fuente
    // reescribe el rótulo, `esSubvencion` cae a false en todas y esto se pone rojo.
    const fuera = C.filter((c) => !c.esSubvencion).length
    expect(fuera / C.length).toBeLessThan(0.1)
    expect(INSTRUMENTO_SUBVENCION).toMatch(/SUBVENCION/)
  })

  it('un préstamo se publica como concesión, pero no suma en los euros recibidos', () => {
    const { concesiones } = parseBdnsConcesiones(
      JSON.stringify([
        filaReal({ id: 1, importe: 1000, instrumento: 'PRÉSTAMO ' }),
        filaReal({ id: 2, importe: 500 }),
      ]),
    )
    expect(concesiones.map((c) => c.esSubvencion).sort()).toEqual([false, true])
    const r = resumirConcesiones(concesiones)
    expect(r.importe).toBe(500)
    expect(r.otrosInstrumentos).toBe(1)
  })
})

describe('resumirConcesiones: la cifra de la tarjeta, con su unidad', () => {
  it('concesiones, convocatorias, euros concedidos y el periodo que abarcan', () => {
    expect(resumirConcesiones(C)).toEqual({
      total: 148,
      convocatorias: 121,
      importe: 46269619.34,
      otrosInstrumentos: 0,
      sinImporte: 0,
      desde: '2022-02-08',
      hasta: '2026-08-04',
    })
  })

  it('los euros son la suma de las concesiones, no de las convocatorias', () => {
    const plan = C.filter((c) => c.bdnsCode === '754381')
    expect(plan).toHaveLength(8)
    expect(resumirConcesiones(plan).importe).toBeCloseTo(2368752.73, 2)
    expect(resumirConcesiones(plan).convocatorias).toBe(1)
  })
})

describe('parseBdnsConcesiones: sólo las del NIF del Ayuntamiento', () => {
  it('una concesión a P4621400C (el Ayuntamiento de Real) se aparta y se cuenta', () => {
    const r = parseBdnsConcesiones(
      JSON.stringify([
        filaReal({ id: 1 }),
        filaReal({ id: 2, beneficiario: 'P4621400C AYUNTAMIENTO DE REAL' }),
      ]),
    )
    expect(r.concesiones.map((c) => c.id)).toEqual([1])
    expect(r.ajenas).toBe(1)
  })

  it('una misma concesión en dos páginas cuenta una vez', () => {
    const r = parseBdnsConcesiones(JSON.stringify([filaReal({}), filaReal({})]))
    expect(r.concesiones).toHaveLength(1)
  })

  it('un importe ilegible es null, no cero', () => {
    const r = parseBdnsConcesiones(JSON.stringify([filaReal({ importe: null })]))
    expect(r.concesiones[0].importe).toBeNull()
    expect(resumirConcesiones(r.concesiones).sinImporte).toBe(1)
  })
})

describe('rechazoDeLasConcesiones: la vía nueva no puede publicar cero en silencio', () => {
  it('con la descarga real, vale', () => {
    expect(rechazoDeLasConcesiones(LEIDAS)).toBeNull()
    expect(rechazoDeLasConcesiones(LEIDAS, { anterior: 148 })).toBeNull()
  })

  it('cero concesiones al NIF es un fallo, no un año tranquilo', () => {
    const vacia = parseBdnsConcesiones(JSON.stringify({ ...FX.paginas[0], content: [] }))
    expect(rechazoDeLasConcesiones(vacia)).toMatch(/cero|ninguna/i)
  })

  it('menos filas de las que la API declara: la paginación se cortó', () => {
    const una = parseBdnsConcesiones(JSON.stringify([FX.paginas[0]]))
    expect(una.concesiones).toHaveLength(50)
    expect(rechazoDeLasConcesiones(una)).toMatch(/148/)
  })

  it('si la API deja de filtrar por NIF, se rechaza', () => {
    const r = parseBdnsConcesiones(
      JSON.stringify([filaReal({}), filaReal({ id: 2, beneficiario: 'B12345678 OTRA SL' })]),
    )
    expect(rechazoDeLasConcesiones(r)).toMatch(/NIF/)
  })

  it('si el importe cambia de nombre, se rechaza', () => {
    const sin = parseBdnsConcesiones(
      JSON.stringify(
        FX.paginas.flatMap((p) => p.content.map((r) => ({ ...r, importe: undefined }))),
      ),
    )
    expect(rechazoDeLasConcesiones(sin)).toMatch(/importe/)
  })

  it(`una caída de más del ${TECHO_CAIDA_CONCESIONES * 100} % frente al snapshot anterior se rechaza`, () => {
    expect(rechazoDeLasConcesiones(LEIDAS, { anterior: 400 })).toMatch(/400/)
  })

  it('la ventana que corre un año (−39 concesiones de 2022) no es una caída', () => {
    const sin2022 = {
      ...LEIDAS,
      concesiones: C.filter((c) => !c.fecha.startsWith('2022')),
      declaradas: null,
    }
    expect(sin2022.concesiones).toHaveLength(109)
    expect(rechazoDeLasConcesiones(sin2022, { anterior: 148 })).toBeNull()
  })
})

describe('el snapshot publicado', () => {
  const d = JSON.parse(readFileSync(resolve('public/data/bdns.json'), 'utf8')) as {
    stats: {
      total: number
      granted: number
      received: number
      concesiones: ReturnType<typeof resumirConcesiones>
    }
    items: BdnsItem[]
    concesiones: ConcesionRecibida[]
  }

  it('trae las concesiones, y su resumen sale de ellas', () => {
    expect(Array.isArray(d.concesiones), 'el snapshot no trae `concesiones`').toBe(true)
    expect(d.stats.concesiones).toEqual(resumirConcesiones(d.concesiones))
  })

  it('suelo: la vía por NIF no publicó cero', () => {
    // 148 el 11-10-2026; la ventana de la BDNS corre, pero no a la mitad.
    expect(d.concesiones.length).toBeGreaterThanOrEqual(100)
    expect(
      rechazoDeLasConcesiones({ concesiones: d.concesiones, ajenas: 0, declaradas: null }),
    ).toBeNull()
  })

  it('lo que sólo trae el NIF no entra en `items`: el verificador lee lo de siempre', () => {
    const enItems = new Set(d.items.map((i) => i.bdnsCode))
    const soloPorNif = new Set(d.concesiones.map((c) => c.bdnsCode).filter((c) => !enItems.has(c)))
    // Que la separación evalúe algo: el 11-10-2026 eran 114 de 121.
    expect(soloPorNif.size).toBeGreaterThan(50)
    expect(d.stats.total).toBe(d.items.length)
    expect(d.stats.granted + d.stats.received).toBe(d.stats.total)
  })

  it('ninguna convocatoria de `items` lleva importe', () => {
    for (const i of d.items) expect(i).not.toHaveProperty('importe')
  })
})
