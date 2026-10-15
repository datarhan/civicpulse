/**
 * /presupuesto · lo que CONPREL no trae no se pinta como 0 €.
 *
 * `parseConprelBudget` devolvía 0 por una celda vacía o ilegible, y la página
 * lo recogía tal cual: un capítulo sin dato caía en «está aprobado a 0 € y por
 * eso no tiene barra», y un total ausente salía como «0,00 M€». Las dos frases
 * afirman una cifra que la fuente no da (CLAUDE.md, regla 3). Ahora la celda
 * llega como null y el snapshot lista en `sinDato` lo que no pudo leer; esta
 * guarda pinta la página con ese snapshot y lee lo que dice.
 *
 * Los datos son los publicados, con huecos hechos a mano: el CONPREL real no
 * trae ninguno (lo comprueba `tests/parse-budget.test.ts` contra la descarga),
 * así que sin ellos la guarda no tendría nada que mirar.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Presupuesto from '../../src/pages/Presupuesto'
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

const publicado = (ruta) => JSON.parse(readFileSync(resolve('public', `.${ruta}`), 'utf8'))

const RUTAS = [
  '/data/budget.json',
  '/data/budget-execution.json',
  '/data/obras.json',
  '/data/bdns.json',
  '/data/deuda-viva.json',
  '/data/tenders.json',
  '/data/tenders-ted.json',
  '/data/tender-geo.json',
  '/data/cpv-labels.json',
  '/data/entities.json',
  '/data/geo.json',
  '/data/quejas.json',
  '/data/queja-contract-relations.json',
  '/data/queja-contract-relations-approved.json',
]

const AL_PULSAR = [
  '/data/entities.json',
  '/data/quejas.json',
  '/data/queja-contract-relations.json',
  '/data/queja-contract-relations-approved.json',
]

/** El snapshot publicado, con los huecos que `vacia` le haga. */
const conHuecos = (vacia) => {
  const mapa = structuredClone(Object.fromEntries(RUTAS.map((r) => [r, publicado(r)])))
  vacia(mapa['/data/budget.json'].snapshot)
  return mapa
}

const escenario = (mapa) => ({
  nombre: 'presupuesto · celda sin dato en CONPREL',
  fetch: mapa,
  pinta: () => <Presupuesto />,
  listo: (c) => Boolean(c.querySelector('[data-capitulo]')),
  alPulsar: AL_PULSAR,
})

const leeTodo = (c) => [c.textContent ?? '']

describe('/presupuesto · una celda sin dato en CONPREL', () => {
  it('el capítulo sin dato se dice sin dato, no «aprobado a 0 €»', async () => {
    const mapa = conHuecos((s) => {
      const cap = s.expenseByEconomicChapter.find((c) => c.code === '2')
      cap.amount = null
      s.sinDato = [{ campo: 'expenseByEconomicChapter.2', etiqueta: cap.label }]
    })
    const { piezas } = await pintaYLee(escenario(mapa), 'es', {
      lee: (c) => [...c.querySelectorAll('[data-sin-dato]')].map((el) => el.textContent),
    })
    const aviso = piezas.join(' ')
    expect(aviso, 'la tarjeta no dice que al capítulo 2 le falta el dato').toMatch(/\b2\b/)
    expect(aviso).toMatch(/sin dato/i)

    const { piezas: todo } = await pintaYLee(escenario(mapa), 'es', { lee: leeTodo })
    expect(todo.join(' '), 'publica el capítulo sin dato como aprobado a cero').not.toMatch(
      /cap[ií]tulos? [^.]*\b2\b[^.]*aprobados? a 0 €/i,
    )
  })

  it('el total sin dato no sale como 0,00 M€ ni NaN', async () => {
    const mapa = conHuecos((s) => {
      s.totalExpense = null
      s.balance = null
      s.sinDato = [{ campo: 'totalExpense', etiqueta: 'Total gastos' }]
    })
    const { piezas } = await pintaYLee(escenario(mapa), 'es', { lee: leeTodo })
    const texto = piezas.join(' ')
    expect(texto).not.toMatch(/NaN/)
    expect(texto, 'publica un presupuesto de gastos de cero euros').not.toMatch(
      /(^|[^\d.,])0,00\s?M€ de gastos/,
    )
    expect(texto, 'publica un gasto por habitante de cero euros').not.toMatch(
      /(^|[^\d.,])0\s?€ por habitante/,
    )
  })
})
