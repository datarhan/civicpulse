import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  construirIndicadoresMunicipales,
  importeAdjudicado,
  ESTADOS_ADJUDICADOS,
  PROCESOS_SIN_PUBLICIDAD,
  ADJUDICACION_DOMINANTE,
} from '../src/scraper/indicadores-friccion'

const ROOT = join(__dirname, '..')
const tenders = JSON.parse(readFileSync(join(ROOT, 'public/data/tenders.json'), 'utf8'))
const budgetExecution = JSON.parse(
  readFileSync(join(ROOT, 'public/data/budget-execution.json'), 'utf8'),
)
const budget = JSON.parse(readFileSync(join(ROOT, 'public/data/budget.json'), 'utf8'))

const indicadores = construirIndicadoresMunicipales({ tenders, budgetExecution, budget })
const byId = (id: string) => indicadores.find((i) => i.id === id)!

describe('scraper/indicadores-friccion', () => {
  it('evaluated something — every municipal indicator carries a period', () => {
    expect(indicadores.length).toBeGreaterThanOrEqual(6)
    for (const i of indicadores) {
      expect(i.periodo).not.toBe('')
      expect(i.periodo).not.toBe('periodo sin declarar')
      expect(i.descripcion.length).toBeGreaterThan(20)
      expect(i.citas.length).toBeGreaterThan(0)
    }
  })

  it('counts the awarded pool by the exported enum, not by `awarded` alone', () => {
    // Filtering on status === 'awarded' drops the 314 `formalized` rows and
    // turns 47,5 % into 58,4 %. That is the finalized/formalized slip from
    // DATA_INTEGRITY rule 1, which once erased €53,5M from the site.
    const pool = tenders.contracts.filter((c: { status?: string }) =>
      (ESTADOS_ADJUDICADOS as readonly string[]).includes(c.status ?? ''),
    )
    const soloAwarded = tenders.contracts.filter((c: { status?: string }) => c.status === 'awarded')
    expect(pool.length).toBeGreaterThan(soloAwarded.length)
    expect(byId('sin-publicidad-abierta').denominador.valor).toBe(pool.length)
  })

  it('computes the single-bidder rate over contracts that declare their offers', () => {
    const i = byId('licitador-unico')
    expect(i.valor).toBeGreaterThan(0)
    expect(i.valor).toBeLessThan(1)
    expect(i.numerador.valor).toBeLessThanOrEqual(i.denominador.valor!)
    expect(i.dimension).toBe('friccion')
    expect(i.formato).toBe('porcentaje')
  })

  it('excludes framework call-offs from "sin publicidad"', () => {
    // `restricted` and `based_on_agreement` derive from a tender that WAS
    // published; counting them would inflate the figure with contracts that
    // did go to open competition.
    expect(PROCESOS_SIN_PUBLICIDAD).not.toContain('restricted')
    expect(PROCESOS_SIN_PUBLICIDAD).not.toContain('based_on_agreement')
    expect(PROCESOS_SIN_PUBLICIDAD).not.toContain('open')
  })

  it('neutralises the PLACSP score-as-amount artifact when summing euros', () => {
    // A 0–100 criterion score written into the importe field. Real deep
    // discounts are always taxed and so are never caught.
    const artefacto = {
      initialAmount: 18_000,
      initialAmountNoTaxes: 14_876,
      finalAmount: 100,
      finalAmountNoTaxes: 100,
    }
    expect(importeAdjudicado(artefacto)).toBe(0)
    const realDeepDiscount = {
      initialAmount: 18_000,
      initialAmountNoTaxes: 14_876,
      finalAmount: 12_100,
      finalAmountNoTaxes: 10_000,
    }
    expect(importeAdjudicado(realDeepDiscount)).toBe(10_000)
  })

  it('says so when one award dominates the concentration figure', () => {
    // Riba-roja's water concession is granted for its whole multi-decade term
    // in a single award, inside a window of ordinary annual contracts. Without
    // this the page would report a concentration that is mostly one contract.
    const i = byId('concentracion-proveedores')
    expect(i.valor).toBeGreaterThan(0)
    expect(i.caveats.some((c) => /una sola adjudicación/i.test(c))).toBe(true)
    expect(i.caveats.some((c) => /concesiones se adjudican por todo su plazo/i.test(c))).toBe(true)
    expect(ADJUDICACION_DOMINANTE).toBeGreaterThan(0)
  })

  it('states the multi-year span of the contract figures', () => {
    // Contracts run 2017→2026. A percentage with no period invites reading it
    // as "this year".
    expect(byId('licitador-unico').periodo).toMatch(/^\d{4}–\d{4}$/)
  })

  it('reads the budget indicators off the published execution snapshot', () => {
    const mod = byId('modificaciones-presupuestarias')
    const eje = byId('ejecucion-presupuestaria')
    expect(mod.numerador.valor).toBe(budgetExecution.latest.gastos.total.modificaciones)
    expect(mod.denominador.valor).toBe(budgetExecution.latest.gastos.total.inicial)
    expect(eje.numerador.valor).toBe(budgetExecution.latest.gastos.total.ejecutado)
    expect(eje.denominador.valor).toBe(budgetExecution.latest.gastos.total.actual)
    expect(mod.dimension).toBe('fiscal')
    // The listing date matters: 30 % executed in June is not 30 % in December.
    expect(eje.periodo).toContain(String(budgetExecution.latest.year))
  })

  it('sitúa el gasto por habitante entre municipios del mismo tamaño', () => {
    const g = byId('gasto-por-habitante')
    expect(g.valor).toBeCloseTo(budget.snapshot.totalExpense / budget.snapshot.population, 6)
    expect(g.dimension).toBe('fiscal')
    expect(g.formato).toBe('euros')
    expect(g.periodo).toBe(String(budget.snapshot.year))
    expect(g.pares!.n).toBeGreaterThanOrEqual(15)
    expect(g.pares!.p25).toBeLessThanOrEqual(g.pares!.mediana)
    expect(g.pares!.mediana).toBeLessThanOrEqual(g.pares!.p75)
    // Gastar más por vecino no es peor ni mejor: si la tarjeta no lo dice, se
    // lee como una nota. Es la misma disciplina que el coste por policía.
    expect(g.caveats.some((c) => /medida de ENTRADA/i.test(c))).toBe(true)
    expect(g.caveats.some((c) => /no gasto ejecutado/i.test(c))).toBe(true)
  })

  it('no encadena el gasto por habitante con el porcentaje de ejecución', () => {
    // La salvedad decía «Es presupuesto aprobado, no gasto realizado. La
    // ejecución de este mismo ejercicio aparece más abajo», que afirma
    // exactamente la reconciliación que la salvedad de la ejecución se niega a
    // hacer en la misma página: las dos cifras dicen ser el mismo ejercicio,
    // difieren en casi cuatro millones, y llamar a una «lo aprobado» y a la
    // otra «lo definitivo» sería inventarse la explicación.
    const gasto = byId('gasto-por-habitante')
    const ejecucion = byId('ejecucion-presupuestaria')
    // Una página no puede sostener las dos frases, así que se comprueban juntas.
    expect(ejecucion.caveats.some((c) => /inventarse la reconciliación/i.test(c))).toBe(true)
    expect(gasto.caveats.some((c) => /presupuesto aprobado/i.test(c))).toBe(false)
    expect(gasto.caveats.some((c) => /sigue sin explicación/i.test(c))).toBe(true)
  })

  it('no compara el gasto por habitante sin banda que lo sostenga', () => {
    const sinPares = construirIndicadoresMunicipales({
      tenders,
      budgetExecution,
      budget: { snapshot: budget.snapshot, pares: { miembros: [] } },
    })
    expect(sinPares.find((m) => m.id === 'gasto-por-habitante')!.pares).toBeUndefined()
  })

  it('refuses a value when the source is empty rather than publishing zero', () => {
    const vacio = construirIndicadoresMunicipales({
      tenders: { contracts: [] },
      budgetExecution: {},
    })
    for (const i of vacio) {
      expect(i.valor).toBeNull()
      expect(i.numerador.estado).not.toBe('declarado')
      expect(i.numerador.valor).toBeNull()
    }
  })

  it('holds the same magnitude invariant as the cost indicators', () => {
    for (const i of indicadores) {
      if (i.valor !== null) {
        expect(i.numerador.estado).toBe('declarado')
        expect(i.denominador.estado).toBe('declarado')
      }
      for (const m of [i.numerador, i.denominador]) {
        if (m.estado !== 'declarado') expect(m.valor).toBeNull()
      }
      expect(i.numerador.fuente.length).toBeGreaterThan(5)
    }
  })
})

describe('licitador-unico — el denominador dice cuánto dejó fuera', () => {
  it('declara «cero excluidos» en vez de callarse', () => {
    // La salvedad sólo salía cuando había exclusiones. Al no haberlas la página
    // callaba, y su denominador coincidía exactamente con el de la tarjeta de al
    // lado —que sí es «sobre el total de adjudicados»—: un lector no podía
    // distinguir «el filtro no dejó fuera a nadie» de «no hubo filtro». Lo cazó
    // la revisión de superficies.
    const i = byId('licitador-unico')
    const texto = i.caveats.join(' ')
    expect(texto).toMatch(/quedan fuera del cálculo|Ningún contrato adjudicado se queda fuera/)
    // Y en la dirección de hoy: con todos declarando, lo dice.
    const adjudicadosSinDeclarar = i.denominador.valor !== null && i.denominador.valor > 0
    expect(adjudicadosSinDeclarar).toBe(true)
  })
})
