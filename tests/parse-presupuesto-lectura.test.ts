/**
 * La lectura de /presupuesto: las frases que la página deriva del dato.
 *
 * La lámina 5b del lienzo «Civicpulse UI/UX review» ordena la página del
 * crédito inicial a lo ejecutado. Su auditoría acertó en nueve cifras y se
 * equivocó en una: «bajó tres años seguidos» sobre una serie de deuda que baja
 * DOS (2023 y 2024) tras subir en 2022. Una frase escrita a mano habría
 * publicado el error; una derivada no puede. Por eso todo lo que la página
 * afirma sobre la forma del dato —cuánto creció el presupuesto, qué capítulo
 * se llevó la ampliación, hacia dónde va la deuda— sale de este módulo y no
 * del JSX.
 *
 * Contrato de las tres lecturas, cada una con su ausencia:
 *
 *   cascadaGastos     null sin inicial o sin definitivo; `cuadra:false` si
 *                     inicial + modificaciones ≠ definitivo (la página retira
 *                     el «+65 %» en vez de publicar aritmética sin cotejar).
 *   capituloDominante null si ningún capítulo se lleva la MAYORÍA de la
 *                     ampliación: «casi toda fue a…» sólo cuando es verdad.
 *   tendenciaDeuda    null con menos de dos puntos; con dos, la dirección del
 *                     último cambio y la racha anterior, contadas — nunca
 *                     escritas.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cascadaGastos,
  lecturaCapitulos,
  capituloDominante,
  tendenciaDeuda,
  rotuloCapitulo,
  capitulosACero,
  magnitudDelEjercicio,
} from '../src/scraper/presupuesto-lectura'

const ROOT = join(__dirname, '..')
const ejecucion = JSON.parse(readFileSync(join(ROOT, 'public/data/budget-execution.json'), 'utf8'))
const budget = JSON.parse(readFileSync(join(ROOT, 'public/data/budget.json'), 'utf8'))
const deuda = JSON.parse(readFileSync(join(ROOT, 'public/data/deuda-viva.json'), 'utf8'))

describe('cascadaGastos · del crédito inicial a lo ejecutado', () => {
  const c = cascadaGastos(ejecucion.latest.gastos.total)!

  it('reproduce las cuatro magnitudes del estado de ejecución y las cuadra', () => {
    expect(c).not.toBeNull()
    expect(c.inicial).toBe(ejecucion.latest.gastos.total.inicial)
    expect(c.modificaciones).toBe(ejecucion.latest.gastos.total.modificaciones)
    expect(c.definitivo).toBe(ejecucion.latest.gastos.total.actual)
    expect(c.ejecutado).toBe(ejecucion.latest.gastos.total.ejecutado)
    expect(c.cuadra).toBe(true)
  })

  it('mide la ampliación sobre el INICIAL y la ejecución sobre los DOS denominadores', () => {
    // Un solo «30,4 % ejecutado» se lee como no gastar. Sobre el crédito
    // aprobado en enero es otro número, y la página tiene que poder decir los
    // dos. Techo y suelo, no cifra clavada: el ayuntamiento revisa el listado.
    expect(c.ampliacionPct).toBeGreaterThan(50)
    expect(c.ampliacionPct).toBeLessThan(80)
    expect(c.ejecutadoSobreDefinitivoPct).toBeCloseTo((c.ejecutado / c.definitivo) * 100, 6)
    expect(c.ejecutadoSobreInicialPct).toBeCloseTo((c.ejecutado / c.inicial) * 100, 6)
    expect(c.ejecutadoSobreInicialPct).toBeGreaterThan(c.ejecutadoSobreDefinitivoPct)
  })

  it('no cuadra cuando la suma no da el definitivo, y lo dice en vez de callarlo', () => {
    const roto = cascadaGastos({ inicial: 100, modificaciones: 50, actual: 170, ejecutado: 20 })!
    expect(roto.cuadra).toBe(false)
  })

  it('devuelve null sin crédito inicial o sin definitivo', () => {
    expect(cascadaGastos({ inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 })).toBeNull()
    expect(cascadaGastos(null)).toBeNull()
    expect(cascadaGastos(undefined)).toBeNull()
  })
})

describe('lecturaCapitulos · dónde se amplió y dónde se ejecutó', () => {
  const total = ejecucion.latest.gastos.total
  const filas = lecturaCapitulos(ejecucion.latest.gastos.chapters, total)

  it('ordena por crédito definitivo, de mayor a menor, sin perder ninguno', () => {
    expect(filas).toHaveLength(ejecucion.latest.gastos.chapters.length)
    for (let i = 1; i < filas.length; i++) {
      expect(filas[i - 1].definitivo).toBeGreaterThanOrEqual(filas[i].definitivo)
    }
  })

  it('las cuotas de ampliación suman uno: así las partes suman el todo', () => {
    const suma = filas.reduce((s, f) => s + f.cuotaAmpliacion, 0)
    expect(suma).toBeCloseTo(1, 6)
  })

  it('marca el capítulo que abrió en cero y termina con crédito', () => {
    const enCero = filas.filter((f) => f.abrioEnCero)
    expect(enCero.length).toBeGreaterThanOrEqual(1)
    for (const f of enCero) {
      expect(f.inicial).toBe(0)
      expect(f.definitivo).toBeGreaterThan(0)
    }
    // Y un capítulo con crédito inicial no lleva la marca, por grande que sea
    // su ampliación.
    const conCredito = filas.filter((f) => f.inicial > 0)
    expect(conCredito.every((f) => !f.abrioEnCero)).toBe(true)
  })

  it('el porcentaje ejecutado es ejecutado ÷ definitivo, y cero sin definitivo', () => {
    for (const f of filas) {
      if (f.definitivo > 0)
        expect(f.pctEjecutado).toBeCloseTo((f.ejecutado / f.definitivo) * 100, 6)
      else expect(f.pctEjecutado).toBe(0)
    }
  })
})

describe('capituloDominante · «casi toda la ampliación fue a…»', () => {
  it('en 2025 es Inversiones reales, que abrió en cero y se llevó la mayoría', () => {
    const d = capituloDominante(ejecucion.latest.gastos.chapters, ejecucion.latest.gastos.total)!
    expect(d).not.toBeNull()
    expect(d.capitulo).toBe(6)
    expect(d.abrioEnCero).toBe(true)
    expect(d.cuotaAmpliacion).toBeGreaterThan(0.5)
  })

  it('devuelve null cuando la ampliación se reparte y nadie tiene mayoría', () => {
    const repartida = [
      { capitulo: 1, label: 'A', inicial: 10, modificaciones: 4, actual: 14, ejecutado: 1 },
      { capitulo: 2, label: 'B', inicial: 10, modificaciones: 3, actual: 13, ejecutado: 1 },
      { capitulo: 3, label: 'C', inicial: 10, modificaciones: 3, actual: 13, ejecutado: 1 },
    ]
    expect(
      capituloDominante(repartida, { inicial: 30, modificaciones: 10, actual: 40, ejecutado: 3 }),
    ).toBeNull()
  })

  it('devuelve null sin modificaciones: no hay ampliación que atribuir', () => {
    const quieta = [
      { capitulo: 1, label: 'A', inicial: 10, modificaciones: 0, actual: 10, ejecutado: 1 },
    ]
    expect(
      capituloDominante(quieta, { inicial: 10, modificaciones: 0, actual: 10, ejecutado: 1 }),
    ).toBeNull()
  })
})

describe('tendenciaDeuda · la forma de la serie, contada', () => {
  it('sobre la entrega real: subió, bajó DOS años seguidos y en 2025 vuelve a subir', () => {
    // La lámina decía «tres». 2021→2022 SUBE (4,5 → 9,33 M); bajan 2023 y
    // 2024; 2025 sube. Es exactamente la clase de frase que no puede ir
    // escrita a mano.
    const t = tendenciaDeuda(deuda.serie)!
    expect(t).not.toBeNull()
    expect(t.ultimo.ejercicio).toBe(2025)
    expect(t.direccion).toBe('sube')
    expect(t.rachaPrevia).toEqual({ direccion: 'baja', n: 2 })
    expect(t.titular).toBe('Bajó dos años seguidos, y en 2025 vuelve a subir')
  })

  it('cada punto lleva su variación contra el anterior, y el primero no lleva ninguna', () => {
    const t = tendenciaDeuda(deuda.serie)!
    expect(t.puntos).toHaveLength(deuda.serie.length)
    expect(t.puntos[0].delta).toBeNull()
    for (let i = 1; i < t.puntos.length; i++) {
      expect(t.puntos[i].delta).toBe(deuda.serie[i].deudaEuros - deuda.serie[i - 1].deudaEuros)
    }
  })

  it('una racha que continúa se dice como racha, no como giro', () => {
    const serie = [
      { ejercicio: 2022, deudaEuros: 10 },
      { ejercicio: 2023, deudaEuros: 9 },
      { ejercicio: 2024, deudaEuros: 8 },
      { ejercicio: 2025, deudaEuros: 7 },
    ]
    const t = tendenciaDeuda(serie)!
    expect(t.direccion).toBe('baja')
    expect(t.rachaPrevia).toEqual({ direccion: 'baja', n: 2 })
    expect(t.titular).toBe('Baja por tercer año seguido')
  })

  it('un giro tras un solo año se dice con el año, no con «seguidos»', () => {
    const serie = [
      { ejercicio: 2023, deudaEuros: 10 },
      { ejercicio: 2024, deudaEuros: 12 },
      { ejercicio: 2025, deudaEuros: 11 },
    ]
    const t = tendenciaDeuda(serie)!
    expect(t.direccion).toBe('baja')
    expect(t.rachaPrevia).toEqual({ direccion: 'sube', n: 1 })
    expect(t.titular).toBe('Subió en 2024 y en 2025 baja')
  })

  it('sin cambio, lo dice', () => {
    const serie = [
      { ejercicio: 2024, deudaEuros: 5 },
      { ejercicio: 2025, deudaEuros: 5 },
    ]
    expect(tendenciaDeuda(serie)!.titular).toBe('Sin cambio en 2025')
  })

  it('con menos de dos puntos no hay tendencia que contar', () => {
    expect(tendenciaDeuda([{ ejercicio: 2025, deudaEuros: 5 }])).toBeNull()
    expect(tendenciaDeuda([])).toBeNull()
    expect(tendenciaDeuda(undefined)).toBeNull()
  })
})

describe('rotuloCapitulo · el listado municipal viene en mayúsculas', () => {
  it('pasa a frase sin tocar las siglas ni las preposiciones', () => {
    expect(rotuloCapitulo('GASTOS CORRIENTES EN BIENES Y SERVICIOS')).toBe(
      'Gastos corrientes en bienes y servicios',
    )
    expect(rotuloCapitulo('INVERSIONES REALES')).toBe('Inversiones reales')
    expect(rotuloCapitulo('Impuestos directos')).toBe('Impuestos directos')
  })
})

describe('capitulosACero · lo aprobado a cero se deja dicho, no se omite', () => {
  it('en el CONPREL de 2025 el fondo de contingencia está a cero', () => {
    const cero = capitulosACero(budget.snapshot.expenseByEconomicChapter)
    expect(cero.map((c) => c.code)).toContain('5')
    for (const c of cero) expect(c.amount).toBe(0)
  })

  it('un capítulo con importe nunca aparece', () => {
    expect(capitulosACero([{ code: '1', label: 'A', amount: 1 }])).toEqual([])
  })
})

describe('magnitudDelEjercicio · qué cifra representa el año en una sola celda', () => {
  it('con el listado municipal del mismo ejercicio, el crédito DEFINITIVO', () => {
    // La portada publicaba los 41,58 M€ de CONPREL como «el presupuesto», y es
    // la menos informativa de las cuatro magnitudes del año: el ayuntamiento
    // acabó autorizado a gastar 62,12 M€, un 49 % más. Una sola cifra que
    // represente el ejercicio tiene que ser la que dice cuánto se pudo gastar.
    const m = magnitudDelEjercicio(budget.snapshot, ejecucion.latest)!
    expect(m).not.toBeNull()
    expect(m.etapa).toBe('definitivo')
    expect(m.fuente).toBe('municipal')
    expect(m.valor).toBe(ejecucion.latest.gastos.total.actual)
    expect(m.year).toBe(budget.snapshot.year)
    expect(m.ejecutado).toBe(ejecucion.latest.gastos.total.ejecutado)
    expect(m.pctEjecutado).toBeCloseTo(
      (ejecucion.latest.gastos.total.ejecutado / ejecucion.latest.gastos.total.actual) * 100,
      6,
    )
    // Y es MAYOR que la cifra que se publicaba: si no lo fuera, el cambio no
    // arreglaría nada.
    expect(m.valor).toBeGreaterThan(budget.snapshot.totalExpense)
  })

  it('sin listado municipal, el aprobado de CONPREL, y lo dice', () => {
    const m = magnitudDelEjercicio(budget.snapshot, null)!
    expect(m.etapa).toBe('aprobado')
    expect(m.fuente).toBe('conprel')
    expect(m.valor).toBe(budget.snapshot.totalExpense)
    // Sin ejecución no se inventa un porcentaje.
    expect(m.ejecutado).toBeNull()
    expect(m.pctEjecutado).toBeNull()
  })

  it('NO mezcla ejercicios: un listado de otro año no gobierna este titular', () => {
    // Etiquetar el crédito definitivo de 2024 como el de 2025 sería fabricar
    // una cifra, que es peor que publicar la menos informativa.
    const otroAnio = { ...ejecucion.latest, year: budget.snapshot.year - 1 }
    const m = magnitudDelEjercicio(budget.snapshot, otroAnio)!
    expect(m.etapa).toBe('aprobado')
    expect(m.fuente).toBe('conprel')
  })

  it('un definitivo a cero no desplaza al aprobado', () => {
    const vacio = {
      year: budget.snapshot.year,
      gastos: { total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 } },
    }
    expect(magnitudDelEjercicio(budget.snapshot, vacio)!.etapa).toBe('aprobado')
  })

  it('el capítulo de personal sale de la MISMA fuente que el total', () => {
    // Dos celdas contiguas de la portada: «€62,1M» arriba y «€20,3M · 49 %»
    // debajo. El 49 % era el capítulo 1 de CONPREL sobre el total de CONPREL,
    // correcto por su cuenta y absurdo bajo un total municipal —un lector que
    // divide obtiene 33 %—. Devolver las dos cifras de la MISMA rama hace la
    // divergencia imposible, en vez de confiar en que dos llamantes elijan
    // igual.
    const m = magnitudDelEjercicio(budget.snapshot, ejecucion.latest)!
    const cap1 = ejecucion.latest.gastos.chapters.find(
      (c: { capitulo: number }) => c.capitulo === 1,
    )!
    expect(m.personal).not.toBeNull()
    expect(m.personal!.valor).toBe(cap1.actual)
    expect(m.personal!.pct).toBeCloseTo((cap1.actual / m.valor) * 100, 6)

    // Y en la rama de CONPREL, el capítulo 1 de CONPREL sobre el total de
    // CONPREL: la misma coherencia, la otra fuente.
    const c = magnitudDelEjercicio(budget.snapshot, null)!
    const conprel1 = budget.snapshot.expenseByEconomicChapter.find(
      (x: { code: string }) => x.code === '1',
    )!
    expect(c.personal!.valor).toBe(conprel1.amount)
    expect(c.personal!.pct).toBeCloseTo((conprel1.amount / c.valor) * 100, 6)
  })

  it('sin capítulo 1 en la fuente elegida, personal es null y no se toma prestado del otro lado', () => {
    const sinCap = {
      year: budget.snapshot.year,
      gastos: {
        total: { inicial: 1, modificaciones: 0, actual: 100, ejecutado: 10 },
        chapters: [],
      },
    }
    expect(magnitudDelEjercicio(budget.snapshot, sinCap)!.personal).toBeNull()
  })

  it('sin ninguna de las dos, null: la celda no publica un guion con aire de cifra', () => {
    expect(magnitudDelEjercicio(null, null)).toBeNull()
    expect(magnitudDelEjercicio({ year: 2025, totalExpense: 0 }, null)).toBeNull()
  })
})
