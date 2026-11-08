/**
 * /presupuesto · dos cifras «por vecino», las dos ciertas, con su puente.
 *
 * La cabecera divide el aprobado de CONPREL entre su población («1.689 € por
 * habitante»); la primera tarjeta de «En breve» divide el tope tras las
 * modificaciones entre esa misma población («2.725 € por vecino»). Un vecino
 * ve dos precios de lo mismo y ninguna frase que los cuadre (auditoría de las
 * dos lecturas, §5.2). El par sólo sale cuando la ejecución es del mismo
 * ejercicio que CONPREL: el 25-10-2026 se veía; el 08-11-2026 no, porque la
 * última ejecución ya es de 2026 y CONPREL sigue en 2025. Volverá en cuanto
 * CONPREL publique 2026.
 *
 * El puente se puede calcular, así que se publica (revisar-superficies, «Cuando
 * las dos cifras son CIERTAS»): la tarjeta dice por vecino lo de partida y lo
 * añadido, y lo de partida es la cifra de la cabecera cuando las dos fuentes
 * dan la misma; si no la dan, el aviso de las dos fuentes trae la de CONPREL
 * por vecino. Las tres cifras de la tarjeta suman al euro.
 *
 * Se mide con el ejercicio de CONPREL (`periodoDelAnio`), no con `latest`: así
 * la guarda mira el par el día que existe, sea cual sea el año publicado.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../../src/i18n'
import Presupuesto from '../../src/pages/Presupuesto'
import { aprobadoPorHabitante, enBrevePresupuesto } from '../../src/scraper/en-breve-presupuesto'
import { periodoDelAnio } from '../../src/scraper/budget-execution'
import { pintaYLee } from '../setup/pinta-y-lee'

vi.mock('react-leaflet', () => {
  const Pinta = ({ children }) => <div>{children}</div>
  return {
    MapContainer: Pinta,
    Circle: Pinta,
    Tooltip: Pinta,
    TileLayer: () => null,
    AttributionControl: () => null,
    Polyline: () => null,
    useMap: () => ({ invalidateSize: () => {} }),
  }
})

const leer = (f) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))
const BUDGET = leer('budget.json')
const EJEC = leer('budget-execution.json')
const S = BUDGET.snapshot
const DEL_ANIO = periodoDelAnio(EJEC, S.year)
const EJEC_DEL_ANIO = { ...EJEC, latest: DEL_ANIO }

describe('las cifras', () => {
  const r = enBrevePresupuesto({ budget: BUDGET, ejecucion: EJEC_DEL_ANIO })
  const cabecera = aprobadoPorHabitante(S)

  it('mide algo: con el ejercicio de CONPREL salen las dos, y NO cuadran solas', () => {
    expect(DEL_ANIO, `no hay ejecución de ${S.year}, el año de CONPREL`).not.toBeNull()
    expect(cabecera).not.toBeNull()
    expect(r.limite?.porVecino).not.toBeNull()
    expect(Math.round(r.limite.porVecino)).not.toBe(Math.round(cabecera))
  })

  it('lo de partida y lo añadido suman, al euro, la cifra de la tarjeta', () => {
    const p = r.limite.porVecinoPartes
    expect(p).not.toBeNull()
    expect(p.inicial + p.anadido).toBe(Math.round(r.limite.porVecino))
  })

  it('la cifra de la cabecera es la de partida, o va en el aviso de las dos fuentes', () => {
    if (r.limite.conprelDiscrepa == null) {
      expect(r.limite.porVecinoPartes.inicial).toBe(Math.round(cabecera))
      expect(r.limite.conprelPorVecino).toBeNull()
    } else expect(r.limite.conprelPorVecino).toBe(cabecera)
  })

  it('cuando CONPREL da otra cifra de partida, el aviso trae la suya por vecino', () => {
    const budget = { snapshot: { ...S, totalExpense: S.totalExpense + 2_000_000 } }
    const rr = enBrevePresupuesto({ budget, ejecucion: EJEC_DEL_ANIO })
    expect(rr.limite.conprelDiscrepa).toBe(budget.snapshot.totalExpense)
    expect(rr.limite.conprelPorVecino).toBe(aprobadoPorHabitante(budget.snapshot))
  })

  it('el redondeo no descuadra: 1,4 + 1,4 son 3 cuando la tarjeta dice 3', () => {
    const latest = {
      year: 2025,
      fechaListado: '31/12/2025',
      gastos: { total: { inicial: 14, modificaciones: 14, actual: 28, ejecutado: 10 } },
    }
    const budget = { snapshot: { year: 2025, population: 10, totalExpense: 14 } }
    const l = enBrevePresupuesto({ budget, ejecucion: { latest } }).limite
    expect(Math.round(l.porVecino)).toBe(3)
    expect(l.porVecinoPartes).toEqual({ inicial: 1, anadido: 2 })
  })

  it('sin nada añadido no hay partes: ni «0 € por vecino» ni una cifra negativa', () => {
    const budget = { snapshot: { year: 2025, population: 10, totalExpense: 14 } }
    for (const modificaciones of [0.2, -2]) {
      const latest = {
        year: 2025,
        fechaListado: '31/12/2025',
        gastos: {
          total: { inicial: 14, modificaciones, actual: 14 + modificaciones, ejecutado: 10 },
        },
      }
      const l = enBrevePresupuesto({ budget, ejecucion: { latest } }).limite
      expect(l.porVecino, String(modificaciones)).not.toBeNull()
      expect(l.porVecinoPartes, String(modificaciones)).toBeNull()
    }
  })

  it('sin población del mismo ejercicio no hay partes ni cifra de CONPREL', () => {
    const budget = { snapshot: { ...S, year: 1999 } }
    const l = enBrevePresupuesto({ budget, ejecucion: EJEC_DEL_ANIO }).limite
    expect(l.porVecino).toBeNull()
    expect(l.porVecinoPartes).toBeNull()
    expect(l.conprelPorVecino).toBeNull()
  })
})

/*
 * Lo que lee el vecino: la cifra de la cabecera se lee de la cabecera pintada
 * y se busca en la tarjeta pintada, en los dos idiomas.
 */
