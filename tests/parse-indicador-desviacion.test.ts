import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  UMBRALES,
  MOTIVOS_DESVIACION,
  DESCARTES,
  RECHAZOS,
  FIABILIDADES,
  detectarDesviaciones,
  type Candidato,
} from '../src/scraper/indicador-desviacion'
import type { Indicador } from '../src/scraper/indicadores'
import type { IndicadorMunicipal } from '../src/scraper/indicadores-friccion'

const ROOT = join(__dirname, '..')
const pub = JSON.parse(readFileSync(join(ROOT, 'public/data/indicadores.json'), 'utf8'))
const indicadores: Indicador[] = pub.indicadores
const municipales: IndicadorMunicipal[] = pub.municipales
const det = detectarDesviaciones({ indicadores, municipales, anioBase: pub.anioBase })
const cand = (id: string): Candidato | undefined => det.candidatos.find((c) => c.indicadorId === id)

describe('scraper/indicador-desviacion', () => {
  it('COMPROBÓ ALGO — cuántas veces pudo correr cada regla', () => {
    // La aserción que no puede faltar. «Cero candidatos» de un motor que no
    // evaluó nada es la suite verde que no mide nada de DATA_INTEGRITY: aquí
    // el número de veces que cada regla llegó a ejecutarse se publica al lado
    // del resultado, y si alguna cae a cero la prueba se entera.
    expect(det.evaluados).toBeGreaterThan(5)
    expect(det.reglas.posicion).toBeGreaterThan(5)
    expect(det.reglas.movimiento).toBeGreaterThan(5)
    expect(det.reglas.umbralLegal).toBeGreaterThan(0)
  })

  it('cada indicador acaba evaluado o descartado con su razón, sin sumideros', () => {
    const total = indicadores.length + municipales.length
    const descartados = Object.values(det.descartes).reduce((a, b) => a + b, 0)
    expect(det.evaluados + descartados).toBe(total)
    for (const clave of Object.keys(det.descartes)) expect(DESCARTES).toContain(clave)
    for (const clave of Object.keys(det.rechazos)) expect(RECHAZOS).toContain(clave)
  })

  it('separa «no llegó a comprobarse» de «se comprobó y no era»', () => {
    // Los dos mapas dicen cosas distintas y colapsarlos volvería a dejar un
    // cero sin significado: `descartes` es por indicador y suma el panel;
    // `rechazos` cuenta reglas que SÍ corrieron y dijeron que no.
    expect(det.rechazos['dentro-de-banda']).toBeGreaterThan(0)
  })

  it('no propone nada que no lleve al menos una desviación con sus dos cifras', () => {
    expect(det.candidatos.length).toBeGreaterThan(0)
    for (const c of det.candidatos) {
      expect(c.desviaciones.length).toBeGreaterThan(0)
      for (const d of c.desviaciones) {
        expect(MOTIVOS_DESVIACION).toContain(d.motivo)
        expect(Number.isFinite(d.valor)).toBe(true)
        expect(Number.isFinite(d.referencia)).toBe(true)
        expect(d.referencia).not.toBe(0)
      }
      expect(c.fuentes.length).toBeGreaterThan(0)
      expect(c.umbrales).toBe(UMBRALES.version)
    }
  })

  it('un indicador da UN candidato, aunque dispare por dos razones', () => {
    // El plazo de pago supera el límite legal Y queda por encima de casi todos
    // sus pares. Dos candidatos serían dos hallazgos diciendo lo mismo del
    // mismo número, que es la duplicación que findRepeatedQuotes existe para
    // impedir un nivel más abajo.
    const ids = det.candidatos.map((c) => c.indicadorId)
    expect(new Set(ids).size).toBe(ids.length)
    const pmp = cand('periodo-medio-pago')!
    expect(pmp.desviaciones.map((d) => d.motivo).sort()).toEqual(['posicion-alta', 'umbral-legal'])
  })

  it('mide el plazo de pago contra la ley, no contra los vecinos', () => {
    const fuente = municipales.find((m) => m.id === 'periodo-medio-pago')!
    const pmp = cand('periodo-medio-pago')!
    const legal = pmp.desviaciones.find((d) => d.motivo === 'umbral-legal')!
    // El umbral se lee del indicador, no se reescribe aquí: una copia a mano
    // del número es cómo seis pruebas de este repositorio se quedaron verdes
    // comprobando una forma que producción no tenía.
    expect(legal.referencia).toBe(fuente.referencia!.valor)
    expect(legal.etiquetaReferencia).toBe(fuente.referencia!.etiqueta)
    expect(legal.veces).toBeGreaterThan(2)
    // Y el candidato lleva la norma enlazable: un hallazgo que dice «supera el
    // límite legal» tiene que poder enseñar el límite.
    expect(pmp.citas.map((c) => c.url)).toContain(fuente.referencia!.fuente)
  })

  it('un precio no es un rendimiento: el escalón input nunca es desviación', () => {
    // Coste por efectivo de policía queda en el percentil 85 y sube. Publicarlo
    // como desviación diría «la policía es cara» cuando lo que mide es cuánto
    // cobra un policía. Es exactamente la mentira por vecindad que el escalón
    // existe para impedir, así que se descarta ANTES de comparar.
    const policia = indicadores.find((i) => i.tier === 'input' && i.valor !== null)!
    expect(policia.pares!.percentil).toBeGreaterThan(75) // se saldría si se comparara
    expect(cand(policia.id)).toBeUndefined()
    expect(det.descartes['tier-input']).toBeGreaterThan(0)
  })

  it('nunca compara un servicio concedido', () => {
    for (const c of det.candidatos) {
      if (c.familia !== 'servicio') continue
      expect(c.modoGestion).not.toBe('concesion')
    }
    expect(det.descartes['no-comparable']).toBeGreaterThan(0)
  })

  it('un movimiento HACIA la mediana no es un movimiento de coste', () => {
    // Alumbrado pasa de 0,07 a 1,05 veces la mediana de sus pares en diez años:
    // catorce veces de salto, y sin embargo lo que cambió es cuánto se declara,
    // no cuánto cuesta. Converger es la firma de un cambio de criterio
    // contable; sólo cuenta alejarse.
    const alumbrado = cand('a165-coste-unitario')
    expect(alumbrado?.desviaciones.some((d) => d.motivo === 'movimiento')).not.toBe(true)
    expect(det.rechazos['convergente']).toBeGreaterThan(0)
  })

  it('sí propone el que se ALEJA de sus pares', () => {
    // Ya no hay ninguno real: los diez servicios con cociente tienen el
    // denominador congelado, y la regla se niega a afirmar un movimiento cuyo
    // punto final divide un coste de hoy entre una cantidad de 2019. Se prueba
    // con la misma serie a la que se le devuelve un denominador vivo, para que
    // la regla de divergencia siga ejercitada: si dejara de emitir por otro
    // motivo, esta prueba lo diría.
    const plantilla = indicadores.find((i) => i.id === 'b323-324-320p-coste-unitario')!
    const conDenominadorVivo = {
      ...plantilla,
      id: 'sintetico-vivo',
      declaracion: plantilla.declaracion
        ? {
            ...plantilla.declaracion,
            denominador: { ...plantilla.declaracion.denominador, congelada: false },
          }
        : null,
    }
    const solo = detectarDesviaciones({
      indicadores: [conDenominadorVivo],
      municipales: [],
      anioBase: pub.anioBase,
    })
    const mov = solo.candidatos
      .flatMap((c) => c.desviaciones)
      .find((d) => d.motivo === 'movimiento')!
    expect(mov).toBeDefined()
    expect(mov.veces).toBeGreaterThanOrEqual(UMBRALES.movimientoRelativo)
    expect(mov.detalle).toMatch(/mediana/)

    // Y con el denominador tal cual está en la fuente, NO se propone.
    expect(cand('b323-324-320p-coste-unitario')).toBeUndefined()
    expect(det.rechazos['denominador-congelado']).toBeGreaterThan(0)
  })

  it('no propone nada de un servicio cuya celda actual está bloqueada', () => {
    // Transporte urbano deja de declarar viajeros: la tarjeta no publica
    // cociente, así que no hay cifra que un hallazgo pueda afirmar.
    const transporte = indicadores.find((i) => i.id === 'a4411-440p-coste-unitario')!
    expect(transporte.valor).toBeNull()
    expect(cand('a4411-440p-coste-unitario')).toBeUndefined()
    expect(det.descartes['sin-valor']).toBeGreaterThan(0)
  })

  it('no afirma un movimiento cuya última observación comprobable es vieja', () => {
    // Ninguna entrega real llega hoy a esta regla, así que se prueba con una
    // serie construida: una guarda que nunca se ejecuta no está probada, y
    // «no hay caso» es la excusa con la que este repositorio ya se ha quedado
    // dos veces con una comprobación que no comprobaba.
    const plantilla = indicadores.find((i) => i.id === 'b323-324-320p-coste-unitario')!
    const viejo = {
      ...plantilla,
      id: 'sintetico-viejo',
      serie: plantilla.serie.filter((p) => p.anio <= 2018),
    }
    const solo = detectarDesviaciones({
      indicadores: [viejo],
      municipales: [],
      anioBase: pub.anioBase,
    })
    expect(solo.rechazos['movimiento-antiguo']).toBe(1)
    expect(solo.candidatos.some((c) => c.desviaciones.some((d) => d.motivo === 'movimiento'))).toBe(
      false,
    )
  })

  it('exige banda suficiente antes de hablar de posición', () => {
    for (const c of det.candidatos) {
      const pos = c.desviaciones.find((d) => d.motivo?.startsWith('posicion'))
      if (!pos) continue
      expect(c.pares!.n).toBeGreaterThanOrEqual(UMBRALES.minPares)
    }
  })

  it('el borrador dice las cifras y NO dice «ineficiente»', () => {
    // La disciplina del texto del diseño: el borrador da el cociente, el
    // reparto, el modo de gestión y la n. El juicio es del curador.
    for (const c of det.candidatos) {
      expect(c.borrador.titulo.length).toBeGreaterThan(20)
      expect(c.borrador.cuerpo.length).toBeGreaterThan(120)
      expect(c.borrador.cuerpo).not.toMatch(
        /ineficien|despilfarr|derroch|malgast|escandalos|injustificad/i,
      )
      expect(c.borrador.titulo).not.toMatch(/ineficien|despilfarr|derroch/i)
    }
  })

  it('el borrador escribe los números en español', () => {
    for (const c of det.candidatos) {
      const texto = `${c.borrador.titulo} ${c.borrador.cuerpo}`
      // «2.1 veces» es un punto decimal inglés en una interfaz en español.
      expect(texto).not.toMatch(/\d\.\d\s*(veces|%|días)/)
    }
  })

  it('no pone al mismo nivel un límite legal y una comparación floja', () => {
    // El plazo de pago sale de una norma: no compara con nadie, así que no
    // puede estar sesgado por cómo declare cada ayuntamiento su casilla. Los
    // dos movimientos descansan sobre denominadores que el propio motor ya
    // marca como declarados a la manera de cada casa.
    const pmp = cand('periodo-medio-pago')!
    expect(pmp.fiabilidad).toBe('alta')
    expect(pmp.desviaciones.find((d) => d.motivo === 'umbral-legal')!.fiabilidad).toBe('alta')
    for (const c of det.candidatos) expect(FIABILIDADES).toContain(c.fiabilidad)
    // Los dos candidatos de servicio que sostenían la otra mitad de esta
    // comparación —urbanismo ×4,9 y centros docentes ×3,5— ya no se emiten: su
    // denominador lleva sin remedirse desde 2019. Que la cola de servicios esté
    // vacía es el resultado, no un fallo de la prueba.
    expect(det.candidatos.every((c) => c.familia === 'municipal')).toBe(true)
  })

  it('pone lo firme arriba de la cola', () => {
    const orden = det.candidatos.map((c) => c.fiabilidad)
    const primeraDebil = orden.indexOf('debil')
    if (primeraDebil >= 0) expect(orden.slice(primeraDebil)).not.toContain('alta')
  })

  it('marca cada candidato como pendiente de una firma humana', () => {
    // Primera de las dos capas: el esquema publicado rechaza este campo, de
    // modo que un borrador no puede colarse a publicado por descuido.
    for (const c of det.candidatos) expect(c.requiresHumanApproval).toBe(true)
  })

  it('arrastra las salvedades del indicador en vez de dejarlas atrás', () => {
    const conCaveats = det.candidatos.find((c) => c.caveats.length > 0)
    expect(conCaveats, 'ningún candidato conserva las salvedades del indicador').toBeDefined()
  })

  it('el id es estable entre pasadas y no depende del reloj', () => {
    const otra = detectarDesviaciones({ indicadores, municipales, anioBase: pub.anioBase })
    expect(otra.candidatos.map((c) => c.id)).toEqual(det.candidatos.map((c) => c.id))
    for (const c of det.candidatos) expect(c.id).toMatch(/^cand-[a-z0-9-]+$/)
  })

  it('cambia el id cuando cambia el umbral que lo justificó', () => {
    // Un candidato es una afirmación bajo unos umbrales concretos. Si se
    // aflojan y el mismo indicador vuelve a salir, no es el mismo candidato:
    // el registro tiene que poder distinguirlos.
    for (const c of det.candidatos) expect(c.id).toContain(UMBRALES.version)
  })

  it('se calla del todo cuando le pasan un panel vacío, y lo dice', () => {
    const vacio = detectarDesviaciones({ indicadores: [], municipales: [], anioBase: 2024 })
    expect(vacio.candidatos).toEqual([])
    expect(vacio.evaluados).toBe(0)
    expect(vacio.reglas.posicion).toBe(0)
  })
})

