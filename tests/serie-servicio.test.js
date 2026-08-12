import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tramosSerie,
  escalaSerie,
  huecosSerie,
  anclasHueco,
} from '../src/components/eficiencia/SerieServicio'

const ROOT = join(__dirname, '..')
const pub = JSON.parse(readFileSync(join(ROOT, 'public/data/indicadores.json'), 'utf8'))
const indicadores = pub.indicadores
const declarados = (i) => i.serie.filter((p) => p.estado === 'declarado')

describe('la serie dibujada no pasa por encima de lo que no midió', () => {
  it('corta la línea en el hueco del calendario', () => {
    // No hay entrega de 2020 en ninguna serie. Unir 2019 con 2021 con un tramo
    // recto afirma una interpolación que nadie ha medido.
    const puntos = [
      { anio: 2018, valor: 1 },
      { anio: 2019, valor: 2 },
      { anio: 2021, valor: 3 },
      { anio: 2022, valor: 4 },
    ]
    const tramos = tramosSerie(puntos)
    expect(tramos.map((t) => t.map((p) => p.anio))).toEqual([
      [2018, 2019],
      [2021, 2022],
    ])
  })

  it('corta la línea alrededor de una entrega inverosímil', () => {
    const puntos = [
      { anio: 2014, valor: 10 },
      { anio: 2015, valor: 67_676_714, atipico: true },
      { anio: 2016, valor: 11 },
      { anio: 2017, valor: 12 },
    ]
    expect(tramosSerie(puntos).map((t) => t.map((p) => p.anio))).toEqual([[2014], [2016, 2017]])
  })

  it('no parte una serie continua', () => {
    // Control: sin esto, un `tramosSerie` que devolviera un tramo por punto
    // pasaría las dos pruebas de arriba.
    const puntos = [2014, 2015, 2016].map((anio) => ({ anio, valor: anio }))
    expect(tramosSerie(puntos)).toHaveLength(1)
    expect(tramosSerie(puntos)[0]).toHaveLength(3)
  })
})

describe('la escala deja fuera lo que no puede ser un coste', () => {
  it('ignora la entrega inverosímil y conserva el resto', () => {
    const puntos = [
      { anio: 2015, valor: 67_676_714, atipico: true },
      { anio: 2016, valor: 1.02 },
      { anio: 2024, valor: 1.59 },
    ]
    const { lo, hi } = escalaSerie(puntos)
    expect(hi).toBeLessThan(10)
    // …y sigue conteniendo lo que sí se dibuja, que es la mitad que impide que
    // «escala segura» acabe siendo «escala vacía».
    expect(lo).toBeLessThanOrEqual(1.02)
    expect(hi).toBeGreaterThanOrEqual(1.59)
  })

  it('abarca también la mediana de los pares, que va dibujada detrás', () => {
    const puntos = [
      { anio: 2023, valor: 137.79, medianaPares: 128 },
      { anio: 2024, valor: 147.25, medianaPares: 900 },
    ]
    expect(escalaSerie(puntos).hi).toBeGreaterThanOrEqual(900)
  })
})

describe('sobre el panel publicado', () => {
  it('dibuja algo para cada cociente con serie', () => {
    // La avería que esto vigila: una serie que se queda sin ningún tramo
    // pintable y deja un hueco donde había un párrafo de cifras.
    const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)
    expect(conSerie.length, 'ningún cociente publicado trae serie').toBeGreaterThan(0)

    for (const i of conSerie) {
      const puntos = declarados(i)
      const limpios = puntos.filter((p) => !p.atipico)
      if (limpios.length < 2) continue
      const pintables = tramosSerie(puntos).filter((t) => t.length >= 2)
      expect(pintables.length, `${i.servicio} se queda sin línea`).toBeGreaterThan(0)
      expect(escalaSerie(puntos), `${i.servicio} se queda sin escala`).not.toBeNull()
    }
  })

  it('ninguna entrega marcada como imposible mueve la escala', () => {
    // Formulado como identidad y no como «queda por encima del techo»: la
    // entrega inverosímil de alumbrado en 2018 es 1,01 €/punto de luz, es decir
    // absurdamente BAJA, y una comprobación que sólo mirase el techo la habría
    // dado por buena. Lo que importa es que no cuente para el rango, caiga
    // donde caiga.
    const conAtipicas = indicadores.filter((i) => declarados(i).some((p) => p.atipico))
    expect(conAtipicas.length, 'el fixture no trae entregas atípicas').toBeGreaterThan(0)

    for (const i of conAtipicas) {
      const puntos = declarados(i)
      const sinAtipicas = puntos.filter((p) => !p.atipico)
      expect(
        escalaSerie(puntos),
        `${i.servicio} deja que su entrega atípica mueva la escala`,
      ).toEqual(escalaSerie(sinAtipicas))
    }
  })

  it('arranca en cero, sin recortar el eje para agrandar el cambio', () => {
    const puntos = [
      { anio: 2023, valor: 137.79 },
      { anio: 2024, valor: 147.25 },
    ]
    expect(escalaSerie(puntos).lo).toBe(0)
  })
})

