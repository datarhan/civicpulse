import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  leerIndicador,
  leerIndicadorMunicipal,
  lecturaVisible,
  chipDeclaracion,
} from '../src/scraper/indicador-lectura'
import type { Indicador } from '../src/scraper/indicadores'
import type { IndicadorMunicipal } from '../src/scraper/indicadores-friccion'

const ROOT = join(__dirname, '..')
const pub = JSON.parse(readFileSync(join(ROOT, 'public/data/indicadores.json'), 'utf8'))
const indicadores: Indicador[] = pub.indicadores
const municipales: IndicadorMunicipal[] = pub.municipales
const byId = (id: string) => indicadores.find((i) => i.id === id)!
const munById = (id: string) => municipales.find((m) => m.id === id)!

describe('scraper/indicador-lectura', () => {
  it('da una lectura a cada indicador publicado, sin dejar ninguno mudo', () => {
    for (const i of indicadores) {
      const l = leerIndicador(i)
      expect(l.que.length).toBeGreaterThan(15)
      expect(l.como.length).toBeGreaterThan(30)
      expect(Array.isArray(l.avisos)).toBe(true)
    }
    for (const m of municipales) {
      const l = leerIndicadorMunicipal(m)
      expect(l.que.length).toBeGreaterThan(5)
      expect(l.como.length).toBeGreaterThan(30)
    }
  })

  it('la frase de «cómo se lee» depende del escalón, no del valor', () => {
    // Es la que impide que la tarjeta se lea como una calificación, y por eso
    // tiene que ser la misma para todos los indicadores del mismo escalón.
    const porTier = new Map<string, Set<string>>()
    for (const i of indicadores.filter((x) => x.valor !== null)) {
      const s = porTier.get(i.tier) ?? new Set()
      s.add(leerIndicador(i).como)
      porTier.set(i.tier, s)
    }
    for (const [tier, frases] of porTier) {
      expect(frases.size, `el escalón ${tier} tiene ${frases.size} redacciones distintas`).toBe(1)
    }
  })

  it('avisa de que un coste por efectivo es un precio, no un rendimiento', () => {
    // El caso que motivó todo esto: percentil 85 en «coste por policía» se lee
    // como una nota si nadie dice que divide un gasto entre otro gasto.
    const policia = byId('b132-130p-coste-unitario')
    expect(policia.tier).toBe('input')
    expect(leerIndicador(policia).como).toMatch(/precio y no un rendimiento/i)
  })

  it('avisa de que el tonelaje es demanda, no logro', () => {
    const residuos = byId('a1621-coste-unitario')
    expect(residuos.tier).toBe('carga')
    expect(leerIndicador(residuos).como).toMatch(/demanda que el servicio atiende/i)
  })

  it('sitúa entre pares sin publicar un puesto', () => {
    const conPares = indicadores.find((i) => i.pares)!
    const l = leerIndicador(conPares)
    expect(l.donde).toMatch(/municipios valencianos de tamaño parecido/i)
    expect(l.donde).toMatch(/mediana/i)
    // Un ranking es una tabla de clasificación con otro nombre.
    expect(l.donde).not.toMatch(/puesto|posición \d|nº ?\d/i)
  })

  it('explica la tarjeta bloqueada en vez de dejarla sin lectura', () => {
    const agua = byId('a161-coste-unitario')
    const l = leerIndicador(agua)
    expect(l.que).toMatch(/concedido/i)
    expect(l.como).toMatch(/hecho sobre la declaración/i)
    expect(l.donde).toBeNull()
  })

  it('marca las entregas que no pueden ser un coste, y no las cuenta como tendencia', () => {
    const conAtipicas = indicadores.find((i) => i.serie.some((p) => p.atipico))
    if (!conAtipicas) return // el fixture podría no traer ninguna
    const l = leerIndicador(conAtipicas)
    expect(l.avisos.some((a) => /no puede.* ser un coste|no pueden ser un coste/i.test(a))).toBe(
      true,
    )
    // La tendencia se calcula sobre los puntos limpios: si entrara la cifra
    // disparatada, diría que el servicio subió un 6.000.000 %.
    const tendencia = l.avisos.find((a) => /sube|baja/.test(a))
    if (tendencia) expect(tendencia).not.toMatch(/\d{5,} %/)
  })

  it('sólo afirma tendencia entre entregas que se pudieron contrastar', () => {
    // Alumbrado arranca en 9,10 €/punto de luz en 2014, un año sin banda de
    // pares con la que comprobarlo. Anclar ahí daba «sube un 1517 %», que no es
    // una subida de coste sino un cambio en cómo se declara.
    for (const i of indicadores.filter((x) => x.valor !== null)) {
      const l = leerIndicador(i)
      const tendencia = l.avisos.find((a) => /Entre \d{4} y \d{4}/.test(a))
      if (!tendencia) continue
      const [, desde] = /Entre (\d{4}) y (\d{4})/.exec(tendencia)!
      const punto = i.serie.find((p) => p.anio === Number(desde))!
      expect(
        punto.medianaPares,
        `${i.servicio} ancla la tendencia en ${desde}, sin comprobar`,
      ).toBeDefined()
      expect(punto.atipico).toBeFalsy()
    }
  })

  it('cuenta la tendencia contra los pares cuando la posición relativa se mueve', () => {
    // Alumbrado sube un 1517 % en diez años y la mediana de sus pares apenas se
    // mueve: no se encareció, se puso a declarar como los demás. Sin esta
    // frase, el porcentaje absoluto cuenta la historia al revés.
    const l = leerIndicador(byId('a165-coste-unitario'))
    const relativo = l.avisos.find((x) => /Medido contra sus pares/.test(x))
    expect(relativo, 'falta la lectura relativa en alumbrado').toBeDefined()
    expect(relativo).toMatch(/veces la mediana/)
    expect(relativo).toMatch(/cuánto se declara y no en cuánto cuesta/)
  })

  it('no añade la lectura relativa cuando la posición apenas se mueve', () => {
    // La policía va de 1,01× a 1,26× la mediana: eso es movimiento real, no un
    // cambio de criterio contable, y la frase sobraría.
    const l = leerIndicador(byId('b132-130p-coste-unitario'))
    expect(l.avisos.some((x) => /Medido contra sus pares/.test(x))).toBe(false)
  })

  it('escribe los decimales en español', () => {
    // «2.1 veces» es un punto decimal inglés en una interfaz en español, al
    // lado de cifras que Intl formatea bien.
    const l = leerIndicadorMunicipal(munById('periodo-medio-pago'))
    const veces = l.avisos.find((a) => /veces el límite/.test(a))!
    expect(veces).toMatch(/\d,\d veces/)
    expect(veces).not.toMatch(/\d\.\d veces/)
  })

  it('mide el plazo de pago contra el límite legal, no contra nuestra opinión', () => {
    const pmp = munById('periodo-medio-pago')
    const l = leerIndicadorMunicipal(pmp)
    expect(l.que).toMatch(/días/)
    expect(l.avisos.some((a) => /veces el límite/i.test(a))).toBe(true)
    expect(l.como).toMatch(/lo fija la ley/i)
  })

  it('dice que el gasto por habitante es dedicación y no logro', () => {
    const l = leerIndicadorMunicipal(munById('gasto-por-habitante'))
    expect(l.como).toMatch(/no lo que se consigue/i)
    expect(l.donde).toMatch(/municipios/)
  })

  it('no inventa comparación cuando no hay banda', () => {
    const sinPares = municipales.find((m) => !m.pares && m.valor !== null)!
    expect(leerIndicadorMunicipal(sinPares).donde).toBeNull()
  })
})

