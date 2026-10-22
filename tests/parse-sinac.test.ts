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
  MIN_PARES,
  noAptaEnPares,
  paresNitrato,
  redPrincipal,
  resultadoAgua,
  serieParametro,
  tipoDeLeyenda,
} from '../src/scraper/sinac'
import { validarResultados } from '../src/scraper/resultados'

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

  it('de dónde viene el agua y qué tratamiento recibe, tal cual lo dice la ficha', () => {
    expect(red.origen).toEqual(['Pozo Entubado (1)'])
    expect(red.procesos).toEqual(['Desinfección - Químicos'])
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

describe('tipoDeLeyenda', () => {
  it('reconoce la sección con y sin «de», con y sin tilde', () => {
    // La misma ficha, el mismo día (22-10-2026): por la mañana y por la tarde.
    expect(tipoDeLeyenda('Análisis de completo (10 últimos)')).toBe('completo')
    expect(tipoDeLeyenda('Análisis completo (10 últimos)')).toBe('completo')
    expect(tipoDeLeyenda('Analisis de control (10 ultimos)')).toBe('control')
    expect(tipoDeLeyenda('Análisis de Vigilancia Sanitaria ( último)')).toBe('vigilancia')
    expect(tipoDeLeyenda('Origen del Agua')).toBeNull()
  })

  it('una sección «Análisis …» que no sabemos leer se dice, no se pierde', () => {
    const html = RED.replace('Análisis de radiactividad', 'Análisis de microplásticos')
    expect(parseDetalleRed(html).seccionesSinReconocer).toEqual([
      'Análisis de microplásticos (5 últimos)',
    ])
    expect(parseDetalleRed(RED).seccionesSinReconocer).toEqual([])
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
    type B = { id: number; fecha: string; calificacionTexto?: string }
    const r = fusionarBoletines<B>(
      [viejo, repetido],
      [{ ...repetido, calificacionTexto: 'otra' }, nuevo],
    )
    expect(r.map((b) => b.id)).toEqual([3, 2, 1])
    // Lo recién leído manda sobre lo archivado: si el ministerio corrige, se ve.
    expect(r[1].calificacionTexto).toBe('otra')
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

describe('resultadoAgua', () => {
  const AGUA = JSON.parse(readFileSync(join(__dirname, '../public/data/agua.json'), 'utf8'))
  const IND = JSON.parse(readFileSync(join(__dirname, '../public/data/indicadores.json'), 'utf8'))
  const r = resultadoAgua(AGUA, 2026)!

  it('mide algo: hay redes, boletines y una serie con años', () => {
    expect(AGUA.redes.length).toBeGreaterThan(0)
    expect(r.serie.length).toBeGreaterThan(1)
  })

  it('pasa el validador de resultados y acompaña a una tarjeta que existe', () => {
    expect(() => validarResultados({ items: [r], ausencias: [] })).not.toThrow()
    expect(IND.indicadores.some((i: { id: string }) => i.id === r.servicioRelacionado)).toBe(true)
    expect(r.pares).toBeNull()
  })

  it('el año en curso no entra en la serie; su última muestra va en las salvedades', () => {
    expect(r.serie.every((p) => p.anio < 2026)).toBe(true)
    expect(r.periodo).toBe(String(r.serie.at(-1)!.anio))
    expect(resultadoAgua(AGUA, 1999)).toBeNull()
  })

  it('la red principal es la de más población, y la frase dice cuántos abastece', () => {
    const mayor = [...AGUA.redes].sort(
      (a: { poblacion: number }, b: { poblacion: number }) => b.poblacion - a.poblacion,
    )[0]
    expect(r.caveats[0]).toContain(mayor.nombre)
    for (const t of [r.comoSeLee, ...r.caveats]) {
      expect(t).not.toMatch(/undefined|NaN|null/)
    }
  })

  it('un «no apta» se cuenta con su gestor, y no se dice «ninguno» de quien lo tuvo', () => {
    const principal = [...AGUA.redes].sort(
      (a: { poblacion: number }, b: { poblacion: number }) => b.poblacion - a.poblacion,
    )[0]
    const conFallo = {
      ...AGUA,
      boletines: [
        {
          id: 1,
          idRed: principal.idRed,
          tipo: 'control',
          fecha: '2025-05-05',
          calificacion: 'no-apta',
          calificacionTexto: 'AGUA NO APTA PARA EL CONSUMO',
        },
        ...AGUA.boletines,
      ],
    }
    const t = resultadoAgua(conFallo, 2026)!.caveats.join(' ')
    expect(t).toContain(`gestor ${principal.gestor}`)
    expect(t).not.toContain(`Ninguno en las`)
  })
})

describe('la banda: el mismo dato en los municipios parecidos', () => {
  /** Un municipio con una red principal (HIDRAQUA, 10.000) y otra privada. */
  const muni = (ine: string, nitrato: number | null, anio = 2025, noAptaPrivada = false) => ({
    ine,
    nombre: `M${ine}`,
    redes: [
      { idRed: 1, nombre: 'principal', gestor: 'HIDRAQUA', poblacion: 10000 },
      { idRed: 2, nombre: 'colegio', gestor: 'PRIVADA SL', poblacion: 0 },
    ],
    boletines: [
      {
        id: Number(ine) * 10,
        idRed: 1,
        tipo: 'completo' as const,
        fecha: `${anio}-05-01`,
        calificacion: 'apta' as const,
        calificacionTexto: 'AGUA APTA PARA EL CONSUMO',
        parametros: [{ nombre: 'Nitrato', valor: nitrato, unidad: 'mg/L' }],
      },
      {
        id: Number(ine) * 10 + 1,
        idRed: 2,
        tipo: 'control' as const,
        fecha: `${anio}-06-01`,
        calificacion: noAptaPrivada ? ('no-apta' as const) : ('apta' as const),
        calificacionTexto: '',
      },
    ],
  })
  const banda = (n: number) => Array.from({ length: n }, (_, i) => muni(String(46000 + i), 10 + i))

  it('la red principal es la de más población; sin población no hay principal', () => {
    expect(redPrincipal(muni('1', 5))!.idRed).toBe(1)
    expect(redPrincipal({ redes: [{ idRed: 9, nombre: 'x', gestor: null, poblacion: 0 }] })).toBe(
      null,
    )
  })

  it('por debajo del mínimo no hay banda; con él, n propio y percentil', () => {
    expect(paresNitrato(banda(MIN_PARES - 1), 2025, 20, 'cv', '46214')).toBeNull()
    const p = paresNitrato(banda(20), 2025, 19, 'cv', '46214')!
    expect(p.n).toBe(20)
    expect(p.percentil).toBe(50)
    expect(p.mediana).toBeCloseTo(19.5, 5)
  })

  it('el propio no entra en su banda, y quien no midió ese año no cuenta', () => {
    const m = [...banda(20), muni('46214', 999), muni('47000', null), muni('47001', 30, 2024)]
    expect(paresNitrato(m, 2025, 19, 'cv', '46214')!.n).toBe(20)
  })

  it('cuenta los «no apta» y separa los de un gestor distinto del principal', () => {
    const m = [muni('1', 10, 2025, true), muni('2', 10), muni('46214', 10, 2025, true)]
    expect(noAptaEnPares(m, '46214')).toEqual({
      municipios: 2,
      municipiosConNoApta: 1,
      redes: 4,
      redesConNoApta: 1,
      redesConNoAptaOtroGestor: 1,
      calificados: 4,
      noAptas: 1,
    })
  })
})

describe('el año entero, del informe del ministerio', () => {
  const AGUA = JSON.parse(readFileSync(join(__dirname, '../public/data/agua.json'), 'utf8'))
  const INFORME = JSON.parse(
    readFileSync(join(__dirname, '../public/data/agua-informe-anual.json'), 'utf8'),
  )
  const t = resultadoAgua(AGUA, 2026, null, INFORME)!.caveats.join(' ')

  it('mide algo: el informe trae años y la zona principal tiene serie', () => {
    expect(INFORME.serieZonaPrincipal.length).toBeGreaterThan(1)
  })

  it('la ventana de SINAC se dice ventana, y nunca «ninguno» de una red entera', () => {
    expect(t).toContain('sólo los últimos boletines de cada red, no todos los del año')
    expect(t).not.toMatch(/Ninguno en las \d+ redes/)
  })

  it('cada año en su formato: recuento hasta 2022, porcentaje después, con la definición', () => {
    expect(t).toContain('2021, 55 «no apto» de 485')
    expect(t).toMatch(/2023, 99,1 % de aptos de 830/)
    expect(t).toContain('No Aptos con riesgos para la salud')
    expect(t).not.toMatch(/2023, \d+ «no apto»/)
  })

  it('las otras zonas con «no apto» o menos del 100 % se nombran con su año', () => {
    expect(t).toContain('RIBA-ROJA 8- COLEGIO MARÍA DE ICIAR: 2 «no apto» de 5')
    expect(t).toMatch(/RESIDENCIA 3ª EDAD ENTRE NARANJOS: 66,7 % de aptos de 14/)
  })
})
