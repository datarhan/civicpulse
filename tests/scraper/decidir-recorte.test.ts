import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decidirRecorte, esRecorteDe } from '../../src/scraper/decision-del-motor'
import { RESUMEN_MAX } from '../../src/scraper/claim-verifier-engine'
import type { OverlayEntry } from '../../src/scraper/verified-merge'

/**
 * El motor de veredictos guardaba su explicación como `reasoning.slice(0, 300)`,
 * y la tarjeta de cada declaración la pinta tal cual. Medido el 04-10-2026: 858
 * retractaciones del motor publicadas a media frase (506 servidas), todas de la
 * pasada del 02-08-2026. Su razonamiento entero sigue en `.llm-cache`, bajo la
 * clave del prompt de entonces (`engine-reason-v1`), y `--recortar` las corta en
 * la última frase entera sin llamar a ningún modelo.
 *
 * Es una escritura automática de prosa publicada (regla 4 de
 * docs/DATA_INTEGRITY.md), y se admite porque sólo QUITA el trozo colgante. Por
 * eso cada recorte se prueba dos veces: que el razonamiento es el que produjo lo
 * publicado (sus 300 primeros caracteres SON lo publicado), y que lo nuevo es un
 * prefijo estricto de lo viejo. Nada más de la entrada cambia.
 *
 * Las filas son de verdad (tests/fixtures/recorte-del-motor_2026-10-04.json, su
 * `_procedencia` dice de dónde sale cada una).
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/recorte-del-motor_2026-10-04.json'), 'utf8'),
)
type Caso = 'frase' | 'elipsis' | 'cifra' | 'charla' | 'huerfana' | 'rederivada'
const ID = F.ids as Record<Caso, string>
const entrada = (caso: Caso): OverlayEntry => F.overlay.entries[ID[caso]]
const v1 = (caso: Caso): string => F.razonamientos['engine-reason-v1'][ID[caso]]
const v2 = (caso: Caso): string | undefined => F.razonamientos['engine-reason-v2'][ID[caso]]
/** Lo que el guion le pasa: lo que haya en la caché, la versión actual primero. */
const enCache = (caso: Caso): string[] => [v2(caso), v1(caso)].filter((r) => r !== undefined)
const decidir = (caso: Caso, razonamientos = enCache(caso), e = entrada(caso)) =>
  decidirRecorte({ claimId: ID[caso], entrada: e, razonamientos })

/** El prefijo del motivo de las retractaciones del 02-08: el motivo es él + el resumen. */
const MOTIVO_DEL_02_08 = 'verdict-engine (claude-code) re-judged parcial→sin-datos: '

