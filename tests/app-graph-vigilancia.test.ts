/**
 * Quién vigila que un fichero no se quede quieto — y qué se publica de verdad.
 *
 * Dos huecos que se tocan:
 *
 * · El mapa llamaba «publicado» a todo lo que vive bajo `public/`. Es la regla
 *   correcta salvo por una excepción real: la guarda de publicación SACA
 *   ficheros de `dist/` al compilar. Un fichero que el despliegue quita no es
 *   fetchable, y decir «se publica y nadie lo lee» de él es falso.
 *
 * · 21 ficheros publicados que escribe una máquina no tienen expectativa de
 *   frescura: ni `DEFAULT_EXPECTATIONS` ni nadie mira si se quedan quietos.
 *   Hoy ninguno está rancio —`check:cadence` da 45 de 45—, y ése es justo el
 *   momento de ponerlo: la avería más cara de este repositorio fue una
 *   nocturna que dejó de escribir en silencio.
 *
 * Un fichero CURADO no entra: lo escribe una persona y envejecer no es un
 * fallo, es una decisión suya.
 */
import { describe, it, expect } from 'vitest'
import { construirGrafoApp, ENTRADAS_VACIAS } from '../src/scraper/app-graph'

const base = {
  ...ENTRADAS_VACIAS,
  curados: ['promises.json'],
  scripts: [
    {
      ruta: 'scripts/scrape-x.ts',
      fuente: "const O = resolve(D, 'x.json')\nwriteFileSync(O, d)",
    },
  ],
  snapshots: [{ nombre: 'x.json', bytes: 10, generatedAt: null, source: null }],
}

describe('app-graph · lo que la compilación retira no está publicado', () => {
  it('un fichero de la lista de no publicación deja de contar como publicado', () => {
    const grafo = construirGrafoApp({ ...base, denegados: ['x.json'] })
    const n = grafo.nodos.find((x) => x.id === 'snapshot:x.json')
    expect(n?.publicado).toBe(false)
    expect(n?.detalle).toMatch(/retira|no se despliega/i)
  })

  it('y por tanto no se le reprocha que ninguna página lo lea', () => {
    const grafo = construirGrafoApp({ ...base, denegados: ['x.json'] })
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).not.toContain('snapshot:x.json')
  })

  it('control: sin la lista, el mismo fichero SÍ sale señalado', () => {
    const grafo = construirGrafoApp({ ...base, denegados: [] })
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-superficie')
      .map((a) => a.nodo)
    expect(señalados).toContain('snapshot:x.json')
  })
})

describe('app-graph · sin-expectativa', () => {
  it('señala el publicado que escribe una máquina y cuya frescura nadie vigila', () => {
    const grafo = construirGrafoApp({ ...base, expectativas: [] })
    const señalados = grafo.averias.averias
      .filter((a) => a.codigo === 'sin-expectativa')
      .map((a) => a.nodo)
    expect(señalados).toContain('snapshot:x.json')
  })

  it('no señala el que sí tiene expectativa', () => {
    const grafo = construirGrafoApp({ ...base, expectativas: ['x.json'] })
    expect(grafo.averias.averias.filter((a) => a.codigo === 'sin-expectativa')).toEqual([])
  })

  it('no señala un fichero CURADO: lo escribe una persona', () => {
    const grafo = construirGrafoApp({
      ...base,
      curados: ['x.json'],
      expectativas: [],
    })
    expect(grafo.averias.averias.filter((a) => a.codigo === 'sin-expectativa')).toEqual([])
  })

  it('el publicado sin expectativa cuyo productor NO se derivó es no-medido', () => {
    // `budget-execution.json` no tiene expectativa y lo escribe la nocturna,
    // pero el escaneo no ata su escritura. Saltárselo en silencio lo deja fuera
    // del recuento justo por no haberlo podido leer, que es al revés.
    const grafo = construirGrafoApp({
      ...base,
      scripts: [],
      snapshots: [{ nombre: 'y.json', bytes: 10, generatedAt: null, source: null }],
      expectativas: [],
    })
    expect(grafo.averias.averias.filter((a) => a.codigo === 'sin-expectativa')).toEqual([])
    expect(
      grafo.averias.noMedido.some(
        (m) => m.codigo === 'sin-expectativa' && m.motivo.includes('y.json'),
      ),
    ).toBe(true)
  })

  it('si no se pudo leer el registro de expectativas, es NO MEDIDO, no un visto bueno', () => {
    // Un registro ilegible con la lista vacía señalaría los noventa y seis
    // ficheros a la vez; y callarse diría que están todos vigilados. Ninguna de
    // las dos cosas se ha comprobado.
    const grafo = construirGrafoApp({ ...base, expectativas: null })
    expect(grafo.averias.averias.filter((a) => a.codigo === 'sin-expectativa')).toEqual([])
    expect(grafo.averias.noMedido.some((m) => m.codigo === 'sin-expectativa')).toBe(true)
  })
})
