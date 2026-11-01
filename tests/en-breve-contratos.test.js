import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  committedAwardYearSpan,
  comprometidosSinImporte,
  importeAdjudicado,
  isCommittedContract,
} from '../src/lib/contract-status'
import { resolverDeEmpresas, topContractors } from '../src/lib/tender-geo'
import { resumenMenores } from '../src/scraper/contratos-menores'
import { enBreveContratos, MAYORES } from '../src/scraper/en-breve-contratos'
import { enBrevePresupuesto } from '../src/scraper/en-breve-presupuesto'
import { PROCESOS_SIN_PUBLICIDAD } from '../src/scraper/indicadores-friccion'

/**
 * «En breve» de /contratos (auditoría de las dos lecturas, §5). Un resumen sólo
 * vale si dice lo mismo que el detalle al que enlaza, así que se mide contra las
 * funciones de las secciones de abajo y contra los snapshots PUBLICADOS.
 */
const leer = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const TENDERS = leer('tenders.json')
const ENTIDADES = leer('entities.json')
const GEO = leer('tender-geo.json')
const INDICADORES = leer('indicadores.json')
const R = enBreveContratos({ tenders: TENDERS, entities: ENTIDADES, tenderGeo: GEO })

const COMPROMETIDOS = TENDERS.contracts.filter(isCommittedContract)
const indicador = (id) => {
  const i = INDICADORES.indicadores.find((x) => x.id === id)
  expect(i, `no hay indicador ${id}`).toBeTruthy()
  return i
}

describe('las cifras salen de las mismas funciones que el detalle', () => {
  it('mide algo: con los snapshots publicados, las tres respuestas existen', () => {
    expect(R.cuanto).not.toBeNull()
    expect(R.aQuien).not.toBeNull()
    expect(R.sinConcurso).not.toBeNull()
    expect(R.barrio).not.toBeNull()
  })

  it('«¿cuánto?» es lo que suma el mapa y cuenta la portada', () => {
    expect(R.cuanto.importe).toBeCloseTo(GEO.universe.totalAmount, 0)
    expect(R.cuanto.importe).toBeCloseTo(TENDERS.stats.awardedTotalEuros, 0)
    expect(R.cuanto.adjudicados).toBe(TENDERS.stats.awardedContracts)
    expect(R.cuanto.sinImporte).toBe(comprometidosSinImporte(TENDERS.contracts))
    const span = committedAwardYearSpan(TENDERS.contracts)
    expect(R.cuanto.desde).toBe(span.from)
    expect(R.cuanto.hasta).toBe(span.to)
    expect(R.cuanto.ejercicios).toBe(span.to - span.from + 1)
  })

  it('«¿a quién?» es la lista de «¿Quién recibe el dinero?», con sus razones sociales unidas', () => {
    const lista = topContractors(
      TENDERS.contracts,
      Infinity,
      resolverDeEmpresas(ENTIDADES.companies),
    )
    const total = lista.reduce((s, f) => s + f.amount, 0)
    const cabeza = lista.slice(0, MAYORES).reduce((s, f) => s + f.amount, 0)
    expect(R.aQuien.adjudicatarios).toBe(lista.length)
    expect(R.aQuien.deCada100).toBe(Math.round((cabeza / total) * 100))
    expect(R.aQuien.mayorDeCada100).toBe(Math.round((lista[0].amount / total) * 100))
  })

  it('«¿sin concurso?» es el indicador de /gestion, partido en lo que lo compone', () => {
    const i = indicador('sin-publicidad-abierta')
    expect(R.sinConcurso.n).toBe(i.numerador.valor)
    expect(R.sinConcurso.de).toBe(i.denominador.valor)
    expect(R.sinConcurso.deCada100).toBe(Math.round(i.valor * 100))
    expect(R.sinConcurso.menores + R.sinConcurso.negociados).toBe(R.sinConcurso.n)
  })

  it('los menores de la tarjeta son los de la sección a la que enlaza', () => {
    expect(R.sinConcurso.menores).toBe(resumenMenores(TENDERS.contracts).n)
  })

  it('el barrio es la misma cobertura que dice /presupuesto', () => {
    expect(R.barrio).toEqual(enBrevePresupuesto({ tenderGeo: GEO }).barrio)
  })

  it('el importe sin convocatoria cuadra con lo que suma cada fila', () => {
    const filas = COMPROMETIDOS.filter((c) => PROCESOS_SIN_PUBLICIDAD.includes(c.processType))
    const suma = (a) => a.reduce((s, c) => s + (importeAdjudicado(c) ?? 0), 0)
    expect(R.sinConcurso.importePct).toBeCloseTo((suma(filas) / suma(COMPROMETIDOS)) * 100, 1)
  })
})