describe('decidirRecorte, sobre filas reales', () => {
  it('recorta en la última frase entera, y sólo cambia el resumen y el motivo que lo lleva', () => {
    const d = decidir('frase')
    expect(d.accion).toBe('recortar')
    if (d.accion !== 'recortar') return
    const viejo = entrada('frase')
    expect(viejo.verification.summary.endsWith('Concluyo que no hay ')).toBe(true)
    expect(d.resumen).toBe(
      'Analicé el único candidato disponible: un contrato de servicios TI (Portal del Empleado) por ' +
        '€25.794, sin relación temática ni de sujeto con la expropiación urbanística de €32.000 ' +
        'mencionada en la afirmación. No hay coincidencia de importe exacto, sujeto ni naturaleza del gasto.',
    )
    expect(Object.keys(d.entrada).sort()).toEqual(
      ['claimId', 'editor', 'reason', 'source', 'verification'].sort(),
    )
    expect(d.entrada.claimId).toBe(ID.frase)
    // Veredicto, evidencia, corpus, pasada y confianza: tal cual.
    expect(d.entrada.verification).toEqual({ ...viejo.verification, summary: d.resumen })
    expect(d.entrada.source).toBe(viejo.source)
    // El rótulo es de otra tarea (la de las 454 de gpt-4o-mini): aquí no se toca.
    expect(d.entrada.editor).toBe(viejo.editor)
    expect(viejo.reason).toBe(MOTIVO_DEL_02_08 + viejo.verification.summary)
    expect(d.entrada.reason).toBe(MOTIVO_DEL_02_08 + d.resumen)
  })

  it('sin una frase entera que quepa, corta tras una palabra entera y lo dice con «…»', () => {
    const d = decidir('elipsis')
    expect(d.accion).toBe('recortar')
    if (d.accion !== 'recortar') return
    expect(entrada('elipsis').verification.summary.endsWith('flexibilidad y aprobación por')).toBe(
      true,
    )
    expect(d.resumen).toBe(
      'Ninguno de los candidatos presenta un respaldo genuino a la afirmación. Aunque varios ' +
        'contratos mencionan aspectos relacionados con la modificación de contratos o la protección ' +
        'del medio ambiente, no hay evidencia concreta que vincule directamente la afirmación sobre ' +
        'la flexibilidad y aprobación…',
    )
  })

  it('el punto de una cifra no acaba la frase: lo publicado decía «€37.» de €37.960', () => {
    expect(entrada('cifra').verification.summary.endsWith('por un importe de €37.')).toBe(true)
    expect(v1('cifra').slice(300, 304)).toBe('960.')
    const d = decidir('cifra')
    expect(d.accion).toBe('recortar')
    if (d.accion !== 'recortar') return
    expect(d.resumen.endsWith('por un importe de…')).toBe(true)
    expect(d.resumen).not.toContain('€37')
  })

  it('una huérfana se recorta igual: el recorte no necesita su declaración', () => {
    const d = decidir('huerfana')
    expect(d.accion).toBe('recortar')
    if (d.accion !== 'recortar') return
    expect(d.resumen).toBe(
      'Análisis completado: ningún candidato respalda genuinamente la afirmación. Los tenders ' +
        '[0]-[5] son de mantenimiento IT sin relación temática.',
    )
  })

  it('lee el razonamiento que prueba su contenido, no el más nuevo', () => {
    // La fila de la charla tiene dos en caché: el de v2 (#233, 04-10) no es el
    // que se publicó; el de v1 sí. Que acabe en «charla» y no en «no-coincide»
    // dice que eligió el v1.
    expect(v2('charla')).toBeDefined()
    expect(decidir('charla')).toEqual({ accion: 'dejar', porque: 'charla' })
    expect(decidir('charla', [v2('charla')!])).toEqual({ accion: 'dejar', porque: 'no-coincide' })
    // Y con uno que recorta: el bueno detrás de otro cualquiera.
    const d = decidir('frase', ['Otro razonamiento que no es el publicado.', v1('frase')])
    expect(d.accion).toBe('recortar')
  })

  it('la charla de la tarea no se recorta: el overlay la rechazaría, y la tarjeta ya la retira', () => {
    expect(entrada('charla').verification.summary.startsWith('Task completed:')).toBe(true)
    expect(decidir('charla')).toEqual({ accion: 'dejar', porque: 'charla' })
  })

  it('una explicación re-derivada no vuelve a un razonamiento viejo', () => {
    // #233 la reescribió desde v2 con `recortarResumen`: no es el corte de
    // ningún razonamiento, ni del v1 de agosto ni del v2 que la produjo.
    expect(decidir('rederivada')).toEqual({ accion: 'dejar', porque: 'no-coincide' })
  })

  it('sin razonamiento en la caché no hay nada con que probarla', () => {
    expect(decidir('frase', [])).toEqual({ accion: 'dejar', porque: 'sin-razonamiento' })
  })

  it('sólo recorta retractaciones del motor', () => {
    // Directo y no con `decidir`: su parámetro por defecto tomaría `undefined`
    // por «la entrada de verdad».
    expect(
      decidirRecorte({ claimId: ID.frase, entrada: undefined, razonamientos: enCache('frase') }),
    ).toEqual({ accion: 'dejar', porque: 'no-es-del-motor' })
    const deCurador = { ...entrada('frase'), source: 'curator-downgrade' } as OverlayEntry
    expect(decidir('frase', enCache('frase'), deCurador)).toEqual({
      accion: 'dejar',
      porque: 'no-es-del-motor',
    })
  })

  it('el motivo tiene que acabar en el resumen publicado: si no, no se sabe qué cambiar', () => {
    const viejo = entrada('frase')
    const cortado = { ...viejo, reason: viejo.reason!.slice(0, 200) }
    expect(decidir('frase', enCache('frase'), cortado)).toEqual({
      accion: 'dejar',
      porque: 'motivo-sin-el-resumen',
    })
  })

  it('cada recorte del fixture cumple el contrato, y son los cuatro que tienen que ser', () => {
    const recortadas: string[] = []
    for (const caso of Object.keys(ID) as Caso[]) {
      const d = decidir(caso)
      if (d.accion !== 'recortar') continue
      recortadas.push(caso)
      expect(d.resumen.length, caso).toBeLessThanOrEqual(RESUMEN_MAX)
      expect(d.resumen, caso).toMatch(/([.!?]["»”)]*|…)$/)
      expect(esRecorteDe(d.resumen, entrada(caso).verification.summary), caso).toBe(true)
    }
    expect(recortadas.sort()).toEqual(['cifra', 'elipsis', 'frase', 'huerfana'])
  })
})

/** Una entrada del motor hecha a mano, para los bordes que no da ninguna fila real. */
function entradaCon(summary: string): OverlayEntry {
  return {
    verification: {
      claimId: 'prueba-001-afi-000000',
      verdict: 'sin-datos',
      summary,
      evidence: [],
      checkedAgainst: [],
      derivedBy: ['verdict-engine'],
      confidence: 0.2,
    },
    source: 'verdict-engine',
    reason: MOTIVO_DEL_02_08 + summary,
    editor: 'verdict-engine:claude-code',
    appliedAt: '2026-08-02T00:00:00.000Z',
  }
}
const decidirCon = (razonamiento: string, summary = razonamiento.slice(0, RESUMEN_MAX)) =>
  decidirRecorte({
    claimId: 'prueba-001-afi-000000',
    entrada: entradaCon(summary),
    razonamientos: [razonamiento],
  })

describe('decidirRecorte, los bordes', () => {
  it('un razonamiento que cupo entero no tiene nada que recortar', () => {
    const corto = 'El único candidato es un contrato menor de 2018 que no dice nada de lo afirmado.'
    expect(decidirCon(corto)).toEqual({ accion: 'dejar', porque: 'nada-que-recortar' })
  })

  it('nunca publica palabras que no estaban publicadas', () => {
    // Con los espacios repetidos, el razonamiento mide más de 300 y su versión
    // normalizada menos: `recortarResumen` lo devolvería entero, con las
    // palabras que el corte de agosto dejó fuera. Eso ya no es quitar el trozo
    // colgante, es escribir prosa nueva.
    const espaciado = Array.from({ length: 34 }, () => 'palabra').join('    ') + '.'
    expect(espaciado.length).toBeGreaterThan(RESUMEN_MAX)
    expect(espaciado.replace(/\s+/g, ' ').length).toBeLessThan(RESUMEN_MAX)
    expect(decidirCon(espaciado)).toEqual({ accion: 'dejar', porque: 'no-es-un-recorte' })
  })
})

describe('esRecorteDe', () => {
  it('lo nuevo es un prefijo ESTRICTO de lo publicado', () => {
    expect(esRecorteDe('Una frase.', 'Una frase. Y otra que se cor')).toBe(true)
    expect(esRecorteDe('Una frase.', 'Una frase.')).toBe(false)
    expect(esRecorteDe('Una frase. Y otra que se cortaba.', 'Una frase. Y otra que se cor')).toBe(
      false,
    )
    expect(esRecorteDe('Otra frase.', 'Una frase. Y otra que se cor')).toBe(false)
  })

  it('la marca «…» no cuenta como texto, y lo que va delante sí', () => {
    expect(esRecorteDe('una palabra entera y media…', 'una palabra entera y media pala')).toBe(true)
    expect(esRecorteDe('una palabra entera y otra…', 'una palabra entera y media pala')).toBe(false)
    expect(esRecorteDe('…', 'una palabra entera')).toBe(false)
    expect(esRecorteDe('', 'una palabra entera')).toBe(false)
  })

  it('compara con los espacios de lo publicado normalizados, como los normaliza el recorte', () => {
    expect(esRecorteDe('Una frase. Otra.', 'Una  frase.\nOtra. Y la que se cor')).toBe(true)
  })
})
