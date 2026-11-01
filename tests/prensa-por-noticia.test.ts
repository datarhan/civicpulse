/**
 * La prensa de /cambios, una fila por noticia (auditoría de las dos lecturas,
 * §2): «la misma noticia aparece dos veces, en un medio valenciano y en uno
 * castellano».
 *
 * La regla de /laboratorio (`clusterArticlesByStory`) no basta: de las siete
 * noticias que el 28-10-2026 salían en más de un sitio en catorce días, juntaba
 * una. Las demás eran la misma noticia en las dos lenguas. Esta añade dos señales
 * —una cifra distintiva y una raíz compartidas, o tres raíces— y se mide sobre los
 * 818 titulares de prensa que press.json ha publicado desde mayo de 2025: los
 * pares que une se leyeron uno a uno.
 *
 * Los fixtures son filas reales: `prensa-misma-noticia_2026-10-28.json`, pares
 * sacados de las versiones de press.json en git; `press_2026-10-28.json`, las 26
 * piezas de los catorce días que acaban el 28-10-2026, con el anuncio de Fotocasa.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  DIAS_DE_UNA_NOTICIA,
  agruparPorNoticia,
  cifrasDistintivas,
  mismaNoticia,
} from '../src/scraper/prensa-por-noticia'
import { esFuenteOficial } from '../src/scraper/press-fuente-oficial'
import { sinAnunciosClasificados } from '../src/scraper/press-clasificado'

const lee = (f: string) => JSON.parse(readFileSync(`tests/fixtures/${f}`, 'utf8'))
const PARES = lee('prensa-misma-noticia_2026-10-28.json')
const PRESS = lee('press_2026-10-28.json')
const PIEZAS = sinAnunciosClasificados(PRESS.items as any[])

describe('cifrasDistintivas', () => {
  it('lee la cifra escrita de las formas en que la escriben los medios', () => {
    expect([...cifrasDistintivas("aumenta un 31'6% la contratación")]).toEqual(['31.6'])
    expect([...cifrasDistintivas('augmenta un 31,6 % la contractació')]).toEqual(['31.6'])
    expect([...cifrasDistintivas('un superávit de 4’5 millones')]).toEqual(['4.5'])
    expect([...cifrasDistintivas('reúne a 2.800 empresas')]).toEqual(['2800'])
    expect([...cifrasDistintivas('recibe más de 10M€')]).toEqual(['10'])
    expect([...cifrasDistintivas('la seguridad en la CV-336')]).toEqual(['336'])
  })

  it('un año o una cifra de un dígito no distinguen una noticia', () => {
    expect(cifrasDistintivas('Curso de Verano de Danza 2026').size).toBe(0)
    expect(cifrasDistintivas('se citen el 8 de novembre').size).toBe(0)
  })
})

describe('mismaNoticia', () => {
  it('mide algo: los fixtures traen los pares', () => {
    expect(PARES.positivos.length).toBeGreaterThanOrEqual(7)
    expect(PARES.negativos.length).toBeGreaterThanOrEqual(6)
  })

  for (const { caso, a, b } of PARES.positivos) {
    it(`junta: ${caso}`, () => {
      expect(mismaNoticia(a, b)).toBe(true)
      expect(mismaNoticia(b, a)).toBe(true)
    })
  }

  for (const { caso, a, b } of PARES.negativos) {
    it(`no junta: ${caso}`, () => {
      expect(mismaNoticia(a, b)).toBe(false)
      expect(mismaNoticia(b, a)).toBe(false)
    })
  }

  it(`a más de ${DIAS_DE_UNA_NOTICIA} días no junta ni dos titulares iguales`, () => {
    const [{ a }] = PARES.positivos
    const despues = { ...a, id: 'otro', sourceHost: 'otro.es', date: '2026-10-30T10:00:00.000Z' }
    expect(mismaNoticia(a, despues)).toBe(false)
  })
})

/** Un grupo, como «host día» de cada pieza, para comparar sin depender del orden. */
const clave = (p: any) => `${p.sourceHost} ${p.date.slice(0, 10)}`

