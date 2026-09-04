/**
 * El manual en texto. Es la mitad del encargo que un agente puede leer: no
 * puede pulsar en una página de React, pero sí abrir un fichero.
 */
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { ENTRADAS_VACIAS, construirGrafoApp } from '../src/scraper/app-graph'
import { renderManual } from '../src/scraper/app-graph-md'
import { leerEntradas } from '../scripts/lib/app-graph-io'

describe('app-graph-md', () => {
  it('escribe la cadena del dominio de la fuente a la ruta', () => {
    const md = renderManual(
      construirGrafoApp({
        ...ENTRADAS_VACIAS,
        snapshots: [
          { nombre: 'padron.json', bytes: 5900, generatedAt: null, source: 'https://www.ine.es/x' },
        ],
        scripts: [
          {
            ruta: 'scripts/scrape-padron.ts',
            fuente: "const OUT = join(R, 'public/data/padron.json')\nwriteFileSync(OUT, d)",
          },
        ],
        rutas: {
          ...ENTRADAS_VACIAS.rutas,
          rutas: ['/datos'],
          rutasPorSnapshot: { 'padron.json': ['/datos'] },
        },
      }),
    )
    expect(md).toContain('## padron')
    expect(md).toContain('www.ine.es')
    expect(md).toContain('scrape-padron.ts')
    expect(md).toContain('padron.json')
    expect(md).toContain('/datos')
  })

  it('DECLARA los guiones que no se pudieron leer en vez de callarlos', () => {
    const md = renderManual(
      construirGrafoApp({
        ...ENTRADAS_VACIAS,
        scripts: [{ ruta: 'scripts/opaco.ts', fuente: 'const p = f(x)' }],
      }),
    )
    expect(md).toMatch(/no leído/i)
    expect(md).toContain('opaco.ts')
  })

  it('sobre el repositorio real sale un manual con cuerpo, no un esqueleto', () => {
    const md = renderManual(construirGrafoApp(leerEntradas(resolve(__dirname, '..'))))
    // Suelos: un manual vacío no es un manual que pase.
    expect(md.length).toBeGreaterThan(8000)
    expect((md.match(/^## /gm) ?? []).length).toBeGreaterThan(40)
    expect(md).toContain('press')
    expect(md).toContain('quejas')
  })
})
