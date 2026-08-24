import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalizeDepartment, DEPARTMENT_LABEL } from '../src/scraper/departments'
import { validarCompetencias } from '../src/scraper/competencias'
import {
  cotejarSuperficie,
  leerFuentes,
  panelesQuePinta,
  PAGINAS,
  PANEL_MUNICIPAL,
} from '../scripts/lib/competencias-superficies'

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
// y que ninguna guarda echa en falta: `check:competencias` la contaba como
// «coincide» mientras la persona conservara el cargo.
//
// El recorrido NO vive aquí: lo IMPORTA de `scripts/lib/competencias-superficies`,
// que es el mismo que usa `check:competencias`. Cuando esto era una copia local
// había una sola implementación; en cuanto hubo dos, la copia se habría quedado
// vieja — DATA_INTEGRITY §1, no reformules la forma en un test.

const fuentes = leerFuentes()

describe('toda atribución firmada llega a una superficie', () => {
  it('mide algo: hay asignaciones, y las páginas declaran paneles de verdad', () => {
    expect(mapa.asignaciones.length).toBeGreaterThan(0)
    expect(PAGINAS.flatMap((p) => panelesQuePinta(fuentes.get(p)!)).length).toBeGreaterThan(0)
  })

  for (const a of mapa.asignaciones) {
    it(`${a.clave} (${a.nombre}) la ve un lector`, () => {
      const c = cotejarSuperficie(a.clave, panel, fuentes)
      expect(
        c.desenlace,
        `«${a.cargo} · ${a.nombre}» no llega a ningún lector — ${c.detalle}`,
      ).toBe('renderizado')
    })
  }
})

// ── 3. Inyección de fallo: la guarda tiene que saber ponerse roja ────────────
//
// Una guarda que nunca se ha visto fallar es una guarda que nadie sabe si
// funciona. Aquí se le pasa un árbol con el cableado roto A PROPÓSITO y se
// exige que lo cace — el defecto real de 2026-08-24, reproducido.

describe('inyección de fallo: el cotejo caza un cableado roto', () => {
  /** Una clave municipal de /gestion, tomada del panel y no escrita a mano. */
  const claveGestion = panel.municipales.find((m) => m.panel === 'gestion')?.id

  it('hay una clave municipal de /gestion con la que probar', () => {
    expect(claveGestion).toBeTruthy()
  })

  it('si Gestion.jsx deja de importar useCompetencias, sale «no-renderizado»', () => {
    const roto = new Map(fuentes)
    roto.set(
      'src/pages/Gestion.jsx',
      fuentes.get('src/pages/Gestion.jsx')!.replaceAll('useCompetencias', 'noExiste'),
    )
    const c = cotejarSuperficie(claveGestion!, panel, roto)
    expect(c.desenlace).toBe('no-renderizado')
    expect(c.detalle).toContain('Gestion.jsx')
  })

  it('si PanelMunicipal deja de recibir la prop, sale «no-renderizado»', () => {
    const roto = new Map(fuentes)
    roto.set(
      PANEL_MUNICIPAL,
      fuentes
        .get(PANEL_MUNICIPAL)!
        .replace(
          /export function PanelMunicipal\(\{[^}]*\}/,
          'export function PanelMunicipal({ municipales, titulo, intro }',
        ),
    )
    const c = cotejarSuperficie(claveGestion!, panel, roto)
    expect(c.desenlace).toBe('no-renderizado')
    expect(c.detalle).toContain('PanelMunicipal')
  })

  it('una clave que no existe en el panel sale «sin-pagina», no «renderizado»', () => {
    expect(cotejarSuperficie('no-existe-esta-clave', panel, fuentes).desenlace).toBe('sin-pagina')
  })
})
