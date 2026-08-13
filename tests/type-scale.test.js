/**
 * §03: ocho pasos y un suelo de 11 px, ningún medio punto.
 *
 * La producción publicaba VEINTIOCHO tamaños distintos en 1.437 sitios: 519 con
 * medio punto y 435 por debajo del suelo, hasta 8 px. Un medio punto no es una
 * decisión de diseño — es lo que pasa cuando alguien empuja una línea para que
 * quepa— y a 9 px la meta de una ficha no la lee nadie.
 *
 * Y §11 promete «densidad ajustable: la escala se reescala desde la raíz». El
 * panel de ajustes movía el font-size de <html> y no cambiaba ni una letra,
 * porque los 1.437 tamaños eran píxeles absolutos: un control que existía y no
 * hacía nada. Por eso la escala va en rem, y por eso el suelo va con `max()`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')

function ficheros(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficheros(p, acc)
    else if (/\.(jsx?|tsx?|css)$/.test(p)) acc.push(p)
  }
  return acc
}
const FUENTES = ficheros(join(ROOT, 'src'))

/** Los pasos declarados, leídos de index.css. No se repiten aquí. */
const PASOS = Object.fromEntries(
  [...css.matchAll(/--fs-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
)

describe('la escala tipográfica', () => {
  it('declara exactamente ocho pasos', () => {
    expect(Object.keys(PASOS).sort()).toEqual(
      ['aux', 'body', 'card', 'display', 'head', 'meta', 'micro', 'page'].sort(),
    )
  })

  it('va en rem, para que la densidad haga algo', () => {
    // El control de densidad mueve el font-size de la raíz. Con la escala en
    // píxeles absolutos ese control es decorativo.
    const enPx = Object.entries(PASOS).filter(([, v]) => /^\d+px$/.test(v))
    expect(enPx, 'un paso en px absolutos no responde a la densidad').toEqual([])
  })

  it('el suelo aguanta en las tres densidades', () => {
    // A densidad compacta la raíz baja a 13,5 px y el paso micro caería a
    // 10,6. El `max(11px, …)` es lo que impide que el suelo se hunda.
    expect(PASOS.micro).toMatch(/max\(\s*11px/)
    const densidades = [13.5, 14, 15]
    const rem = parseFloat(PASOS.micro.match(/([\d.]+)rem/)[1])
    for (const raiz of densidades) {
      expect(Math.max(11, rem * raiz), `a raíz ${raiz}px`).toBeGreaterThanOrEqual(11)
    }
  })

  it('ningún paso lleva medio punto', () => {
    for (const [k, v] of Object.entries(PASOS)) {
      const px = (parseFloat(v.match(/([\d.]+)rem/)?.[1] ?? 0) * 14).toFixed(2)
      expect(Math.abs(px - Math.round(px)), `${k} = ${px}px`).toBeLessThan(0.02)
    }
  })

  it('ningún tamaño numérico escrito a mano, en ninguna de sus formas', () => {
    // Las formas que el barrido inicial NO vio y esta prueba sí: el ternario
    // (`size === 'xs' ? 10 : 11`), el clamp con extremos propios y el cálculo.
    // Eran ocho, y la primera versión de este guard las encontró todas.
    //
    // SectionGlyph queda fuera con nombre y motivo: su tamaño se deriva de la
    // caja que le pasa quien lo usa (`Math.round(size * 0.94)`), y eso es
    // geometría de un glifo, no un paso de la escala de TEXTO.
    const EXENTOS = new Set(['src/components/SectionGlyph.jsx'])
    const culpables = []
    for (const p of FUENTES) {
      const rel = p.replace(ROOT + '/', '')
      if (EXENTOS.has(rel)) continue
      const lineas = readFileSync(p, 'utf8').split('\n')
      lineas.forEach((l, i) => {
        const m = l.match(/fontSize: *(['"`]?)([^,\n]*)|font-size: *([^;\n]*)/)
        if (!m) return
        const valor = (m[2] || m[3] || '').trim()
        if (!valor || /var\(--(fs|type)-/.test(valor)) return
        if (/inherit|^\{|^$/.test(valor)) return
        if (/\d/.test(valor)) culpables.push(`${rel}:${i + 1} — ${valor}`)
      })
    }
    expect(culpables, 'usa var(--fs-…)').toEqual([])
  })

  it('ningún tamaño llega a fontSize por una variable intermedia', () => {
    // La forma que se escapó de la comprobación de arriba: el número no está en
    // la línea del `fontSize`, sino en una variable que se le pasa. Ocurrió en
    // el propio <Quote> —`const cuerpo = size === 'page' ? 17 : 14`—, escrito
    // un rato antes de que existiera la escala. Así es como se acumulan
    // veintiocho tamaños: de uno en uno, cada uno con su motivo.
    const culpables = []
    for (const p of FUENTES) {
      if (!/\.jsx?$/.test(p)) continue
      const txt = readFileSync(p, 'utf8')
      const lineas = txt.split('\n')
      // variables que acaban en fontSize
      const usadas = new Set([...txt.matchAll(/fontSize: (\w+)[,\s}]/g)].map((m) => m[1]))
      usadas.delete('undefined')
      lineas.forEach((l, i) => {
        const m = l.match(/(?:const|let)\s+(\w+)\s*=\s*(.+)$/)
        if (!m || !usadas.has(m[1])) return
        if (/var\(--(fs|type)-/.test(m[2])) return
        if (/\b\d+(\.\d+)?\b/.test(m[2]))
          culpables.push(`${p.replace(ROOT + '/', '')}:${i + 1} — ${m[1]} = ${m[2].trim()}`)
      })
    }
    expect(culpables, 'la variable que alimenta fontSize también usa la escala').toEqual([])
  })

  it('el barrido miró ficheros de verdad y los pasos se usan', () => {
    // Prueba de trabajo. Una regex rota dejaría todo lo de arriba verde.
    expect(FUENTES.length).toBeGreaterThan(100)
    expect(Object.keys(PASOS).length).toBe(8)
    const codigo = FUENTES.map((p) => readFileSync(p, 'utf8')).join('\n')
    for (const k of Object.keys(PASOS)) {
      expect(codigo.split(`var(--fs-${k})`).length - 1, `--fs-${k} no se usa`).toBeGreaterThan(0)
    }
  })
})
