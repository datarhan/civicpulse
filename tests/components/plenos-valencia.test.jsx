/**
 * El índice de plenos en valencià (#38).
 *
 * /plenos era una de las tres páginas que la incidencia encontró enteras sin
 * catálogo. Medido al empezar, era más de lo que decía: además de la tabla de
 * sesiones y de los filtros de `pleno-summary`, la página monta la escalera de
 * cobertura, las tarjetas de votaciones y de declaraciones y el reparto por área,
 * y ninguna pasaba por el catálogo. Tampoco la píldora de frescura (`DataAsOf`),
 * que es compartida.
 *
 * La guarda es la de la portada: pinta la página en castellano y en valencià con
 * las instantáneas PUBLICADAS —aquí no hay dato personal que proteger—, espera dos
 * lecturas iguales y compara pieza a pieza. Las ramas que el dato de hoy no pinta
 * se abren con una mutación pequeña y nombrada del fichero publicado, y los cinco
 * filtros se pulsan uno a uno, porque cada uno reescribe la cabecera y las notas
 * de año. La cobertura exige que cada cadena `plenos.indice.*` y `plenos.retirada.*`
 * del catálogo salga pintada en algún escenario.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../../src/i18n'
import Plenos from '../../src/pages/Plenos'
import { DEPARTMENT_LABEL } from '../../src/scraper/departments'
import { RETRACTION_SCOPES } from '../../src/scraper/pleno-votes'
import {
  cadenasDe,
  datosPintados,
  detectorDeCastellano,
  lectura,
  masLargasPrimero,
} from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

// ─── Qué no es lengua ──────────────────────────────────────────────────────────

const SIGLAS = ['regmeet.com', 'regmeet', 'Riba-roja de Túria']

/**
 * Los nombres de área que se escriben igual en los dos idiomas («Cultura»): salen
 * de la tabla que los rotula, no se apuntan aquí.
 */
const AREAS_IGUALES = Object.values(DEPARTMENT_LABEL)
  .filter((l) => l.es === l.ca)
  .map((l) => l.es)

/**
 * «39 de 62» se escribe igual en valencià. Sólo se quita para comparar piezas
 * enteras; al detector de palabras sueltas no se le pasa, que «de» no es castellano.
 */
const ENTRE_CIFRAS = [' de ']

// ─── Lo publicado ──────────────────────────────────────────────────────────────

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))

const RUTAS = {
  plenos: '/data/plenos.json',
  agendas: '/data/plenos-agendas.json',
  manifiesto: '/data/pleno-claims/index.json',
  votos: '/data/pleno-votes.json',
  hallazgos: '/data/pleno-findings.json',
}
const sirve = () => Object.fromEntries(Object.values(RUTAS).map((r) => [r, publicado(r)]))

const idsCon = (mapa) => ({
  orden: new Set((mapa[RUTAS.agendas].plenos ?? []).map((p) => p.id)),
  decl: new Set((mapa[RUTAS.manifiesto].plenos ?? []).map((p) => p.plenoId)),
})

/**
 * La escalera anidada, sin retiradas ni retenidas sin procedencia, y todas las
 * sesiones ordinarias: el filtro de extraordinarias no deja ninguna.
 */
function anidadaYSinRetiradas() {
  const mapa = structuredClone(sirve())
  const { orden } = idsCon(mapa)
  const manifiesto = mapa[RUTAS.manifiesto]
  manifiesto.plenos = manifiesto.plenos.filter((p) => orden.has(p.plenoId))
  manifiesto.totals.retenidasSinProcedencia = 0
  const decl = new Set(manifiesto.plenos.map((p) => p.plenoId))
  const votos = mapa[RUTAS.votos]
  votos.stats.byPleno = Object.fromEntries(
    Object.entries(votos.stats.byPleno ?? {}).filter(([id]) => decl.has(id)),
  )
  votos.stats.retracted = {}
  mapa[RUTAS.plenos].items = mapa[RUTAS.plenos].items.map((s) => ({ ...s, kind: 'ordinario' }))
  return mapa
}

/** Sesiones de la instantánea que no tienen declaraciones: las primeras `n`. */
const sinDeclaraciones = (mapa, n) => {
  const { decl } = idsCon(mapa)
  return mapa[RUTAS.plenos].items
    .map((s) => s.id)
    .filter((id) => !decl.has(id))
    .slice(0, n)
}

/**
 * Una sesión con declaraciones sin orden del día y varias con votaciones sin
 * declaraciones; un desenlace de cada clase; y retiradas con los plurales que el
 * dato de hoy no tiene.
 */
function unaSinOrdenVariasSinDecl() {
  const mapa = structuredClone(sirve())
  const { orden } = idsCon(mapa)
  const manifiesto = mapa[RUTAS.manifiesto]
  const sueltas = manifiesto.plenos.filter((p) => !orden.has(p.plenoId))
  manifiesto.plenos = manifiesto.plenos.filter(
    (p) => orden.has(p.plenoId) || p.plenoId === sueltas[0]?.plenoId,
  )
  const votos = mapa[RUTAS.votos]
  for (const id of sinDeclaraciones(mapa, 2)) votos.stats.byPleno[id] = 1
  votos.items[0].outcome = 'retirado'
  votos.items[1].outcome = 'aplazado'
  votos.stats.retracted = { record: 1, breakdown: 2, plazo: 2 }
  return mapa
}

/** Varias con declaraciones sin orden del día, una con votaciones sin declaraciones. */
function variasSinOrdenUnaSinDecl() {
  const mapa = structuredClone(sirve())
  const votos = mapa[RUTAS.votos]
  for (const id of sinDeclaraciones(mapa, 1)) votos.stats.byPleno[id] = 1
  votos.stats.retracted = { plazo: 1 }
  return mapa
}

