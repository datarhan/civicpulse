import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tramosSerie,
  escalaSerie,
  huecosSerie,
  anclasHueco,
  puntosSueltos,
  puentesHueco,
  serieMediana,
  enTerminosReales,
  bandaSerie,
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

describe('ninguna entrega publicada se queda sin dibujar', () => {
  it('encuentra el punto que queda aislado entre una cifra imposible y un hueco', () => {
    // Alumbrado: 2018 es inverosímil y 2020 no existe, así que 2019 queda solo.
    // `tramosSerie` le da un tramo de un punto y el render descartaba los
    // tramos de longitud < 2 — una cifra publicada, limpia y verificada que no
    // aparecía en ningún sitio del gráfico.
    const puntos = [
      { anio: 2016, valor: 12.83 },
      { anio: 2017, valor: 15.26 },
      { anio: 2018, valor: 1.01, atipico: true },
      { anio: 2019, valor: 11.31 },
      { anio: 2021, valor: 21.76 },
      { anio: 2022, valor: 64.09 },
    ]
    expect(puntosSueltos(puntos).map((p) => p.anio)).toEqual([2019])
  })

  it('no llama suelto a un punto que va dentro de una línea', () => {
    // Control: sin esto, un `puntosSueltos` que devolviera todos los puntos
    // pasaría la prueba de arriba y pintaría un lunar sobre cada vértice.
    const puntos = [2021, 2022, 2023].map((anio) => ({ anio, valor: anio }))
    expect(puntosSueltos(puntos)).toEqual([])
  })

  it('sobre el panel publicado: toda entrega limpia acaba en una línea o en un lunar', () => {
    const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)
    expect(conSerie.length).toBeGreaterThan(0)
    let sueltos = 0
    for (const i of conSerie) {
      const puntos = declarados(i)
      const limpios = puntos.filter((p) => !p.atipico)
      const enLinea = tramosSerie(puntos)
        .filter((t) => t.length >= 2)
        .flat().length
      const solos = puntosSueltos(puntos)
      sueltos += solos.length
      expect(
        enLinea + solos.length,
        `${i.servicio} publica ${limpios.length} entregas limpias y sólo dibuja ${enLinea + solos.length}`,
      ).toBe(limpios.length)
    }
    // Y el caso existe de verdad en el dato: si algún día deja de existir, esta
    // prueba pasa por no medir nada y conviene enterarse.
    expect(sueltos, 'ninguna serie publicada tiene un punto aislado').toBeGreaterThan(0)
  })
})

describe('el puente punteado sobre el año que falta', () => {
  it('une el último punto medido con el siguiente', () => {
    const puntos = [
      { anio: 2018, valor: 1 },
      { anio: 2019, valor: 2 },
      { anio: 2021, valor: 3 },
    ]
    const [p] = puentesHueco(puntos)
    expect(p.desde.anio).toBe(2019)
    expect(p.hasta.anio).toBe(2021)
  })

  it('NO ancla en una entrega inverosímil', () => {
    // Su cifra está fuera de la escala a propósito: un puente hasta ella
    // dibujaría una pendiente hacia un valor que la propia tarjeta declara
    // ilegible. Sin puente, y el rótulo del año se queda solo.
    const puntos = [
      { anio: 2018, valor: 1 },
      { anio: 2019, valor: 67_676_714, atipico: true },
      { anio: 2021, valor: 3 },
    ]
    expect(puentesHueco(puntos)).toEqual([])
  })

  it('no puentea donde no hay hueco', () => {
    // Control: sin esto, un `puentesHueco` que devolviera siempre un tramo
    // pintaría un punteado sobre datos que sí están medidos.
    const puntos = [2021, 2022, 2023].map((anio) => ({ anio, valor: anio }))
    expect(puentesHueco(puntos)).toEqual([])
  })

  it('sobre el panel publicado: las diez cruzan 2020 y ninguna inventa el ancla', () => {
    const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)
    expect(conSerie.length).toBeGreaterThan(0)
    for (const i of conSerie) {
      const puntos = declarados(i)
      const [p] = puentesHueco(puntos)
      expect(p, `${i.servicio} se queda sin puente sobre su hueco`).toBeDefined()
      expect(p.desde.anio).toBe(2019)
      expect(p.hasta.anio).toBe(2021)
      expect(p.desde.atipico).toBeFalsy()
      expect(p.hasta.atipico).toBeFalsy()
    }
  })
})

