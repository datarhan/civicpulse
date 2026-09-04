/**
 * La geometría del despiece.
 *
 * El orden por baricentro se descartó midiendo: con 20 % de aristas hacia atrás
 * y 56 % saltando carril, deja decenas de miles de cruces y ni siquiera
 * converge. Lo que sí da un dibujo determinista es el ESPINAZO: una arista
 * primaria por nodo, y cada nodo colocado bajo la fila de su destino primario.
 */
import { describe, it, expect } from 'vitest'
import {
  espina,
  ordenarCarriles,
  contarCruces,
  cierre,
  ordenAlfabetico,
  CARRILES,
  medida,
  trazar,
} from '../src/components/despiece/despiece-geometria'

/** Dos cadenas cruzadas: s1 va a n2 y s2 va a n1. */
const NODOS = [
  { id: 'script:s1', carril: 'script' },
  { id: 'script:s2', carril: 'script' },
  { id: 'snapshot:n1', carril: 'snapshot' },
  { id: 'snapshot:n2', carril: 'snapshot' },
  { id: 'ruta:/a', carril: 'ruta' },
  { id: 'ruta:/b', carril: 'ruta' },
]
const ARISTAS = [
  { de: 'script:s1', a: 'snapshot:n2', tipo: 'escribe' },
  { de: 'script:s2', a: 'snapshot:n1', tipo: 'escribe' },
  { de: 'snapshot:n1', a: 'ruta:/a', tipo: 'alimenta' },
  { de: 'snapshot:n2', a: 'ruta:/b', tipo: 'alimenta' },
]

describe('despiece-geometria · el espinazo', () => {
  it('le da a cada nodo una arista primaria, o dice que no tiene', () => {
    const esp = espina(NODOS, ARISTAS)
    expect(esp.get('script:s1')).toBe('snapshot:n2')
    expect(esp.get('script:s2')).toBe('snapshot:n1')
    // Una ruta es el final del recorrido: no tiene destino primario.
    expect(esp.get('ruta:/a')).toBe(null)
  })

  it('el espinazo no cruza ni una vez, y el alfabético sí', () => {
    const alfabetico = ordenAlfabetico(NODOS)
    // Control positivo: si esto diera 0, la prueba de abajo no mediría nada.
    expect(contarCruces(alfabetico, ARISTAS)).toBeGreaterThan(0)

    const orden = ordenarCarriles(NODOS, ARISTAS, espina(NODOS, ARISTAS))
    expect(contarCruces(orden, ARISTAS)).toBe(0)
  })

  it('coloca cada nodo en su carril, sin dejarse ninguno', () => {
    const orden = ordenarCarriles(NODOS, ARISTAS, espina(NODOS, ARISTAS))
    expect(orden.size).toBe(NODOS.length)
    for (const n of NODOS) expect(orden.get(n.id).carril).toBeGreaterThanOrEqual(0)
  })

  it('el mismo grafo da el mismo dibujo dos veces', () => {
    const a = ordenarCarriles(NODOS, ARISTAS, espina(NODOS, ARISTAS))
    const b = ordenarCarriles([...NODOS].reverse(), ARISTAS, espina(NODOS, ARISTAS))
    const normal = (m) => JSON.stringify([...m].sort((x, y) => (x[0] < y[0] ? -1 : 1)))
    expect(normal(a)).toEqual(normal(b))
  })
})

describe('despiece-geometria · lo que NO va en el espinazo', () => {
  it('deja fuera los procesos, y por eso quien dibuja tiene que contarlos aparte', () => {
    // La banda de procesos —crones, flujos, guardas, CLIs— no es un carril del
    // recorrido del dato. Se excluye a posta, y esta prueba lo fija para que
    // nadie la dé por perdida: si un día `CARRILES` incluyera 'proceso', el
    // dibujo cambiaría de sentido sin que nada avisara.
    const conProceso = [...NODOS, { id: 'proceso:cron', carril: 'proceso' }]
    const orden = ordenarCarriles(conProceso, ARISTAS, espina(conProceso, ARISTAS))
    expect(orden.has('proceso:cron')).toBe(false)
    expect(orden.size).toBe(NODOS.length)
    expect(CARRILES).not.toContain('proceso')
  })
})

describe('despiece-geometria · el recorrido', () => {
  it('alcanza aguas arriba y aguas abajo, y NO la rama hermana', () => {
    const { arriba, abajo } = cierre('snapshot:n1', ARISTAS, { profundidad: 5 })
    expect([...abajo.keys()]).toContain('ruta:/a')
    expect([...arriba.keys()]).toContain('script:s2')
    // Control negativo: la otra cadena no está en el recorrido de ésta.
    expect([...abajo.keys()]).not.toContain('ruta:/b')
    expect([...arriba.keys()]).not.toContain('script:s1')
  })

  it('la profundidad recorta, y dice a qué distancia está cada nodo', () => {
    const corto = cierre('script:s2', ARISTAS, { profundidad: 1 })
    expect(corto.abajo.get('snapshot:n1')).toBe(1)
    expect(corto.abajo.has('ruta:/a')).toBe(false)

    const largo = cierre('script:s2', ARISTAS, { profundidad: 2 })
    expect(largo.abajo.get('ruta:/a')).toBe(2)
  })
})

describe('despiece-geometria · de filas a píxeles', () => {
  const orden = ordenarCarriles(NODOS, ARISTAS, espina(NODOS, ARISTAS))

  it('compacta los carriles vacíos: no deja columnas en blanco', () => {
    // El grafo de prueba usa script, snapshot y ruta — no fuente, parser, hook
    // ni vista. Un lienzo de siete columnas con cuatro vacías es un dibujo que
    // miente sobre lo que hay.
    const m = medida(orden)
    expect(m.carriles.map((c) => c.carril)).toEqual(['script', 'snapshot', 'ruta'])
    expect(m.carriles[0].x).toBeLessThan(m.carriles[1].x)
    expect(m.ancho).toBeGreaterThan(0)
    expect(m.alto).toBeGreaterThan(0)
  })

  it('sitúa cada nodo dentro del lienzo que declara', () => {
    const m = medida(orden)
    for (const n of NODOS) {
      const caja = m.cajas.get(n.id)
      expect(caja).toBeDefined()
      expect(caja.x).toBeGreaterThanOrEqual(0)
      expect(caja.x + caja.ancho).toBeLessThanOrEqual(m.ancho)
      expect(caja.y + caja.alto).toBeLessThanOrEqual(m.alto)
    }
  })

  it('traza una curva de lado a lado, y dice cuántos carriles se salta', () => {
    const m = medida(orden)
    const recta = trazar(m, { de: 'script:s2', a: 'snapshot:n1' })
    expect(recta.d).toMatch(/^M[\d.]+,[\d.]+ C/)
    expect(recta.salta).toBe(0)

    // script → ruta se saltaría el carril de snapshot.
    const salto = trazar(m, { de: 'script:s2', a: 'ruta:/a' })
    expect(salto.salta).toBe(1)
  })

  it('una arista con un extremo fuera del lienzo devuelve null, no una curva a la nada', () => {
    expect(trazar(medida(orden), { de: 'script:s1', a: 'fantasma:x' })).toBe(null)
  })
})
