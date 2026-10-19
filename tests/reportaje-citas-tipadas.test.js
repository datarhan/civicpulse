import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { TIPOS_CITA } from '../src/pages/reportajes/ConteoVisitantes'

// Cada cita de una pieza dice QUÉ documento habla: la etiqueta en mono encima
// —«Pliego técnico · exp. 98/2025»— sale de `tipo` y `de`. Una cita sin `tipo`
// lanza al pintarse; esto la encuentra antes, en el código, y con su línea.

const DIR = 'src/pages/reportajes'
// Sólo las piezas que usan ESTA `Cita`: la define ConteoVisitantes.jsx y la
// importan las demás. Una pieza con una `Cita` propia —basuras la tuvo hasta
// el 19-10-2026— es otra componente con otras props, y no se mira.
const piezas = readdirSync(DIR).filter((f) => {
  if (!f.endsWith('.jsx')) return false
  if (f === 'ConteoVisitantes.jsx') return true
  const src = readFileSync(`${DIR}/${f}`, 'utf8')
  return /import\s*\{[^}]*\bCita\b[^}]*\}\s*from\s*'\.\/ConteoVisitantes'/.test(src)
})

/** Las etiquetas de apertura de <Cita> y <CitaEnLinea>, con su fichero. */
function aperturas() {
  const out = []
  for (const f of piezas) {
    const src = readFileSync(`${DIR}/${f}`, 'utf8')
    for (const m of src.matchAll(/<Cita(?:EnLinea|Fragmentos)?\b([^>]*)>/g)) {
      out.push({ f, attrs: m[1] })
    }
  }
  return out
}

describe('citas tipadas en las piezas', () => {
  const todas = aperturas()

  it('el barrido encontró citas de verdad', () => {
    // Prueba de trabajo: una regex rota dejaría la de abajo en verde sin mirar
    // nada. «matrículas y móviles» sola tiene más de cinco.
    expect(todas.length).toBeGreaterThan(5)
  })

  it('toda cita declara un tipo de los que existen', () => {
    const tipos = Object.keys(TIPOS_CITA)
    const malas = todas
      .map(({ f, attrs }) => ({ f, tipo: attrs.match(/\btipo="([^"]+)"/)?.[1] ?? null }))
      .filter(({ tipo }) => tipo === null || !tipos.includes(tipo))
    expect(malas).toEqual([])
  })
})

describe('hoja de contactos de «matrículas y móviles»', () => {
  const snap = JSON.parse(readFileSync('public/data/reportajes/matriculas-y-moviles.json', 'utf8'))
  const { fotos, filas } = snap.observado

  it('cada foto que cita una fila cita una que existe', () => {
    const conFila = fotos.filter((f) => f.fila !== undefined)
    // Sin ninguna, la tabla no citaría ninguna foto y esto pasaría vacío.
    expect(conFila.length).toBeGreaterThan(0)
    for (const f of conFila) {
      expect(Number.isInteger(f.fila), f.src).toBe(true)
      expect(f.fila, f.src).toBeGreaterThanOrEqual(0)
      expect(f.fila, f.src).toBeLessThan(filas.length)
    }
  })
})