describe('la mediana de pares es su propia serie', () => {
  const puntos = [
    { anio: 2017, valor: 15.26, medianaPares: 130 },
    { anio: 2018, valor: 1.01, atipico: true, medianaPares: 133 },
    { anio: 2019, valor: 11.31, medianaPares: 135 },
    { anio: 2021, valor: 21.76, medianaPares: 138 },
  ]

  it('no se corta porque NUESTRA entrega de ese año sea imposible', () => {
    // `atipico` es una propiedad de la cifra de Riba-roja. La mediana de los
    // comparables de 2018 es perfectamente buena: que la nuestra sea 1,01
    // €/punto de luz no la estropea. La línea gris se cortaba ahí sin motivo,
    // y justo en el servicio donde más falta hace ver contra qué se compara.
    const tramos = tramosSerie(serieMediana(puntos))
    // 2021 va aparte porque falta 2020 — ése es el corte legítimo. Lo que se
    // comprueba aquí es que 2018 NO parte nada: 2017-2018-2019 van seguidos.
    expect(tramos.map((t) => t.map((p) => p.anio))).toEqual([[2017, 2018, 2019], [2021]])
    // Y sobre la serie del SERVICIO el corte de 2018 sigue existiendo, que es
    // lo correcto ahí: sin este control, borrar `atipico` de `tramosSerie`
    // pasaría esta prueba y dibujaría la cifra imposible como si fuera buena.
    expect(tramosSerie(puntos).map((t) => t.map((p) => p.anio))).toEqual([[2017], [2019], [2021]])
  })

  it('no hace pasar nuestra cifra por la de los pares', () => {
    // Con `{...p, valor: p.medianaPares}`, un punto SIN mediana entraba tal
    // cual y la línea de la mediana dibujaba nuestro propio valor. Hoy no se
    // ve porque todos los puntos publicados traen mediana; es una trampa
    // esperando a la primera entrega que no la traiga.
    const sinMediana = [{ anio: 2014, valor: 9.1 }, ...puntos]
    const m = serieMediana(sinMediana)
    expect(m[0]).toEqual({ anio: 2014, valor: null })
    expect(m.every((p) => p.valor === null || p.valor >= 130)).toBe(true)
  })

  it('cruza el año sin entrega igual que la serie', () => {
    const [p] = puentesHueco(serieMediana(puntos))
    expect(p.desde.anio).toBe(2019)
    expect(p.hasta.anio).toBe(2021)
    expect(p.desde.valor).toBe(135)
  })

  it('sobre el panel publicado: una sola línea de mediana, con su puente', () => {
    const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)
    expect(conSerie.length).toBeGreaterThan(0)
    for (const i of conSerie) {
      const m = serieMediana(declarados(i))
      // Dos tramos y un puente: el único corte es 2020. Antes alumbrado tenía
      // tres, porque su 2018 atípico partía también la línea de los pares.
      const tramos = tramosSerie(m).filter((t) => t.length >= 2)
      expect(tramos.length, `${i.servicio}: la mediana se parte de más`).toBeLessThanOrEqual(2)
      expect(puentesHueco(m).length, `${i.servicio}: la mediana no cruza su hueco`).toBe(1)
    }
  })
})

