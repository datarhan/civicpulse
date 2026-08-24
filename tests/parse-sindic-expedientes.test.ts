import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseResultados,
  esAyuntamientoDeRibaRoja,
  repartirPorAdministracion,
  TIPOS_RESOLUCION_CONOCIDOS,
  type ExpedienteSindic,
} from '../src/scraper/sindic-expedientes'

/**
 * El Síndic de Greuges CV, y el cero que no era un cero.
 *
 * `sindic.json` llevaba 125 días con 0 filas y `/quejas` decía en prosa que no
 * había resoluciones contra el Ayuntamiento. La cabecera de `sindic.ts`
 * explicaba por qué nadie había vuelto a mirar: el portal era «JS-rendered
 * behind an Oracle APEX-style POST with viewstate» y automatizarlo no valía la
 * pena para «~1–5 resoluciones per year».
 *
 * Medido el 2026-08-24: elsindic.com es WordPress con un buscador
 * Elasticsearch, el formulario de /actuaciones/ habla por POST con
 * admin-ajax.php (que el robots.txt del propio organismo permite), y detrás hay
 * 38 expedientes contra este ayuntamiento entre 2013 y 2026 — 14 de ellos con
 * «Resolución de consideraciones a la Administración». La página publicaba un
 * todo-claro que el registro del Síndic desmiente.
 *
 * LA TRAMPA, y es la que decide el diseño: el facet `poblacion` es la población
 * del QUEJOSO, no la administración reclamada. De sus 16 filas sólo 4 van
 * contra el Ayuntamiento y una va contra el de València. Un adaptador que
 * filtrara por ahí publicaría «4» creyendo publicar «38» y mezclaría dos
 * preguntas bajo un número. La puerta es el campo `Administración`.
 */

const fx = (n: string) => readFileSync(resolve('tests/fixtures', n), 'utf8')
const TEXTO = fx('elsindic_texto_riba-roja_2026-08-24.html')
const POBLACION = fx('elsindic_poblacion_riba-roja_2026-08-24.html')
const VACIO = fx('elsindic_sin-resultados_2026-08-24.html')

