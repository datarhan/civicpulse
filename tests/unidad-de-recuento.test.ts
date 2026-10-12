/**
 * La unidad de un recuento («500 viviendas» → count 500, countUnit «viviendas»)
 * llega del modelo como texto libre, y el esquema sólo le pedía 1-60
 * caracteres. Dos defectos pasaron por ahí y se publicaron en /plenos/10yl550:
 *
 *   · un trozo de JSON dentro de la cadena: gpt-4o-mini, con salida
 *     estructurada, escribió el VALOR «euros},» — la cadena es JSON válido,
 *     así que ningún analizador la rechaza. ClaimLedger pinta
 *     `{count} {countUnit}` tal cual: «4 millones de euros},».
 *   · una moneda como unidad de recuento: el dinero tiene su campo,
 *     `amountEuros`, y lo que el modelo deja en `count` junto a «euros» es un
 *     trozo de la cifra («30» de 30.000 €, «1» de un millón), no un recuento.
 *     «30 euros» donde se dijo 30.000 es una cifra falsa con una cita al lado.
 *
 * El fixture son las respuestas reales que dejó `.llm-cache/` (pleno-claim-v3,
 * gpt-4o-mini). Se les quitó sólo `speakerGroup`, que el esquema actual ya no
 * tiene y que en esa versión el modelo adivinaba (ver schemas.ts).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractClaimsWithLlm } from '../src/scraper/pleno-claim-llm'
import { sanearFilas, sanearRecuento } from '../src/scraper/unidad-de-recuento'

interface Respuesta {
  cacheKey: string
  result: { claims: Array<{ entities: { count?: number | null; countUnit?: string | null } }> }
}

const RESPUESTAS = JSON.parse(
  readFileSync(resolve('tests/fixtures/pleno-claim-llm_gpt-4o-mini_2026-07-03.json'), 'utf8'),
) as Respuesta[]

const TRANSCRIPCION = '[1.0 → 5.0] (SPEAKER_00) Una línea cualquiera de pleno.'

function llamadaUnica(claims: unknown[]) {
  let llamadas = 0
  return async (): Promise<any> => {
    llamadas += 1
    return llamadas === 1 ? { claims } : { claims: [] }
  }
}

describe('sanearRecuento', () => {
  it('el fixture trae de verdad los dos defectos (si no, este fichero no prueba nada)', () => {
    const unidades = RESPUESTAS.flatMap((r) => r.result.claims.map((c) => c.entities.countUnit))
    expect(unidades).toContain('euros},')
    expect(unidades).toContain('millones de euros},')
    expect(unidades).toContain('comercios},')
  })

  it('una unidad con un trozo de JSON no es una unidad: se va, y con ella su número', () => {
    expect(sanearRecuento({ count: 20, countUnit: 'comercios},' })).toEqual({
      descarte: 'fragmento-json',
    })
    expect(sanearRecuento({ count: 3, countUnit: 'plazas"]' })).toEqual({
      descarte: 'fragmento-json',
    })
  })

  it('una moneda no es unidad de recuento: el dinero va en amountEuros, nunca en count', () => {
    for (const countUnit of [
      'euros',
      'euro',
      '€',
      'EUR',
      'millones de euros',
      'millón de euros',
      'mil euros',
      'mil',
      'milions d’euros',
      "milions d'euros",
    ]) {
      expect(sanearRecuento({ count: 4, countUnit }), countUnit).toEqual({ descarte: 'moneda' })
    }
  })

  it('NO adivina: no limpia «euros},» a «euros» ni pasa count a amountEuros', () => {
    // «30 euros» por 30.000 sería una cifra falsa; escalar 4 → 4.000.000 sería
    // inventar la magnitud. Lo único seguro es no decir nada.
    const r = sanearRecuento({ count: 30, countUnit: 'euros},' })
    expect(r).toEqual({ descarte: 'fragmento-json' })
    expect(r).not.toHaveProperty('countUnit')
    expect(r).not.toHaveProperty('count')
  })

  it('deja en paz las unidades de verdad, tasas incluidas', () => {
    for (const countUnit of [
      'viviendas',
      'plazas',
      'km',
      '% de financiación europea',
      'euros por habitante',
      'euros al mes',
      'euros/día',
      'días (período medio de pago)',
      "unitats d'execució (UE) amb aval",
    ]) {
      expect(sanearRecuento({ count: 7, countUnit }), countUnit).toEqual({
        count: 7,
        countUnit,
        descarte: null,
      })
    }
  })

  it('sin unidad no hay nada que juzgar', () => {
    expect(sanearRecuento({ count: 5 })).toEqual({ count: 5, descarte: null })
    expect(sanearRecuento({ count: null, countUnit: null })).toEqual({ descarte: null })
    expect(sanearRecuento({})).toEqual({ descarte: null })
  })
})

describe('sanearFilas · lo ya extraído', () => {
  it('quita count y countUnit de las filas descartadas, y nada más', () => {
    const filas = [
      {
        id: 'a',
        plenoId: 'p',
        verbatim: 'x',
        entities: { amountEuros: 30000, count: 30, countUnit: 'euros},' },
      },
      { id: 'b', plenoId: 'p', verbatim: 'y', entities: { count: 500, countUnit: 'viviendas' } },
      {
        id: 'c',
        plenoId: 'p',
        verbatim: 'z',
        entities: { amountEuros: 1100, count: 862, countUnit: '€' },
      },
    ]
    const copia = structuredClone(filas)
    const { filas: nuevas, descartadas } = sanearFilas(filas)
    expect(nuevas).toEqual([
      { id: 'a', plenoId: 'p', verbatim: 'x', entities: { amountEuros: 30000 } },
      filas[1],
      { id: 'c', plenoId: 'p', verbatim: 'z', entities: { amountEuros: 1100 } },
    ])
    expect(descartadas.map((d) => [d.id, d.motivo])).toEqual([
      ['a', 'fragmento-json'],
      ['c', 'moneda'],
    ])
    // No muta la entrada: la CLI compara antes y después.
    expect(filas).toEqual(copia)
  })
})

describe('extractClaimsWithLlm · unidades de recuento del fixture real', () => {
  it.each(RESPUESTAS.map((r) => [r.cacheKey, r] as const))(
    'respuesta %s: ninguna unidad publicada lleva llaves ni moneda',
    async (_clave, respuesta) => {
      const res = await extractClaimsWithLlm(
        TRANSCRIPCION,
        {
          plenoId: 'fixture',
          plenoDate: '2026-05-11',
          currentSeats: [{ bloc: 'PSOE', seats: 11 }],
          windowChars: 5000,
          minConfidence: 0,
        },
        llamadaUnica(respuesta.result.claims),
      )
      // Que evaluó algo: el fixture tiene declaraciones y salen.
      expect(res.items.length).toBeGreaterThan(0)
      for (const it of res.items) {
        expect(it.entities.countUnit ?? '').not.toMatch(/[{}[\]"\\]/)
        expect(it.entities.countUnit ?? '').not.toMatch(/euro|€/i)
        // Un número sin su unidad no se publica a medias.
        if (it.entities.count != null) expect(it.entities.countUnit).toBeTruthy()
      }
    },
  )

  it('cuenta lo que descarta, por motivo (una pasada demuestra lo que hizo)', async () => {
    const todas = RESPUESTAS.flatMap((r) => r.result.claims)
    const res = await extractClaimsWithLlm(
      TRANSCRIPCION,
      {
        plenoId: 'fixture',
        plenoDate: '2026-05-11',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        windowChars: 5000,
        minConfidence: 0,
      },
      llamadaUnica(todas),
    )
    const conDefecto = todas.filter((c) => /[{}]/.test(c.entities.countUnit ?? '')).length
    expect(conDefecto).toBeGreaterThan(0)
    // Se cuentan las emitidas, antes del colapso: lo que el modelo dijo mal,
    // no lo que sobrevivió a la deduplicación.
    expect(res.stats.unidadesDescartadas).toEqual({ 'fragmento-json': conDefecto, moneda: 0 })
  })

  it('el id no cambia: la clave sale de la respuesta cruda, no de la saneada', async () => {
    // Los veredictos, el overlay y los hallazgos citan ids. Si sanear la unidad
    // moviera el id, re-extraer un pleno dejaría huérfano lo ya firmado.
    const [una] = RESPUESTAS[0].result.claims
    const opciones = {
      plenoId: 'fixture',
      plenoDate: '2026-05-11',
      currentSeats: [{ bloc: 'PSOE', seats: 11 }],
      windowChars: 5000,
      minConfidence: 0,
    }
    const saneada = await extractClaimsWithLlm(TRANSCRIPCION, opciones, llamadaUnica([una]))
    const sinUnidad = await extractClaimsWithLlm(
      TRANSCRIPCION,
      opciones,
      llamadaUnica([{ ...una, entities: { ...una.entities, countUnit: 'viviendas' } }]),
    )
    expect(saneada.items[0].id).toBe(sinUnidad.items[0].id)
  })
})
