import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La infografía es el mismo reportaje en una sola página servible — y son DOS
 * artefactos congelados que afirman las mismas cifras. Dos copias de una cifra
 * es la receta clásica de la deriva: el reportaje se corrige por su vía
 * (`meta.correcciones`, que el lector ve plegada pero visible) y la infografía,
 * que no tiene vía, se quedaría afirmando el número viejo con la misma
 * tipografía segura.
 *
 * Así que cada cifra de la infografía se recontrasta contra el JSON congelado
 * del reportaje, que es la única fuente de las dos superficies. No se comprueba
 * presentación (anchos de barra, posiciones): sólo los números que un lector
 * puede citar.
 */
const RAIZ = join(__dirname, '..')
const html = readFileSync(join(RAIZ, 'public/infografias/eficiencia-2026-08.html'), 'utf8')
const pieza = JSON.parse(
  readFileSync(join(RAIZ, 'public/data/reportajes/coste-efectivo.json'), 'utf8'),
)

/** es-ES con un decimal: 44.9 → «44,9», como imprime la infografía. */
const es1 = (v) => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** Las variaciones van redondeadas al entero en la infografía: 111.9 → «+112 %». */
const pct = (v) => `+${Math.round(v)} %`

describe('infografía — cada cifra coincide con el reportaje congelado', () => {
  it('mide algo: el HTML y el JSON traen lo que este test recorre', () => {
    expect(html.length).toBeGreaterThan(5000)
    expect(pieza.rendicionCV.porAnio.length).toBeGreaterThan(5)
    expect(pieza.inflacion.servicios.length).toBeGreaterThan(2)
    expect(pieza.congelados.banda).toBeTruthy()
  })

  it('lleva el título de la pieza', () => {
    expect(html).toContain(pieza.meta.titulo)
  })

  it('las once casillas de entrega: presentadas y ausentes, año por año', () => {
    const presentadas = html.match(/celda presentada/g) ?? []
    expect(presentadas.length).toBe(
      pieza.entregas.publicadas.length - pieza.entregas.noPresentadas.length,
    )
    const ausentes = [...html.matchAll(/class="celda ausente"[^>]*>(\d{4})</g)].map((m) =>
      Number(m[1]),
    )
    expect(ausentes.sort()).toEqual([...pieza.entregas.noPresentadas].sort())
  })

  it('el control anti-pandemia: los recuentos de rendición por año, incluido el propio', () => {
    for (const fila of pieza.rendicionCV.porAnio) {
      expect(html, `falta el recuento de ${fila.anio}`).toContain(`>${fila.n}</span>`)
    }
    // La fila destacada en ámbar es exactamente el año que Riba-roja no rindió.
    const propia = html.match(
      /class="fila propia"><span class="anio">(\d{4})<\/span>.*?<span class="n">(\d+)<\/span>/s,
    )
    expect(propia, 'no hay fila propia destacada').toBeTruthy()
    expect(pieza.entregas.noPresentadas).toContain(Number(propia[1]))
    const enJson = pieza.rendicionCV.porAnio.find((f) => f.anio === Number(propia[1]))
    expect(Number(propia[2])).toBe(enJson.n)
  })

  it('los denominadores congelados y su banda de comparación', () => {
    const c = pieza.congelados
    expect(html).toContain(`${c.propios} de ${c.medibles}`)
    expect(html).toContain(`p25 · ${es1(c.banda.p25)} %`)
    expect(html).toContain(`mediana · ${es1(c.banda.mediana)} %`)
    expect(html).toContain(`p75 · ${es1(c.banda.p75)} %`)
    expect(html).toContain(`${c.banda.n} comparables`)
    expect(html).toContain(`Riba-roja · ${c.banda.propio} %`)
  })

  it('la inflación acumulada y las tres variaciones, corrientes y constantes', () => {
    expect(html).toContain(`${es1(pieza.inflacion.acumulada)} %`)
    for (const s of pieza.inflacion.servicios) {
      expect(html, `falta ${s.nombre}`).toContain(s.nombre)
      expect(html, `variación corriente de ${s.nombre}`).toContain(pct(s.nominal))
      expect(html, `variación constante de ${s.nombre}`).toContain(pct(s.real))
    }
  })

  it('si el reportaje se corrige, la infografía no puede quedarse callada', () => {
    // La pieza publicada anota sus correcciones en meta.correcciones y el
    // componente las pliega sin esconderlas. La infografía no tiene componente:
    // este candado la obliga a llevar la palabra «Corrección» el día que el
    // reportaje la lleve, o a fallar en rojo hasta que alguien la ponga.
    if (pieza.meta.correcciones.length > 0) {
      expect(html, 'el reportaje tiene correcciones y la infografía no dice «Corrección»').toMatch(
        /Corrección/,
      )
    }
  })

  it('enlaza de vuelta a las dos superficies vivas', () => {
    expect(html).toContain(`/reportajes/${pieza.meta.slug}`)
    expect(html).toContain('/eficiencia')
  })
})
