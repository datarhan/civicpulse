import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirIndicadores, type Indicador } from '../src/scraper/indicadores'
import { leerIndicador } from '../src/scraper/indicador-lectura'
import { MAPA_URL } from '../src/scraper/cesel-entregas'
import type { OrigenEntrega } from '../src/scraper/cesel-procedencia'

/**
 * Lo que la ficha afirma de la SERIE: la tendencia, su lectura contra los
 * pares y las salvedades de los años raros. Sobre la serie real entera
 * (coste-efectivo.json, 2014–2024), porque es la única que tiene a la vez un
 * año de otro régimen, un año que titula sin banda de su modo y un salto
 * relativo que no viene del divisor.
 *
 *  - Residuos decía «Entre 2014 y 2024 baja un 31 %», y 2014 es un año de
 *    concesión que la misma ficha declara no comparable (regla 4).
 *  - Transporte decía «Entre 2021 y 2023 sube un 36 % … 4194 €/km» debajo de
 *    una cifra de 2024 de 4056: 2024 se caía sólo por no tener mediana de su
 *    modo, aunque pasó la comprobación de cordura contra todos los que
 *    declararon ese año.
 *  - Colegios decía «buena parte de ese cambio está en cuánto se declara»
 *    con el coste multiplicado por seis y la superficie SUBIENDO: el divisor
 *    se movió en la dirección que lo contradice.
 */
const ROOT = join(__dirname, '..')
const fuente = JSON.parse(readFileSync(join(ROOT, 'public/data/coste-efectivo.json'), 'utf8'))
const ipc = JSON.parse(readFileSync(join(ROOT, 'public/data/ipc.json'), 'utf8')).medias
const anios: number[] = [
  ...new Set<number>(fuente.municipio.filas.map((f: { anio: number }) => f.anio)),
]
const origenes: Record<number, OrigenEntrega> = Object.fromEntries(
  anios.map((a) => [a, { documento: 'informe-ccaa', url: MAPA_URL, ccaa: 17 }]),
)
const snap = construirIndicadores({
  municipio: fuente.municipio,
  pares: fuente.pares,
  ipc,
  origenes,
  supramunicipal: fuente.supramunicipal?.filas ?? [],
})
const byId = (id: string) => snap.indicadores.find((i) => i.id === id)!
const tendencia = (i: Indicador) =>
  leerIndicador(i).avisos.find((a) => /^Entre \d{4} y \d{4}/.test(a))
const extremos = (frase: string) =>
  frase
    .match(/^Entre (\d{4}) y (\d{4})/)!
    .slice(1)
    .map(Number)

describe('la tendencia no ancla en un año de otro régimen', () => {
  it('residuos: 2014 es concesión y la tendencia no empieza ahí', () => {
    const r = byId('a1621-coste-unitario')
    expect(r.serie.find((p) => p.anio === 2014)!.otroModo).toBe('concesion')
    const t = tendencia(r)
    expect(t, 'residuos sin tendencia: la prueba no mediría nada').toBeDefined()
    expect(extremos(t!)[0]).not.toBe(2014)
  })

  it('en ninguna ficha arranca o acaba en un año de otro modo o inverosímil', () => {
    let vistas = 0
    for (const i of snap.indicadores) {
      const t = tendencia(i)
      if (!t) continue
      vistas++
      for (const anio of extremos(t)) {
        const p = i.serie.find((x) => x.anio === anio)!
        expect(p.otroModo, `${i.id} ${anio}`).toBeUndefined()
        expect(p.atipico, `${i.id} ${anio}`).toBeFalsy()
      }
    }
    expect(vistas).toBeGreaterThan(5)
  })
})

