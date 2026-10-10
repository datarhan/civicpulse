import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  verifyClaimWithEngine,
  RESUMEN_MAX,
  type EngineDeps,
  type EngineExtract,
} from '../../src/scraper/claim-verifier-engine'
import { conclusionSinRespaldo } from '../../src/scraper/conclusion-sin-respaldo'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'
import type { CandidateShortlist } from '../../src/scraper/claim-verifier'

/**
 * La explicación que publica una retractación del motor cuando el razonamiento
 * concluye que nada respalda la declaración (salida `razonamiento`).
 *
 * Se guardaba `recortarResumen(razonamiento)`: las primeras frases enteras que
 * caben en el tope. Pero el razonamiento empieza siempre repitiendo la
 * declaración y concluye al final, así que la tarjeta enseñaba bajo la cita una
 * frase que la repite —y que puede leerse como si el motor la afirmara— sin decir
 * por qué se retracta. Es lo que dejó «Explicación retirada» a c8kr44-088, -089,
 * -114 y -117 (#249).
 *
 * Medido el 10-10-2026 sobre los 56 razonamientos «sin respaldo» de esa noche
 * —el eval del oro y `verify:pleno-claims:engine --base --dry-run`—
 * (tests/fixtures/motor-corte-conclusion_2026-10-10.json): el recorte llevaba la
 * conclusión en 5; en el `--base`, 7 de las 8 retractaciones habrían publicado
 * sólo la repetición de la declaración. La frase en que el modelo concluye cabe
 * en el tope en las 56.
 */
const F = JSON.parse(
  readFileSync(resolve('tests/fixtures/motor-corte-conclusion_2026-10-10.json'), 'utf8'),
)
type Fila = {
  id: string
  origen: 'eval-del-oro' | 'base-en-seco'
  claim: PlenoClaim
  candidatos: CandidateShortlist[]
  razonamiento: string
}
const FILAS = F.filas as Fila[]

/** El razonamiento de aquel día. Concluye «sin respaldo»: la extracción no se pide. */
function comoAquelDia(razonamiento: string): EngineDeps {
  return {
    reasonFn: async () => razonamiento,
    extractFn: async () => {
      throw new Error('la extracción no se pide cuando el razonamiento concluye «sin respaldo»')
    },
  }
}

const juzgar = (claim: PlenoClaim, candidatos: CandidateShortlist[], deps: EngineDeps) =>
  verifyClaimWithEngine({ claim, candidates: candidatos }, deps)

const plano = (t: string) => t.replace(/\s+/g, ' ').trim()