const fila = (o) => ({
  status: 'awarded',
  assignee: 'ACME SL',
  awardDate: '2024-03-01',
  finalAmountNoTaxes: 1000,
  processType: 'open',
  contractType: 'services',
  ...o,
})

describe('una respuesta que no se puede dar es null, nunca un cero', () => {
  it('sin snapshot no hay ninguna', () => {
    expect(enBreveContratos({})).toEqual({
      cuanto: null,
      aQuien: null,
      sinConcurso: null,
      barrio: null,
    })
  })

  it('sin un solo importe no hay «cuánto» ni «a quién», y sí el recuento de la vía', () => {
    const r = enBreveContratos({
      tenders: {
        contracts: [fila({ finalAmountNoTaxes: null, processType: 'minor_contract' })],
      },
    })
    expect(r.cuanto).toBeNull()
    expect(r.aQuien).toBeNull()
    expect(r.sinConcurso.n).toBe(1)
    expect(r.sinConcurso.importePct).toBeNull()
  })

  it('si ninguna fila declara procedimiento no dice «0 de cada 100»', () => {
    const r = enBreveContratos({
      tenders: { contracts: [fila({ processType: undefined })] },
    })
    expect(r.sinConcurso).toBeNull()
  })

  it('un contrato anulado no cuenta en ninguna de las tres', () => {
    const r = enBreveContratos({
      tenders: {
        contracts: [
          fila({}),
          fila({ status: 'void', finalAmountNoTaxes: 999_000, processType: 'minor_contract' }),
        ],
      },
    })
    expect(r.cuanto.adjudicados).toBe(1)
    expect(r.cuanto.importe).toBe(1000)
    expect(r.sinConcurso.n).toBe(0)
  })

  it('con menos adjudicatarios que los que se nombran no hay «cinco empresas»', () => {
    const contracts = ['A', 'B', 'C'].map((assignee) => fila({ assignee }))
    expect(enBreveContratos({ tenders: { contracts } }).aQuien).toBeNull()
  })
})

describe('la salvedad de la concesión se deriva, y sólo sale cuando pesa', () => {
  const vecinos = Array.from({ length: 6 }, (_, i) =>
    fila({ assignee: `E${i}`, finalAmountNoTaxes: 100 }),
  )

  it('una concesión dominante se dice por su tipo y por su cuota', () => {
    const contracts = [
      ...vecinos,
      fila({
        assignee: 'AGUA SA',
        finalAmountNoTaxes: 1400,
        contractType: 'public_services_management',
      }),
    ]
    const { cuanto } = enBreveContratos({ tenders: { contracts } })
    expect(cuanto.mayor).toEqual({ importe: 1400, cuota: 70, esConcesion: true })
  })

  it('un contrato dominante que no es concesión no se llama concesión', () => {
    const contracts = [...vecinos, fila({ assignee: 'OBRA SA', finalAmountNoTaxes: 1400 })]
    const { cuanto } = enBreveContratos({ tenders: { contracts } })
    expect(cuanto.mayor.esConcesion).toBe(false)
  })

  it('sin un contrato dominante la salvedad desaparece sola', () => {
    const { cuanto } = enBreveContratos({ tenders: { contracts: vecinos } })
    expect(cuanto.mayor).toBeNull()
  })

  it('apartar la concesión mueve el importe sin convocatoria, y sólo se dice si no es ella', () => {
    const contracts = [
      ...vecinos,
      fila({ assignee: 'M', finalAmountNoTaxes: 200, processType: 'minor_contract' }),
      fila({
        assignee: 'AGUA SA',
        finalAmountNoTaxes: 2000,
        contractType: 'public_services_management',
      }),
    ]
    const { sinConcurso } = enBreveContratos({ tenders: { contracts } })
    expect(sinConcurso.importePct).toBeCloseTo((200 / 2800) * 100, 1)
    expect(sinConcurso.importeSinElMayorPct).toBeCloseTo((200 / 800) * 100, 1)

    const elMayorEsDirecto = [
      ...vecinos,
      fila({ assignee: 'M', finalAmountNoTaxes: 5000, processType: 'minor_contract' }),
    ]
    expect(
      enBreveContratos({ tenders: { contracts: elMayorEsDirecto } }).sinConcurso
        .importeSinElMayorPct,
    ).toBeNull()
  })
})
