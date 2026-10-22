import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALIFICACIONES,
  TIPOS_ANALISIS,
  calificacion,
  fusionarBoletines,
  parseBoletin,
  parseDetalleRed,
  parseRedes,
  serieParametro,
} from '../src/scraper/sinac'

/**
 * Tres páginas REALES de la consulta ciudadana de SINAC (Ministerio de Sanidad),
 * descargadas el 22-10-2026 con un POST de formulario, sin navegador:
 *
 *   informacionRedes.do (codMunicipio=46214)            → las redes del término
 *   informacionAbastecimientoActionDetalleRed.do (595)   → la red del casco urbano
 *   detalleBoletin.do (10049064)                         → un análisis completo, 2020
 *
 * La cabecera declara iso-8859-1 y el cuerpo es UTF-8: el CLI decodifica UTF-8
 * y el test lee igual. Dos trampas que este contrato fija: un parámetro sin
 * valor publica sólo su unidad (es `null`, nunca 0), y la calificación es
 * una frase del ministerio que se guarda tal cual al lado de la nuestra.
 */
const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8')
const REDES = fx('sinac_redes-46214_2026-10-22.html')
const RED = fx('sinac_red-595_2026-10-22.html')
const BOLETIN = fx('sinac_boletin-10049064_2026-10-22.html')

describe('parseRedes', () => {
  const redes = parseRedes(REDES)

  it('lee las seis redes de distribución de Riba-roja con su id', () => {
    expect(redes).toHaveLength(6)
    expect(redes.find((r) => r.idRed === 595)?.nombre).toBe('RIBARROJA 1: RED CASCO URBANO')
    expect(redes.map((r) => r.idRed).sort((a, b) => a - b)).toEqual([
      216, 595, 2985, 23046, 24415, 24701,
    ])
  })
})

describe('parseDetalleRed', () => {
  const red = parseDetalleRed(RED)

  it('gestor, responsable y población abastecida, con el millar de punto', () => {
    expect(red.gestor).toBe('HIDRAQUA')
    expect(red.responsable).toBe('AYUNTAMIENTO DE RIBA-ROJA DE TÚRIA')
    const rr = red.suministro.find((s) => s.localidad === 'RIBA-ROJA DE TÚRIA')
    expect(rr?.poblacion).toBe(14913)
    expect(red.suministro.find((s) => s.localidad === 'MASÍA TRAVER')?.poblacion).toBe(2280)
    expect(red.dotacionLHabDia).toBeCloseTo(314.38, 5)
  })

  it('los boletines de cada sección, con su tipo y su fecha ISO', () => {
    const porTipo = (t: string) => red.boletines.filter((b) => b.tipo === t)
    expect(porTipo('control')).toHaveLength(10)
    expect(porTipo('completo')).toHaveLength(10)
    expect(porTipo('radiactividad').length).toBeGreaterThan(0)
    const b = red.boletines.find((x) => x.id === 15331957)!
    expect(b).toMatchObject({ tipo: 'completo', fecha: '2024-10-11', calificacion: 'apta' })
    expect(b.calificacionTexto).toBe('AGUA APTA PARA EL CONSUMO')
    for (const x of red.boletines) expect(TIPOS_ANALISIS).toContain(x.tipo)
  })

  it('«gestionada por la Consejería» no es «apta»: es su propio valor', () => {
    const rad = red.boletines.filter((b) => b.tipo === 'radiactividad')
    expect(rad.some((b) => b.calificacion === 'gestionada-consejeria')).toBe(true)
  })

  it('techo de fallback: casi ninguna calificación queda sin reconocer', () => {
    const sin = red.boletines.filter((b) => b.calificacion === null).length
    expect(red.boletines.length).toBeGreaterThan(20)
    expect(sin / red.boletines.length).toBeLessThan(0.1)
  })

  it('el último valor de cada parámetro legal; «Sin datos en SINAC» es null', () => {
    const p = (n: string) => red.parametros.find((x) => x.nombre === n)
    expect(p('Nitrato')).toMatchObject({ valor: 38, unidad: 'mg/L', fecha: '2026-06-17' })
    expect(p('Escherichia coli')?.valor).toBe(0)
    expect(p('Legionella spp')?.valor).toBeNull()
  })
})

describe('parseBoletin', () => {
  const b = parseBoletin(BOLETIN)

  it('la cabecera del análisis', () => {
    expect(b).toMatchObject({
      id: 10049064,
      red: 'RIBARROJA 1: RED CASCO URBANO',
      fecha: '2020-03-11',
      tipoAnalisis: 'Análisis completo',
      calificacion: 'apta',
    })
  })

  it('los parámetros, con decimales de punto y los vacíos como null', () => {
    const p = (n: string) => b.parametros.find((x) => x.nombre === n)
    expect(p('Nitrato')).toMatchObject({ valor: 43, unidad: 'mg/L' })
    expect(p('Cloro libre residual')?.valor).toBeCloseTo(0.67, 5)
    // Publicado sin cifra, sólo con la unidad: no se midió, no es un cero.
    expect(p('Acrilamida (CAS 79-06-01)')?.valor).toBeNull()
    expect(p('Acrilamida (CAS 79-06-01)')?.unidad).toBe('µg/L')
  })
})

describe('calificacion', () => {
  it('traduce sólo las frases conocidas, y nada por parecido', () => {
    expect(calificacion('AGUA APTA PARA EL CONSUMO')).toBe('apta')
    expect(calificacion('AGUA NO APTA PARA EL CONSUMO')).toBe('no-apta')
    expect(calificacion('Calificaci�n gestionada por la Consejer�a')).toBe('gestionada-consejeria')
    expect(calificacion('AGUA APTA PARA EL CONSUMO CON NO CONFORMIDAD')).toBeNull()
    expect(calificacion('')).toBeNull()
    for (const c of ['apta', 'no-apta', 'gestionada-consejeria'] as const)
      expect(CALIFICACIONES).toContain(c)
  })
})

describe('fusionarBoletines', () => {
  it('el archivo crece: lo que la página ya no enseña no se pierde', () => {
    const viejo = { id: 1, idRed: 595, tipo: 'control', fecha: '2020-01-01' }
    const repetido = { id: 2, idRed: 595, tipo: 'control', fecha: '2021-01-01' }
    const nuevo = { id: 3, idRed: 595, tipo: 'control', fecha: '2026-01-01' }
    const r = fusionarBoletines(
      [viejo, repetido] as never[],
      [{ ...repetido, calificacionTexto: 'otra' }, nuevo] as never[],
    )
    expect(r.map((b) => b.id)).toEqual([3, 2, 1])
    // Lo recién leído manda sobre lo archivado: si el ministerio corrige, se ve.
    expect((r[1] as { calificacionTexto?: string }).calificacionTexto).toBe('otra')
  })
})

describe('serieParametro', () => {
  it('media por año de los análisis completos que lo midieron; los null no cuentan', () => {
    const bol = (id: number, fecha: string, valor: number | null, tipo = 'completo') => ({
      id,
      idRed: 595,
      tipo,
      fecha,
      parametros: [{ nombre: 'Nitrato', valor, unidad: 'mg/L' }],
    })
    const s = serieParametro(
      [
        bol(1, '2024-03-01', 40),
        bol(2, '2024-10-01', 44),
        bol(3, '2025-03-01', null),
        bol(4, '2025-10-01', 38),
        bol(5, '2025-11-01', 99, 'control'),
      ] as never[],
      595,
      'Nitrato',
    )
    expect(s).toEqual([
      { anio: 2024, valor: 42, n: 2 },
      { anio: 2025, valor: 38, n: 1 },
    ])
  })
})
