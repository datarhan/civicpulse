import { describe, it, expect } from 'vitest'
import {
  SIN_DEDICACION,
  retribucionesSplit,
  alcaldeSerie,
  formatEurosCents,
} from '../src/hooks/useIspa'
import { fijadoTramos } from '../src/hooks/useDedicaciones'
import { mailboxKinds } from '../src/lib/mailboxes'
import ispaPublicado from '../public/data/ispa.json'
import dedicacionesPublicadas from '../public/data/dedicaciones.json'
import officialsPublicados from '../public/data/officials.json'

const leer = (p) =>
  ({
    'ispa.json': ispaPublicado,
    'dedicaciones.json': dedicacionesPublicadas,
    'officials.json': officialsPublicados,
  })[p]

// Shape of one ISPA year, as public/data/ispa.json publishes it. Amounts are
// the real 2024 entrega so the arithmetic below is the arithmetic the page
// prints; the sentinel is IMPORTED, never restated (DATA_INTEGRITY rule 1).
const anio2024 = {
  year: 2024,
  alcalde: { dedicacion: 'exclusiva', amountEuros: 48647.5 },
  concejales: [
    { dedicacion: 'exclusiva', amountEuros: 43436.42 },
    { dedicacion: 'exclusiva', amountEuros: 43436.42 },
    { dedicacion: 'exclusiva', amountEuros: 39224.98 },
    { dedicacion: 'exclusiva', amountEuros: 39224.98 },
    { dedicacion: 'exclusiva', amountEuros: 39224.98 },
    { dedicacion: 'exclusiva', amountEuros: 39224.98 },
    { dedicacion: SIN_DEDICACION, amountEuros: 16858.04 },
    { dedicacion: SIN_DEDICACION, amountEuros: 4582.49 },
  ],
  summary: {
    total: 9,
    totalAnnualEuros: 313860.79,
    conDedicacion: 7,
    sinDedicacion: 2,
    brackets: [],
  },
}
const ispa2024 = { latestYear: 2024, years: [anio2024] }

describe('useIspa — retribucionesSplit', () => {
  it('cuenta al alcalde entre los de dedicación, no aparte', () => {
    const s = retribucionesSplit(ispa2024)
    expect(s.con.count).toBe(7)
    expect(s.con.sum).toBeCloseTo(48647.5 + 43436.42 * 2 + 39224.98 * 4, 2)
  })

  it('ordena las asistencias de menor a mayor y publica sus extremos', () => {
    const s = retribucionesSplit(ispa2024)
    expect(s.sin.count).toBe(2)
    expect(s.sin.amounts).toEqual([4582.49, 16858.04])
    expect(s.sin.min).toBe(4582.49)
    expect(s.sin.max).toBe(16858.04)
  })

  it('cuadra cuando las dos columnas suman el total publicado', () => {
    const s = retribucionesSplit(ispa2024)
    expect(s.cuadra).toBe(true)
    expect(s.con.sum + s.sin.sum).toBeCloseTo(anio2024.summary.totalAnnualEuros, 2)
  })

  // El desenlace que importa: si el centinela deja de casar, TODO cae en «con
  // dedicación» y la página imprimiría «21 con dedicación · 0 asistencias» sin
  // que nada se queje. `cuadra` es el techo que lo impide.
  it('NO cuadra cuando el centinela de dedicación deja de casar con la fuente', () => {
    const renombrado = structuredClone(ispa2024)
    for (const c of renombrado.years[0].concejales) {
      if (c.dedicacion === SIN_DEDICACION) c.dedicacion = 'sin_dedicacion_v2'
    }
    const s = retribucionesSplit(renombrado)
    expect(s.sin.count).toBe(0)
    expect(s.cuadra).toBe(false)
  })

  it('NO cuadra cuando falta una fila y las sumas dejan de dar el total', () => {
    const podado = structuredClone(ispa2024)
    podado.years[0].concejales.pop()
    const s = retribucionesSplit(podado)
    expect(s.cuadra).toBe(false)
  })

  it('devuelve null sin datos, en vez de un cero que se lee como una cifra', () => {
    expect(retribucionesSplit(null)).toBeNull()
    expect(retribucionesSplit({ years: [] })).toBeNull()
  })

  it('la entrega publicada cuadra y el centinela casa con filas de verdad', () => {
    // Contra el snapshot REAL: una aserción que no muerde es el fallo que este
    // repo repite. Si la entrega cambia de forma, esto se pone rojo.
    const s = retribucionesSplit(leer('ispa.json'))
    expect(s.cuadra).toBe(true)
    expect(s.sin.count).toBeGreaterThan(0)
    expect(s.con.count).toBeGreaterThan(0)
  })
})

