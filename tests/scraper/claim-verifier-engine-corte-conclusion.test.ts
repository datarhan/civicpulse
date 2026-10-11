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
 *
 * Y desde el 11-10-2026, sin los números de la lista. El modelo nombra cada
 * candidato por su número en la lista que leyó («[0]», «[5] y [7]», «el
 * candidato 5»), y una retractación no lleva filas de evidencia: bajo la cita,
 * ese número no señala nada. Pasaba en 10 de las 56 frases de la conclusión. Se
 * deja fuera, en un «;» o un «:», la cláusula que lo nombra —la conclusión se
 * queda— y el corte se dice con «…». Cuando el número va en la cláusula misma de
 * la conclusión no hay corte que lo deje fuera, y la frase se queda como estaba.
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

/**
 * Un candidato nombrado por su número en la lista del motor. Escrito aquí y no
 * importado: mira lo que lee quien abre la tarjeta, no lo que busca el código.
 */
const NUMERO_DE_CANDIDATO = /\[\d+\]|\bcandidatos? \d/i

/**
 * Como los de verdad: el razonamiento arranca repitiendo la declaración, y el
 * recorte de siempre se queda en esa frase, sin la conclusión; así que la
 * explicación es la frase de la conclusión que se pone detrás.
 */
const PREAMBULO =
  'La afirmación habla de una obra de reforma en el pabellón municipal que, según el orador, ' +
  'la Generalitat debía haber terminado antes del verano pasado, con un dinero que el Ayuntamiento ' +
  'habría adelantado de sus propios fondos y que todavía no le ha devuelto.'

