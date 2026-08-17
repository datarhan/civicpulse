import { describe, it, expect } from 'vitest'
import {
  MIN_MUESTRA,
  ESTADOS_ESPERADO,
  MOTIVOS_EXCLUSION_ESPERADO,
  cuantilT,
  ajustarOls,
  intervaloPrediccion,
  analizarServicio,
  INE_PROPIO,
} from '../src/scraper/coste-esperado'
import type { CesteRow } from '../src/scraper/coste-efectivo'

/** Una fila del libro CCAA-17 reducida a lo que el modelo consume. */
const fila = (
  ine: string,
  programa: string,
  costeTotal: number | null,
  modoGestion = 'directa',
): CesteRow =>
  ({
    anio: 2024,
    ine,
    ente: `Ayto ${ine}`,
    nombre: `Municipio ${ine}`,
    programa,
    modoGestion,
    codGestionRaw: 'Gestión directa por la entidad local',
    costeTotal,
    unidades: [],
  }) as CesteRow

/** Muestra sintética SIN ruido: coste = e^2 · población^0.9, exacto. */
function muestraExacta(n: number, programa = 'a1621') {
  const filas: CesteRow[] = []
  const poblaciones = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const ine = `9${String(i).padStart(4, '0')}`
    const pob = 1000 * Math.exp(i / 12) // repartida en log, de 1.000 a ~64 M
    poblaciones.set(ine, pob)
    filas.push(fila(ine, programa, Math.exp(2) * pob ** 0.9))
  }
  return { filas, poblaciones }
}

describe('el cuantil t que ancla los intervalos', () => {
  it('reproduce los valores de tabla', () => {
    // Abramowitz & Stegun / tablas estándar, dos decimales largos.
    expect(cuantilT(0.975, 40)).toBeCloseTo(2.0211, 3)
    expect(cuantilT(0.975, 60)).toBeCloseTo(2.0003, 3)
    expect(cuantilT(0.975, 120)).toBeCloseTo(1.9799, 3)
    expect(cuantilT(0.975, 1000)).toBeCloseTo(1.9623, 3)
  })
})

describe('la recta log-log', () => {
  it('recupera la elasticidad exacta de una muestra sin ruido', () => {
    const { filas, poblaciones } = muestraExacta(50)
    const puntos = filas.map((f) => ({
      poblacion: poblaciones.get(f.ine)!,
      coste: f.costeTotal!,
    }))
    const m = ajustarOls(puntos)
    expect(m.beta).toBeCloseTo(0.9, 9)
    expect(m.alfa).toBeCloseTo(2, 9)
    expect(m.r2).toBeCloseTo(1, 9)
    expect(m.n).toBe(50)
  })

  it('la elasticidad no depende de la unidad de la población', () => {
    // Propiedad, no restatement: reescalar x (miles en vez de habitantes)
    // desplaza la constante y NO puede mover la pendiente.
    const { filas, poblaciones } = muestraExacta(45)
    const puntos = filas.map((f) => ({
      poblacion: poblaciones.get(f.ine)!,
      coste: f.costeTotal!,
    }))
    const escalados = puntos.map((p) => ({ ...p, poblacion: p.poblacion / 1000 }))
    expect(ajustarOls(escalados).beta).toBeCloseTo(ajustarOls(puntos).beta, 9)
  })

  it('el intervalo de predicción se ensancha lejos de la media', () => {
    const { filas, poblaciones } = muestraExacta(60)
    const puntos = filas.map((f, i) => ({
      poblacion: poblaciones.get(f.ine)!,
      // Ruido determinista alternante para que sigma > 0 sin aleatoriedad.
      coste: f.costeTotal! * (i % 2 === 0 ? 1.15 : 0.87),
    }))
    const m = ajustarOls(puntos)
    const enMedia = intervaloPrediccion(m, Math.exp(m.xMedia))
    const lejos = intervaloPrediccion(m, Math.exp(m.xMedia + 2))
    const ancho = (b: { superior: number; inferior: number }) =>
      Math.log(b.superior) - Math.log(b.inferior)
    expect(ancho(lejos)).toBeGreaterThan(ancho(enMedia))
    // Y el esperado queda dentro de su propia banda, siempre.
    expect(enMedia.inferior).toBeLessThan(enMedia.esperado)
    expect(enMedia.superior).toBeGreaterThan(enMedia.esperado)
  })
})

