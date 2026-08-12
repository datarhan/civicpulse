/**
 * Un coste unitario cuyo denominador nadie vuelve a medir.
 *
 * Riba-roja declara 11.059,41 toneladas de residuos en 2019, en 2021, en 2022,
 * en 2023 y en 2024 —el mismo número hasta el céntimo de tonelada— mientras el
 * coste de esos servicios sube un 64 %. El €/t que publica `/eficiencia` es
 * entonces un cociente con el numerador de este año y el denominador de hace
 * seis: sube porque nadie volvió a pesar la basura.
 *
 * Esto no lo caza ninguna guarda de datos: la cifra publicada resuelve
 * perfectamente a la celda que cita, y la celda dice justo eso. Lo que falla es
 * lo que la tarjeta DEJA ENTENDER, y por eso la salvedad tiene que salir del
 * dato y no de una frase escrita a mano que se quedará atrás.
 */
import { describe, it, expect } from 'vitest'
import { construirIndicadores } from '../src/scraper/indicadores'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { MIN_ENTREGAS_CONGELADA } from '../src/scraper/declaracion-congelada'
import { detectarDesviaciones, RECHAZOS } from '../src/scraper/indicador-desviacion'
import type { CesteRow } from '../src/scraper/coste-efectivo'

const ANIOS = [2019, 2020, 2021, 2022, 2023, 2024]
const DEN = SERVICIOS['a1621'].denominador

function fila(ine: string, anio: number, coste: number, unidad: number): CesteRow {
  return {
    anio,
    ine,
    ente: `17-46-${ine.slice(2)}-AA-000`,
    nombre: `Municipio ${ine}`,
    programa: 'a1621',
    modoGestion: 'directa',
    codGestionRaw: 'Gestión directa por la entidad local',
    costeTotal: coste,
    unidades: [{ atributo: DEN, valor: unidad }],
  }
}

/** El patrón real: coste que sube cada entrega, unidad clavada. */
const propias = ANIOS.map((a, i) => fila('46214', a, 800000 + i * 90000, 11059.41))

/** Pares: la mitad congela su denominador, la otra mitad lo actualiza. */
const paresFilas = [
  ...Array.from({ length: 8 }, (_, k) =>
    ANIOS.map((a, i) => fila(`4600${k}`, a, 700000 + i * 20000, 9000)),
  ).flat(),
  ...Array.from({ length: 8 }, (_, k) =>
    ANIOS.map((a, i) => fila(`4610${k}`, a, 700000 + i * 20000, 9000 + i * 137)),
  ).flat(),
]

function construir(municipioFilas: CesteRow[]) {
  return construirIndicadores({
    municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: municipioFilas },
    pares: {
      conjunto: 'cv-15k-40k',
      miembros: [...new Set(paresFilas.map((f) => f.ine))].map((ine) => ({
        ine,
        nombre: `Municipio ${ine}`,
        poblacion: 20000,
      })),
      filas: paresFilas,
    },
    citaUrl: 'https://www.hacienda.gob.es/',
  })
}

const byId = (s: ReturnType<typeof construir>, id: string) =>
  s.indicadores.find((i) => i.id === id)!