describe('la lectura no repite lo que la tarjeta ya enseña', () => {
  // La tarjeta imprimía «81.965 €/efectivo en la entrega de 2024» en cuerpo 30,
  // la fórmula debajo, la banda con mediana y percentil, y ACTO SEGUIDO la
  // misma cifra y la misma posición otra vez en prosa. Cuatro apariciones del
  // mismo número en una tarjeta. Lo que no se deduce mirando —«esto es un
  // precio, no un rendimiento»— quedaba sepultado entre las repeticiones.
  it('calla la cifra y la posición cuando el número y la banda están en pantalla', () => {
    const conBanda = indicadores.find((i) => i.valor !== null && i.pares)!
    const l = leerIndicador(conBanda)
    const v = lecturaVisible(l, { cifra: true, banda: true })
    expect(v.que).toBeNull()
    expect(v.donde).toBeNull()

    // Control, y es la mitad que importa: lo que NO se deduce mirando sigue
    // entero. Sin esto, una función que devolviera todo a null pasaría.
    expect(v.como).toBe(l.como)
    expect(v.avisos).toEqual(l.avisos)
    expect(v.como.length).toBeGreaterThan(30)
  })

  it('conserva el motivo cuando no hay cifra que lo repita', () => {
    // Una tarjeta bloqueada no tiene número ni banda: ahí `que` ES el
    // contenido («no hay coste por unidad porque el servicio está concedido»).
    const bloqueado = indicadores.find((i) => i.valor === null)!
    const l = leerIndicador(bloqueado)
    const v = lecturaVisible(l, { cifra: false, banda: false })
    expect(v.que).toBe(l.que)
    expect(v.que!.length).toBeGreaterThan(15)
  })

  it('conserva «no hay comparación» cuando no hay banda que lo diga', () => {
    // Hoy los diez cocientes publicados tienen banda, así que el caso se
    // construye quitándosela a uno real en vez de saltarse la prueba: un test
    // que se salta cuando el dato no colabora es un test que no mide.
    const base = indicadores.find((i) => i.valor !== null && i.pares)!
    const sinBanda = { ...base, pares: undefined, modoGestion: 'directa' as const }
    const v = lecturaVisible(leerIndicador(sinBanda), { cifra: true, banda: false })
    expect(v.donde).toMatch(/No hay comparación/)
  })
})