/** Ninguna sesión con fecha: la entradilla y el pie sin ventana temporal. */
function sinFechas() {
  const mapa = structuredClone(sirve())
  mapa[RUTAS.plenos].items = mapa[RUTAS.plenos].items.map((s) => ({ ...s, date: null }))
  return mapa
}

// ─── Escenarios ────────────────────────────────────────────────────────────────

const filasDe = (mapa) => mapa[RUTAS.plenos].items.length

/** La tabla, las tarjetas y el reparto ya pintados. */
const pintada = (mapa) => (c) =>
  c.querySelectorAll('.cp-plenos-fila').length === filasDe(mapa) &&
  c.querySelectorAll('[role="group"] button').length > 1 &&
  c.querySelectorAll('h2').length >= 4 &&
  c.querySelectorAll('.cp-plenos-area').length > 0

/** Pulsa cada filtro y lee la página cada vez: la cabecera y las notas de año cambian. */
async function pulsaCadaFiltro(container) {
  const botones = () => [...container.querySelectorAll('[role="group"] button')]
  const leido = []
  for (let i = 0; i < botones().length; i += 1) {
    fireEvent.click(botones()[i])
    await waitFor(() => expect(botones()[i].getAttribute('aria-pressed')).toBe('true'))
    leido.push(...lectura(container))
  }
  return leido
}

const escenario = (nombre, mapa, extra = {}) => ({
  nombre,
  fetch: mapa,
  pinta: () => <Plenos />,
  listo: pintada(mapa),
  ...extra,
})

const ESCENARIOS = [
  escenario('el índice con lo publicado, pulsando cada filtro', sirve(), {
    interactua: pulsaCadaFiltro,
  }),
  escenario(
    'la escalera anidada, sin retiradas y un filtro que no deja ninguna',
    anidadaYSinRetiradas(),
    { interactua: pulsaCadaFiltro },
  ),
  escenario(
    'una sesión con declaraciones sin orden, varias con votos sin declaraciones y cada desenlace',
    unaSinOrdenVariasSinDecl(),
  ),
  escenario(
    'varias con declaraciones sin orden y una con votos sin declaraciones',
    variasSinOrdenUnaSinDecl(),
  ),
  escenario('sin fechas: la entradilla y el pie sin ventana', sinFechas()),
]

afterEach(() => localStorage.clear())

// ─── Lo que se compara ─────────────────────────────────────────────────────────

describe('las mutaciones abren las ramas que dicen', () => {
  it('cada alcance de retirada sale en singular y en plural en algún escenario', () => {
    const vistos = new Set()
    for (const e of ESCENARIOS) {
      for (const [alcance, n] of Object.entries(e.fetch[RUTAS.votos].stats.retracted ?? {})) {
        if (n > 0) vistos.add(`${alcance}·${n === 1 ? 'uno' : 'varios'}`)
      }
    }
    const faltan = RETRACTION_SCOPES.flatMap((a) => [`${a}·uno`, `${a}·varios`]).filter(
      (x) => !vistos.has(x),
    )
    expect(faltan).toEqual([])
  })
})

describe('el índice de plenos en valencià: nada se lee igual que en castellano', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (esc) => {
      const es = await pintaYLee(esc, 'es')
      const ca = await pintaYLee(esc, 'ca')
      expect(es.piezas.length, 'el escenario no pintó nada que leer').toBeGreaterThan(0)
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])

      const datos = datosPintados(es.piezas, cadenasDe(esc.fetch))
      const noSeTraduce = masLargasPrimero([...datos, ...SIGLAS, ...AREAS_IGUALES])
      const { sinTraducir } = detectorDeCastellano(
        masLargasPrimero([...noSeTraduce, ...ENTRE_CIFRAS]),
      )
      const { castellanoEn } = detectorDeCastellano(noSeTraduce)

      expect
        .soft(
          ca.piezas.length,
          `no se pintan las mismas piezas\n  es ${JSON.stringify(es.piezas.slice(0, 80))}\n  ca ${JSON.stringify(ca.piezas.slice(0, 80))}`,
        )
        .toBe(es.piezas.length)
      expect
        .soft(
          [...new Set(sinTraducir(es.piezas.map((s, i) => [s, ca.piezas[i]])))],
          'se lee igual en castellano y en valencià',
        )
        .toEqual([])
      expect
        .soft(
          [...new Set(ca.piezas.flatMap((s) => castellanoEn(s)))],
          'castellano dentro del valencià',
        )
        .toEqual([])
    },
    120000,
  )
})

/**
 * Cobertura: cada cadena del índice en el catálogo se pinta en algún escenario. Un
 * rótulo nuevo sin escenario nace sin leer en valencià y nadie lo notaría.
 */
describe('cobertura de la guarda del índice de plenos', () => {
  it('toda cadena plenos.indice.* y plenos.retirada.* se pinta en algún escenario', async () => {
    const claves = Object.keys(CATALOGUE.es).filter(
      (k) => k.startsWith('plenos.indice.') || k.startsWith('plenos.retirada.'),
    )
    // Mide algo: sin claves no hay nada que cubrir.
    expect(claves.length, 'el catálogo no tiene cadenas del índice').toBeGreaterThan(30)
    const leido = []
    for (const esc of ESCENARIOS) leido.push(...(await pintaYLee(esc, 'es')).piezas)
    const texto = leido.join('\n')
    const sinPintar = claves.filter((clave) =>
      CATALOGUE.es[clave]
        .split(/\{\w+\}/)
        .map((trozo) => trozo.trim())
        .filter((trozo) => /\p{L}/u.test(trozo))
        .some((trozo) => !texto.includes(trozo)),
    )
    expect(sinPintar).toEqual([])
  }, 300000)
})
