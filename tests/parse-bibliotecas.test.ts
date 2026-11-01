import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLUMNAS_ANEXO_28,
  parseAnexoMunicipios,
  variantesNombre,
  resolverMunicipio,
  paresDe,
  grupoDe,
  resultadosBibliotecas,
} from '../src/scraper/bibliotecas'
import { validarResultados } from '../src/scraper/resultados'

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

describe('resultadosBibliotecas', () => {
  const SNAP = JSON.parse(readFileSync(join(__dirname, '../public/data/bibliotecas.json'), 'utf8'))
  const IND = JSON.parse(readFileSync(join(__dirname, '../public/data/indicadores.json'), 'utf8'))
  const items = resultadosBibliotecas(SNAP)

  it('mide algo: cinco años, la banda entera resuelta, y dos resultados', () => {
    expect(SNAP.municipio.serie.length).toBeGreaterThanOrEqual(5)
    expect(SNAP.stats.paresSinFila).toEqual([])
    expect(items.map((r) => r.id)).toEqual([
      'biblioteca-prestatarios-por-mil',
      'biblioteca-visitas-por-habitante',
    ])
  })

  it('las cifras de Riba-roja son las del anexo, sin tocar', () => {
    const porAnio = Object.fromEntries(
      SNAP.municipio.serie.map((p: { anio: number }) => [p.anio, p]),
    )
    expect(porAnio[2020]).toMatchObject({
      visitas: 17123,
      usuariosInscritos: 5190,
      prestatariosActivos: 862,
    })
    expect(porAnio[2023]).toMatchObject({
      visitas: 25339,
      usuariosInscritos: 5668,
      prestatariosActivos: 1068,
    })
    expect(porAnio[2024]).toMatchObject({
      visitas: 20992,
      usuariosInscritos: 6067,
      prestatariosActivos: 1077,
    })
    // La tasa es la cifra entre el padrón de ese año: se rehace aquí.
    const p = porAnio[2024]
    expect(p.prestatariosPorMil).toBeCloseTo((1000 * 1077) / p.poblacion, 9)
  })

  it('pasan el validador y acompañan a la tarjeta de biblioteca, que existe', () => {
    expect(() => validarResultados({ items, ausencias: [] })).not.toThrow()
    for (const r of items) {
      expect(r.servicioRelacionado).toBe('a3321-330p-coste-unitario')
      expect(IND.indicadores.some((i: { id: string }) => i.id === r.servicioRelacionado)).toBe(true)
    }
    // Lo publicado es lo que esta función construye.
    for (const r of items) {
      expect(IND.resultados.items.find((x: { id: string }) => x.id === r.id)).toEqual(r)
    }
  })

  it('ni inscritos ni préstamos: la tarjeta ya divide por préstamos', () => {
    for (const r of items) expect(r.etiqueta).not.toMatch(/inscrit|préstamos/i)
  })

  it('el grupo excluye al propio y declara su n; la serie es de un panel fijo', () => {
    for (const r of items) {
      expect(r.pares!.n).toBeLessThanOrEqual(SNAP.pares.miembros)
      expect(SNAP.pares.filas.some((f: { ine: string }) => f.ine === '46214')).toBe(false)
      const ns = new Set(r.paresSerie!.map((p) => p.n))
      expect(ns.size).toBe(1)
      expect(r.paresSerie!.map((p) => p.anio)).toEqual(r.serie.map((p) => p.anio))
    }
  })

  it('las frases no llevan huecos, y la no-causal dice que no se divide', () => {
    for (const r of items) {
      for (const t of [r.comoSeLee, ...r.caveats]) expect(t).not.toMatch(/undefined|NaN|null/)
      expect(r.comoSeLee).toContain('nunca dividido')
      // El punto de millar también por debajo de 10.000: «5.190», no «5190».
      expect(r.caveats.join(' ')).toContain('5.190')
      expect(r.caveats.join(' ')).not.toContain('5190')
    }
  })
})

describe('grupoDe', () => {
  const propio = [2020, 2021].map((anio) => ({ anio, prestatariosPorMil: 10 }) as never)
  const fila = (ine: string, anio: number, v: number | null) =>
    ({ ine, nombre: ine, anio, prestatariosPorMil: v }) as never

  it('el panel fijo deja fuera a quien falta un año; el último año los cuenta a todos', () => {
    const filas = Array.from({ length: 16 }, (_, i) => [
      fila(`x${i}`, 2020, i === 0 ? null : i),
      fila(`x${i}`, 2021, i),
    ]).flat()
    const g = grupoDe(filas, propio, 'prestatariosPorMil', 'banda')
    expect(g.ultimo!.n).toBe(16)
    expect(g.serie!.every((p) => p.n === 15)).toBe(true)
  })

  it('con menos de 15 en el panel, sin línea de grupo', () => {
    const filas = Array.from({ length: 16 }, (_, i) => [
      fila(`x${i}`, 2020, i < 2 ? null : i),
      fila(`x${i}`, 2021, i),
    ]).flat()
    expect(grupoDe(filas, propio, 'prestatariosPorMil', 'banda').serie).toBeNull()
  })
})