describe('scraper/indicadores — declaración congelada', () => {
  const snap = construir(propias)
  const residuos = byId(snap, 'a1621-coste-unitario')

  it('mide la declaración de las dos magnitudes por separado', () => {
    // La comparación entre ellas ES la evidencia: un ayuntamiento que congelara
    // las dos no rellena el modelo; uno que congela sólo el denominador dice
    // qué mitad del formulario se rellena de verdad.
    expect(residuos.declaracion).not.toBeNull()
    expect(residuos.declaracion!.denominador.congelada).toBe(true)
    expect(residuos.declaracion!.denominador.repeticionesFinales).toBe(ANIOS.length)
    expect(residuos.declaracion!.denominador.desde).toBe(2019)
    expect(residuos.declaracion!.numerador.congelada).toBe(false)
  })

  it('cuenta cuántos comparables hacen lo mismo, para no señalar a uno solo', () => {
    // Sin esto la salvedad se lee como «este ayuntamiento es especialmente
    // descuidado», cuando la mitad de la banda hace exactamente igual. La
    // diferencia entre un defecto local y uno de la fuente es la noticia.
    expect(residuos.declaracion!.paresMedibles).toBe(16)
    expect(residuos.declaracion!.paresCongelados).toBe(8)
  })

  it('añade una salvedad que dice qué le pasa al cociente', () => {
    const texto = residuos.caveats.join(' ')
    expect(texto).toMatch(/2019/)
    expect(texto).toMatch(/mism[ao]/i)
    // Lo que un lector necesita concluir: el cociente puede subir sin que el
    // servicio cambie.
    expect(texto).toMatch(/sin que|aunque no/i)
  })

  it('no inventa la salvedad cuando el denominador SÍ se actualiza', () => {
    const vivas = ANIOS.map((a, i) => fila('46214', a, 800000 + i * 90000, 11059.41 + i * 53))
    const otro = byId(construir(vivas), 'a1621-coste-unitario')
    expect(otro.declaracion!.denominador.congelada).toBe(false)
    expect(otro.caveats.join(' ')).not.toMatch(/misma cifra/i)
  })

  it('se calla cuando no hay entregas suficientes para afirmar nada', () => {
    // Repetir cifra dos años es normal. Una guarda que grita ahí es una guarda
    // que se apaga.
    const pocas = [2023, 2024].map((a, i) => fila('46214', a, 800000 + i * 90000, 11059.41))
    const corto = byId(construir(pocas), 'a1621-coste-unitario')
    expect(corto.declaracion).toBeNull()
    expect(corto.caveats.join(' ')).not.toMatch(/misma cifra/i)
    expect(MIN_ENTREGAS_CONGELADA).toBeGreaterThan(2)
  })

  it('distingue congelar el denominador de congelarlo todo', () => {
    // Si las dos magnitudes están clavadas, el cociente no puede «subir sin que
    // cambie el servicio»: sencillamente es viejo. Decir lo primero sería una
    // acusación que el dato no sostiene.
    const todo = ANIOS.map((a) => fila('46214', a, 800000, 11059.41))
    const i = byId(construir(todo), 'a1621-coste-unitario')
    expect(i.declaracion!.numerador.congelada).toBe(true)
    expect(i.declaracion!.denominador.congelada).toBe(true)
    const texto = i.caveats.join(' ')
    expect(texto).toMatch(/ninguna de las dos|ni el coste|sin actualizar/i)
    expect(texto).not.toMatch(/sólo puede subir/i)
  })
})

describe('scraper/indicador-desviacion — techo por denominador congelado', () => {
  it('nunca firma como fiable una desviación que descansa en una cifra sin remedir', () => {
    // El candidato puede salir impecable contra sus pares y seguir siendo débil:
    // se está comparando un coste de este año con una cantidad de hace seis. La
    // rebaja es un TECHO, no un criterio más — no puede subir nada.
    const snap = construir(propias)
    const i = byId(snap, 'a1621-coste-unitario')
    expect(i.declaracion!.denominador.congelada).toBe(true)

    const { candidatos } = detectarDesviaciones({
      indicadores: snap.indicadores,
      municipales: [],
      anioBase: 2024,
    })
    const mio = candidatos.filter((c) => c.indicadorId === 'a1621-coste-unitario')
    for (const c of mio) expect(c.fiabilidad).toBe('debil')

    // Y que la prueba haya evaluado algo: con estos datos el servicio SÍ genera
    // candidato, así que un cero aquí significaría que no se comprobó nada.
    expect(mio.length).toBeGreaterThan(0)
  })

  it('deja la fiabilidad intacta cuando el denominador se actualiza', () => {
    // El control: si con la unidad viva saliera igual de débil, el techo no
    // estaría midiendo nada.
    const vivas = ANIOS.map((a, i) => fila('46214', a, 800000 + i * 90000, 11059.41 + i * 53))
    const snap = construir(vivas)
    expect(byId(snap, 'a1621-coste-unitario').declaracion!.denominador.congelada).toBe(false)
    const { candidatos } = detectarDesviaciones({
      indicadores: snap.indicadores,
      municipales: [],
      anioBase: 2024,
    })
    const mio = candidatos.filter((c) => c.indicadorId === 'a1621-coste-unitario')
    expect(mio.length).toBeGreaterThan(0)
    expect(mio.some((c) => c.fiabilidad === 'alta')).toBe(true)
  })
})

