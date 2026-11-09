import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseBusqueda,
  parseEjercicios,
  parseCuenta,
  parseLeyenda,
  evaluarPlazo,
  diaEnEspana,
  recuentoRendidas,
  ESTADOS_CUENTA,
  ICONO_EJERCICIOS_ANTERIORES,
  CAMPOS_FECHA,
  PLAZOS,
  VEREDICTOS,
  ID_ENTIDAD_RIBA_ROJA,
} from '../src/scraper/rendicion-cuentas'

/**
 * La Plataforma de Rendición de Cuentas (Tribunal de Cuentas y órganos de
 * control externo, la Sindicatura de Comptes entre ellos) publica, por
 * ejercicio, si el Ayuntamiento rindió su Cuenta General y las fechas de cada
 * trámite: aprobación del presupuesto, de la liquidación, formación de la
 * cuenta, informe de la Comisión Especial, exposición pública, Pleno y envío.
 *
 * Por qué importa: presentarla ante la Sindicatura es requisito para ser
 * beneficiario del Fondo de Cooperación Municipal (Ley 5/2021, art. 4.2), y la
 * ley fija tres plazos que la propia fecha publicada permite contrastar.
 *
 * Las fixtures son las cuatro páginas reales del 2026-11-09, en ISO-8859-1 tal
 * como llegan. LO QUE DECIDE EL DISEÑO:
 *
 *   · Un ejercicio que la plataforma no ofrece responde 500 (medido con 2026).
 *     Así que los ejercicios salen de lo que la búsqueda y el histórico
 *     enlazan, nunca de un bucle de años: un 500 no es «no rendida».
 *   · Sólo tres fechas se juzgan contra plazo, porque sólo en esas la fecha
 *     publicada es el acto que la ley data: aprobación definitiva del
 *     presupuesto (art. 169.2), aprobación de la cuenta por el Pleno (art.
 *     212.4) y rendición (art. 223.2). La liquidación y el informe de la
 *     Comisión tienen plazo para OTRO acto (confeccionarla, someterla a
 *     informe), y su fecha no prueba ni el cumplimiento ni el retraso.
 */

const fx = (n: string) => readFileSync(resolve('tests/fixtures', n), 'latin1')
const BUSQUEDA = fx('rendiciondecuentas_busqueda_riba-roja_2026-11-09.html')
const EJERCICIOS = fx('rendiciondecuentas_ejercicios_riba-roja_2026-11-09.html')
const CUENTA_2025 = fx('rendiciondecuentas_cuenta-2025_riba-roja_2026-11-09.html')
const CUENTA_2015 = fx('rendiciondecuentas_cuenta-2015_riba-roja_2026-11-09.html')

describe('parseLeyenda — el vocabulario de estados lo dicta la fuente', () => {
  // La leyenda de la búsqueda trae también el icono del histórico («Ejercicios
  // anteriores»), que es un enlace y no un estado: es la única excepción.
  const conocidos = [...Object.keys(ESTADOS_CUENTA), ICONO_EJERCICIOS_ANTERIORES]

  it('cada icono que la leyenda de la búsqueda nombra es un estado conocido', () => {
    const alts = parseLeyenda(BUSQUEDA)
    // Mide algo: la búsqueda trae los cinco iconos de su leyenda.
    expect(alts).toHaveLength(5)
    for (const a of alts) expect(conocidos).toContain(a)
  })

  it('la leyenda del histórico tampoco trae un estado que no conozcamos', () => {
    const alts = parseLeyenda(EJERCICIOS)
    expect(alts.length).toBeGreaterThanOrEqual(3)
    for (const a of alts) expect(conocidos).toContain(a)
  })
})

describe('parseBusqueda — los tres últimos ejercicios', () => {
  const r = parseBusqueda(BUSQUEDA)

  it('encuentra exactamente una entidad, la nuestra, con su id', () => {
    expect(r.filas).toHaveLength(1)
    const [f] = r.filas
    expect(f.denominacion).toBe('Riba-roja de Túria')
    expect(f.tipo).toBe('Ayuntamiento')
    expect(f.idEntidad).toBe(ID_ENTIDAD_RIBA_ROJA)
    expect(f.historico).toBe(true)
  })

  it('lee los ejercicios de la cabecera, no de un rango supuesto', () => {
    expect(r.filas[0].ejercicios.map((e) => e.ejercicio)).toEqual([2023, 2024, 2025])
  })

  it('cada celda lleva su estado y su enlace', () => {
    for (const e of r.filas[0].ejercicios) {
      expect(e.estado).toBe('rendida')
      expect(e.enlace).toBe(true)
    }
  })
})

describe('parseEjercicios — el histórico', () => {
  const r = parseEjercicios(EJERCICIOS)

  it('trae 2012-2022, cada uno con estado y enlace', () => {
    expect(r.map((e) => e.ejercicio)).toEqual([
      2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022,
    ])
    for (const e of r) {
      expect(e.estado).toBe('rendida')
      expect(e.enlace).toBe(true)
    }
  })
})