describe('la serie se dibuja en euros constantes', () => {
  const conSerie = indicadores.filter((i) => i.valor !== null && declarados(i).length >= 2)

  it('el snapshot publicado trae los términos reales, no sólo los corrientes', () => {
    // Si esto se rompe, compute:indicadores corrió sin ipc.json y la página
    // está dibujando corrientes mientras el rótulo puede decir otra cosa.
    expect(conSerie.length).toBeGreaterThan(0)
    for (const i of conSerie) {
      for (const p of declarados(i)) {
        expect(typeof p.valorReal, `${i.servicio} ${p.anio}: sin valorReal`).toBe('number')
      }
    }
  })

  it('sustituye el valor y su mediana a la vez, o ninguno', () => {
    for (const i of conSerie) {
      const { puntos, reales } = enTerminosReales(declarados(i))
      expect(reales).toBe(true)
      for (const p of puntos) {
        expect(p.valor).toBe(p.valorReal)
        // La mediana de pares tiene que venir del campo real, nunca del
        // nominal: media serie deflactada contra media sin deflactar dibuja
        // una distancia que no le ha pasado a nadie.
        if (typeof p.medianaParesReal === 'number') {
          expect(p.medianaPares).toBe(p.medianaParesReal)
        }
        // Y la banda con ella: los cuatro campos de comparación cambian de
        // unidad juntos o no cambia ninguno.
        if (typeof p.p25ParesReal === 'number') {
          expect(p.p25Pares).toBe(p.p25ParesReal)
          expect(p.p75Pares).toBe(p.p75ParesReal)
        }
      }
    }
  })

  it('la banda de pares del año se publica, escalada, y se corta en el hueco', () => {
    const conBanda = conSerie.filter((i) =>
      declarados(i).some((p) => typeof p.p25Pares === 'number'),
    )
    expect(conBanda.length).toBeGreaterThan(3)
    for (const i of conBanda) {
      for (const p of declarados(i)) {
        if (typeof p.p25Pares !== 'number') continue
        expect(p.p75Pares).toBeGreaterThanOrEqual(p.p25Pares)
        expect(p.nPares).toBeGreaterThanOrEqual(15)
        if (typeof p.valorReal === 'number' && p.valor) {
          const factor = p.valorReal / p.valor
          expect(p.p25ParesReal / p.p25Pares).toBeCloseTo(factor, 9)
          expect(p.p75ParesReal / p.p75Pares).toBeCloseTo(factor, 9)
        }
      }
      // El 2020 sin entrega corta la banda igual que corta la línea:
      // interpolarla afirmaría una anchura que nadie midió ese año.
      for (const t of bandaSerie(enTerminosReales(declarados(i)).puntos)) {
        expect(t.length).toBeGreaterThanOrEqual(2)
        for (let k = 1; k < t.length; k++) expect(t[k].anio - t[k - 1].anio).toBe(1)
      }
    }
  })

  it('el año que titula no se mueve al deflactar', () => {
    for (const i of conSerie) {
      const base = i.citas?.[0]?.entrega
      const p = declarados(i).find((x) => x.anio === base)
      if (p) expect(p.valorReal).toBeCloseTo(p.valor, 6)
    }
  })

  it('sin índice cae a corrientes y lo dice, en vez de fingirlos', () => {
    const sinIndice = declarados(conSerie[0]).map(({ valorReal, ...resto }) => resto)
    const salida = enTerminosReales(sinIndice)
    expect(salida.reales).toBe(false)
    expect(salida.puntos).toBe(sinIndice)
  })

  it('un solo año sin deflactar tumba toda la serie a corrientes', () => {
    // Todo o nada. Mezclar un año corriente con nueve constantes es peor que
    // no deflactar: la pendiente resultante no es de nadie.
    const puntos = declarados(conSerie[0]).map((p, idx) =>
      idx === 1 ? (({ valorReal, ...resto }) => resto)(p) : p,
    )
    expect(enTerminosReales(puntos).reales).toBe(false)
  })
})
