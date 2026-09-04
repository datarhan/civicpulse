/**
 * Las notas a mano y su guarda.
 *
 * El despiece deriva las relaciones, pero «para qué sirve esto» y «cómo falla»
 * hay que escribirlo. Y una nota escrita a mano dentro de un mapa contra el
 * desfase se queda vieja ella sola — que es el chiste que este repositorio ya
 * ha contado dos veces. Por eso cada nota se ancla al hash del fichero que
 * describe y la comprobación tiene CUATRO desenlaces, no dos.
 */
import { describe, it, expect } from 'vitest'
import { verificarNotas } from '../src/scraper/app-graph-notas'

const GRAFO = {
  nodos: [
    { id: 'script:scrape-padron.ts', ruta: 'scripts/scrape-padron.ts' },
    { id: 'ruta:/datos', ruta: undefined },
  ],
}

describe('app-graph-notas · los cuatro desenlaces', () => {
  it('coincide cuando el hash sigue siendo el mismo', () => {
    const r = verificarNotas(
      [{ nodo: 'script:scrape-padron.ts', queEs: 'x', hashDelCodigo: 'aaa' }],
      GRAFO,
      () => 'aaa',
    )
    expect(r.map((x) => x.desenlace)).toEqual(['coincide'])
  })

  it('movido cuando el código cambió debajo de la nota — avisa, no rompe', () => {
    const r = verificarNotas(
      [{ nodo: 'script:scrape-padron.ts', queEs: 'x', hashDelCodigo: 'aaa' }],
      GRAFO,
      () => 'bbb',
    )
    expect(r[0].desenlace).toBe('movido')
    expect(r[0].rompe).toBe(false)
  })

  it('huérfana cuando la nota nombra un nodo que ya no existe — y ESA sí rompe', () => {
    const r = verificarNotas(
      [{ nodo: 'script:fantasma.ts', queEs: 'x', hashDelCodigo: 'aaa' }],
      GRAFO,
      () => 'aaa',
    )
    expect(r[0].desenlace).toBe('huerfana')
    expect(r[0].rompe).toBe(true)
  })

  it('una nota sobre algo sin fichero no puede quedarse vieja por el código', () => {
    // Una ruta no es un fichero: no hay hash que comparar, así que el único
    // desenlace posible es que exista o que no.
    const r = verificarNotas([{ nodo: 'ruta:/datos', queEs: 'x' }], GRAFO, () => null)
    expect(r[0].desenlace).toBe('coincide')
  })

  it('no confunde «no hay notas» con «todo coincide»', () => {
    // El desenlace de un conjunto vacío es vacío, no un visto bueno. Quien
    // imprime el parte tiene que poder distinguirlo.
    expect(verificarNotas([], GRAFO, () => 'aaa')).toEqual([])
  })
})

describe('app-graph-notas · las notas de verdad', () => {
  it('todas apuntan a un nodo del grafo real', async () => {
    const { NOTAS } = await import('../src/scraper/app-graph-notas')
    const { leerEntradas } = await import('../scripts/lib/app-graph-io')
    const { construirGrafoApp } = await import('../src/scraper/app-graph')
    const { resolve } = await import('node:path')
    const grafo = construirGrafoApp(leerEntradas(resolve(__dirname, '..')))

    // Suelo: un fichero de notas vacío pasaría cualquier comprobación sobre él.
    expect(NOTAS.length).toBeGreaterThan(3)
    const ids = new Set(grafo.nodos.map((n) => n.id))
    expect(NOTAS.filter((n) => !ids.has(n.nodo)).map((n) => n.nodo)).toEqual([])
  })
})