describe('el borrador describe bien contra QUIÉN se compara', () => {
  it('no le cuelga «el mismo modo de gestión» a un indicador municipal', () => {
    // `reglaPosicion` la comparten las dos familias. Para un servicio la frase
    // es cierta —los pares se filtran por modo de gestión antes de calcular
    // ningún percentil—; para el plazo de pago o para los denominadores sin
    // remedir no significa nada, porque ahí no hay servicio ni modo. Nunca
    // llegó a una ficha publicada, pero el borrador es de donde un curador
    // copia.
    const municipales = det.candidatos.filter((c) => c.familia === 'municipal')
    expect(municipales.length).toBeGreaterThan(0)
    let revisados = 0
    for (const c of municipales) {
      for (const d of c.desviaciones.filter((x) => x.motivo?.startsWith('posicion'))) {
        expect(d.detalle).not.toMatch(/prestan el servicio del mismo modo/)
        // Y dice algo, no se queda en «en 51 municipios .»
        expect(d.detalle).toMatch(/en \d[\d.]* municipios \S/)
        revisados++
      }
      expect(c.borrador.cuerpo).not.toMatch(/prestan el servicio del mismo modo/)
    }
    expect(revisados).toBeGreaterThan(0)
  })

  it('sí se la cuelga a un servicio, que es donde es cierta', () => {
    // El control: si la frase desapareciera de las dos familias, la corrección
    // habría borrado información en vez de colocarla.
    const base = indicadores.find((i) => i.pares)!
    const solo = detectarDesviaciones({
      indicadores: [{ ...base, pares: { ...base.pares!, percentil: 97 } }],
      municipales: [],
      anioBase: pub.anioBase,
    })
    const pos = solo.candidatos
      .flatMap((c) => c.desviaciones)
      .find((d) => d.motivo?.startsWith('posicion'))!
    expect(pos.detalle).toMatch(/prestan el servicio del mismo modo/)
  })
})