const explicacionTras = async (conclusion: string) =>
  (await juzgar(FILAS[0].claim, FILAS[0].candidatos, comoAquelDia(`${PREAMBULO} ${conclusion}`)))!
    .verification.summary

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
    // Leídas a mano en el razonamiento de cada una: la frase donde concluye, sin
    // la cláusula que nombra un candidato por su número de la lista.
    const ESPERADA: Record<string, string> = {
      '15uvjew-012-afi-83a0e3':
        'Ningún candidato respalda la afirmación; la fuerza del respaldo es nula.',
      '15uvjew-148-afi-fbf71b': 'Ningún candidato respalda la afirmación…',
      '15uvjew-148-afi-755647':
        'Conclusión: ningún candidato respalda genuinamente la afirmación; respaldo nulo o muy débil, no verificable con estos registros.',
      '15uvjew-182-cit-3a11cb': 'Ningún candidato respalda genuinamente la afirmación…',
      '15uvjew-193-cit-446421': 'Ningún candidato respalda genuinamente la afirmación…',
      // La conclusión va detrás del paréntesis que nombra [0] y [1]: el corte se
      // queda con lo que la sigue, y lo dice con «…» delante.
      'rx4hb4-006-cit-13b19d':
        '…no hay respaldo genuino del acto de información pública ni de valores concretos.',
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
      // Un corte se dice con «…»: detrás, o delante si lo cortado es el principio.
      const cuerpo = s.replace(/^…/, '').replace(/…$/, '')
      const razonamiento = plano(f.razonamiento)
      const donde = razonamiento.indexOf(cuerpo)
      expect(donde, f.id).toBeGreaterThanOrEqual(0)
      // Junto a un corte no queda una letra: las palabras de los bordes, enteras.
      if (s.startsWith('…')) expect(razonamiento[donde - 1], f.id).toMatch(/[^\p{L}\p{N}]/u)
      if (s.endsWith('…'))
        expect(razonamiento[donde + cuerpo.length], f.id).toMatch(/[^\p{L}\p{N}]/u)
      else expect(s, f.id).toMatch(/[.!?]["»”)]*$/)
    }
  })

  it('no nombra un candidato por su número de la lista, que la tarjeta no enseña', async () => {
    // Una retractación no lleva filas de evidencia: bajo la cita, «[0]» no señala
    // nada. Se queda sólo la que lo nombra en la cláusula misma de la conclusión
    // («respaldo nulo o, como mucho, contexto muy débil (el [0] muestra…)»): no
    // hay corte que lo deje fuera.
    const nombran: string[] = []
    for (const f of FILAS) {
      const r = await juzgar(f.claim, f.candidatos, comoAquelDia(f.razonamiento))
      if (NUMERO_DE_CANDIDATO.test(r!.verification.summary)) nombran.push(f.id)
    }
    expect(nombran).toEqual(['1qi8axv-028-acu-7ac1a4'])
  })

  it('corta tras la cláusula de la conclusión, no en el primer «:» de la frase', async () => {
    // Una frase del motor (engine-reason-v2, de su caché): «Conclusión:» es un
    // rótulo y la conclusión es lo que lo sigue. Cortar en el primer «:» dejaría
    // el rótulo solo.
    const s = await explicacionTras(
      'Conclusión: ningún candidato respalda genuinamente la afirmación; [0] es a lo sumo contexto relacionado, no verificación.',
    )
    expect(s).toBe('Conclusión: ningún candidato respalda genuinamente la afirmación…')
  })

  it('tampoco nombra un candidato por su número sin corchetes («el candidato 5»)', async () => {
    // Otra frase del motor, de su caché: nueve de sus conclusiones lo escriben así.
    const s = await explicacionTras(
      'Ningún candidato respalda genuinamente la afirmación; en el mejor de los casos el candidato 5 es una coincidencia temática débil (calderas), pero sin cifra ni fecha que encajen.',
    )
    expect(s).toBe('Ningún candidato respalda genuinamente la afirmación…')
  })

  it('si la cláusula de la conclusión nombra un candidato, no se corta nada: la frase se queda entera', async () => {
    // Otra frase del motor, de su caché. La conclusión («no veo respaldo genuino»)
    // va en la cláusula que nombra [1]: ningún corte deja fuera el número, y
    // quitar sólo la cláusula de [0] y [2] publicaría un trozo que lo sigue
    // nombrando.
    const conclusion =
      'Los [0] y [2] se refieren a la Escuela Municipal de Música y Conservatorio, y el [3] a la Botaya, por lo que son entidades/obras distintas; en conjunto, no veo respaldo genuino y solo una coincidencia temática muy débil en [1].'
    expect(await explicacionTras(conclusion)).toBe(conclusion)
  })

  it('un «:» dentro de un paréntesis no es un corte', async () => {
    // El número va en la cláusula de la conclusión, tras un «:» que está dentro
    // del paréntesis: cortar ahí dejaría el paréntesis abierto. No hay corte que
    // lo deje fuera, y la frase se queda como estaba.
    const conclusion =
      'Ningún candidato respalda la afirmación (por ejemplo: el [0], de 2019); la cifra no aparece en ninguno.'
    expect(await explicacionTras(conclusion)).toBe(conclusion)
  })

  it('el «:» de una hora no es un corte', async () => {
    const conclusion =
      'Ningún candidato respalda la afirmación sobre el pleno de las 10:30 del [0]; la cifra no aparece en ninguno.'
    expect(await explicacionTras(conclusion)).toBe(conclusion)
  })

  it('si el recorte de siempre ya lleva la conclusión —el razonamiento cabe entero—, se publica ése', async () => {
    // Entero, el razonamiento dice por qué no hay respaldo; su última frase sola, no.
    const razonamiento =
      'La afirmación dice que el polideportivo se reformó en 2024. ' +
      'El candidato [0] es el contrato de limpieza del polideportivo, de 2023, y no habla de ninguna reforma. ' +
      'Ningún candidato respalda la afirmación.'
    expect(razonamiento.length).toBeLessThanOrEqual(RESUMEN_MAX)
    const r = await juzgar(FILAS[0].claim, FILAS[0].candidatos, comoAquelDia(razonamiento))
    expect(r!.sinDatosPorque).toBe('razonamiento')
    expect(r!.verification.summary).toBe(razonamiento)
  })

  it('una conclusión más larga que el tope se corta tras una palabra entera y lo dice con «…»', async () => {
    const larga =
      'Ningún candidato respalda genuinamente la afirmación: ' +
      'los registros cotejados tratan del mantenimiento ordinario de los edificios municipales y del alumbrado ' +
      'de los polígonos industriales del término, con importes y fechas que no guardan relación con la obra ' +
      'que se menciona en el pleno ni con el plazo que el orador atribuye a la Generalitat para terminarla antes del verano.'
    expect(larga.length).toBeGreaterThan(RESUMEN_MAX)
    // Como los de verdad: arranca repitiendo la declaración, y el recorte de
    // siempre se queda en esa frase, sin la conclusión.
    const razonamiento =
      'La afirmación habla de una obra de reforma en el pabellón municipal que, según el orador, ' +
      `la Generalitat debía haber terminado antes del verano pasado. ${larga}`
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
