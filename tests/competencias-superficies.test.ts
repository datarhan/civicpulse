import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../src/scraper/departments'
import { validarCompetencias } from '../src/scraper/competencias'

/**
 * Dos maneras de decirle a un lector quién lleva un área, y el desacuerdo
 * entre ellas.
 *
 * `/eficiencia` y `/gestion` nombran al titular de la competencia delegada
 * desde `competencias.json`, un mapa curado y firmado. `/cargos` pinta debajo
 * de cada ficha unas pastillas de navegación derivadas en render de
 * `canonicalizeDepartment(portfolio)`. Las dos capas hablan del mismo
 * ayuntamiento y ninguna sabe de la otra.
 *
 * El 24-08-2026 un lector leyó «Urbanismo →» en la ficha de Rafael Gómez
 * Sánchez —una pastilla de departamento derivada de su cartera
 * «Urbanizaciones»— y concluyó que la atribución de `/eficiencia`, que pone
 * «Urbanismo · Teresa Pozuelo Martín» sobre esa misma cifra, se contradecía
 * con `/cargos`. No se contradecía: el decreto delega Urbanismo en Pozuelo y
 * Urbanizaciones en Gómez Sánchez. Lo que fallaba era la palabra.
 *
 * Los dos invariantes de abajo son los que habrían frenado eso, y no los
 * cubría ninguna prueba: `check:competencias` sólo pregunta si la persona
 * sigue teniendo el cargo, nunca si la fila llega a una superficie ni si otra
 * superficie dice lo contrario.
 */

const J = (p: string) => JSON.parse(readFileSync(resolve(p), 'utf8'))

interface Official {
  slug: string
  name: string
  portfolios?: string[]
}

const oficiales: Official[] = J('public/data/officials.json').officials
const mapa = validarCompetencias(J('public/data/competencias.json'))
const panel = J('public/data/indicadores.json')

// ── 1. Una pastilla no puede reclamar la competencia de otra persona ────────
//
// La pastilla de `/cargos` sólo lleva el nombre del departamento, sin decir
// que lo es. Si ese nombre coincide LITERALMENTE con la cartera delegada de
// otra persona, el lector lee una atribución, no un enlace.

/** Las pastillas que `DepartmentLinks` pintaría para cada concejal. */
function pastillasDe(o: Official): string[] {
  const vistos = new Set<string>()
  for (const p of o.portfolios ?? []) {
    const s = canonicalizeDepartment(p)
    if (s) vistos.add(DEPARTMENT_LABEL[s].es)
  }
  return [...vistos]
}

describe('las pastillas de /cargos no reclaman la competencia de otro concejal', () => {
  it('mide algo: hay concejales con cartera y pastillas que pintar', () => {
    const conCartera = oficiales.filter((o) => (o.portfolios ?? []).length > 0)
    expect(conCartera.length).toBeGreaterThan(5)
    expect(conCartera.flatMap(pastillasDe).length).toBeGreaterThan(5)
  })

  /** cartera literal → quién la tiene delegada, según el propio ayuntamiento. */
  const titularDe = new Map<string, string>()
  for (const o of oficiales) {
    for (const p of o.portfolios ?? []) titularDe.set(p.toLowerCase(), o.name)
  }

  for (const o of oficiales) {
    if ((o.portfolios ?? []).length === 0) continue
    it(`${o.name}: ninguna de sus pastillas nombra un área ajena`, () => {
      const propias = new Set((o.portfolios ?? []).map((p) => p.toLowerCase()))
      for (const etiqueta of pastillasDe(o)) {
        const titular = titularDe.get(etiqueta.toLowerCase())
        if (titular === undefined) continue // no es el nombre de ninguna cartera
        if (propias.has(etiqueta.toLowerCase())) continue // es SU área, correcto
        expect.fail(
          `la ficha de ${o.name} pinta «${etiqueta} →», y «${etiqueta}» es la ` +
            `cartera delegada de ${titular}. Un lector lo lee como una atribución.`,
        )
      }
    })
  }
})

// ── 2. Una atribución firmada tiene que llegar a una superficie ─────────────
//
// `competencias.json` es curado y se firma a mano fila a fila. Una fila que
// no se pinta en ninguna parte es trabajo de curaduría que el lector nunca ve
// y que ninguna guarda echa en falta: `check:competencias` la cuenta como
// «coincide» mientras la persona conserve el cargo.

// Nada de tabla a mano: qué página pinta qué panel se lee del propio código.
// Una tabla escrita a mano dentro de un control contra el desfase se desfasa
// ella misma, que es el chiste que este repositorio ya ha contado dos veces.
const PAGINAS = ['src/pages/Eficiencia.jsx', 'src/pages/Gestion.jsx'] as const
const PANEL_MUNICIPAL = 'src/components/eficiencia/PanelMunicipal.jsx'

const fuente = new Map<string, string>(
  [...PAGINAS, PANEL_MUNICIPAL].map((p) => [p, readFileSync(resolve(p), 'utf8')]),
)

/** Los `m.panel === '…'` que cada página declara filtrar. */
function panelesQuePinta(src: string): string[] {
  return [...src.matchAll(/\.panel\s*===\s*'([^']+)'/g)].map((m) => m[1])
}

/** ¿Esta página le pasa la competencia a lo que pinta? */
const cableada = (src: string) => src.includes('useCompetencias')

/** ¿PanelMunicipal sabe siquiera recibirla? */
const panelMunicipalRecibeCompetencia =
  /export function PanelMunicipal\(\{[^}]*\bcompetencias?\b/.test(fuente.get(PANEL_MUNICIPAL)!)

/** clave de indicador → los ficheros fuente que pueden pintarla. */
function paginasDe(clave: string): string[] {
  if (panel.indicadores.some((i: { id: string }) => i.id === clave)) {
    // Los indicadores de coste efectivo los pinta ServicioCard en /eficiencia.
    return ['src/pages/Eficiencia.jsx']
  }
  const m = panel.municipales.find((x: { id: string }) => x.id === clave)
  if (!m) return []
  return PAGINAS.filter((p) => panelesQuePinta(fuente.get(p)!).includes(m.panel))
}

describe('toda atribución firmada llega a una superficie', () => {
  it('mide algo: hay asignaciones, y las páginas declaran paneles de verdad', () => {
    expect(mapa.asignaciones.length).toBeGreaterThan(0)
    expect(PAGINAS.flatMap((p) => panelesQuePinta(fuente.get(p)!)).length).toBeGreaterThan(0)
  })

  for (const a of mapa.asignaciones) {
    it(`${a.clave} (${a.nombre}) la ve un lector`, () => {
      const paginas = paginasDe(a.clave)
      expect(
        paginas.length,
        `ninguna página pinta ${a.clave}: la clave no existe en indicadores.json ` +
          `o su panel no lo filtra nadie`,
      ).toBeGreaterThan(0)

      for (const p of paginas) {
        expect(
          cableada(fuente.get(p)!),
          `${p} pinta ${a.clave} pero no importa useCompetencias: la firma de ` +
            `«${a.cargo} · ${a.nombre}» no llega a la página`,
        ).toBe(true)
      }

      // Los municipales pasan por PanelMunicipal; si no acepta la prop, da
      // igual que la página la tenga cargada.
      if (panel.municipales.some((x: { id: string }) => x.id === a.clave)) {
        expect(
          panelMunicipalRecibeCompetencia,
          `${a.clave} lo pinta PanelMunicipal, que no recibe competencias: la ` +
            `firma de «${a.cargo} · ${a.nombre}» no la ve ningún lector`,
        ).toBe(true)
      }
    })
  }
})