describe('el año que titula entra en la tendencia si pasó la comprobación', () => {
  it('transporte: la tendencia llega a 2024, la cifra de arriba', () => {
    const t = byId('a4411-440p-coste-unitario')
    const p24 = t.serie.find((p) => p.anio === 2024)!
    expect(p24.medianaPares).toBeUndefined() // sin banda de su modo…
    expect(p24.contrastado).toBe(true) // …pero comprobada contra todos
    const frase = tendencia(t)
    expect(frase).toBeDefined()
    expect(extremos(frase!)[1]).toBe(2024)
  })

  it('en toda ficha cuya entrega base pasó la comprobación, la tendencia acaba en ella', () => {
    for (const i of snap.indicadores) {
      const t = tendencia(i)
      if (!t) continue
      const base = i.serie.find((p) => p.anio === i.citas[0].entrega)!
      if (base.estado === 'declarado' && !base.atipico && !base.otroModo && base.contrastado) {
        expect(extremos(t)[1], i.id).toBe(i.citas[0].entrega)
      }
    }
  })
})

describe('«cuánto se declara» sólo cuando el divisor lo explica', () => {
  const SE_DECLARA = /cuánto se declara y no en cuánto cuesta/

  it('colegios: el coste ×6 y la superficie al alza — dice qué se movió, no «se declara»', () => {
    const avisos = leerIndicador(byId('b323-324-320p-coste-unitario')).avisos
    const rel = avisos.find((a) => /veces la mediana/.test(a))
    expect(rel, 'sin frase relativa: la prueba no mediría nada').toBeDefined()
    expect(rel).not.toMatch(SE_DECLARA)
    expect(rel).toMatch(/coste/)
    expect(rel).toMatch(/505\.554/)
    expect(rel).toMatch(/3\.210\.292/)
  })

  it('urbanismo: la superficie pasa de 4,54 a 58,01 km² — ahí sí se declara', () => {
    const rel = leerIndicador(byId('b151-150p-coste-unitario')).avisos.find((a) =>
      /veces la mediana/.test(a),
    )
    expect(rel).toMatch(SE_DECLARA)
    expect(rel).toMatch(/4,54/)
    expect(rel).toMatch(/58,01/)
  })

  it('en toda ficha, «se declara» exige un divisor que se mueva en contra del cociente', () => {
    for (const i of snap.indicadores) {
      const rel = leerIndicador(i).avisos.find((a) => SE_DECLARA.test(a))
      if (!rel) continue
      const [a, b] = rel
        .match(/de ([\d.,]+) a ([\d.,]+) veces/)!
        .slice(1)
        .map((s) => Number(s.replace(',', '.')))
      const conMediana = i.serie.filter(
        (p) =>
          p.estado === 'declarado' && p.medianaPares !== undefined && !p.atipico && !p.otroModo,
      )
      const pa = conMediana[0]
      const pb = conMediana[conMediana.length - 1]
      const divisor = pb.denominador! / pa.denominador!
      // Sube la posición relativa ⇒ el divisor tuvo que BAJAR, y al revés.
      if (b > a) expect(divisor, i.id).toBeLessThan(1)
      else expect(divisor, i.id).toBeGreaterThan(1)
    }
  })
})

describe('las salvedades de la serie dicen de quién es cada cosa', () => {
  it('la cifra inverosímil es nuestra división, no algo que publique el ministerio', () => {
    for (const i of snap.indicadores) {
      for (const c of i.caveats) expect(c).not.toMatch(/El ministerio publica cifras inverosímiles/)
    }
    const transporte = byId('a4411-440p-coste-unitario')
    expect(transporte.caveats.some((c) => /inverosímil/.test(c) && /divi/.test(c))).toBe(true)
  })

  it('el modo de gestión se nombra en castellano, no con la clave interna', () => {
    const r = byId('a1621-coste-unitario')
    const c = r.caveats.find((x) => /otro modo de gestión/.test(x))
    expect(c).toBeDefined()
    expect(c).toContain('concesión')
    expect(c).not.toMatch(/\(concesion\)/)
  })

  it('limpieza viaria: los 0,01 m² de 2014 y 2015 no dan cociente', () => {
    const l = byId('a163-coste-unitario')
    for (const anio of [2014, 2015]) {
      const p = l.serie.find((x) => x.anio === anio)!
      expect(p.valor, String(anio)).toBeNull()
      expect(p.denominador, String(anio)).toBeUndefined()
    }
  })
})