/**
 * Como la exacta pero con ruido determinista alternante (±15 %): una banda de
 * predicción sobre una muestra SIN ruido colapsa al punto, y entonces hasta un
 * 5 % de desvío queda «fuera de lo esperado» — correcto para el modelo, inútil
 * para probar el caso normal.
 */
function muestraRuidosa(n: number, programa = 'a1621') {
  const { filas, poblaciones } = muestraExacta(n, programa)
  for (let i = 0; i < filas.length; i++) {
    filas[i] = { ...filas[i], costeTotal: filas[i].costeTotal! * (i % 2 === 0 ? 1.15 : 0.87) }
  }
  return { filas, poblaciones }
}

describe('analizarServicio: la escalera declarada', () => {
  it('publica el análisis del propio cuando declara en directa', () => {
    const { filas, poblaciones } = muestraRuidosa(50)
    poblaciones.set(INE_PROPIO, 25000)
    filas.push(fila(INE_PROPIO, 'a1621', Math.exp(2) * 25000 ** 0.9 * 1.05))
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.estado).toBe('publicada')
    expect(a.propia).not.toBeNull()
    // Un 5 % por encima de la recta, con pares que se desvían ±15 %: normal
    // para un municipio así.
    expect(a.propia!.dentroDeLoEsperado).toBe(true)
    // El propio entra en la muestra del ajuste: no se compara contra un modelo
    // del que se le ha dejado fuera.
    expect(a.modelo!.n).toBe(51)
  })

  it('marca fuera de lo esperado un coste inflado de verdad', () => {
    const { filas, poblaciones } = muestraRuidosa(50)
    poblaciones.set(INE_PROPIO, 25000)
    filas.push(fila(INE_PROPIO, 'a1621', Math.exp(2) * 25000 ** 0.9 * 4))
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.propia!.dentroDeLoEsperado).toBe(false)
    expect(a.propia!.razon).toBeGreaterThan(1)
  })

  it('con muestra corta publica el fallo, no un modelo', () => {
    const { filas, poblaciones } = muestraExacta(MIN_MUESTRA - 2)
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.estado).toBe('muestra-insuficiente')
    expect(a.modelo).toBeNull()
    expect(a.propia).toBeNull()
    expect(a.motivoEstado).toMatch(/\d+/)
  })

  it('sin declaración propia publica el modelo y dice por qué falta el punto', () => {
    const { filas, poblaciones } = muestraExacta(50)
    // El propio existe pero presta en concesión: su coste declarado no es
    // comparable (regla 4) y el punto no se dibuja.
    poblaciones.set(INE_PROPIO, 25000)
    filas.push(fila(INE_PROPIO, 'a1621', 0, 'concesion'))
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.estado).toBe('sin-declaracion-propia')
    expect(a.modelo).not.toBeNull()
    expect(a.propia).toBeNull()
    expect(a.motivoEstado).toMatch(/concesión/)
  })

  it('sólo entra la gestión directa, y lo excluido se cuenta por municipio', () => {
    const { filas, poblaciones } = muestraExacta(50)
    const extra = fila('88888', 'a1621', 5000, 'concesion')
    poblaciones.set('88888', 12000)
    filas.push(extra)
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.modelo!.n).toBe(50)
    expect(a.cobertura.excluidas['otro-modo']).toBe(1)
    // La cobertura cuadra en MUNICIPIOS: incluidos + excluidos = declarantes.
    // Las filas no suman porque un municipio puede traer dos mitades legítimas.
    const suma = Object.values(a.cobertura.excluidas).reduce((x, y) => x + y, 0)
    expect(a.cobertura.incluidas + suma).toBe(a.cobertura.declarantes)
  })

  it('dos COSTES para el mismo servicio excluyen al municipio (regla 1)', () => {
    const { filas, poblaciones } = muestraExacta(50)
    filas.push(fila('90000', 'a1621', 999)) // 90000 ya declara un coste: segundo
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.modelo!.n).toBe(49)
    expect(a.cobertura.excluidas['filas-duplicadas']).toBe(1)
  })

  it('una declaración inverosímil queda fuera de la recta (regla 7)', () => {
    // El libro real trae ayuntamientos declarando 1 € de coste de escuelas: no
    // es un coste, es un artefacto, y dentro del ajuste arrastra la recta y
    // estira el eje diez décadas. La cordura es la MISMA regla 7 del panel
    // (×ATIPICO_FACTOR sobre la mediana), normalizada por habitante.
    const { filas, poblaciones } = muestraRuidosa(50)
    poblaciones.set('77777', 20000)
    filas.push(fila('77777', 'a1621', 1)) // 1 € para 20.000 habitantes
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.modelo!.n).toBe(50)
    expect(a.cobertura.excluidas['cifra-inverosimil']).toBe(1)
  })

  it('si la cifra inverosímil es la propia, el punto no se dibuja y se dice', () => {
    const { filas, poblaciones } = muestraRuidosa(50)
    poblaciones.set(INE_PROPIO, 25000)
    filas.push(fila(INE_PROPIO, 'a1621', 2)) // 2 €: inverosímil también para nosotros
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.estado).toBe('sin-declaracion-propia')
    expect(a.propia).toBeNull()
    expect(a.motivoEstado).toMatch(/inverosímil/)
  })

  it('la pareja coste + unidades del libro NO es un duplicado', () => {
    // El libro CCAA-17 publica algunos programas en dos filas por municipio:
    // una con el coste y otra con las unidades físicas de la MISMA
    // declaración. Tratarlas como regla 1 dejó a171/170P en 0 de 956 la
    // primera vez que esto corrió contra el libro real.
    const { filas, poblaciones } = muestraExacta(50)
    filas.push(fila('90000', 'a1621', null)) // la mitad de unidades, sin coste
    const a = analizarServicio('a1621', { filas, poblaciones })
    expect(a.modelo!.n).toBe(50)
    expect(a.cobertura.excluidas['filas-duplicadas']).toBeUndefined()
    expect(a.cobertura.declarantes).toBe(50)
    expect(a.cobertura.filas).toBe(51)
  })

  it('la muestra publicada es anónima: dos números por punto, ordenados', () => {
    const { filas, poblaciones } = muestraExacta(50)
    const a = analizarServicio('a1621', { filas, poblaciones })
    for (const p of a.muestra) {
      expect(Object.keys(p).sort()).toEqual(['coste', 'poblacion'])
    }
    // Ordenada por población: el orden del libro fuente permitiría
    // re-identificar municipios por posición.
    const pobs = a.muestra.map((p) => p.poblacion)
    expect([...pobs].sort((x, y) => x - y)).toEqual(pobs)
    // Y en el objeto entero no viaja ningún INE ni nombre ajeno.
    const crudo = JSON.stringify(a)
    expect(crudo).not.toMatch(/Municipio 9/)
    expect(crudo).not.toMatch(/"ine"/)
  })

  it('es determinista de punta a punta', () => {
    const { filas, poblaciones } = muestraExacta(50)
    const a = analizarServicio('a1621', { filas, poblaciones })
    const b = analizarServicio('a1621', { filas, poblaciones })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('los enums que la página y la guarda comparten', () => {
  it('exportados, no restatados', () => {
    expect(ESTADOS_ESPERADO).toContain('publicada')
    expect(ESTADOS_ESPERADO).toContain('muestra-insuficiente')
    expect(ESTADOS_ESPERADO).toContain('sin-declaracion-propia')
    expect(MOTIVOS_EXCLUSION_ESPERADO).toContain('otro-modo')
    expect(MIN_MUESTRA).toBeGreaterThanOrEqual(40)
  })
})
