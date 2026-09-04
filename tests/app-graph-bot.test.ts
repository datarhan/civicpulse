/**
 * El bot es una segunda espina, no un nodo.
 *
 * Lo que entra por ahí es el mensaje de una persona, no el JSON de un portal, y
 * es el único sitio por donde entran datos personales. Sin él, `quejas.json`
 * aparece en el mapa como un fichero que nadie escribe — que es falso: lo
 * escribe un vecino con el móvil, y lo trae un flujo de CI.
 */
import { describe, it, expect } from 'vitest'
import { ENTRADAS_VACIAS, construirGrafoApp } from '../src/scraper/app-graph'

const BOT = {
  comandos: ['queja.ts', 'olvidar.ts'],
  servicios: ['photo-anonymize.ts', 'export.ts'],
  datos: [],
  fuentes: {},
  tablas: ['quejas', 'apoyos'],
  exporta: 'quejas.json',
}

describe('app-graph · la espina del bot', () => {
  const grafo = construirGrafoApp({
    ...ENTRADAS_VACIAS,
    bot: BOT,
    snapshots: [{ nombre: 'quejas.json', bytes: 100, generatedAt: null, source: null }],
    comandos: {},
    flujos: [
      {
        fichero: '.github/workflows/pull-quejas.yml',
        nombre: 'Pull quejas',
        cron: '0 4 * * *',
        ejecuta: [],
      },
    ],
  })
  const ids = grafo.nodos.map((n) => n.id)

  it('la fuente es una persona, y se dice', () => {
    expect(ids).toContain('fuente:Telegram')
    const f = grafo.nodos.find((n) => n.id === 'fuente:Telegram')
    expect(f.detalle).toMatch(/vecin|persona/i)
  })

  it('el bot recoge del vecino y guarda en sus tablas', () => {
    expect(grafo.aristas).toContainEqual({
      de: 'fuente:Telegram',
      a: 'proceso:bot',
      tipo: 'alimenta',
      origen: 'declarada',
    })
    expect(ids).toContain('snapshot:quejas (SQLite)')
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:bot',
      a: 'snapshot:quejas (SQLite)',
      tipo: 'escribe',
      origen: 'declarada',
    })
  })

  it('el flujo de CI trae el export al sitio: quejas.json YA tiene productor', () => {
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:pull-quejas.yml',
      a: 'snapshot:quejas.json',
      tipo: 'escribe',
      origen: 'declarada',
    })
    // Y por tanto deja de figurar como un fichero que nadie escribe. (Que
    // ninguna ruta lo lea es otro hecho, y en este montaje es cierto: no hay
    // rutas. La avería que se comprueba aquí es la de productor.)
    const suyas = grafo.averias.averias.filter((a) => a.nodo === 'snapshot:quejas.json')
    expect(suyas.map((a) => a.codigo)).not.toContain('sin-productor')
  })

  it('sin bot declarado no aparece nada del bot', () => {
    const vacio = construirGrafoApp({ ...ENTRADAS_VACIAS })
    expect(vacio.nodos.map((n) => n.id)).not.toContain('proceso:bot')
  })
})

describe('app-graph · el bot conserva su familia', () => {
  it('las tablas del bot no se quedan huérfanas al repartir dominios', () => {
    // El union-find sólo conoce los ficheros de public/data. Si el reparto
    // pisara lo que el bot ya declaró, sus tablas desaparecerían de la familia
    // «quejas» y el bot quedaría dibujado en el aire.
    const grafo = construirGrafoApp({ ...ENTRADAS_VACIAS, bot: BOT })
    const tabla = grafo.nodos.find((n) => n.id === 'snapshot:quejas (SQLite)')
    expect(tabla.dominio).toBe('quejas')
  })
})