describe('parseResultados — el eje de texto', () => {
  const r = parseResultados(TEXTO)

  it('mide algo: el fixture trae página y filas', () => {
    expect(TEXTO.length).toBeGreaterThan(5000)
    expect(r.filas.length).toBeGreaterThan(0)
  })

  it('lee el total de la cabecera de resultados, no el tamaño de la página', () => {
    // «Expedientes 1 - 10 de 49»: el total NO es filas.length, y confundirlos
    // haría que el raspador dejase de paginar en la primera vuelta.
    expect(r.total).toBe(49)
    expect(r.filas).toHaveLength(10)
  })

  it('cada fila trae expediente, materia, asunto y administración', () => {
    for (const f of r.filas) {
      expect(f.expediente).toMatch(/^\d{9}$/)
      expect(f.anio).toBe(Number(f.expediente.slice(0, 4)))
      expect(f.materia.length).toBeGreaterThan(2)
      expect(f.asunto.length).toBeGreaterThan(5)
      expect(f.administracion.length).toBeGreaterThan(5)
    }
  })

  it('transcribe las materias del Síndic tal cual, sin recodificarlas', () => {
    // «Servicios públicos y medio ambiente» es UNA materia suya y dos de las
    // nuestras; «Procedimientos administrativos» no tiene hueco. Meterlas en el
    // enum de sindic.ts las llevaría a `otros`, que es el centinela de siempre.
    const materias = r.filas.map((f) => f.materia)
    expect(materias).toContain('Servicios públicos y medio ambiente')
    expect(materias.every((m) => m === m.trim() && !m.includes('&'))).toBe(true)
  })

  it('recoge las resoluciones con tipo, fecha ISO y PDF en elsindic.com', () => {
    const res = r.filas.flatMap((f) => f.resoluciones)
    expect(res.length).toBeGreaterThan(0)
    for (const x of res) {
      expect(x.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(x.urlPdf).toMatch(/^https:\/\/(www\.)?elsindic\.com\/.+\.pdf$/)
      expect(x.tipo.length).toBeGreaterThan(3)
    }
  })

  it('un expediente puede traer varias resoluciones, y no se pisan', () => {
    // 202502231 lleva consideraciones (22/07/2025) y cierre (10/09/2025). El id
    // curado `sindic-<expediente>` colisionaba justamente aquí.
    const conVarias = r.filas.filter((f) => f.resoluciones.length > 1)
    expect(conVarias.length).toBeGreaterThan(0)
    for (const f of conVarias) {
      const urls = f.resoluciones.map((x) => x.urlPdf)
      expect(new Set(urls).size).toBe(urls.length)
    }
  })
})

describe('parseResultados — el eje de población', () => {
  const r = parseResultados(POBLACION)

  it('lee su propio total', () => {
    expect(r.total).toBe(16)
    expect(r.filas.length).toBeGreaterThan(0)
  })
})

describe('parseResultados — el control negativo', () => {
  it('«No se han encontrado expedientes» es 0 filas y total 0, no un fallo', () => {
    const r = parseResultados(VACIO)
    expect(r.total).toBe(0)
    expect(r.filas).toEqual([])
  })

  it('distingue «sin resultados» de «no supe leer la página»', () => {
    // Los dos dan 0 filas; sólo uno es una respuesta legítima. Sin esta
    // distinción, un cambio de plantilla publicaría un cero con pinta de dato.
    expect(parseResultados(VACIO).reconocida).toBe(true)
    expect(parseResultados('<html><body>nada de esto</body></html>').reconocida).toBe(false)
  })
})

describe('esAyuntamientoDeRibaRoja — la puerta', () => {
  it('acepta la forma que imprime el buscador', () => {
    expect(esAyuntamientoDeRibaRoja('Ayuntamiento de Riba-roja de Túria')).toBe(true)
  })

  it('acepta las grafías del alias compartido', () => {
    expect(esAyuntamientoDeRibaRoja('Ajuntament de Ribarroja del Turia')).toBe(true)
  })

  it('rechaza otros ayuntamientos y la administración autonómica', () => {
    expect(esAyuntamientoDeRibaRoja('Ayuntamiento de València')).toBe(false)
    expect(esAyuntamientoDeRibaRoja('Ayuntamiento de Guadassuar')).toBe(false)
    expect(esAyuntamientoDeRibaRoja('Conselleria de Sanidad')).toBe(false)
  })

  it('rechaza vacío y nulo en vez de dejarlos pasar', () => {
    expect(esAyuntamientoDeRibaRoja('')).toBe(false)
    expect(esAyuntamientoDeRibaRoja(null)).toBe(false)
  })

  it('no cuela por mención: la Diputación no es el Ayuntamiento', () => {
    // El asunto de 202502231 nombra a las dos. La puerta mira la Administración
    // reclamada, y sólo esa.
    expect(esAyuntamientoDeRibaRoja('Diputación Provincial de Valencia')).toBe(false)
  })
})

describe('repartirPorAdministracion — y que la puerta DESCARTE de verdad', () => {
  const texto = parseResultados(TEXTO).filas
  const poblacion = parseResultados(POBLACION).filas

  it('parte el eje de texto en contra-ayuntamiento y descartadas', () => {
    const p = repartirPorAdministracion(texto, poblacion)
    expect(p.contraAyuntamiento.length + p.descartadas.length + p.vecinos.length).toBe(
      texto.length + poblacion.length - p.duplicadas,
    )
  })

  it('DESCARTA filas — una puerta que nunca descarta no está probada', () => {
    // El eje de texto trae expedientes que sólo MENCIONAN Riba-roja: contra el
    // Ayuntamiento de València, contra Conselleria… Si esto llega a 0, o el
    // buscador cambió o la puerta se abrió.
    const p = repartirPorAdministracion(texto, poblacion)
    expect(p.descartadas.length).toBeGreaterThan(0)
    expect(p.contraAyuntamiento.length).toBeGreaterThan(0)
  })

  it('todo lo que pasa la puerta la pasa de verdad', () => {
    const p = repartirPorAdministracion(texto, poblacion)
    for (const f of p.contraAyuntamiento)
      expect(esAyuntamientoDeRibaRoja(f.administracion)).toBe(true)
    for (const f of p.vecinos) expect(esAyuntamientoDeRibaRoja(f.administracion)).toBe(false)
  })

  it('las dos listas no comparten un solo expediente', () => {
    // Son respuestas a preguntas distintas y no se pueden sumar: 4 de los 16 de
    // población salen también por texto.
    const p = repartirPorAdministracion(texto, poblacion)
    const a = new Set(p.contraAyuntamiento.map((f) => f.expediente))
    const b = new Set(p.vecinos.map((f) => f.expediente))
    expect([...a].filter((e) => b.has(e))).toEqual([])
  })

  it('deduplica por expediente, no por objeto', () => {
    const p = repartirPorAdministracion(texto, texto)
    expect(p.duplicadas).toBe(texto.length)
    const ids = p.contraAyuntamiento.map((f) => f.expediente)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ordena de más reciente a más antiguo', () => {
    const p = repartirPorAdministracion(texto, poblacion)
    const exps = p.contraAyuntamiento.map((f) => f.expediente)
    expect([...exps].sort().reverse()).toEqual(exps)
  })
})

describe('el vocabulario del Síndic, importado y no recopiado', () => {
  it('el enum vive en el módulo y la prueba lo importa', () => {
    // Regla 1 de DATA_INTEGRITY: seis pruebas de este repo copiaron una forma a
    // mano y se quedaron verdes mientras producción no casaba con nada.
    expect(TIPOS_RESOLUCION_CONOCIDOS.length).toBeGreaterThan(2)
  })

  it('los tipos del fixture están casi todos reconocidos — techo del 10 %', () => {
    const tipos = parseResultados(TEXTO).filas.flatMap((f) => f.resoluciones.map((x) => x.tipo))
    expect(tipos.length).toBeGreaterThan(0)
    const fuera = tipos.filter((t) => !TIPOS_RESOLUCION_CONOCIDOS.includes(t))
    expect(fuera.length / tipos.length).toBeLessThan(0.1)
  })

  it('pero el tipo se guarda verbatim: uno desconocido NO se convierte en «otros»', () => {
    const f: ExpedienteSindic = parseResultados(TEXTO).filas[0]
    expect(f.resoluciones.every((x) => x.tipo !== 'otros')).toBe(true)
  })
})
