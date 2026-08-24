import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AREAS, SERVICIOS } from '../src/scraper/indicador-registry'
import { agruparPorArea, particionPosiciones, fraseParticion } from '../src/scraper/indicador-areas'
import type { Indicador } from '../src/scraper/indicadores'

/**
 * La agrupación por áreas alimenta cabeceras y frases visibles, así que se
 * comprueba contra el snapshot PUBLICADO, no contra una lista copiada: el modo
 * de fallo 1 de docs/DATA_INTEGRITY.md fue exactamente un test que restataba a
 * mano la forma que debía importar.
 */
const snap = JSON.parse(readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'))
const indicadores: Indicador[] = snap.indicadores

describe('registro — cada servicio declara un área válida', () => {
  it('mide algo: el registro tiene servicios y áreas', () => {
    expect(Object.keys(SERVICIOS).length).toBeGreaterThan(10)
    expect(Object.keys(AREAS).length).toBeGreaterThan(2)
  })

  it('el área de cada servicio existe en AREAS (importado, no restatado)', () => {
    for (const [key, def] of Object.entries(SERVICIOS)) {
      expect(AREAS[def.area], `${key} declara el área desconocida «${def.area}»`).toBeTruthy()
    }
  })

  it('cada indicador del snapshot pertenece a un servicio del registro', () => {
    for (const i of indicadores) {
      expect(SERVICIOS[i.servicio!], `${i.id} no está en el registro`).toBeTruthy()
    }
  })
})

describe('agruparPorArea — partición completa y orden por gasto', () => {
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const grupos = agruparPorArea(indicadores)

  it('mide algo: hay grupos y fichas con cociente', () => {
    expect(grupos.length).toBeGreaterThan(1)
    expect(conRatio.length).toBeGreaterThan(5)
  })

  it('las fichas con cociente quedan repartidas enteras, sin repetirse', () => {
    const ids = grupos.flatMap((g) => g.indicadores.map((i) => i.id))
    expect(ids.length).toBe(conRatio.length)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('las bloqueadas NO entran en ningún grupo: conservan su sección propia', () => {
    const ids = new Set(grupos.flatMap((g) => g.indicadores.map((i) => i.id)))
    for (const i of indicadores.filter((x) => x.valor === null)) {
      expect(ids.has(i.id), `${i.id} está bloqueada y aparece en un grupo`).toBe(false)
    }
  })

  it('los grupos van por gasto declarado descendente, y dentro también', () => {
    for (let g = 1; g < grupos.length; g++) {
      expect(grupos[g - 1].gasto).toBeGreaterThanOrEqual(grupos[g].gasto)
    }
    for (const g of grupos) {
      const nums = g.indicadores.map((i) => i.numerador.valor ?? 0)
      for (let k = 1; k < nums.length; k++) {
        expect(nums[k - 1]).toBeGreaterThanOrEqual(nums[k])
      }
    }
  })
})

describe('particionPosiciones — una sola regla de «por debajo» para toda la página', () => {
  it('abajo + arriba + indistinguibles suman los situados; situados + sinSituar, los con cociente', () => {
    const p = particionPosiciones(indicadores)
    expect(p.abajo + p.arriba + p.indistinguibles).toBe(p.situados)
    expect(p.situados + p.sinSituar).toBe(indicadores.filter((i) => i.valor !== null).length)
  })

  it('la del total coincide con la suma de las de área', () => {
    const total = particionPosiciones(indicadores)
    const grupos = agruparPorArea(indicadores)
    const suma = (k: 'situados' | 'abajo' | 'arriba' | 'indistinguibles' | 'sinSituar') =>
      grupos.reduce((s, g) => s + g.particion[k], 0)
    expect(suma('situados')).toBe(total.situados)
    expect(suma('abajo')).toBe(total.abajo)
    expect(suma('arriba')).toBe(total.arriba)
    expect(suma('indistinguibles')).toBe(total.indistinguibles)
    expect(suma('sinSituar')).toBe(total.sinSituar)
  })
})

describe('fraseParticion — la mini-frase no afirma lo que no se midió', () => {
  it('con cero situados no hay frase: nada que decir de posiciones sin banda', () => {
    expect(
      fraseParticion({ situados: 0, abajo: 0, arriba: 0, indistinguibles: 0, sinSituar: 2 }),
    ).toBeNull()
  })

  it('en singular no imprime recuentos con gramática rota', () => {
    const f = fraseParticion({ situados: 1, abajo: 0, arriba: 1, indistinguibles: 0, sinSituar: 0 })
    expect(f).toBe('El servicio con comparación queda por encima de la mediana de su banda')
  })

  it('en plural cuenta cada lado y añade los sin banda', () => {
    const f = fraseParticion({ situados: 5, abajo: 2, arriba: 2, indistinguibles: 1, sinSituar: 1 })
    expect(f).toContain('De 5 con comparación')
    expect(f).toContain('1 no se distinguen de la mediana')
    expect(f).toContain('2 por debajo')
    expect(f).toContain('2 por encima')
    expect(f).toContain('1 sin banda comparable')
  })
})
