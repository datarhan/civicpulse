import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselWorkbook } from '../src/scraper/coste-efectivo'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import {
  construirIndicadores,
  resolverCoste,
  resolverUnidad,
  MIN_PARES,
  situacion,
  DIVERGENCIA_EXTREMA,
} from '../src/scraper/indicadores'

const FIXTURE = join(__dirname, 'fixtures', 'cesel_2021_cv_slice.xlsx')
const CITA = 'https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx'

const rows = parseCeselWorkbook(readFileSync(FIXTURE), { anio: 2021 })
const mias = rows.filter((r) => r.ine === '46214')
const miembros = [...new Set(rows.map((r) => r.ine))].map((ine) => ({
  ine,
  nombre: rows.find((r) => r.ine === ine)!.nombre,
  poblacion: 0,
}))

const snap = construirIndicadores({
  municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: mias },
  pares: { conjunto: 'cv-15k-40k', anios: [2021], miembros, filas: rows },
  anioBase: 2021,
  citaUrl: CITA,
})
const byId = (id: string) => snap.indicadores.find((i) => i.id === id)!

describe('scraper/indicadores', () => {
  it('evaluated something — every registry service produced an indicator', () => {
    expect(snap.indicadores.length).toBe(Object.keys(SERVICIOS).length)
    expect(snap.universe.serviciosEnRegistro).toBe(Object.keys(SERVICIOS).length)
    expect(snap.universe.conRatio).toBeGreaterThan(3)
  })

  it('computes the residuos ratio from the real cells', () => {
    const i = byId('a1621-coste-unitario')
    expect(i.numerador.valor).toBe(801040.17)
    expect(i.denominador.valor).toBe(11059.41)
    expect(i.valor).toBeCloseTo(801040.17 / 11059.41, 6)
    expect(i.unidad).toBe('€/t')
    // Tonnage is demand, not achievement — the card must not read as a score.
    expect(i.tier).toBe('carga')
  })

  // ── THE reproducer ────────────────────────────────────────────────────────
  // Without this rule the page publishes «Riba-roja suministra agua gratis, el
  // más barato del grupo», because the concessionaire's cost never touches the
  // council's books while the metres of network sit right there as a divisor.
  it('never turns a concession into a ratio or a peer position', () => {
    for (const id of ['a161-coste-unitario', 'a160-coste-unitario']) {
      const i = byId(id)
      expect(i.modoGestion).toBe('concesion')
      expect(i.numerador.estado).toBe('no-declarado')
      expect(i.numerador.motivo).toBe('concesion')
      expect(i.numerador.valor).toBeNull()
      expect(i.valor).toBeNull()
      expect(i.comparable).toBe(false)
      expect(i.pares).toBeNull()
      // The denominator is genuinely there; that is what makes the trap live.
      expect(i.denominador.estado).toBe('declarado')
    }
  })

  it('refuses a ratio when the denominator is an undeclared zero', () => {
    const bus = byId('a4411-440p-coste-unitario')
    expect(bus.numerador.estado).toBe('declarado') // the money is real
    expect(bus.numerador.valor).toBe(485975.77)
    expect(bus.denominador.estado).toBe('no-declarado')
    expect(bus.denominador.motivo).toBe('cero-sin-declarar')
    expect(bus.denominador.valor).toBeNull()
    expect(bus.valor).toBeNull()
    expect(bus.pares).toBeNull()
  })

  it('refuses a cost when a programa has contradictory duplicate rows', () => {
    // a1721 declares 1.964.894,95 AND 282.412,19 for the same programa, both
    // under direct management. Two live claims, no way to choose.
    const m = resolverCoste(mias, 'a1721/170P', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('filas-duplicadas')
    expect(m.valor).toBeNull()
  })

  it('does not let a zero-cost row poison a real one', () => {
    // Parques y jardines declares 718.015,88 AND 0, both direct. A zero cost is
    // «no lo declaré» exactly as it is on the CE3 side — treating it as a rival
    // claim would apply the opposite rule to the two halves of one module, and
    // would blank a 700k€ service that has a good denominator and 60+ peers.
    const m = resolverCoste(mias, 'a171/170P', 2021)
    expect(m.estado).toBe('declarado')
    expect(m.valor).toBe(718015.88)
    expect(byId('a171-170p-coste-unitario').valor).toBeCloseTo(718015.88 / 740046, 6)
  })

  it('still refuses when every row for a programa declares zero', () => {
    const filas = mias
      .filter((f) => f.programa === 'a171/170P')
      .map((f) => ({ ...f, costeTotal: 0 }))
    const m = resolverCoste(filas, 'a171/170P', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('cero-sin-declarar')
  })

  it('refuses a unit when the same attribute is declared twice differently', () => {
    const m = resolverUnidad(
      mias,
      'a1721/170P',
      2021,
      'Nº personas en plantilla adscritas al servicio',
    )
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('atributo-ambiguo')
    expect(m.valor).toBeNull()
  })

  it('reports a missing service as absent rather than as zero', () => {
    const m = resolverCoste(mias, 'programa-que-no-existe', 2021)
    expect(m.estado).toBe('no-declarado')
    expect(m.motivo).toBe('ausente')
  })

  it('never selects a code attribute as a denominator', () => {
    // a1621 offers `Periodicidad (1 - DI, 2 - AL…) = 5`. Dividing the annual
    // spend by 5 would render a beautifully formatted lie.
    for (const def of Object.values(SERVICIOS)) {
      expect(def.denominador).not.toMatch(/periodicidad/i)
      expect(def.denominador).not.toMatch(/^Nº personas en plantilla/i)
    }
  })

  it('keeps every registry denominator matchable against the real source text', () => {
    // A denominator with a typo fixed, or a stray space, silently matches
    // nothing and the service quietly disappears from the page.
    const atributos = new Set(rows.flatMap((r) => r.unidades.map((u) => u.atributo)))
    for (const [programa, def] of Object.entries(SERVICIOS)) {
      expect(atributos.has(def.denominador), `${programa}: ${def.denominador}`).toBe(true)
    }
  })

  it('holds the invariants across every indicator', () => {
    let conPares = 0
    for (const i of snap.indicadores) {
      if (i.valor !== null) {
        expect(i.numerador.estado).toBe('declarado')
        expect(i.denominador.estado).toBe('declarado')
      }
      // A magnitude that is not `declarado` must not carry a number at all.
      for (const m of [i.numerador, i.denominador]) {
        if (m.estado !== 'declarado') expect(m.valor).toBeNull()
      }
      if (i.pares) {
        conPares++
        expect(i.pares.modoGestion).toBe(i.modoGestion)
        expect(i.pares.n).toBeGreaterThanOrEqual(MIN_PARES)
        expect(i.pares.miembros).toHaveLength(i.pares.n)
        expect(i.pares.p25).toBeLessThanOrEqual(i.pares.mediana)
        expect(i.pares.mediana).toBeLessThanOrEqual(i.pares.p75)
        expect(i.comparable).toBe(true)
        expect(i.pares.miembros.every((m) => m.ine !== '46214')).toBe(true)
      } else {
        expect(i.comparable).toBe(false)
      }
      for (const p of i.serie) if (p.estado !== 'declarado') expect(p.valor).toBeNull()
      expect(i.numerador.fuente).toMatch(/^cesel:\d{4}:CE2:.+:Econ14$/)
      expect(i.denominador.fuente).toMatch(/^cesel:\d{4}:CE3:/)
    }
    // Assert the peer comparison actually ran for somebody. Without this the
    // whole block passes vacuously on a snapshot where nothing is comparable.
    expect(conPares).toBeGreaterThan(0)
  })

  it('warns when a peer comparison diverges enough to be a declaration artifact', () => {
    // Alumbrado lands at about a quarter of the peer median. Read naively that
    // says Riba-roja lights its streets four times more efficiently than 52
    // comparable towns; far more likely is that «puntos de luz» and what gets
    // booked against the programa are filled in differently town to town.
    const alumbrado = byId('a165-coste-unitario')
    expect(alumbrado.valor! / alumbrado.pares!.mediana).toBeLessThan(1 / DIVERGENCIA_EXTREMA)
    expect(alumbrado.caveats.some((c) => /mediana de sus pares/.test(c))).toBe(true)

    // …and a service sitting close to the median gets no such warning, so the
    // caveat means something when it does appear.
    const biblioteca = byId('a3321-330p-coste-unitario')
    const razon = biblioteca.valor! / biblioteca.pares!.mediana
    expect(razon).toBeGreaterThan(1 / DIVERGENCIA_EXTREMA)
    expect(razon).toBeLessThan(DIVERGENCIA_EXTREMA)
    expect(biblioteca.caveats.some((c) => /mediana de sus pares/.test(c))).toBe(false)
  })

  it('states its own coverage as a partition that adds up', () => {
    // A coverage strip whose buckets overlap or leave a remainder reads as
    // completeness with extra confidence. These five must tile the registry.
    const u = snap.universe
    expect(u.aniosDisponibles).toEqual([2021])
    expect(u.enConcesion).toBeGreaterThan(0)
    expect(u.conRatio + u.enConcesion + u.sinUnidad + u.sinCoste + u.noSePresta).toBe(
      u.serviciosEnRegistro,
    )
    expect(u.comparables).toBeLessThanOrEqual(u.conRatio)
  })

  it('classifies every indicator into exactly one situación', () => {
    const buckets = snap.indicadores.map((i) => situacion(i))
    expect(buckets).toHaveLength(snap.indicadores.length)
    expect(situacion(byId('a161-coste-unitario'))).toBe('concesion')
    expect(situacion(byId('a4411-440p-coste-unitario'))).toBe('sin-unidad')
    expect(situacion(byId('a1621-coste-unitario'))).toBe('con-ratio')
  })
})
