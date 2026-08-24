import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirGrafoRutas } from '../scripts/lib/route-graph'
import { rutasDeFichero } from '../scripts/routes-for-changes'

const ROOT = join(__dirname, '..')
const grafo = construirGrafoRutas(join(ROOT, 'src'))
const rutas = (f: string) => rutasDeFichero(f, grafo).sort()

describe('qué rutas toca un cambio', () => {
  it('una página lleva a su propia ruta', () => {
    expect(rutas('src/pages/Eficiencia.jsx')).toContain('/eficiencia')
    expect(rutas('src/pages/Gestion.jsx')).toContain('/gestion')
  })

  it('un componente hoja lleva sólo a donde se monta', () => {
    // SerieServicio la pintan la ficha de un servicio y el libro que lleva a
    // ella: dos rutas, las dos de eficiencia. Si esto empieza a devolver media
    // docena, el grafo se ha vuelto borroso y el gancho revisará de más — que
    // acaba siendo revisar de menos, porque el presupuesto se lo come otra
    // ruta.
    expect(rutas('src/components/eficiencia/SerieServicio.jsx')).toEqual([
      '/eficiencia',
      '/eficiencia/:id',
    ])
  })

  it('un snapshot lleva a las páginas que lo cargan Y a las que lo describen', () => {
    const r = rutas('public/data/indicadores.json')
    expect(r).toContain('/eficiencia')
    expect(r).toContain('/gestion')
    // /metodologia no lo carga: lo declara con el marcador `prosa-describe`, y
    // es justo la página donde una cifra vieja es peor.
    expect(r).toContain('/metodologia')
  })

  it('coincide con el mapa committeado, que sale del mismo grafo', () => {
    // Cross-check: dos consumidores del mismo recorrido no pueden discrepar.
    const mapa = JSON.parse(readFileSync(join(ROOT, '.claude/hooks/prosa-map.json'), 'utf8')) as {
      snapshots: Record<string, string[]>
    }
    const nombres = Object.keys(mapa.snapshots)
    expect(nombres.length).toBeGreaterThan(0)
    for (const snap of nombres) {
      expect(rutas(`public/data/${snap}`), `${snap} discrepa del mapa de prosa`).toEqual(
        [...mapa.snapshots[snap]].sort(),
      )
    }
  })

  it('lo que no toca ninguna página no devuelve ninguna ruta', () => {
    expect(rutas('docs/OPERATIONS.md')).toEqual([])
    expect(rutas('scripts/check-indicadores.ts')).toEqual([])
    expect(rutas('')).toEqual([])
  })

  it('no devuelve todo para todo', () => {
    // EL CONTROL. Sin él, un `rutasDeFichero` que devolviera siempre las
    // veintitantas rutas pasaría todas las pruebas de arriba, y el gancho
    // volvería a repartir su presupuesto entre rutas que nadie tocó — que es
    // exactamente la avería que esto viene a arreglar.
    const hoja = rutas('src/components/eficiencia/SerieServicio.jsx')
    const global = rutas('src/i18n.jsx')
    expect(hoja.length).toBeLessThan(global.length)
    expect(global.length).toBeGreaterThan(5)
    expect(hoja.length).toBeLessThanOrEqual(2)
  })

  it('toda ruta que devuelve está montada de verdad', () => {
    // Una ruta inventada haría que el gancho pidiera una página que da 404, y
    // una página vacía se revisa «limpia».
    const montadas = new Set(grafo.rutas)
    expect(montadas.size).toBeGreaterThan(10)
    for (const f of [
      'src/i18n.jsx',
      'src/pages/Eficiencia.jsx',
      'public/data/indicadores.json',
      'public/data/pleno-findings.json',
    ]) {
      for (const r of rutas(f)) {
        expect(montadas.has(r), `${f} devuelve ${r}, que no está montada`).toBe(true)
      }
    }
  })
})