describe('parseCuenta — las fechas de un ejercicio', () => {
  it('2025: las ocho fechas, en ISO, y ningún campo desconocido', () => {
    const c = parseCuenta(CUENTA_2025)
    expect(c.ejercicio).toBe(2025)
    expect(c.entidad).toBe('Ayuntamiento Riba-roja de Túria')
    expect(c.estadoPrincipal).toBe('rendida')
    expect(c.camposDesconocidos).toEqual([])
    expect(c.fechas).toEqual({
      presupuestoAprobado: '2025-07-13',
      liquidacionAprobada: '2026-02-25',
      cuentaFormada: '2026-07-01',
      informeComision: '2026-07-31',
      exposicionPublica: '2026-08-19',
      presentadaAlPleno: '2026-10-05',
      cuentaAprobada: '2026-10-05',
      enviada: '2026-10-14',
    })
  })

  it('cada etiqueta de la página es una clave de CAMPOS_FECHA', () => {
    // Si la plataforma cambia una etiqueta, el campo no puede quedarse en
    // null sin avisar: la etiqueta nueva sale en camposDesconocidos.
    const c = parseCuenta(CUENTA_2015)
    expect(c.camposDesconocidos).toEqual([])
    expect(Object.values(c.fechas).filter((v) => v === null)).toEqual([])
    expect(Object.keys(c.fechas).sort()).toEqual(Object.values(CAMPOS_FECHA).sort())
  })

  it('cuenta las filas que leyó: ocho en una página real, cero si la tabla no está', () => {
    // La página del histórico no trae la tabla de fechas: es la forma real de
    // «la página cambió». Sin este recuento, ocho nulos se publicarían como
    // ocho «sin fecha».
    expect(parseCuenta(CUENTA_2025).camposLeidos).toBe(8)
    const otra = parseCuenta(EJERCICIOS)
    expect(otra.camposLeidos).toBe(0)
    expect(Object.values(otra.fechas).every((v) => v === null)).toBe(true)
  })

  it('2015: liquidación del 07-03-2016 y envío del 30-10-2016', () => {
    const c = parseCuenta(CUENTA_2015)
    expect(c.ejercicio).toBe(2015)
    expect(c.fechas.liquidacionAprobada).toBe('2016-03-07')
    expect(c.fechas.enviada).toBe('2016-10-30')
  })
})

describe('evaluarPlazo — sólo los tres actos que la ley data', () => {
  const HOY = '2026-11-09'

  it('juzga exactamente presupuesto, aprobación por el Pleno y envío', () => {
    expect(Object.keys(PLAZOS).sort()).toEqual(['cuentaAprobada', 'enviada', 'presupuestoAprobado'])
    for (const p of Object.values(PLAZOS)) {
      expect(p.articulo).toMatch(/^art\. \d+\.\d+ TRLRHL$/)
      expect(p.literal.length).toBeGreaterThan(15)
    }
  })

  it('2025, envío del 14-10-2026: en plazo, límite 15-10-2026', () => {
    expect(evaluarPlazo('enviada', 2025, '2026-10-14', HOY)).toEqual({
      limite: '2026-10-15',
      veredicto: 'en-plazo',
      diasTras: null,
    })
  })

  it('2025, Pleno del 05-10-2026: fuera de plazo, cuatro días después del 1-10', () => {
    expect(evaluarPlazo('cuentaAprobada', 2025, '2026-10-05', HOY)).toEqual({
      limite: '2026-10-01',
      veredicto: 'fuera-de-plazo',
      diasTras: 4,
    })
  })

  it('presupuesto de 2025 aprobado el 13-07-2025: 194 días después del 31-12-2024', () => {
    expect(evaluarPlazo('presupuestoAprobado', 2025, '2025-07-13', HOY)).toEqual({
      limite: '2024-12-31',
      veredicto: 'fuera-de-plazo',
      diasTras: 194,
    })
  })

  it('presupuesto de 2023 aprobado el 30-12-2022: en plazo', () => {
    expect(evaluarPlazo('presupuestoAprobado', 2023, '2022-12-30', HOY).veredicto).toBe('en-plazo')
  })

  it('«antes del día 15» deja fuera el propio 15: cero días después', () => {
    expect(evaluarPlazo('enviada', 2025, '2026-10-15', HOY)).toEqual({
      limite: '2026-10-15',
      veredicto: 'fuera-de-plazo',
      diasTras: 0,
    })
  })

  it('sin fecha y con el plazo aún abierto es «pendiente», no un retraso', () => {
    expect(evaluarPlazo('enviada', 2026, null, HOY)).toEqual({
      limite: '2027-10-15',
      veredicto: 'pendiente',
      diasTras: null,
    })
  })

  it('sin fecha y con el plazo vencido es «sin-fecha», no un retraso', () => {
    // La plataforma no publica la fecha: no sabemos si se hizo tarde o nunca.
    expect(evaluarPlazo('presupuestoAprobado', 2015, null, HOY).veredicto).toBe('sin-fecha')
  })

  it('«hoy» es el día de Madrid, no el de UTC', () => {
    // 23:30 UTC del 14-10 son las 01:30 del 15-10 en Madrid (horario de verano).
    expect(diaEnEspana(new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-15')
    // Y en invierno, 23:30 UTC del 31-12 ya es 1 de enero.
    expect(diaEnEspana(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })

  it('todo veredicto pertenece a VEREDICTOS', () => {
    const casos = [
      evaluarPlazo('enviada', 2015, '2016-10-30', HOY),
      evaluarPlazo('enviada', 2026, null, HOY),
      evaluarPlazo('enviada', 2010, null, HOY),
      evaluarPlazo('cuentaAprobada', 2024, '2025-09-08', HOY),
    ]
    for (const c of casos) expect(VEREDICTOS).toContain(c.veredicto)
  })
})

describe('recuentoRendidas — qué cuenta como rendida y sobre qué', () => {
  it('«Cuenta rendida no disponible» está rendida; no-aplica y N.D. no cuentan', () => {
    // Cada estado sale de ESTADOS_CUENTA, la tabla de la fuente: ninguno se
    // escribe a mano.
    const e = ESTADOS_CUENTA
    expect(
      recuentoRendidas([
        e['Cuenta rendida'],
        e['Cuenta rendida no disponible'],
        e['Cuenta no rendida'],
        e['No aplica'],
        e['N.D.'],
      ]),
    ).toEqual({ rendidas: 2, conEstado: 3 })
  })
})