const RUTAS = [
  '/data/budget.json',
  '/data/budget-execution.json',
  '/data/deuda-viva.json',
  '/data/tender-geo.json',
]
const servido = (budget, ejecucion = EJEC_DEL_ANIO) => ({
  ...Object.fromEntries(RUTAS.map((r) => [r, leer(r.slice('/data/'.length))])),
  '/data/budget.json': budget,
  '/data/budget-execution.json': ejecucion,
})
const escenario = (fetch) => ({
  nombre: 'presupuesto · las dos cifras por vecino',
  fetch,
  pinta: () => <Presupuesto />,
  listo: (c) =>
    Boolean(c.querySelector('[data-sello]') && c.querySelector('[data-en-breve="limite"]')),
})
const lee = (c) => [
  c.querySelector('[data-sello]')?.textContent ?? '',
  c.querySelector('[data-en-breve="limite"]')?.textContent ?? '',
]
const CIFRA = '(\\d{1,3}(?:\\.\\d{3})*)\\u00a0€'
const entero = (s) => Number(s.replaceAll('.', ''))
const POR_HAB = { es: 'por habitante', ca: 'per habitant' }
const POR_VECINO = { es: 'por vecino', ca: 'per veí' }

async function leeLasDos(budget, idioma, ejecucion) {
  const { piezas } = await pintaYLee(escenario(servido(budget, ejecucion)), idioma, { lee })
  const [sello, tarjeta] = piezas
  const enSello = sello.match(new RegExp(`${CIFRA} ${POR_HAB[idioma]}`))
  expect(enSello, `la cabecera no dice «… ${POR_HAB[idioma]}»: ${sello}`).not.toBeNull()
  const enTarjeta = [...tarjeta.matchAll(new RegExp(`${CIFRA} ${POR_VECINO[idioma]}`, 'g'))].map(
    (m) => entero(m[1]),
  )
  return { porHab: entero(enSello[1]), enTarjeta, tarjeta }
}

/** La mayor es la de la tarjeta; dos de las otras tienen que sumarla. */
function cuadran(cifras) {
  const total = Math.max(...cifras)
  const resto = cifras.filter((c, i) => i !== cifras.indexOf(total))
  return resto.some((a, i) => resto.some((b, j) => i !== j && a + b === total))
}

describe('lo que lee el vecino', () => {
  for (const idioma of ['es', 'ca']) {
    it(`${idioma}: la cifra de la cabecera reaparece en la tarjeta, y las de la tarjeta suman`, async () => {
      const { porHab, enTarjeta, tarjeta } = await leeLasDos(BUDGET, idioma)
      // La premisa, medida en lo pintado: la cifra grande de la tarjeta no es
      // la de la cabecera.
      expect(Math.max(...enTarjeta), tarjeta).not.toBe(porHab)
      expect(enTarjeta, tarjeta).toContain(porHab)
      expect(cuadran(enTarjeta), `no suman: ${enTarjeta.join(', ')}`).toBe(true)
    })
  }

  it('con las dos fuentes en desacuerdo, la cifra de CONPREL va en su aviso', async () => {
    const budget = { ...BUDGET, snapshot: { ...S, totalExpense: S.totalExpense + 2_000_000 } }
    const { porHab, enTarjeta, tarjeta } = await leeLasDos(budget, 'es')
    expect(enTarjeta, tarjeta).toContain(porHab)
    expect(cuadran(enTarjeta.filter((c) => c !== porHab)), enTarjeta.join(', ')).toBe(true)
  })
})