describe('scraper/indicador-desviacion — el movimiento necesita un denominador que pueda moverse', () => {
  /** Un servicio que se aleja de sus pares con fuerza, año a año. */
  const paresQuietos = Array.from({ length: 16 }, (_, k) =>
    ANIOS.map((a) => fila(`462${String(k).padStart(2, '0')}`, a, 700000, 9000)),
  ).flat()

  function conMovimiento(unidadPorAnio: (i: number) => number) {
    // El coste se multiplica por seis a lo largo de la ventana: contra unos
    // pares quietos, eso es un movimiento enorme y la regla lo emitiría.
    const propiasMov = ANIOS.map((a, i) => fila('46214', a, 300000 + i * 340000, unidadPorAnio(i)))
    return construirIndicadores({
      municipio: { ine: '46214', nombre: 'Riba-roja de Túria', filas: propiasMov },
      pares: {
        conjunto: 'cv-15k-40k',
        miembros: [...new Set(paresQuietos.map((f) => f.ine))].map((ine) => ({
          ine,
          nombre: `Municipio ${ine}`,
          poblacion: 20000,
        })),
        filas: paresQuietos,
      },
      citaUrl: 'https://www.hacienda.gob.es/',
    })
  }

  it('con el denominador vivo, el movimiento sí genera candidato', () => {
    // EL CONTROL. Sin él, una regla que rechazara todo pasaría la prueba de
    // abajo, y la guarda no estaría midiendo nada.
    const snap = conMovimiento((i) => 9000 + i * 220)
    expect(byId(snap, 'a1621-coste-unitario').declaracion!.denominador.congelada).toBe(false)
    const { candidatos } = detectarDesviaciones({
      indicadores: snap.indicadores,
      municipales: [],
      anioBase: 2024,
    })
    const mio = candidatos.find((c) => c.indicadorId === 'a1621-coste-unitario')
    expect(mio?.desviaciones.some((d) => d.motivo === 'movimiento')).toBe(true)
  })

  it('con el denominador congelado, deja de generarlo', () => {
    // Es el caso de urbanismo y de centros docentes: «la distancia a sus pares
    // se multiplica por 4,9» con el punto final dividiendo un coste de hoy
    // entre una cantidad de 2019. El movimiento es del numerador; atribuirlo a
    // la gestión sería publicar como hallazgo la falta de medición.
    const snap = conMovimiento(() => 9000)
    expect(byId(snap, 'a1621-coste-unitario').declaracion!.denominador.congelada).toBe(true)
    const det = detectarDesviaciones({
      indicadores: snap.indicadores,
      municipales: [],
      anioBase: 2024,
    })
    const mio = det.candidatos.find((c) => c.indicadorId === 'a1621-coste-unitario')
    expect(mio?.desviaciones.some((d) => d.motivo === 'movimiento') ?? false).toBe(false)
    // Y el rechazo se CUENTA con su motivo: una regla que se calla es
    // indistinguible de una que no corrió.
    expect(RECHAZOS).toContain('denominador-congelado')
    expect(det.rechazos['denominador-congelado']).toBeGreaterThan(0)
  })
})
