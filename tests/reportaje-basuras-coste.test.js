import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// La tabla del coste declarado de «basuras» pinta «2020 · sin entrega» entre
// 2019 y 2021. Hasta el 19-10-2026 saltaba de un año al otro sin decirlo. El
// año no lo inventa la tabla: lo declara `costeEfectivo.sinEntrega`, y esto lo
// coteja con la pieza del coste efectivo, que es la que lo documenta. Si una
// cambia y la otra no, rojo.

const leer = (slug) => JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8'))
const ce = leer('basuras').costeEfectivo
const entregas = leer('coste-efectivo').entregas

describe('la tabla del coste de «basuras» y las entregas del coste efectivo', () => {
  const anios = ce.filas.map((f) => f.anio)
  const [desde, hasta] = [Math.min(...anios), Math.max(...anios)]

  it('mide algo: hay un año sin entrega dentro de la tabla', () => {
    expect(ce.sinEntrega?.length).toBeGreaterThan(0)
  })

  it('los huecos de la tabla son exactamente las entregas no presentadas', () => {
    const huecos = []
    for (let a = desde; a <= hasta; a++) if (!anios.includes(a)) huecos.push(a)
    const noPresentadas = entregas.noPresentadas.filter((a) => a >= desde && a <= hasta)
    expect(huecos).toEqual(noPresentadas)
    expect([...ce.sinEntrega].sort()).toEqual(noPresentadas)
  })

  it('un año sin entrega no trae cifra', () => {
    for (const a of ce.sinEntrega) expect(anios).not.toContain(a)
  })
})