/*
 * Lo que vio la lectura independiente del 08-11-2026, con datos congelados: el
 * par vuelve con CONPREL 2026, y para entonces lo publicado habrá cambiado.
 */
const fixture = (f) => readFileSync(resolve('tests/fixtures', f), 'utf8')
/** La primera columna de «Total Gastos» de una hoja municipal: el crédito inicial. */
const inicialDe = (f) => {
  const m = fixture(f).match(/Total Gastos(\d{1,3}(?:\.\d{3})*,\d{2})/)
  return Number(m[1].replaceAll('.', '').replace(',', '.'))
}
// La hoja de junio de 2025, la que el sitio publicó de julio al 22-10-2026, con
// la fecha con que se imprimió: su parámetro de informe decía 31/12/2025
// (commit 69eb7947).
const HOJA_2T = JSON.parse(fixture('budget-execution_publicado-2026-10-21_hoja-2t2025.json'))
const JUNIO_2025 = { ...HOJA_2T, latest: { ...HOJA_2T.latest, fechaListado: '30/06/2025' } }
// CONPREL 2025: el total es el crédito inicial del cierre, igual al céntimo
// (69eb7947), y la población la de su padrón.
const CONPREL_2025 = {
  ...BUDGET,
  snapshot: {
    ...S,
    year: 2025,
    population: 24616,
    totalExpense: inicialDe('budget-execution-gastos_4t2025.txt'),
  },
}

describe('lo que la tarjeta afirma del año', () => {
  it('no dice que el año empezó con el crédito inicial: en 2025 cambió a mitad de año', () => {
    // La premisa: marzo y junio de 2025 parten de 37,6 M€, el cierre de 41,6 M€.
    // «Empezó el año con 41,6 M€» sería falso del 1 de enero.
    const marzo = inicialDe('budget-execution-gastos_1t2025.txt')
    const junio = inicialDe('budget-execution-gastos_2t2025.txt')
    const cierre = inicialDe('budget-execution-gastos_4t2025.txt')
    expect(marzo).toBe(junio)
    expect(cierre).toBeGreaterThan(marzo)
    const claves = Object.keys(CATALOGUE.es).filter((k) =>
      k.startsWith('presupuesto.enBreve.limite.'),
    )
    expect(claves.length).toBeGreaterThan(5)
    for (const idioma of ['es', 'ca'])
      for (const k of claves)
        expect(CATALOGUE[idioma][k], `${idioma} · ${k}`).not.toMatch(/empez|comen[cç]/i)
  })

  it('con el año sin cerrar, el aviso no llama desacuerdo de fuentes a una hoja de mitad de año', async () => {
    const { porHab, enTarjeta, tarjeta } = await leeLasDos(CONPREL_2025, 'es', JUNIO_2025)
    // Medido: el puente sigue (1.527 + 997 = 2.524, y 1.689 en el aviso)…
    expect(enTarjeta, tarjeta).toContain(porHab)
    expect(cuadran(enTarjeta.filter((c) => c !== porHab)), enTarjeta.join(', ')).toBe(true)
    // …pero en junio el Ayuntamiento aún no había cambiado su cifra de partida, y
    // en el cierre coincidió con CONPREL al céntimo.
    expect(tarjeta).not.toMatch(/no cuadran/)
    expect(tarjeta).toMatch(/no ha cerrado/)
  })

  it('la misma cifra por vecino no sale dos veces como si fueran dos', async () => {
    // Una diferencia de 5.000 € entre las dos fuentes pasa la tolerancia de 1.000 €
    // y no mueve un euro por vecino: «otra cifra … 1.689 € por vecino» junto a
    // «(1.689 € por vecino)» diría dos cosas con un número.
    const budget = { ...BUDGET, snapshot: { ...S, totalExpense: S.totalExpense + 5_000 } }
    const { porHab, enTarjeta, tarjeta } = await leeLasDos(budget, 'es')
    expect(
      enTarjeta.filter((c) => c === porHab),
      tarjeta,
    ).toHaveLength(1)
  })
})
