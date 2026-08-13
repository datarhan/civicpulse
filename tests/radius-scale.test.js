/**
 * §05: tres radios. 8 en controles, 12 en contenedores, 20 en pastillas.
 *
 * Los tokens `--r-input/--r-card/--r-pill` existían desde el brandbook v2 y se
 * usaban SIETE veces, mientras 307 sitios escribían el número a mano en catorce
 * valores distintos: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 20 y 999. Es el
 * mismo patrón que `--ink70`: el token existe, la escala está escrita, y los
 * componentes no la miran.
 *
 * Esta prueba impide que vuelva. No comprueba «se ven bien los radios» —eso no
 * lo puede ver ninguna suite— sino que nadie escriba un número donde hay un
 * token, que es la condición sin la cual la escala no existe.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')

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

describe('la escala de radios', () => {
  it('declara exactamente tres, y con los valores del brandbook', () => {
    const css = readFileSync(join(ROOT, 'src/index.css'), 'utf8')
    const tokens = [...css.matchAll(/--r-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
    expect(Object.fromEntries(tokens)).toEqual({ input: '8px', card: '12px', pill: '20px' })
  })

  it('ningún radio numérico escrito a mano en JSX, ni suelto ni en cadena', () => {
    // Las DOS formas. La primera versión de esta prueba sólo miraba
    // `borderRadius: 8` y dejaba pasar `borderRadius: '0 4px 4px 0'`, que es
    // exactamente igual de escrito a mano: cinco radios direccionales seguían
    // fuera de la escala y la página los enseñaba.
    //
    // `50%` no cuenta: es una circunferencia —avatares, puntos, el indicador
    // «en vivo»—, no un radio de la escala.
    const culpables = []
    for (const p of FUENTES) {
      if (!/\.jsx?$/.test(p)) continue
      const lineas = readFileSync(p, 'utf8').split('\n')
      lineas.forEach((l, i) => {
        const m = l.match(/borderRadius: *(['"`]?)([^,\n]*)/)
        if (!m) return
        // Se quitan los tokens y el círculo; si queda alguna cifra distinta de
        // cero, está escrita a mano. El cero SÍ vale: en un radio direccional
        // —`0 var(--r-input) var(--r-input) 0`— significa «esta esquina no
        // lleva», no una medida elegida a ojo.
        const valor = m[2]
        const limpio = valor.replace(/var\(--r-[\w-]+\)/g, '').replace(/50%/g, '')
        if (!/[1-9]/.test(limpio)) return
        culpables.push(`${p.replace(ROOT + '/', '')}:${i + 1} — ${valor.trim()}`)
      })
    }
    expect(culpables, 'usa var(--r-input | --r-card | --r-pill)').toEqual([])
  })

  it('ningún radio numérico en CSS, salvo el círculo', () => {
    // `50%` no es un radio de la escala: es una circunferencia — avatares,
    // puntos, el indicador «en vivo»— y no tiene sentido tokenizarla.
    const culpables = []
    for (const p of FUENTES) {
      if (!p.endsWith('.css')) continue
      const lineas = readFileSync(p, 'utf8').split('\n')
      lineas.forEach((l, i) => {
        if (!/border-radius:/.test(l)) return
        if (/50%|var\(--r-/.test(l)) return
        culpables.push(`${p.replace(ROOT + '/', '')}:${i + 1} — ${l.trim()}`)
      })
    }
    expect(culpables).toEqual([])
  })

  it('el barrido miró ficheros de verdad, y los tokens se usan', () => {
    // Prueba de trabajo: una regex rota dejaría las dos comprobaciones de
    // arriba en verde sin abrir nada, que es la forma que este repo ya ha
    // pagado dos veces.
    expect(FUENTES.length).toBeGreaterThan(100)
    const codigo = FUENTES.map((p) => readFileSync(p, 'utf8')).join('\n')
    for (const t of ['--r-input', '--r-card', '--r-pill']) {
      const n = codigo.split(`var(${t})`).length - 1
      expect(n, `${t} no se usa en ninguna parte`).toBeGreaterThan(5)
    }
  })
})