describe('useIspa — alcaldeSerie', () => {
  const trend = [
    { year: 2020, amountEuros: 45461.94 },
    { year: 2021, amountEuros: 45916.56 },
    { year: 2022, amountEuros: 52855.48 },
    { year: 2024, amountEuros: 48647.5 },
  ]

  it('dibuja el hueco de 2023 como una ranura propia, no lo compacta', () => {
    const slots = alcaldeSerie({ alcaldeTrend: trend })
    expect(slots.map((s) => s.tipo)).toEqual(['dato', 'dato', 'dato', 'hueco', 'dato'])
    const hueco = slots.find((s) => s.tipo === 'hueco')
    expect(hueco).toMatchObject({ desde: 2023, hasta: 2023 })
  })

  it('no inventa huecos en los extremos de la serie', () => {
    const slots = alcaldeSerie({ alcaldeTrend: trend })
    expect(slots[0].tipo).toBe('dato')
    expect(slots[slots.length - 1].tipo).toBe('dato')
  })

  it('funde años ausentes consecutivos en un solo hueco', () => {
    const slots = alcaldeSerie({
      alcaldeTrend: [
        { year: 2020, amountEuros: 1 },
        { year: 2023, amountEuros: 2 },
      ],
    })
    expect(slots.map((s) => s.tipo)).toEqual(['dato', 'hueco', 'dato'])
    expect(slots[1]).toMatchObject({ desde: 2021, hasta: 2022 })
  })

  it('no marca nada cuando la serie es continua', () => {
    const slots = alcaldeSerie({
      alcaldeTrend: [
        { year: 2020, amountEuros: 1 },
        { year: 2021, amountEuros: 2 },
      ],
    })
    expect(slots.every((s) => s.tipo === 'dato')).toBe(true)
  })

  it('devuelve una lista vacía cuando no hay serie que dibujar', () => {
    expect(alcaldeSerie({ alcaldeTrend: [] })).toEqual([])
    expect(alcaldeSerie(null)).toEqual([])
  })
})

describe('useDedicaciones — fijadoTramos', () => {
  it('agrupa el acuerdo por importe, de mayor a menor, con su recuento', () => {
    const t = fijadoTramos(leer('dedicaciones.json'))
    expect(t.tramos.map((x) => x.count)).toEqual([1, 2, 4])
    expect(t.tramos[0].amountEuros).toBeGreaterThan(t.tramos[1].amountEuros)
    expect(t.tramos[1].amountEuros).toBeGreaterThan(t.tramos[2].amountEuros)
  })

  it('nombra el cargo de cada tramo tomándolo del acuerdo, sin reescribirlo', () => {
    const t = fijadoTramos(leer('dedicaciones.json'))
    expect(t.tramos[0].roles).toHaveLength(1)
    expect(t.tramos[0].roles[0]).toMatch(/alcald/i)
  })

  it('suma lo FIJADO, que es una serie distinta de lo percibido', () => {
    const d = leer('dedicaciones.json')
    const t = fijadoTramos(d)
    expect(t.count).toBe(d.byOfficial.length)
    expect(t.sum).toBeCloseTo(
      d.byOfficial.reduce((a, o) => a + o.amountEuros, 0),
      2,
    )
  })

  it('devuelve null sin acuerdo, en vez de una tabla vacía que parece un cero', () => {
    expect(fijadoTramos(null)).toBeNull()
    expect(fijadoTramos({ byOfficial: [] })).toBeNull()
  })
})

describe('useIspa — formatEurosCents', () => {
  // Los céntimos son el asunto: la página enfrenta 48.234,08 € con 48.647,50 €
  // para decir que NO se contradicen. Redondeadas a euros las dos cifras se
  // parecen lo bastante como para que el lector las lea como una sola mal
  // copiada, que es justo el defecto que este panel viene a arreglar.
  it('conserva los céntimos, que es donde se ve que son dos series', () => {
    expect(formatEurosCents(48234.08)).toMatch(/48\.234,08/)
    expect(formatEurosCents(48647.5)).toMatch(/48\.647,50/)
  })

  // Los dos extremos del reparto de asistencias se rotulan uno frente al otro.
  // Con el agrupamiento por defecto de es-ES, cuatro cifras NO llevan punto de
  // millar, así que salía «4582,49 €» a la izquierda y «16.858,04 €» a la
  // derecha: la misma escala escrita de dos maneras.
  it('agrupa los millares también con cuatro cifras, para que la escala case', () => {
    expect(formatEurosCents(4582.49)).toMatch(/4\.582,49/)
  })

  it('devuelve cadena vacía ante lo que no es una cifra', () => {
    expect(formatEurosCents(null)).toBe('')
    expect(formatEurosCents(undefined)).toBe('')
    expect(formatEurosCents(Number.NaN)).toBe('')
  })
})

describe('lib/mailboxes — mailboxKinds', () => {
  const roster = [
    { slug: 'a', email: 'alcaldia@ribarroja.es' },
    { slug: 'b', email: 'alcaldia@ribarroja.es' },
    { slug: 'c', email: 'propio@ribarroja.es' },
    { slug: 'd', email: null },
  ]

  it('marca como compartido el buzón que usa más de un cargo, y dice cuántos', () => {
    const k = mailboxKinds(roster)
    expect(k.get('a')).toMatchObject({ compartido: true, n: 2 })
    expect(k.get('b')).toMatchObject({ compartido: true, n: 2 })
  })

  it('deja personal la dirección que no comparte nadie', () => {
    expect(mailboxKinds(roster).get('c')).toMatchObject({ compartido: false, n: 1 })
  })

  it('no inventa buzón para quien la fuente no publica ninguno', () => {
    expect(mailboxKinds(roster).get('d')).toBeUndefined()
  })

  it('el padrón publicado tiene buzones compartidos de verdad', () => {
    // Si esto deja de morder es que el ayuntamiento publicó direcciones
    // propias — y entonces la etiqueta sobra, que es justo lo que hay que ver.
    const k = mailboxKinds(leer('officials.json').officials)
    expect([...k.values()].some((v) => v.compartido)).toBe(true)
  })
})
