/**
 * La especificación es donde un DEA se gana o se pierde la credibilidad.
 *
 * El motor (`dea.ts`) es aritmética comprobable. Lo que decide si la página
 * dice algo verdadero es qué servicios entran en la cesta, a quién se deja
 * fuera y si eso se cuenta. Un municipio con la limpieza en concesión declara
 * coste cero: si se cuela, sale insuperable, arrastra la frontera hacia abajo y
 * empeora la puntuación de todos los demás. Estas pruebas fijan justo esas
 * fronteras, contra el corte real del volcado ministerial.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselWorkbook } from '../src/scraper/coste-efectivo'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import {
  ESPECIFICACIONES,
  MOTIVOS_EXCLUSION,
  ESTADOS_ESPECIFICACION,
  INE_PROPIO,
  construirDmus,
  analizarEspecificacion,
} from '../src/scraper/dea-especificacion'

const FIXTURE = join(__dirname, 'fixtures', 'cesel_2021_cv_slice.xlsx')
const FILAS = parseCeselWorkbook(readFileSync(FIXTURE), { anio: 2021 })
const MUNICIPIOS = new Set(FILAS.map((f) => f.ine))
const ENTRADA = { filas: FILAS, anio: 2021, miembrosBanda: MUNICIPIOS.size, replicas: 100 }
const spec = (id: string) => ESPECIFICACIONES.find((e) => e.id === id)!

describe('scraper/dea-especificacion — el registro', () => {
  it('sólo usa servicios que existen en el registro de /eficiencia', () => {
    // Ni un programa inventado aquí: el denominador de cada servicio ya está
    // curado a mano en indicador-registry, y duplicarlo sería el modo de fallo 1
    // de DATA_INTEGRITY con otro nombre.
    expect(ESPECIFICACIONES.length).toBeGreaterThan(2)
    for (const e of ESPECIFICACIONES) {
      expect(e.programas.length).toBeGreaterThan(0)
      for (const p of e.programas) expect(SERVICIOS[p]).toBeDefined()
      expect(e.porQue.length).toBeGreaterThan(40)
    }
  })

  it('mantiene identificadores únicos', () => {
    expect(new Set(ESPECIFICACIONES.map((e) => e.id)).size).toBe(ESPECIFICACIONES.length)
  })

  it('incluye a propósito una especificación que no puede publicarse', () => {
    // Una página que sólo enseña las especificaciones que salen bien no está
    // enseñando el método, está enseñando el resultado.
    const analisis = ESPECIFICACIONES.map((e) => analizarEspecificacion(e, ENTRADA))
    expect(analisis.some((a) => a.estado === 'insuficiente')).toBe(true)
    expect(analisis.some((a) => a.estado === 'publicada')).toBe(true)
  })
})

describe('scraper/dea-especificacion — construcción de unidades', () => {
  const { incluidas, excluidas } = construirDmus(spec('residuos-limpieza-alumbrado'), ENTRADA)

  it('cuadra la contabilidad: incluidas + excluidas = municipios de la entrada', () => {
    expect(incluidas.length + excluidas.length).toBe(MUNICIPIOS.size)
    expect(incluidas.length).toBeGreaterThan(15)
  })

  it('da a cada exclusión un motivo del enum exportado, y usa más de uno', () => {
    const vistos = new Set<string>()
    for (const e of excluidas) {
      expect(MOTIVOS_EXCLUSION).toContain(e.motivo)
      vistos.add(e.motivo)
    }
    // Que la clasificación haya discriminado algo: un solo motivo para todo
    // significaría que el resto de ramas nunca se ejecuta.
    expect(vistos.size).toBeGreaterThan(1)
  })

  it('no confunde «no presta el servicio» con «lo tiene concesionado»', () => {
    // Uno dice algo del municipio y el otro dice algo de la fuente, y la tira
    // de cobertura de la página cuenta cosas distintas según cuál sea. El mismo
    // cajón para los dos es un centinela con dos significados.
    const sinServicio = excluidas.filter((e) => e.motivo === 'no-se-presta')
    const concesion = excluidas.filter((e) => e.motivo === 'modo-no-directa')
    for (const e of sinServicio) {
      const filas = FILAS.filter(
        (f) =>
          f.ine === e.ine && spec('residuos-limpieza-alumbrado').programas.includes(f.programa),
      )
      expect(filas.some((f) => f.modoGestion === 'no-se-presta')).toBe(true)
    }
    for (const e of concesion) {
      const filas = FILAS.filter(
        (f) =>
          f.ine === e.ine && spec('residuos-limpieza-alumbrado').programas.includes(f.programa),
      )
      // Si TODOS los modos del primer servicio bloqueante fueran 'no-se-presta',
      // debería haber caído por la otra puerta.
      expect(filas.every((f) => f.modoGestion === 'no-se-presta')).toBe(false)
    }
  })

  it('deja fuera todo lo que no sea gestión directa', () => {
    // El municipio en concesión declara coste 0 y saldría insuperable,
    // arrastrando la frontera y empeorando la puntuación de todos los demás.
    // Trampa 1 de la fuente, ahora con efecto sobre terceros.
    const enConcesion = excluidas.filter((e) => e.motivo === 'modo-no-directa')
    expect(enConcesion.length).toBeGreaterThan(0)
    for (const e of enConcesion) expect(incluidas.some((d) => d.id === e.ine)).toBe(false)
  })

  it('no deja pasar ni un cero: todo valor de una unidad es estrictamente positivo', () => {
    let revisados = 0
    for (const d of incluidas) {
      expect(d.entradas).toHaveLength(1)
      expect(d.salidas).toHaveLength(3)
      for (const v of [...d.entradas, ...d.salidas]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThan(0)
        revisados++
      }
    }
    expect(revisados).toBe(incluidas.length * 4)
  })

  it('usa la suma de la cesta como única entrada', () => {
    // Un coste por servicio como entrada separada convierte el modelo en «el
    // mejor de tres cocientes» y deja de medir el reparto del dinero.
    const rr = incluidas.find((d) => d.id === INE_PROPIO)!
    const propias = FILAS.filter((f) => f.ine === INE_PROPIO)
    const suma = spec('residuos-limpieza-alumbrado')
      .programas.map((p) => propias.find((f) => f.programa === p)!.costeTotal ?? 0)
      .reduce((a, b) => a + b, 0)
    expect(rr.entradas[0]).toBeCloseTo(suma, 2)
  })
})

describe('scraper/dea-especificacion — el análisis', () => {
  const principal = analizarEspecificacion(spec('residuos-limpieza-alumbrado'), ENTRADA)

  it('publica la especificación principal con la propia unidad dentro', () => {
    expect(ESTADOS_ESPECIFICACION).toContain(principal.estado)
    expect(principal.estado).toBe('publicada')
    expect(principal.gradosLibertad.cumple).toBe(true)
    expect(principal.propia).not.toBeNull()
    expect(principal.propia!.theta).toBeGreaterThan(0)
    expect(principal.propia!.theta).toBeLessThanOrEqual(1)
    expect(principal.propia!.thetaCorregido).toBeLessThanOrEqual(principal.propia!.theta)
  })

  it('cuenta la cobertura con los mismos números que la construcción', () => {
    const { incluidas, excluidas } = construirDmus(spec('residuos-limpieza-alumbrado'), ENTRADA)
    expect(principal.cobertura.incluidas).toBe(incluidas.length)
    const sumaExcluidas = Object.values(principal.cobertura.excluidas).reduce((a, b) => a + b, 0)
    expect(sumaExcluidas).toBe(excluidas.length)
    expect(principal.cobertura.incluidas + sumaExcluidas).toBe(principal.cobertura.banda)
  })

  it('publica la distribución sin nombrar a nadie', () => {
    // El coste unitario de /eficiencia es una división de cifras del ministerio
    // y ahí los pares SÍ van con nombre. Una puntuación DEA es el veredicto de
    // un modelo nuestro: publicar la tabla equivaldría a firmar una afirmación
    // sobre veinte ayuntamientos a los que este sitio no da derecho de réplica.
    const serializado = JSON.stringify(principal)
    let comprobados = 0
    for (const ine of MUNICIPIOS) {
      if (ine === INE_PROPIO) continue
      expect(serializado).not.toContain(ine)
      comprobados++
    }
    expect(comprobados).toBeGreaterThan(40)
    for (const f of FILAS) {
      if (f.ine === INE_PROPIO) continue
      expect(serializado).not.toContain(f.nombre)
    }
    expect(principal.distribucion!.n).toBe(principal.cobertura.incluidas)
  })

  it('publica cuántas unidades son eficientes y cuántas lo son por rareza', () => {
    const d = principal.distribucion!
    expect(d.eficientes).toBeGreaterThan(0)
    expect(d.eficientes).toBeLessThanOrEqual(d.n)
    expect(d.autorreferentes).toBeLessThanOrEqual(d.eficientes)
    expect(d.mediana).toBeGreaterThan(0)
    expect(d.p25).toBeLessThanOrEqual(d.mediana)
    expect(d.mediana).toBeLessThanOrEqual(d.p75)
  })

  it('acompaña cada puntuación de su intervalo y de si la corrección procede', () => {
    const p = principal.propia!
    expect(p.ic.inferior).toBeLessThanOrEqual(p.ic.superior)
    expect(p.ic.superior).toBeLessThanOrEqual(1 + 1e-9)
    expect(typeof p.correccionRecomendada).toBe('boolean')
    expect(p.razonSesgo).toBeGreaterThanOrEqual(0)
    // Y si el intervalo no acota por abajo, lo dice en vez de imprimir el corte.
    expect(p.intervaloAcotaPorAbajo).toBe(!p.ic.truncadoInferior)
  })

  it('da también la lectura con rendimientos constantes y la eficiencia de escala', () => {
    const p = principal.propia!
    expect(p.thetaCrs).toBeGreaterThan(0)
    expect(p.thetaCrs).toBeLessThanOrEqual(p.theta + 1e-9)
    expect(p.escala).toBeCloseTo(p.thetaCrs / p.theta, 6)
  })

  it('avisa de que la cesta más fina pone a Riba-roja en la frontera sin poder acotarla', () => {
    // El resultado más fácil de malinterpretar de todo el experimento: la única
    // especificación que da θ = 1 es también la que se queda en el mínimo de
    // unidades, y su intervalo se sale de la escala por abajo. «Estamos en la
    // frontera» y «no se puede saber» son aquí la misma medición.
    const cuatro = analizarEspecificacion(spec('cuatro-servicios'), ENTRADA)
    expect(cuatro.estado).toBe('publicada')
    expect(cuatro.propia!.theta).toBeCloseTo(1, 6)
    expect(cuatro.cobertura.incluidas).toBeLessThan(principal.cobertura.incluidas)
    expect(cuatro.propia!.intervaloAcotaPorAbajo).toBe(false)
    expect(cuatro.propia!.ic.truncadoInferior).toBe(true)
    // …y la principal sí acota, o el aviso no distinguiría nada.
    expect(principal.propia!.intervaloAcotaPorAbajo).toBe(true)
  })

  it('se niega a publicar la cesta que no llega a grados de libertad', () => {
    const pobre = analizarEspecificacion(spec('cinco-servicios'), ENTRADA)
    expect(pobre.estado).toBe('insuficiente')
    expect(pobre.gradosLibertad.cumple).toBe(false)
    expect(pobre.propia).toBeNull()
    expect(pobre.distribucion).toBeNull()
    // Pero la cobertura SÍ se publica: es el dato que explica por qué no hay
    // puntuación, y es la mitad interesante del resultado.
    expect(pobre.cobertura.incluidas).toBeGreaterThan(0)
    expect(pobre.motivoEstado).toMatch(/grados de libertad/i)
  })

  it('repite exactamente el mismo análisis en dos pasadas', () => {
    const a = analizarEspecificacion(spec('residuos-limpieza-alumbrado'), ENTRADA)
    const b = analizarEspecificacion(spec('residuos-limpieza-alumbrado'), ENTRADA)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('mueve la puntuación al cambiar de especificación, que es el resultado del experimento', () => {
    const dos = analizarEspecificacion(spec('residuos-limpieza'), ENTRADA)
    expect(dos.estado).toBe('publicada')
    // Si dos cestas defendibles dieran la misma cifra, DEA sería una medición.
    // No lo es, y la página existe para enseñar exactamente eso.
    expect(dos.propia!.theta).not.toBeCloseTo(principal.propia!.theta, 3)
  })
})
