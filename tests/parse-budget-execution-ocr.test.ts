// @vitest-environment node
/**
 * Las hojas de ejecución sin capa de texto, leídas por OCR (RED).
 *
 * Las seis hojas de la «Ejecución trimestral» del 3T de 2025 y la de ingresos
 * del cierre de 2024 salen de «Microsoft: Print To PDF» con cada letra dibujada
 * como un trazo y sin fuente: pdf-parse no saca nada, el raspador las contaba
 * en `lectura.hojasSinTexto` y sus dos periodos se descartaban.
 *
 * Lo que se fija aquí es la PUERTA más que el lector: una cifra leída por OCR
 * se publica sólo si cuadra con su porcentaje impreso y con las sumas de su
 * hoja al céntimo, y la lectura que no cuadra se descarta diciendo qué cifra no
 * cuadró. Por eso cada comprobación lleva al lado una lectura estropeada que
 * tiene que rechazar: una puerta que no puede fallar no comprueba nada.
 *
 * Fixtures: los PDF reales tal como los servía ribarroja.es el 29-10-2026 —con
 * el nombre de quien los imprimió borrado de /Author en su sitio, 16 bytes, y
 * el resto intacto (check:metadatos los da limpios)—, y los dos «Resumen» del
 * 1T de 2026, que sí traen texto: leídos por OCR como si no lo trajeran, tienen
 * que dar lo mismo que su capa de texto. Las líneas de los tests rápidos son
 * líneas reales del OCR de esas hojas, recortadas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseBudgetExecutionPdf,
  fechaDeCorte,
  mergeExecutionPeriod,
  motivoDeDescarte,
} from '../src/scraper/budget-execution'
import {
  centimosOcr,
  celdasOcr,
  plantillaOcr,
  leerHojaOcr,
  lecturaAceptable,
  cotejarDesglose,
  fechaImpresaOcr,
  type LecturaValida,
  type DesgloseLeido,
} from '../src/scraper/budget-execution-ocr'
import { crearLectorOcr, AJUSTES, type LectorOcr } from '../src/scraper/budget-execution-ocr-fetch'

const fx = (n: string) => join(__dirname, 'fixtures', n)

const RESUMEN_GASTOS_3T2025 = `Presupuestos gastos. Resumen por capítulos
»<    Periodo: 2025
1    GASTOS DE PERSONAL    20.338.112,65    21.704.464,34    13.529.118,40    13.529.118,40    141.011,34    62,33%
2    GASTOS CORRIENTES EN BIENES Y SERVICIOS    16.288.669,58    17.727.425,48    11.517.818,49    8.997.524,64    1.657.665,36    64,97%
3    GASTOS FINANCIEROS    283.520,17    283.520,17    101.658,59    87.198,74    704,04    35,86%
4    TRANSFERENCIAS CORRIENTES    2.595.582,99    2.528.003,67    761.535,96    485.484,92    389.242,86    30,12%
5    FONDO DE CONTINGENCIA Y OTROS IMPREVISTOS    0,00    0,00    0,00    0,00    0,00    0,00%
6    INVERSIONES REALES    905.517,35    23.330.598,00    1.498.896,25    1.412.095,57    809.175,98    6,42%
7    TRANSFERENCIAS DE CAPITAL    246.000,00    246.000,00    204.622,72    197.159,22    44.400,00    83,18%
8    ACTIVOS FINANCIEROS    25.000,00    25.000,00    13.550,00    11.750,00    0,00    54,20%
9    PASIVOS FINANCIEROS    895.849,52    895.849,52    447.749,00    447.749,00    0,00    49,98%
Total    41.578.252,26    66.740.861,18    28.074.949,41    25.168.080,49    3.042.199,58    42,07%
Página 1 de 1    3 de Noviembre del 2025`

const ESTADO_INGRESOS_2024 = `Estado de ejecución de Ingresos
»<    Periodo: 2024
Fecha de listado igual a: 31/12/2024
Total Capítulo 1 Impuestos directos.    17.963.497,13    17.963.497,13    0,00    17.664.462,84    1.537.202,03    4.476.481,74    11.647.433,97    11.546.877,21    1.940.138,18
0,00    0,00    16.023.358,95    3.345,10    11.647.433,97    100.556,76    89,20%    72,06%
Total Capítulo 2 Impuestos indirectos.    2.375.000,00    2.375.000,00    0,00    605.768,25    72,50    9.919,06    595.776,69    589.196,61    1.775.884,33
0,00    0,00    599.115,67    0,00    595.776,69    6.580,08    25,23%    98,34%
Total Capítulo 3 Tasas, precios públicos y otros ingresos.    5.041.567,76    5.041.567,76    0,00    3.899.274,40    3.742,84    492.389,52    3.402.954,04    3.384.412,66    1.164.765,58
0,00    0,00    3.876.802,18    188,00    3.402.954,04    18.541,38    76,90%    87,30%
Total Capítulo 4 Transferencia corrientes.    12.285.692,10    13.264.682,23    1.822.979,53    14.233.669,00    0,00    1.236.646,81    12.997.022,19    12.707.710,13    -679.674,71
978.990,13    144.871,08    13.944.356,94    0,00    12.997.022,19    289.312,06    105,12%    91,13%
Total Capítulo 5 Ingresos patrimoniales.    1.494.126,75    1.494.126,75    0,00    1.547.808,21    4.090,80    806.023,03    737.694,38    737.694,38    -49.590,66
0,00    0,00    1.543.717,41    0,00    737.694,38    0,00    103,32%    47,79%
Total Capítulo 7 Transferencias de capital.    319.884,74    2.571.276,83    400.000,00    833.109,86    0,00    0,00    833.109,86    833.109,86    1.738.166,97
2.251.392,09    400.000,00    833.109,86    0,00    833.109,86    0,00    32,40%    100,00%
Total Capítulo 8 Activos financieros.    25.000,00    7.129.471,62    0,00    25.000,00    0,00    11.774,99    13.225,01    13.225,01    7.104.471,62
7.104.471,62    0,00    25.000,00    0,00    13.225,01    0,00    0,35%    52,90%
Total Ingresos    39.504.768,48    49.839.622,32    2.222.979,53    38.809.092,56    1.545.108,17    7.033.235,15    30.227.216,14    29.812.225,86    12.994.161,31
10.334.853,84    544.871,08    36.845.461,01    3.533,10    30.227.216,14    414.990,28    73,93%    80,91%
Página 1 de 6    5 de Marzo del 2025`

const DESGLOSE_CAPITAL_GASTOS = (
  total: string,
) => `| | | |    Presupuesto Gastos. Desglose de Operaciones de Capital y Financieras
»<    Periodo: 2025
\f
${total}
Página 4 de 4    3 de Noviembre del 2025`
// Los capítulos 6–9 del resumen de gastos, columna a columna.
const TOTAL_CAPITAL_GASTOS =
  'Total    2.072.366,87    24.497.447,52    2.164.817,97    2.068.753,79    853.575,98'

const valida = (texto: string) => {
  const l = leerHojaOcr(texto)
  expect(l.motivo).toBeNull()
  return l as LecturaValida
}

describe('budget-execution-ocr — una celda, sólo por sus cifras', () => {
  it('lee los separadores que el OCR confunde, porque toda cifra lleva dos decimales', () => {
    // Los tres, tal como salieron del 1T de 2026.
    expect(centimosOcr('265 416,53')).toBe(26541653)
    expect(centimosOcr('4.090.267 48')).toBe(409026748)
    expect(centimosOcr('147%')).toBe(147)
    expect(centimosOcr('-4.928,52')).toBe(-492852)
    expect(centimosOcr('0,00')).toBe(0)
  })

  it('una letra en la celda es una cifra mal leída: null, no se adivina', () => {
    expect(centimosOcr('12.345,6l')).toBeNull()
    expect(centimosOcr('GASTOS')).toBeNull()
    expect(centimosOcr('5')).toBeNull()
    expect(centimosOcr('')).toBeNull()
  })

  it('las columnas van separadas por dos espacios o más; uno solo es parte de la celda', () => {
    expect(celdasOcr('3    GASTOS FINANCIEROS    265 416,53    21,39%')).toEqual([
      '3',
      'GASTOS FINANCIEROS',
      '265 416,53',
      '21,39%',
    ])
  })
})

describe('budget-execution-ocr — qué hoja es', () => {
  it('por su título: plantilla, gastos o ingresos y, en un desglose, sus capítulos', () => {
    expect(plantillaOcr('Presupuestos gastos. Resumen por capítulos')).toEqual({
      plantilla: 'resumen',
      kind: 'gastos',
      capitulos: null,
    })
    expect(plantillaOcr('Estado de ejecución de Ingresos').plantilla).toBe('estado')
    expect(
      plantillaOcr('Presupuesto Gastos. Desglose de Operaciones de naturaleza Corriente'),
    ).toEqual({ plantilla: 'desglose', kind: 'gastos', capitulos: [1, 2, 3, 4, 5] })
    expect(
      plantillaOcr(
        'Presupuesto Ingresos Presupuestarios. Desglose de Operaciones Financieras y de Capital',
      ),
    ).toEqual({ plantilla: 'desglose', kind: 'ingresos', capitulos: [6, 7, 8, 9] })
  })

  it('una hoja que no se reconoce no se lee', () => {
    expect(leerHojaOcr('Ajuntament Riba-Roja de Túria').motivo).toMatch(/plantilla/)
  })

  it('la fecha de impresión va al pie, no en la cabecera', () => {
    expect(fechaImpresaOcr(RESUMEN_GASTOS_3T2025)).toBe('03/11/2025')
  })
})

describe('budget-execution-ocr — la puerta del «Resumen por capítulos»', () => {
  it('una lectura que cuadra da el documento, con el ejecutado y el crédito definitivo', () => {
    const l = valida(RESUMEN_GASTOS_3T2025)
    expect(l.doc.kind).toBe('gastos')
    expect(l.doc.year).toBe(2025)
    expect(l.doc.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(l.doc.chapters[0]).toEqual({
      capitulo: 1,
      label: 'GASTOS DE PERSONAL',
      inicial: 20338112.65,
      modificaciones: 1366351.69,
      actual: 21704464.34,
      ejecutado: 13529118.4,
    })
    expect(l.doc.total.ejecutado).toBe(28074949.41)
    // Sin «Fecha de listado»: el corte es la impresión, como en el 1T de 2026.
    expect(l.doc.fechaListado).toBeNull()
    expect(fechaDeCorte(l.doc)).toBe('03/11/2025')
  })

  it('una cifra del ejecutado mal leída no cuadra con su porcentaje ni con la suma', () => {
    const l = leerHojaOcr(RESUMEN_GASTOS_3T2025.replace('101.658,59', '101.858,59'))
    expect(lecturaAceptable(l)).toBe(false)
    expect(l.motivo).toMatch(/capítulo 3: imprime 35,86 %/)
    expect(l.motivo).toMatch(/columna 3 suma/)
  })

  it('un céntimo mal leído en una columna sin porcentaje lo caza la suma', () => {
    const l = leerHojaOcr(RESUMEN_GASTOS_3T2025.replace('20.338.112,65', '20.338.112,66'))
    expect(l.motivo).toMatch(/la columna 1 suma 41\.578\.252,27 y el total imprime 41\.578\.252,26/)
  })

  it('un capítulo que no sale es un capítulo que falta, no un cero', () => {
    const sin5 = RESUMEN_GASTOS_3T2025.split('\n')
      .filter((l) => !l.startsWith('5 '))
      .join('\n')
    expect(leerHojaOcr(sin5).motivo).toMatch(/falta el capítulo 5/)
  })

  it('el nombre del capítulo no tiene aritmética: se coteja con la clasificación', () => {
    const l = leerHojaOcr(RESUMEN_GASTOS_3T2025.replace('GASTOS DE PERSONAL', 'GASTOS DE PERSONAI'))
    expect(l.motivo).toMatch(/capítulo 1 se lee «GASTOS DE PERSONAI»/)
  })
})

describe('budget-execution-ocr — la puerta del estado antiguo de ingresos', () => {
  it('cuadra, y el ejecutado son los DR netos, los que mide su «%DR s/Prev»', () => {
    const l = valida(ESTADO_INGRESOS_2024)
    expect(l.plantilla).toBe('estado')
    expect(l.doc.kind).toBe('ingresos')
    expect(l.doc.fechaListado).toBe('31/12/2024')
    expect(fechaDeCorte(l.doc)).toBe('31/12/2024')
    // La hoja no trae capítulos 6 ni 9: no se inventan.
    expect(l.doc.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5, 7, 8])
    expect(l.doc.chapters[3].label).toBe('Transferencia corrientes')
    expect(l.doc.total).toEqual({
      inicial: 39504768.48,
      modificaciones: 10334853.84,
      actual: 49839622.32,
      ejecutado: 36845461.01, // no los DR brutos, 38.809.092,56
    })
  })

  it('unos DR netos mal leídos rompen su identidad, su porcentaje y la suma', () => {
    const l = leerHojaOcr(ESTADO_INGRESOS_2024.replace('3.876.802,18', '3.876.302,18'))
    expect(l.motivo).toMatch(/capítulo 3: los DR netos no son/)
  })

  it('una fila «Total Capítulo» sin su segunda línea no se lee', () => {
    const cojo = ESTADO_INGRESOS_2024.replace(
      '0,00    0,00    599.115,67    0,00    595.776,69    6.580,08    25,23%    98,34%\n',
      '',
    )
    expect(leerHojaOcr(cojo).motivo).toMatch(/capítulo 2 no trae sus diecisiete cifras/)
  })
})

describe('budget-execution-ocr — el desglose coteja el resumen', () => {
  it('su fila «Total» es la suma de los capítulos que cubre, leída de otra hoja', () => {
    const d = leerHojaOcr(DESGLOSE_CAPITAL_GASTOS(TOTAL_CAPITAL_GASTOS)) as DesgloseLeido
    expect(lecturaAceptable(d)).toBe(true)
    expect(d.capitulos).toEqual([6, 7, 8, 9])
    expect(cotejarDesglose(valida(RESUMEN_GASTOS_3T2025), d)).toEqual({ estado: 'coincide' })
  })

  it('si no cuadran, contradice y dice en qué columna', () => {
    const d = leerHojaOcr(
      DESGLOSE_CAPITAL_GASTOS(TOTAL_CAPITAL_GASTOS.replace('2.164.817,97', '2.164.817,98')),
    ) as DesgloseLeido
    const c = cotejarDesglose(valida(RESUMEN_GASTOS_3T2025), d)
    expect(c.estado).toBe('contradice')
    expect('motivo' in c && c.motivo).toMatch(/capítulos 6–9 .* columna 3/)
  })

  it('sin su fila «Total» no se ha cotejado nada, y no se dice que coincide', () => {
    const d = leerHojaOcr(DESGLOSE_CAPITAL_GASTOS('')) as DesgloseLeido
    expect(lecturaAceptable(d)).toBe(false)
    expect(cotejarDesglose(valida(RESUMEN_GASTOS_3T2025), d)).toEqual({ estado: 'sin-total' })
  })
})

describe('budget-execution-ocr — el lector sobre los PDF reales', () => {
  let lector: LectorOcr
  beforeAll(async () => {
    lector = await crearLectorOcr()
  }, 60_000)
  afterAll(async () => {
    await lector?.cerrar()
  })
  const leer = async (n: string) => (await lector.leerPdf(readFileSync(fx(n)))).lectura

  it('prueba primero la página tal cual', () => {
    expect(AJUSTES[0].blanqueo).toBeNull()
  })

  it.each(['gastos', 'ingresos'])(
    'el «Resumen» de %s del 1T de 2026, leído por OCR, da lo mismo que su capa de texto',
    async (kind) => {
      const ocr = await leer(`budget-execution-${kind}-resumen_1t2026.pdf`)
      expect(ocr.motivo).toBeNull()
      const texto = parseBudgetExecutionPdf(
        readFileSync(fx(`budget-execution-${kind}-resumen_1t2026.txt`), 'utf8'),
      )
      const doc = (ocr as LecturaValida).doc
      expect(doc.chapters).toEqual(texto.chapters)
      expect(doc.total).toEqual(texto.total)
      expect(doc.year).toBe(texto.year)
    },
    60_000,
  )

  it('las dos hojas «Resumen» del 3T de 2025 cuadran y hacen un periodo publicable', async () => {
    const g = await leer('budget-execution-gastos-resumen_3t2025.pdf')
    const i = await leer('budget-execution-ingresos-resumen_3t2025.pdf')
    expect(g.motivo).toBeNull()
    expect(i.motivo).toBeNull()
    const gd = (g as LecturaValida).doc
    const id = (i as LecturaValida).doc
    expect(gd.total).toEqual({
      inicial: 41578252.26,
      modificaciones: 25162608.92,
      actual: 66740861.18,
      ejecutado: 28074949.41,
    })
    expect(id.total).toEqual({
      inicial: 43516817.13,
      modificaciones: 22221880.92,
      actual: 65738698.05,
      ejecutado: 41103336.45,
    })
    const p = mergeExecutionPeriod(gd, id, { trimestre: 3 })
    expect(p.fechaListado).toBe('03/11/2025')
    expect(p.mismoCorte).toBe(true)
    expect(p.ejecucionPct).toEqual({ gastos: 42.1, ingresos: 62.5 })
    expect(motivoDeDescarte(p, { year: 2025 })).toBeNull()
  }, 60_000)

  it('el desglose de capital de ingresos del 3T de 2025 coincide con su resumen', async () => {
    const d = await leer('budget-execution-ingresos-desglose-capital_3t2025.pdf')
    expect(lecturaAceptable(d)).toBe(true)
    expect((d as DesgloseLeido).total).toEqual([
      180856473, 2122961712, 1538307946, 1537510448, 1097499,
    ])
    const r = (await leer('budget-execution-ingresos-resumen_3t2025.pdf')) as LecturaValida
    expect(cotejarDesglose(r, d as DesgloseLeido)).toEqual({ estado: 'coincide' })
  }, 90_000)

  it('el estado de ingresos del cierre de 2024 cuadra en sus seis páginas', async () => {
    const l = await leer('budget-execution-ingresos_4t2024.pdf')
    expect(l.motivo).toBeNull()
    const doc = (l as LecturaValida).doc
    expect(doc.year).toBe(2024)
    expect(fechaDeCorte(doc)).toBe('31/12/2024')
    expect(doc.total.ejecutado).toBe(36845461.01)
    expect(doc.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5, 7, 8])
  }, 180_000)
})