describe('agruparPorNoticia sobre los catorce días que acaban el 28-10-2026', () => {
  const grupos = agruparPorNoticia(PIEZAS)

  it('mide algo: 25 piezas sin el anuncio de Fotocasa', () => {
    expect(PRESS.items.length).toBe(26)
    expect(PIEZAS.length).toBe(25)
  })

  it('cada pieza en un grupo y en uno solo', () => {
    const ids = grupos.flatMap((g) => g.piezas.map((p: any) => p.id))
    expect(ids.length).toBe(PIEZAS.length)
    expect(new Set(ids).size).toBe(PIEZAS.length)
  })

  it('junta cinco noticias que salen en más de un sitio, y ninguna más', () => {
    const multiples = grupos
      .filter((g) => g.piezas.length > 1)
      .map((g) => ({ principal: clave(g.principal), piezas: g.piezas.map(clave).sort() }))
    expect(multiples).toEqual([
      {
        principal: 'valenciaplaza.com 2026-10-23',
        piezas: ['infoturia.com 2026-10-23', 'valenciaplaza.com 2026-10-23'],
      },
      {
        principal: 'infoturia.com 2026-10-21',
        piezas: ['infoturia.com 2026-10-21', 'ribarroja.es 2026-10-21'],
      },
      {
        principal: 'infoturia.com 2026-10-16',
        piezas: ['infoturia.com 2026-10-16', 'ribarroja.es 2026-10-16'],
      },
      {
        principal: 'elperiodic.com 2026-10-16',
        piezas: [
          'cheste.es 2026-10-16',
          'elperiodic.com 2026-10-16',
          'elperiodicodeaqui.com 2026-10-16',
        ],
      },
      {
        principal: 'infoturia.com 2026-10-15',
        piezas: ['infoturia.com 2026-10-15', 'ribarroja.es 2026-10-15'],
      },
    ])
    expect(grupos.length).toBe(25 - 11 + 5)
  })

  // Lo que la regla no junta, medido: sale en dos filas, como antes. Si una regla
  // mejor los junta, esta prueba se pone roja y hay que leer qué más junta.
  const par = (h1: string, t1: string, h2: string, t2: string) => [
    PIEZAS.find((p: any) => p.sourceHost === h1 && p.title.includes(t1)),
    PIEZAS.find((p: any) => p.sourceHost === h2 && p.title.includes(t2)),
  ]
  const NO_JUNTA = {
    'la Ofrena al Túria, en Levante y en Valenciabonita': par(
      'levante-emv.com',
      'Ofrena',
      'valenciabonita.es',
      'Ofrena',
    ),
    'el MeteoAula, en la web municipal y en El Periódico de Aquí': par(
      'ribarroja.es',
      'MeteoAula',
      'elperiodicodeaqui.com',
      'aulas',
    ),
    'el proyecto CircSyst, con palabras distintas': par(
      'cadenaser.com',
      'CircSyst',
      'actualidadvalencia.com',
      'agua regenerada',
    ),
  }
  for (const [caso, [a, b]] of Object.entries(NO_JUNTA)) {
    it(`no junta, medido el 28-10: ${caso}`, () => {
      expect(a, caso).toBeDefined()
      expect(b, caso).toBeDefined()
      expect(mismaNoticia(a, b)).toBe(false)
    })
  }

  it('el titular de la fila es el de un medio, si lo hay, y el primero que la publicó', () => {
    for (const g of grupos) {
      const medios = g.piezas.filter((p: any) => !esFuenteOficial(p))
      if (medios.length === 0) continue
      expect(esFuenteOficial(g.principal)).toBe(false)
      const primero = [...medios].sort((x: any, y: any) => x.date.localeCompare(y.date))[0]
      expect(g.principal.id).toBe(primero.id)
      expect(g.piezas[0].id).toBe(g.principal.id)
    }
  })

  it('las filas van de la más reciente a la más antigua', () => {
    const fechas = grupos.map((g) => g.principal.date)
    expect(fechas).toEqual([...fechas].sort().reverse())
  })
})
