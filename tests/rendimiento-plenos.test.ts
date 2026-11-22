/**
 * El renglón de rendimiento de la tubería de plenos y su comparación con la
 * pasada anterior (paso 0.3). Lo que se pide: que mida la atribución en tres
 * pasos sin confundirlos, que lo no leído salga «?» y nunca 0, y que la palabra
 * DEGRADADO salga sólo cuando la pasada fue a peor — y entonces siempre.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { medirEnDisco } from '../scripts/rendimiento-plenos'
import {
  avisoDePasada,
  compararConPrevia,
  hoyEnMadrid,
  leerPrevia,
  lineaRendimiento,
  lineaUltimaPasada,
  medirRendimiento,
  NUMERADORES,
  type Entradas,
  type Mapa,
  type Previa,
} from '../src/scraper/rendimiento-plenos'

const mapa = (id: string, completo: boolean, huecos = 0, legible = true): Mapa => ({
  id,
  legible,
  completo,
  huecos,
})

const BASE: Entradas = {
  extraidas: [
    { plenoId: 'a', speakerGroup: 'PSOE' },
    { plenoId: 'a', speakerGroup: null },
    { plenoId: 'b', speakerGroup: null },
    // De una sesión de acta: ni cuenta en el denominador ni puede tener grupo.
    { plenoId: 'acta1', speakerGroup: 'PP' },
  ],
  publicadas: [{ speakerGroup: 'PSOE' }, { speakerGroup: null }],
  transcripciones: [
    { id: 'a', tipo: 'audio' },
    { id: 'b', tipo: 'audio' },
    { id: 'c', tipo: 'audio' },
    { id: 'acta1', tipo: 'acta' },
    { id: 'raro', tipo: 'unknown' },
  ],
  mapas: [
    mapa('a', true),
    mapa('b', true, 2),
    mapa('c', false),
    // Un mapa de una sesión que no es de audio no es atribución posible.
    mapa('acta1', true),
  ],
  hallazgos: [{ publishedAt: '2026-07-07' }, { publishedAt: '2026-07-30' }, { publishedAt: 'x' }],
  hoy: '2026-11-22',
}

describe('medirRendimiento', () => {
  it('cuenta los tres pasos por separado, y sólo las de audio', () => {
    const r = medirRendimiento(BASE)
    expect(r).toMatchObject({
      extraidas: 4,
      extraidasDeAudio: 3,
      conBloque: 1,
      sesionesConBloque: 1,
      porSesion: { a: 1 },
      gruposDesconocidos: 0,
      publicadas: 2,
      publicadasConBloque: 1,
      audio: 3,
      acta: 1,
      desconocidas: 1,
      mapasCompletos: 2,
      mapasConHuecos: 1,
      mapasEnteros: 1,
      mapasParciales: 1,
      mapasIlegibles: 0,
      // b: terminado y sin ninguna declaración con grupo.
      mapasSinBloque: 1,
      // c sin mapa terminado + b sin grupo.
      pendiente: 2,
      hallazgos: 3,
      ultimoHallazgo: '2026-07-30',
      diasSinHallazgo: 115,
    })
  })

  it('un grupo que no es de SPEAKER_GROUPS no cuenta como atribución: se cuenta aparte', () => {
    const r = medirRendimiento({
      ...BASE,
      extraidas: [...BASE.extraidas!, { plenoId: 'b', speakerGroup: 'Otro' }],
    })
    expect(r.conBloque).toBe(1)
    expect(r.gruposDesconocidos).toBe(1)
    expect(lineaRendimiento(r)).toMatch(/1 con un grupo que no es ninguno de los conocidos/)
  })

  it('un mapa ilegible no es «a medias»: se dice aparte, y lo pendiente queda en «?»', () => {
    const r = medirRendimiento({
      ...BASE,
      mapas: [...BASE.mapas!.slice(0, 2), mapa('c', false, 0, false)],
    })
    expect(r.mapasParciales).toBe(0)
    expect(r.mapasIlegibles).toBe(1)
    expect(r.pendiente).toBeNull()
    expect(lineaRendimiento(r)).toMatch(/1 que no se dejan leer/)
  })

  it('lo que no se pudo leer es null, no 0, y el renglón lo dice con «?»', () => {
    const r = medirRendimiento({ ...BASE, extraidas: null, mapas: null, hallazgos: null })
    expect(r.conBloque).toBeNull()
    expect(r.mapasCompletos).toBeNull()
    expect(r.pendiente).toBeNull()
    expect(r.ultimoHallazgo).toBeNull()
    const l = lineaRendimiento(r)
    expect(l).toMatch(/extraídas con grupo \? de \? de audio/)
    expect(l).toMatch(/mapas terminados \? de 3/)
    expect(l).toMatch(/último hallazgo \?/)
    expect(l).not.toMatch(/ 0 /)
  })

  it('sin ningún hallazgo publicado lo dice, en vez de «?»', () => {
    const l = lineaRendimiento(medirRendimiento({ ...BASE, hallazgos: [] }))
    expect(l).toMatch(/ningún hallazgo publicado/)
  })

  it('el renglón lleva las cifras con separador de miles y el porcentaje sobre las de audio', () => {
    const extraidas = Array.from({ length: 8493 }, (_, i) => ({
      plenoId: i < 7164 ? 'a' : 'acta1',
      speakerGroup: i < 188 ? 'PP' : null,
    }))
    const l = lineaRendimiento(medirRendimiento({ ...BASE, extraidas }))
    expect(l).toMatch(/extraídas con grupo 188 de 7\.164 de audio \(2,6 %; 8\.493 en total\)/)
  })
})

describe('hoyEnMadrid', () => {
  it('pasada la medianoche en Madrid ya es el día siguiente, aunque en UTC no', () => {
    expect(hoyEnMadrid(new Date('2026-11-22T23:30:00Z'))).toBe('2026-11-23')
    expect(hoyEnMadrid(new Date('2026-11-22T22:30:00Z'))).toBe('2026-11-22')
  })
})

describe('compararConPrevia', () => {
  const r = medirRendimiento(BASE)
  const previa = (p: Partial<Previa> = {}): Previa => ({
    at: '2026-11-19T10:00:00Z',
    valores: { conBloque: 1, sesionesConBloque: 1, mapasEnteros: 1 },
    porSesion: { a: 1 },
    errores: 2,
    sinAvance: 0,
    sinAvanceDesde: null,
    veredicto: null,
    ...p,
  })
  const AHORA = '2026-11-22T10:00:00Z'

  it('la primera pasada no compara, y deja la base para la siguiente', () => {
    const v = compararConPrevia(r, null, 3, AHORA)
    expect(v.degradado).toBe(false)
    expect(v.texto).toBe('sin comparar (no hay pasada previa guardada)')
    expect(v.siguiente.valores).toEqual({ conBloque: 1, sesionesConBloque: 1, mapasEnteros: 1 })
    expect(v.siguiente.errores).toBe(3)
    expect(v.siguiente.veredicto).toBe(v.texto)
  })

  it('una previa que no se deja leer lo dice, no la confunde con «no hay»', () => {
    expect(compararConPrevia(r, null, 3, AHORA, 'ilegible').texto).toMatch(/no se deja leer/)
  })

  it('un numerador que baja es DEGRADADO, con el nombre y las dos cifras', () => {
    const v = compararConPrevia(
      r,
      previa({ valores: { conBloque: 5, sesionesConBloque: 1, mapasEnteros: 1 } }),
      2,
      AHORA,
    )
    expect(v.degradado).toBe(true)
    expect(v.texto).toBe('DEGRADADO — bajó desde la pasada anterior: extraídas con grupo 5→1')
  })

  it('una sesión que pierde declaraciones con grupo es DEGRADADO aunque el total suba', () => {
    const ahora = { ...r, conBloque: 31, porSesion: { a: 1, b: 30 } }
    const v = compararConPrevia(
      ahora,
      previa({
        valores: { conBloque: 21, sesionesConBloque: 1, mapasEnteros: 1 },
        porSesion: { a: 21 },
      }),
      2,
      AHORA,
    )
    expect(v.degradado).toBe(true)
    expect(v.texto).toMatch(/sesiones con menos declaraciones con grupo: a 21→1/)
    // Y lo que subió también se dice: un veredicto mixto no se calla la mitad.
    expect(v.texto).toMatch(/subió: extraídas con grupo 21→31/)
  })

  it('un mapa que se da por terminado rindiéndose en sus trozos no es «avanza»', () => {
    const antes = medirRendimiento({
      ...BASE,
      mapas: [mapa('a', true), mapa('b', false), mapa('c', false)],
    })
    const despues = medirRendimiento({
      ...BASE,
      mapas: [mapa('a', true), mapa('b', true, 6), mapa('c', false)],
    })
    expect(despues.mapasCompletos).toBe(antes.mapasCompletos! + 1)
    const p0 = compararConPrevia(antes, null, 2, '2026-11-19T10:00:00Z').siguiente
    const v = compararConPrevia(
      despues,
      { ...p0, sinAvance: 3, sinAvanceDesde: '2026-11-09' },
      2,
      AHORA,
    )
    expect(v.texto).toMatch(/^SIN AVANCE \(4 pasada/)
  })

  it('más errores en el manifiesto es DEGRADADO; los mismos, no', () => {
    expect(compararConPrevia(r, previa(), 3, AHORA).texto).toMatch(
      /^DEGRADADO — errores del manifiesto 2→3/,
    )
    expect(compararConPrevia(r, previa(), 2, AHORA).degradado).toBe(false)
  })

  it('un manifiesto sin leer (null) ni compara ni pisa el último conocido', () => {
    const v = compararConPrevia(r, previa(), null, AHORA)
    expect(v.degradado).toBe(false)
    expect(v.siguiente.errores).toBe(2)
    // Y la pasada siguiente, con 3, sí se compara contra ese 2 y no contra un 0.
    expect(compararConPrevia(r, v.siguiente, 3, AHORA).degradado).toBe(true)
  })

  it('plano con trabajo pendiente es SIN AVANCE, con su racha desde la pasada previa, y no DEGRADADO', () => {
    const v1 = compararConPrevia(r, previa(), 2, AHORA)
    expect(v1.degradado).toBe(false)
    expect(v1.texto).toMatch(
      /^SIN AVANCE \(1 pasada\(s\) seguidas, desde 2026-11-19\) — 2 sesión\(es\)/,
    )
    expect(v1.texto).not.toMatch(/comparados/)
    const v2 = compararConPrevia(r, v1.siguiente, 2, '2026-11-26T10:00:00Z')
    expect(v2.texto).toMatch(/^SIN AVANCE \(2 pasada\(s\) seguidas, desde 2026-11-19\)/)
  })

  it('SIN AVANCE dice cuántos numeradores pudo comparar si no fueron todos', () => {
    const ciega = medirRendimiento({ ...BASE, extraidas: null })
    expect(compararConPrevia(ciega, previa(), 2, AHORA).texto).toMatch(/\(1 de 3 comparados\)$/)
  })

  it('un numerador al alza es «avanza» y corta la racha', () => {
    const v = compararConPrevia(
      r,
      previa({
        valores: { conBloque: 0, sesionesConBloque: 1, mapasEnteros: 1 },
        porSesion: {},
        sinAvance: 4,
        sinAvanceDesde: '2026-11-01',
      }),
      2,
      AHORA,
    )
    expect(v.texto).toBe('avanza — extraídas con grupo 0→1')
    expect(v.siguiente.sinAvance).toBe(0)
  })

  it('sin nada pendiente y plano, «al día»', () => {
    const todo = medirRendimiento({
      ...BASE,
      extraidas: ['a', 'b', 'c'].map((plenoId) => ({ plenoId, speakerGroup: 'PP' })),
      mapas: ['a', 'b', 'c'].map((id) => mapa(id, true)),
    })
    const v = compararConPrevia(
      todo,
      previa({
        valores: { conBloque: 3, sesionesConBloque: 3, mapasEnteros: 3 },
        porSesion: { a: 1, b: 1, c: 1 },
      }),
      2,
      AHORA,
    )
    expect(v.texto).toMatch(/^al día/)
  })

  it('una noche sin leer las extraídas no borra su último valor conocido', () => {
    const ciega = medirRendimiento({ ...BASE, extraidas: null })
    const v = compararConPrevia(
      ciega,
      previa({ valores: { conBloque: 9, sesionesConBloque: 1, mapasEnteros: 1 } }),
      2,
      AHORA,
    )
    expect(v.siguiente.valores.conBloque).toBe(9)
    expect(v.siguiente.porSesion).toEqual({ a: 1 })
    expect(v.texto).not.toMatch(/extraídas con grupo/)
  })

  it('sin ninguna cifra legible, «sin comparar», nunca limpio', () => {
    const nada = medirRendimiento({ ...BASE, extraidas: null, mapas: null })
    expect(compararConPrevia(nada, previa(), null, AHORA).texto).toMatch(/^sin comparar/)
  })

  it('compara sólo numeradores: ni porcentajes, ni el total, ni mapas rendidos', () => {
    expect([...NUMERADORES].sort()).toEqual(['conBloque', 'mapasEnteros', 'sesionesConBloque'])
  })
})

describe('leerPrevia y la línea del parte', () => {
  it('una forma rara cuenta como «no hay»', () => {
    expect(leerPrevia(null)).toBeNull()
    expect(leerPrevia({ at: 1 })).toBeNull()
    expect(leerPrevia({ at: 'x', valores: { conBloque: 'no' } })).toEqual({
      at: 'x',
      valores: {},
      porSesion: null,
      errores: null,
      sinAvance: 0,
      sinAvanceDesde: null,
      veredicto: null,
    })
  })

  it('el parte repite el veredicto guardado, con su fecha', () => {
    const v = compararConPrevia(medirRendimiento(BASE), null, 0, '2026-11-22T10:00:00Z')
    const guardada = leerPrevia(JSON.parse(JSON.stringify(v.siguiente)))
    expect(lineaUltimaPasada(guardada)).toBe(
      'última pasada de plenos (2026-11-22): sin comparar (no hay pasada previa guardada)',
    )
    expect(lineaUltimaPasada(null)).toMatch(/sin veredicto guardado/)
  })
})

describe('sobre el repositorio de verdad', () => {
  it('lee todas las cifras: ninguna sale «sin leer» con los datos publicados', () => {
    const r = medirEnDisco()
    for (const k of [
      'extraidas',
      'conBloque',
      'publicadas',
      'audio',
      'hallazgos',
      'mapasCompletos',
      'mapasParciales',
      'pendiente',
    ] as const)
      expect(r[k], k).not.toBeNull()
    expect(r.mapasCompletos!, 'ningún mapa terminado: ¿falta pleno-speaker-map/?').toBeGreaterThan(
      0,
    )
    expect(r.mapasIlegibles).toBe(0)
    // Un cotejo de verdad: lo servido es lo que el manifiesto de los trozos dice
    // que hay (y no confunde ese manifiesto con un trozo).
    const indice = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
    expect(r.publicadas).toBe(indice.totals.items)
  })
})

describe('avisoDePasada', () => {
  const guardada = (veredicto: string, at = '2026-11-22T10:00:00Z'): Previa => ({
    at,
    valores: {},
    porSesion: null,
    errores: null,
    sinAvance: 0,
    sinAvanceDesde: null,
    veredicto,
  })
  const AHORA = new Date('2026-11-23T11:00:00Z')

  it('un DEGRADADO reciente es un aviso del parte, con la hora de la pasada en el código', () => {
    const a = avisoDePasada(guardada('DEGRADADO — bajó desde la pasada anterior: x 2→1'), AHORA)
    expect(a?.code).toBe('plenos-a-peor:2026-11-22T10:00:00Z')
    expect(a?.detail).toMatch(/2026-11-22: DEGRADADO — bajó/)
  })

  it('ni SIN AVANCE, ni «avanza», ni uno de hace más de cinco días, ni sin previa', () => {
    expect(avisoDePasada(guardada('SIN AVANCE (3 pasada(s) seguidas…)'), AHORA)).toBeNull()
    expect(avisoDePasada(guardada('avanza — x 1→2'), AHORA)).toBeNull()
    expect(avisoDePasada(guardada('DEGRADADO — x', '2026-11-10T10:00:00Z'), AHORA)).toBeNull()
    expect(avisoDePasada(null, AHORA)).toBeNull()
  })
})
