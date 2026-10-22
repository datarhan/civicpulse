import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLUMNAS_ANEXO_28,
  parseAnexoMunicipios,
  variantesNombre,
  resolverMunicipio,
  paresDe,
} from '../src/scraper/bibliotecas'

/**
 * Dos páginas REALES de la Estadística de Bibliotecas Públicas (Ministerio de
 * Cultura, alziraweb), descargadas el 22-10-2026 con un GET simple:
 *
 *   GetAnexo&id=28&origen=PR&codigo=46&ejercicio=2024 → Valencia, por municipio
 *   GetAnexo&id=28&origen=PR&codigo=03&ejercicio=2024 → Alicante, por municipio
 *
 * El anexo 28 es «Visitas y usuarios inscritos». La página se sirve en
 * ISO-8859-1 y con entidades HTML; el CLI la decodifica latin1 y el test igual.
 *
 * Tres trampas que este contrato fija: una casilla «-» es «sin dato» (null,
 * nunca 0); la fila TOTAL no es un municipio, pero sí la prueba de que no se
 * ha perdido ninguno; y el nombre del ministerio no es el del INE («L' Alfàs
 * del Pi» frente a «Alfàs del Pi (l')», «Xàbia/Jávea» frente a
 * «Jávea/Xàbia»), así que se resuelve por variantes y un empate es un fallo.
 */
const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'latin1')
const VALENCIA = fx('bibliotecas_anexo28-PR46-2024_2026-10-22.html')
const ALICANTE = fx('bibliotecas_anexo28-PR03-2024_2026-10-22.html')

describe('parseAnexoMunicipios', () => {
  const v = parseAnexoMunicipios(VALENCIA)

  it('lee el año, la provincia y las cuatro columnas del anexo, en su orden', () => {
    expect(v.anio).toBe(2024)
    expect(v.ambito).toBe('Comunidad Valenciana - Valencia/València')
    expect(v.columnas).toEqual([...COLUMNAS_ANEXO_28])
  })

  it('una fila por municipio, sin la de TOTAL, y la suma cuadra con la TOTAL', () => {
    expect(v.filas.length).toBeGreaterThan(150)
    expect(v.filas.some((f) => /total/i.test(f.municipio))).toBe(false)
    for (const k of [
      'visitas',
      'usuariosInscritos',
      'nuevosUsuarios',
      'prestatariosActivos',
    ] as const) {
      const suma = v.filas.reduce((s, f) => s + (f[k] ?? 0), 0)
      expect(suma).toBe(v.total[k])
    }
  })

  it('Riba-roja 2024: 20.992 visitas, 6.067 inscritos, 399 nuevos, 1.077 prestatarios', () => {
    const r = v.filas.find((f) => f.municipio === 'Riba-roja de Túria')
    expect(r).toEqual({
      municipio: 'Riba-roja de Túria',
      visitas: 20992,
      usuariosInscritos: 6067,
      nuevosUsuarios: 399,
      prestatariosActivos: 1077,
    })
  })

  it('«-» es sin dato (null), nunca cero — y el sin-dato es la excepción', () => {
    const cof = v.filas.find((f) => f.municipio === 'Cofrentes')!
    expect(cof.visitas).toBeNull()
    expect(cof.prestatariosActivos).toBeNull()
    const nulos = v.filas.filter((f) => f.prestatariosActivos === null).length
    expect(nulos / v.filas.length).toBeLessThan(0.1)
  })

  it('decodifica las entidades: los nombres salen con su acento', () => {
    expect(v.filas.some((f) => f.municipio === 'Alaquàs')).toBe(true)
    expect(v.filas.every((f) => !/&[a-z]+;/.test(f.municipio))).toBe(true)
  })

  it('una columna que no conoce rompe la lectura en vez de cambiar de sitio una cifra', () => {
    const otra = VALENCIA.replace('>Prestatarios activos<', '>Préstamos<')
    expect(() => parseAnexoMunicipios(otra)).toThrow(/columna/)
  })

  it('una página sin tabla de municipios rompe la lectura', () => {
    expect(() => parseAnexoMunicipios('<html><body>Mantenimiento</body></html>')).toThrow()
  })
})

describe('resolverMunicipio', () => {
  const filas = [...parseAnexoMunicipios(VALENCIA).filas, ...parseAnexoMunicipios(ALICANTE).filas]
  const nombre = (n: string) => resolverMunicipio(filas, n)?.municipio ?? null

  it('el artículo, delante o entre paréntesis, no distingue', () => {
    expect(nombre("Alfàs del Pi (l')")).toBe("L' Alfàs del Pi")
    expect(nombre('Campello (el)')).toBe('El Campello')
    expect(nombre('Pobla de Vallbona (la)')).toBe('La Pobla de Vallbona')
  })

  it('el orden de las dos lenguas no distingue, y basta una variante en común', () => {
    expect(nombre('Jávea/Xàbia')).toBe('Xàbia/Jávea')
    expect(nombre('Villajoyosa/Vila Joiosa (la)')).toBe('La Vila Joiosa/Villajoyosa')
    expect(nombre('Alboraia/Alboraya')).toBe('Alboraia/Alboraya')
  })

  it('una palabra contenida en otra no es el mismo municipio', () => {
    expect(nombre("Eliana (l')")).toBe("L' Eliana")
    expect(nombre('Eliana')).not.toBe('Meliana')
  })

  it('sin coincidencia, null; con dos, null: una fila ajena es peor que ninguna', () => {
    expect(nombre('Municipio Inventado')).toBeNull()
    const dobles = [...filas, { ...filas[0] }]
    expect(resolverMunicipio(dobles, filas[0].municipio)).toBeNull()
  })

  it('variantesNombre: claves normalizadas, sin artículo, por lengua', () => {
    expect(variantesNombre('La Vila Joiosa/Villajoyosa').sort()).toEqual(
      ['vilajoiosa', 'villajoyosa'].sort(),
    )
  })
})

describe('paresDe', () => {
  const vals = Array.from({ length: 20 }, (_, i) => i + 1)

  it('percentil, cuartiles y n de los comparables', () => {
    const p = paresDe(vals, 10, 'banda')!
    expect(p.n).toBe(20)
    expect(p.percentil).toBe(50)
    expect(p.mediana).toBeCloseTo(10.5)
    expect(p.conjunto).toBe('banda')
  })

  it('menos de 15 comparables no hacen grupo', () => {
    expect(paresDe(vals.slice(0, 14), 3, 'banda')).toBeNull()
  })
})
