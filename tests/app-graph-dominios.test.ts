/**
 * Los dominios salen de las ARISTAS, no de los nombres.
 *
 * Medido el 4-9-2026: la convención `scrape-<x>.ts → <x>.json` deja 49 de 96
 * snapshots sin dominio —los curados no tienen guion que los bautice— y un
 * corte por el primer segmento parte familias reales (`pleno`/`plenos` son 13
 * ficheros). Union-find sobre tres reglas derivadas sí agrupa.
 */
import { describe, it, expect } from 'vitest'
import {
  ENTRADAS_VACIAS,
  TOPE_HOOK_UNIFICADOR,
  derivarDominios,
  construirGrafoApp,
} from '../src/scraper/app-graph'

const snap = (nombre: string) => ({ nombre, bytes: 1, generatedAt: null, source: null })

describe('app-graph · dominios', () => {
  it('(A) une los snapshots que escribe el mismo guion', () => {
    const d = derivarDominios({
      ...ENTRADAS_VACIAS,
      snapshots: [snap('press.json'), snap('press-trust.json')],
      scripts: [
        {
          ruta: 'scripts/compute-press-analytics.ts',
          fuente: [
            "const A = resolve(D, 'press.json')",
            "const B = resolve(D, 'press-trust.json')",
            'writeFileSync(A, x)',
            'writeFileSync(B, y)',
          ].join('\n'),
        },
      ],
    })
    expect(d.get('press.json')).toBe(d.get('press-trust.json'))
  })

  it('(B) une los snapshots que lee el mismo hook', () => {
    const d = derivarDominios({
      ...ENTRADAS_VACIAS,
      snapshots: [snap('alfa.json'), snap('beta.json')],
      hooks: [{ ruta: 'src/hooks/useCosa.js', fuente: '' }],
      rutas: {
        ...ENTRADAS_VACIAS.rutas,
        snapshotsDe: { 'src/hooks/useCosa.js': ['alfa.json', 'beta.json'] },
      },
    })
    expect(d.get('alfa.json')).toBe(d.get('beta.json'))
  })

  it('(B) un hook que lee de medio sitio no une NADA, y el tope es derivado', () => {
    const muchos = Array.from({ length: TOPE_HOOK_UNIFICADOR + 1 }, (_, i) => `s${i}.json`)
    const d = derivarDominios({
      ...ENTRADAS_VACIAS,
      snapshots: muchos.map(snap),
      hooks: [{ ruta: 'src/hooks/useLabHealth.js', fuente: '' }],
      rutas: {
        ...ENTRADAS_VACIAS.rutas,
        snapshotsDe: { 'src/hooks/useLabHealth.js': muchos },
      },
    })
    // Un inventario del sitio entero no es un dominio: cada uno se queda solo.
    expect(new Set(muchos.map((m) => d.get(m))).size).toBe(muchos.length)
  })

  it('(C) une por prefijo con guion, y NO por prefijo a secas', () => {
    const d = derivarDominios({
      ...ENTRADAS_VACIAS,
      snapshots: [
        snap('pleno-votes.json'),
        snap('pleno-votes-suggestions.json'),
        snap('plenos.json'),
      ],
    })
    expect(d.get('pleno-votes.json')).toBe(d.get('pleno-votes-suggestions.json'))
    // `pleno` es prefijo de `plenos` como cadena, pero no con guion: son cosas
    // distintas y unirlas por casualidad léxica es inventarse una relación.
    expect(d.get('plenos.json')).not.toBe(d.get('pleno-votes.json'))
  })

  it('el representante del dominio es el tallo más corto', () => {
    const d = derivarDominios({
      ...ENTRADAS_VACIAS,
      snapshots: [snap('pleno-votes-suggestions.json'), snap('pleno-votes.json')],
    })
    expect(d.get('pleno-votes.json')).toBe('pleno-votes')
  })

  it('un snapshot suelto es su propio dominio, nunca null', () => {
    const d = derivarDominios({ ...ENTRADAS_VACIAS, snapshots: [snap('solo.json')] })
    expect(d.get('solo.json')).toBe('solo')
  })
})

describe('app-graph · el dominio viaja en el nodo', () => {
  it('le pone dominio al snapshot, a su guion, a su parser y a su hook', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [snap('padron.json')],
      scripts: [
        {
          ruta: 'scripts/scrape-padron.ts',
          fuente: [
            "import { parseInePadron } from '../src/scraper/padron'",
            "const OUT = join(R, 'public/data/padron.json')",
            'writeFileSync(OUT, d)',
          ].join('\n'),
        },
      ],
      parsers: [{ ruta: 'src/scraper/padron.ts', fuente: 'export const x = 1' }],
      hooks: [{ ruta: 'src/hooks/usePadron.js', fuente: '' }],
      rutas: {
        ...ENTRADAS_VACIAS.rutas,
        snapshotsDe: { 'src/hooks/usePadron.js': ['padron.json'] },
      },
    })
    const dom = (id: string) => grafo.nodos.find((n) => n.id === id)?.dominio
    expect(dom('snapshot:padron.json')).toBe('padron')
    expect(dom('script:scrape-padron.ts')).toBe('padron')
    expect(dom('parser:padron.ts')).toBe('padron')
    expect(dom('hook:usePadron.js')).toBe('padron')
  })

  it('un nodo que no pertenece a ningún dominio lo dice con null, no lo adivina', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [{ ruta: 'scripts/check-sparse.ts', fuente: 'const x = 1' }],
    })
    expect(grafo.nodos.find((n) => n.id === 'script:check-sparse.ts')?.dominio).toBe(null)
  })
})

describe('app-graph · lo compartido no es de nadie', () => {
  it('un parser que usan dos dominios no se queda con el primero: es compartido', () => {
    const escribe = (fichero: string, parser: string) =>
      [
        `import { x } from '../src/scraper/${parser}'`,
        "import { r } from '../src/scraper/retry'",
        `const OUT = join(R, 'public/data/${fichero}.json')`,
        'writeFileSync(OUT, d)',
      ].join('\n')

    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [snap('press.json'), snap('padron.json')],
      scripts: [
        { ruta: 'scripts/scrape-press.ts', fuente: escribe('press', 'press') },
        { ruta: 'scripts/scrape-padron.ts', fuente: escribe('padron', 'padron') },
      ],
      parsers: [
        { ruta: 'src/scraper/press.ts', fuente: '' },
        { ruta: 'src/scraper/padron.ts', fuente: '' },
        { ruta: 'src/scraper/retry.ts', fuente: '' },
      ],
    })
    const dom = (id: string) => grafo.nodos.find((n) => n.id === id)?.dominio

    // Cada parser propio se queda con el suyo…
    expect(dom('parser:press.ts')).toBe('press')
    expect(dom('parser:padron.ts')).toBe('padron')
    // …y la utilidad que usan los dos no es de ninguno.
    expect(dom('parser:retry.ts')).toBe(null)
  })
})
