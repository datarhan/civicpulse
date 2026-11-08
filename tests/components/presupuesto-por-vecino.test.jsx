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
const servido = (budget) => ({
  ...Object.fromEntries(RUTAS.map((r) => [r, leer(r.slice('/data/'.length))])),
  '/data/budget.json': budget,
  '/data/budget-execution.json': EJEC_DEL_ANIO,
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

async function leeLasDos(budget, idioma) {
  const { piezas } = await pintaYLee(escenario(servido(budget)), idioma, { lee })
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