describe('la explicación de un sin-datos que concluye el razonamiento', () => {
  it('lleva la conclusión del modelo, en los 56 razonamientos de la noche del 10-10', async () => {
    expect(FILAS).toHaveLength(56)
    const sinConclusion: string[] = []
    for (const f of FILAS) {
      const r = await juzgar(f.claim, f.candidatos, comoAquelDia(f.razonamiento))
      expect(r!.verification.verdict, f.id).toBe('sin-datos')
      expect(r!.sinDatosPorque, f.id).toBe('razonamiento')
      // La misma clase que decidió la salida tiene que leerse en lo publicado.
      if (conclusionSinRespaldo(r!.verification.summary) !== conclusionSinRespaldo(f.razonamiento))
        sinConclusion.push(f.id)
    }
    expect(sinConclusion, 'publican la declaración repetida, no por qué se retracta').toEqual([])
  })

  it('las ocho retractaciones del --base en seco publican la frase de la conclusión', async () => {
    // Leídas a mano en el razonamiento de cada una: la frase donde concluye.
    const ESPERADA: Record<string, string> = {
      '15uvjew-012-afi-83a0e3':
        'Ningún candidato respalda la afirmación; la fuerza del respaldo es nula.',
      '15uvjew-148-afi-fbf71b':
        'Ningún candidato respalda la afirmación; como mucho hay una coincidencia numérica fortuita en [0], sin fuerza probatoria.',
      '15uvjew-148-afi-755647':
        'Conclusión: ningún candidato respalda genuinamente la afirmación; respaldo nulo o muy débil, no verificable con estos registros.',
      '15uvjew-182-cit-3a11cb':
        'Ningún candidato respalda genuinamente la afirmación: el [0] sólo es contexto temático relacionado, con respaldo muy débil o nulo, y la parte verificable (aumento del presupuesto, conversación con José Manuel) no tiene datos que la confirmen.',
      '15uvjew-193-cit-446421':
        'Ningún candidato respalda genuinamente la afirmación; a lo sumo [0] aporta contexto muy débil de que el plan existe.',
      'rx4hb4-006-cit-13b19d':
        'Conclusión: respaldo como mucho contextual y débil (el [0] por mencionar Santa Rosa II, el [1] por el plan de reforma interior); no hay respaldo genuino del acto de información pública ni de valores concretos.',
      'rx4hb4-136-cit-2639de':
        'Ningún candidato respalda la afirmación; la fuerza del respaldo es nula.',
      '19gax3o-046-cit-336cb3':
        'Ningún candidato respalda genuinamente la afirmación; como mucho hay un contexto débil y tangencial, y la afirmación es una opinión o testimonio no verificable con estos registros.',
    }
    const base = FILAS.filter((f) => f.origen === 'base-en-seco')
    expect(base.map((f) => f.id).sort()).toEqual(Object.keys(ESPERADA).sort())
    for (const f of base) {
      const r = await juzgar(f.claim, f.candidatos, comoAquelDia(f.razonamiento))
      expect(r!.verification.summary, f.id).toBe(ESPERADA[f.id])
    }
  })

  it('no reescribe nada: es un trozo seguido del razonamiento, sin pasar del tope ni partir una palabra', async () => {
    for (const f of FILAS) {
      const r = await juzgar(f.claim, f.candidatos, comoAquelDia(f.razonamiento))
      const s = r!.verification.summary
      expect(s.length, f.id).toBeLessThanOrEqual(RESUMEN_MAX)
      const cuerpo = s.endsWith('…') ? s.slice(0, -1) : s
      expect(plano(f.razonamiento).includes(cuerpo), f.id).toBe(true)
      if (!s.endsWith('…')) expect(s, f.id).toMatch(/[.!?]["»”)]*$/)
    }
  })

  it('una conclusión más larga que el tope se corta tras una palabra entera y lo dice con «…»', async () => {
    const larga =
      'Ningún candidato respalda genuinamente la afirmación: ' +
      'los registros cotejados tratan del mantenimiento ordinario de los edificios municipales y del alumbrado ' +
      'de los polígonos industriales del término, con importes y fechas que no guardan relación con la obra ' +
      'que se menciona en el pleno ni con el plazo que el orador atribuye a la Generalitat para terminarla antes del verano.'
    expect(larga.length).toBeGreaterThan(RESUMEN_MAX)
    const razonamiento = `La afirmación habla de una obra. ${larga}`
    const r = await juzgar(FILAS[0].claim, FILAS[0].candidatos, comoAquelDia(razonamiento))
    const s = r!.verification.summary
    expect(s.length).toBeLessThanOrEqual(RESUMEN_MAX)
    expect(s.startsWith('Ningún candidato respalda genuinamente la afirmación:')).toBe(true)
    expect(s.endsWith('…')).toBe(true)
    const cuerpo = s.slice(0, -1)
    expect(larga.startsWith(cuerpo)).toBe(true)
    // Tras lo publicado no sigue una letra: la última palabra está entera.
    expect(larga[cuerpo.length]).toMatch(/[^\p{L}\p{N}]/u)
  })

  it('cuando decide la extracción, la explicación sigue siendo el arranque recortado', async () => {
    // Sin conclusión «sin respaldo» en el razonamiento: decide la extracción.
    const razonamiento =
      'La afirmación dice que el contrato de la piscina municipal se adjudicó en 2023 por unos 40.000 euros. ' +
      'El candidato [0] es el contrato de mantenimiento de la piscina municipal, adjudicado en 2023 por 27.538,20 euros. ' +
      'La cifra no coincide con la que se da en el pleno, y el objeto del contrato es el mantenimiento, no la gestión del servicio.'
    expect(conclusionSinRespaldo(razonamiento)).toBeNull()
    const sinDatos: EngineExtract = { verdict: 'sin-datos', cites: [] }
    const r = await juzgar(FILAS[0].claim, FILAS[0].candidatos, {
      reasonFn: async () => razonamiento,
      extractFn: async () => sinDatos,
    })
    expect(r!.sinDatosPorque).toBe('extraccion')
    expect(r!.verification.summary).toBe(
      'La afirmación dice que el contrato de la piscina municipal se adjudicó en 2023 por unos 40.000 euros. ' +
        'El candidato [0] es el contrato de mantenimiento de la piscina municipal, adjudicado en 2023 por 27.538,20 euros.',
    )
  })
})
