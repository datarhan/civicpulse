import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRibalicitaContracts } from '../src/scraper/tenders'
import { esLote, agrupaPorExpediente } from '../src/lib/tender-lotes'

/**
 * Un lote NO es un expediente, y el enlace no lleva al lote.
 *
 * Gobierto publica la tabla `contratos` con UNA FILA POR LOTE. Las filas de un
 * mismo expediente comparten `id` y comparten `permalink`: el enlace es el
 * deeplink de PLACSP del expediente ENTERO, no del lote. El parser desempata
 * los ids repetidos con un sufijo `#n` —ver `tenders-colision-id.test.ts` para
 * la otra colisión, la de `tenders` contra `contracts`— y hasta 2026-09-16
 * TIRABA la columna `batch_number`, así que aguas abajo un lote era
 * indistinguible de un contrato suelto.
 *
 * Lo que eso publicaba, medido en la portada el 16-09-2026: el expediente
 * 106/2025 —«revisión de precios y actualización del proyecto de urbanización
 * de la unidad de ejecución Casco 5, Vella 6 y Pous 6, dividido en varios
 * lotes»— salía como DOS contratos, «UE casco 5» por 6.900 € y «UE vella 6»
 * por 20.251 €, cada uno enlazando a la misma ficha de PLACSP, cuya única
 * cifra visible es el presupuesto base de los tres lotes juntos: 53.409,63 €.
 * El lector que comprobaba la cita —exactamente lo que este sitio le pide que
 * haga— encontraba otro número. Las dos cifras eran ciertas y ninguna decía de
 * qué era.
 *
 * No es una rareza: en la instantánea publicada, más de un cuarto de las filas
 * comparten enlace con al menos una hermana.
 */
const RAIZ = join(__dirname, '..')
const CONTRACTS_CSV = join(__dirname, 'fixtures', 'ribalicita_contratos_2026-04-19.csv')

describe('scraper/tenders — el número de lote sobrevive al parser', () => {
  let contracts: ReturnType<typeof parseRibalicitaContracts>

  beforeAll(() => {
    contracts = parseRibalicitaContracts(readFileSync(CONTRACTS_CSV, 'utf8'))
  })

  it('mide algo: la fixture trae expedientes repartidos en varios lotes', () => {
    const porEnlace = agrupaPorExpediente(contracts)
    const repartidos = [...porEnlace.values()].filter((g) => g.length > 1)
    expect(
      repartidos.length,
      'la fixture ya no trae expedientes con varios lotes: este gate mediría cero',
    ).toBeGreaterThan(10)
    // El mayor grupo de la fixture es el SDA de aplicaciones informáticas.
    expect(Math.max(...repartidos.map((g) => g.length))).toBeGreaterThanOrEqual(20)
  })

  it('la mayoría de las filas repartidas declara SU número de lote', () => {
    const porEnlace = agrupaPorExpediente(contracts)
    const filas = [...porEnlace.values()].filter((g) => g.length > 1).flat()
    const conNumero = filas.filter((c) => c.batchNumber > 0)
    expect(filas.length, 'no hay filas repartidas: el gate mediría cero').toBeGreaterThan(100)
    // Techo de respaldo, no igualdad: NO todas lo traen, y da igual cuántas
    // sean —lo que no puede pasar es que el campo se caiga entero y el sitio
    // deje de marcar lotes en silencio. Las que no lo traen son sobre todo
    // contratos derivados de un SDA, que comparten el enlace del sistema padre
    // sin ser lotes de nada; `infoLote` devuelve `numero: null` para ésas y la
    // etiqueta se queda en el aviso, sin inventarles un ordinal.
    expect(conNumero.length / filas.length).toBeGreaterThan(0.8)
  })

  it('las hermanas de un mismo enlace NUNCA repiten número de lote', () => {
    const porEnlace = agrupaPorExpediente(contracts)
    let comprobados = 0
    for (const grupo of porEnlace.values()) {
      if (grupo.length < 2) continue
      const nums = grupo.map((c) => c.batchNumber).filter((n) => n > 0)
      if (nums.length < 2) continue
      comprobados++
      expect(new Set(nums).size, `lotes repetidos en ${grupo[0].permalink}`).toBe(nums.length)
    }
    expect(comprobados, 'ningún grupo tenía dos números que comparar').toBeGreaterThan(10)
  })

  it('un contrato sin hermanas NO se marca como lote aunque traiga batch_number', () => {
    // `batch_number` viene a 1 en muchísimos contratos de lote único. Marcar
    // ésos como «lote 1 de 1» sería ruido en cada ficha del sitio, y peor: el
    // aviso existe para explicar por qué el enlace dice otra cifra, cosa que
    // en un expediente de un solo lote no pasa.
    const porEnlace = agrupaPorExpediente(contracts)
    const sueltos = [...porEnlace.values()].filter((g) => g.length === 1).flat()
    expect(sueltos.length, 'la fixture ya no trae contratos de lote único').toBeGreaterThan(100)
    for (const c of sueltos) expect(esLote(c, porEnlace)).toBe(false)
  })
})

describe('tenders.json — el caso que se vio en la portada', () => {
  const d = JSON.parse(readFileSync(join(RAIZ, 'public/data/tenders.json'), 'utf8')) as {
    contracts: Array<{
      id: string
      title: string
      permalink: string | null
      batchNumber?: number
      assignee?: string | null
      finalAmountNoTaxes?: number
    }>
  }

  it('la instantánea publicada conserva el número de lote', () => {
    const porEnlace = agrupaPorExpediente(d.contracts ?? [])
    const filas = [...porEnlace.values()].filter((g) => g.length > 1).flat()
    expect(filas.length, 'la instantánea ya no trae expedientes repartidos').toBeGreaterThan(100)
    expect(filas.filter((c) => (c.batchNumber ?? 0) > 0).length / filas.length).toBeGreaterThan(0.8)
  })

  it('«UE casco 5» y «UE vella 6» son dos lotes del MISMO enlace', () => {
    const casco = (d.contracts ?? []).find((c) => c.title === 'UE casco 5')
    const vella = (d.contracts ?? []).find((c) => c.title === 'UE vella 6')
    expect(casco, 'se fue «UE casco 5» de la instantánea').toBeTruthy()
    expect(vella, 'se fue «UE vella 6» de la instantánea').toBeTruthy()
    expect(casco!.permalink).toBe(vella!.permalink)
    expect(casco!.batchNumber).toBeGreaterThan(0)
    expect(vella!.batchNumber).toBeGreaterThan(0)
    expect(casco!.batchNumber).not.toBe(vella!.batchNumber)
    // El adjudicatario es la empresa, nunca el órgano de contratación: es el
    // campo que la portada imprimía mal bajo un respaldo que decía «Sin
    // adjudicatario».
    expect(casco!.assignee).not.toMatch(/Ayuntamiento/i)
  })
})