describe('el denominador congelado se marca, no se repite entero', () => {
  // El párrafo de ~55 palabras salía idéntico en las diez tarjetas: 550
  // palabras de casi la misma frase en una página que ya iba por las trece
  // pantallas. A esa densidad no refuerza, anestesia — y es el hallazgo que
  // más importa de los que hay aquí. Se cuenta entero arriba una vez, y en la
  // tarjeta queda una marca que dice desde cuándo.
  it('marca cada cociente cuyo denominador nadie vuelve a medir', () => {
    const congelados = indicadores.filter(
      (i) => i.valor !== null && i.declaracion?.denominador?.congelada,
    )
    expect(congelados.length, 'el fixture no trae ningún denominador congelado').toBeGreaterThan(0)

    for (const i of congelados) {
      const chip = chipDeclaracion(i)!
      expect(chip, `${i.servicio} sin marca`).not.toBeNull()
      // La marca dice el MISMO año que la salvedad larga, o las dos se van
      // separando en cuanto alguien toque una.
      expect(chip.texto).toContain(String(i.declaracion!.denominador.desde))
      expect(chip.texto).toMatch(/denominador|cifras|coste/)
    }
  })

  it('no marca lo que no está congelado', () => {
    // Control: sin esto, un `chipDeclaracion` que devolviera siempre una marca
    // pasaría la prueba de arriba con las diez tarjetas mintiendo a la vez.
    const base = indicadores.find((i) => i.valor !== null && i.declaracion)!
    const vivo = {
      ...base,
      declaracion: {
        ...base.declaracion!,
        numerador: { ...base.declaracion!.numerador, congelada: false },
        denominador: { ...base.declaracion!.denominador, congelada: false },
      },
    }
    expect(chipDeclaracion(vivo)).toBeNull()
    expect(chipDeclaracion({ ...base, declaracion: null })).toBeNull()
  })

  it('distingue qué mitad se quedó parada', () => {
    // Decir «el cociente puede subir» cuando lo congelado es el coste sería
    // falso al revés, y es la distinción que caveatDeclaracion ya hace.
    const base = indicadores.find((i) => i.valor !== null && i.declaracion)!
    const con = (num: boolean, den: boolean) =>
      chipDeclaracion({
        ...base,
        declaracion: {
          ...base.declaracion!,
          numerador: { ...base.declaracion!.numerador, congelada: num, desde: 2019 },
          denominador: { ...base.declaracion!.denominador, congelada: den, desde: 2019 },
        },
      })!.texto
    expect(con(false, true)).toMatch(/^denominador de 2019$/)
    expect(con(true, false)).toMatch(/^coste de 2019$/)
    expect(con(true, true)).toMatch(/^las dos cifras de 2019$/)
  })
})

describe('el tramo del percentil no promete tipicidad', () => {
  it('no dice «en el grueso del grupo» cuando la cifra está lejos de la mediana', () => {
    // La banda de pavimentación va de 0,07 a 1,29 €/m²: diecinueve veces de un
    // cuartil a otro. Caer dentro del intercuartílico no es parecerse a nadie, y
    // la misma tarjeta avisa de que la cifra está a la mitad de la mediana. El
    // lector recibía las dos cosas a la vez, y lo cazó la revisión de superficies.
    const pav = indicadores.find((i) => i.servicio === 'a1532/150P')!
    expect(pav.pares!.percentil).toBeLessThan(50)
    expect(pav.valor! / pav.pares!.mediana).toBeLessThan(0.6)

    const l = leerIndicador(pav)
    const texto = [l.donde ?? '', ...pav.caveats].join(' ')
    expect(texto).not.toMatch(/grueso del grupo/)
    expect(texto).toMatch(/por debajo de la mediana/)
  })

  it('sigue distinguiendo los extremos de los dos lados de la mediana', () => {
    const base = indicadores.find((i) => i.pares)!
    const donde = (percentil: number) =>
      leerIndicador({ ...base, pares: { ...base.pares!, percentil } }).donde ?? ''
    expect(donde(5)).toMatch(/casi todos/)
    expect(donde(95)).toMatch(/casi todos/)
    expect(donde(20)).toMatch(/tres de cada cuatro/)
    expect(donde(44)).toMatch(/por debajo de la mediana/)
    expect(donde(60)).toMatch(/por encima de la mediana/)
    // Y ninguna de las seis frases promete tipicidad.
    for (const p of [5, 20, 44, 60, 80, 95]) expect(donde(p)).not.toMatch(/grueso/)
  })
})
