import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  esAbierto,
  ofertaUnica,
  PREFIJO_CONFLICTO,
} from '../src/pages/reportajes/InteligenciaTuristica'

// Desde el 19-10-2026 la tabla del plan marca «única» en los procedimientos
// abiertos con una sola oferta, y el párrafo de debajo los cuenta a mano:
// «cuatro de los once procedimientos abiertos del plan recibieron una única
// oferta». Si la instantánea cambia y la frase no, la tabla y el texto dirían
// cosas distintas una debajo del otro.

const snap = JSON.parse(readFileSync('public/data/reportajes/inteligencia-turistica.json', 'utf8'))
const fuente = readFileSync('src/pages/reportajes/InteligenciaTuristica.jsx', 'utf8')
const plan = snap.cluster.filter((r) => r.pstd)
const EN_LETRA = [
  'cero',
  'una',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
]

describe('«inteligencia turística»: lo que la tabla marca y el texto cuenta', () => {
  it('mide algo: hay procedimientos abiertos con una sola oferta', () => {
    expect(plan.filter(ofertaUnica).length).toBeGreaterThan(0)
  })

  it('el párrafo cuenta las mismas que marca la tabla', () => {
    const unicas = EN_LETRA[plan.filter(ofertaUnica).length]
    const abiertos = EN_LETRA[plan.filter(esAbierto).length]
    expect(fuente.replace(/\s+/g, ' ')).toContain(
      `${unicas} de los ${abiertos} procedimientos abiertos del plan recibieron una única oferta`,
    )
  })

  it('el párrafo cuenta los nombres que la tabla repite', () => {
    // Decía «Tres nombres se repiten» con uno solo repetido en la tabla, y
    // seguía con Auren, que tiene un contrato (corrección del 29-10-2026).
    const filas = new Map()
    for (const r of plan) filas.set(r.empresa, (filas.get(r.empresa) ?? 0) + 1)
    const repetidos = [...filas].filter(([, n]) => n > 1).map(([empresa]) => empresa)
    expect(repetidos).toEqual(['Sien Planificación Inteligente S.L.'])
    expect(fuente.replace(/\s+/g, ' ')).toContain('Sólo un nombre se repite en la tabla')
  })

  it('el ≈1,56 M€ es la suma de las filas del plan', () => {
    // La corrección del 02-08-2026 lo daba por irreproducible; la del
    // 29-10-2026 dice que es esta suma, y la nota de la tabla también.
    const suma = plan.reduce((s, r) => s + r.importe, 0)
    expect(suma).toBe(1561590)
    expect(snap.clusterNota).toContain('Suman ≈1,56 M€ sin IVA')
  })

  it('las filas en foco son los dos contratos que celebra la nota', () => {
    const foco = plan.filter((r) => r.foco).map((r) => r.objeto)
    expect(foco).toHaveLength(2)
    expect(foco.join(' ')).toMatch(/97\/2025/)
    expect(foco.join(' ')).toMatch(/101\/2025/)
  })

  it('la declaración de intereses que va en la cabecera está en el método', () => {
    const enMetodo = snap.metodo.filter((t) => t.startsWith(PREFIJO_CONFLICTO))
    expect(enMetodo).toHaveLength(1)
  })
})