describe('el hueco del calendario se marca, no sólo se deja en blanco', () => {
  it('encuentra los años sin entrega dentro del tramo publicado', () => {
    const puntos = [2018, 2019, 2021, 2022].map((anio) => ({ anio, valor: 1 }))
    expect(huecosSerie(puntos)).toEqual([{ desde: 2020, hasta: 2020 }])
  })

  it('agrupa un hueco de varios años en una sola marca', () => {
    const puntos = [2016, 2020, 2021].map((anio) => ({ anio, valor: 1 }))
    expect(huecosSerie(puntos)).toEqual([{ desde: 2017, hasta: 2019 }])
  })

  it('no inventa huecos en una serie continua', () => {
    // Control: sin esto, un `huecosSerie` que devolviera siempre algo pasaría
    // las dos pruebas de arriba y pintaría una banda sobre datos que sí están.
    const puntos = [2021, 2022, 2023].map((anio) => ({ anio, valor: 1 }))
    expect(huecosSerie(puntos)).toEqual([])
  })

  it('una entrega inverosímil NO es un hueco de calendario', () => {
    // La línea también se corta ahí, pero por otro motivo y con otra marca: el
    // año existe y su cifra está publicada. Confundir las dos cosas diría que
    // el ministerio no publicó 2018 de alumbrado, y sí lo publicó.
    const puntos = [
      { anio: 2017, valor: 15 },
      { anio: 2018, valor: 1.01, atipico: true },
      { anio: 2019, valor: 11 },
    ]
    expect(huecosSerie(puntos)).toEqual([])
  })

  it('sobre el panel publicado: el hueco es 2020 y es de todas las series', () => {
    // No es una rareza de una tarjeta: el ministerio publicó la entrega de 2020
    // y aquí no se ha obtenido, así que las diez se parten por el mismo sitio.
    // Eso es lo que hace que parezca una avería de dibujo en vez de un dato.
    const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)
    expect(conSerie.length).toBeGreaterThan(0)
    for (const i of conSerie) {
      const huecos = huecosSerie(declarados(i))
      expect(huecos, `${i.servicio} tiene un hueco distinto de 2020`).toEqual([
        { desde: 2020, hasta: 2020 },
      ])
    }
  })
})

describe('la banda del hueco ocupa el hueco entero', () => {
  it('va de punto pintado a punto pintado, no del ancho del año que falta', () => {
    // Medido sobre la publicada: la línea terminaba en 362 px y reanudaba en
    // 543, y la banda iba de 407 a 497 — la mitad del hueco, flotando en el
    // centro con blanco a los dos lados. Se leía como un rectángulo suelto.
    expect(anclasHueco({ desde: 2020, hasta: 2020 })).toEqual({ izq: 2019, der: 2021 })
  })

  it('abraza también un hueco de varios años', () => {
    expect(anclasHueco({ desde: 2017, hasta: 2019 })).toEqual({ izq: 2016, der: 2020 })
  })

  it('sobre el panel publicado: las anclas son años que existen de verdad', () => {
    // Si un ancla cayera fuera de la serie, la banda se saldría del gráfico o
    // taparía un punto pintado. Por construcción no puede pasar, y esto lo
    // comprueba sobre el dato real en vez de fiarse de la construcción.
    const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)
    expect(conSerie.length).toBeGreaterThan(0)
    let bandas = 0
    for (const i of conSerie) {
      const puntos = declarados(i)
      const anios = new Set(puntos.map((p) => p.anio))
      for (const h of huecosSerie(puntos)) {
        const { izq, der } = anclasHueco(h)
        expect(anios.has(izq), `${i.servicio}: ancla izquierda ${izq} no está pintada`).toBe(true)
        expect(anios.has(der), `${i.servicio}: ancla derecha ${der} no está pintada`).toBe(true)
        bandas++
      }
    }
    expect(bandas, 'ninguna banda comprobada — la prueba no mide nada').toBeGreaterThan(0)
  })
})
