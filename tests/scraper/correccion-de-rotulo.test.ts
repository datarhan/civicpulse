/**
 * Corregir el rótulo de una retractación del motor con lo que dice la caché.
 *
 * El 02-08-2026 el motor escribió como `verdict-engine:claude-code` 457
 * retractaciones que había contestado gpt-4o-mini, el respaldo de pago de la
 * cadena (la causa, cerrada en la PR #248: tests/llm/procedencia-del-respaldo.test.ts).
 * El veredicto y la explicación se quedan; lo que se corrige es a nombre de
 * quién están, y sólo con prueba: quién escribió en `.llm-cache` el razonamiento
 * cuyo corte es el resumen publicado, y su extracción. Lo que no se prueba no se
 * toca, y cada corrección deja su registro en la entrada.
 *
 * Las filas son de verdad (tests/fixtures/rotulo-del-motor_2026-10-05.json),
 * con la procedencia que se midió; la caché es una tabla en memoria.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { zodToJsonSchema } from '../../src/llm/schemas'
import {
  CLAVES_DE_LAS_PASADAS,
  corregirRotulos,
  decidirCorreccionDeRotulo,
  type DecisionDeRotulo,
  type LectorDeCache,
} from '../../src/scraper/correccion-de-rotulo'
import { validateOverlay, type Overlay, type OverlayEntry } from '../../src/scraper/verified-merge'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/rotulo-del-motor_2026-10-05.json'), 'utf8'),
)
const GPT = '19gax3o-142-afi-f3d4db'
const MIXTA = '19gax3o-132-acu-a3b10d'
const CLAUDE = '1237hbp-030-cit-eea251'
const entrada = (id: string): OverlayEntry => structuredClone(FIXTURE.entries[id])

interface Escrito {
  backend: string
  model: string
  result: unknown
}

/**
 * La caché como la dejó la pasada de agosto: todo bajo la clave de claude-code,
 * con la procedencia medida en cada entrada. El razonamiento es el resumen
 * publicado (su corte); la extracción cuelga de ese razonamiento.
 */
function cacheDeAgosto(ids: string[]): { leer: LectorDeCache; pedidas: string[] } {
  const tabla = new Map<string, Escrito>()
  for (const id of ids) {
    const p = FIXTURE.procedencia[id]
    const reasoning = FIXTURE.entries[id].verification.summary
    tabla.set(`${p.razonar.version}|${JSON.stringify({ claimId: id })}`, {
      backend: p.razonar.backend,
      model: p.razonar.model,
      result: { reasoning },
    })
    tabla.set(`engine-extract-v1|${JSON.stringify({ claimId: id, reasoning })}`, {
      backend: p.extraer.backend,
      model: p.extraer.model,
      result: { verdict: 'sin-datos', cites: [] },
    })
  }
  const pedidas: string[] = []
  const leer: LectorDeCache = (primario, q) => {
    pedidas.push(`${primario.backend}:${q.promptVersion}`)
    // Sólo hay entradas bajo la clave de claude-code, como en agosto.
    if (primario.backend !== 'claude-code' || primario.claudeCodeModel !== 'sonnet') return null
    return (tabla.get(`${q.promptVersion}|${JSON.stringify(q.input)}`) as never) ?? null
  }
  return { leer, pedidas }
}

const decidir = (id: string, leer: LectorDeCache, e: OverlayEntry | undefined = entrada(id)) =>
  decidirCorreccionDeRotulo({ claimId: id, entrada: e, leer })

describe('decidirCorreccionDeRotulo · el rótulo que prueba la caché', () => {
  it('lo que razonó y decidió gpt-4o-mini se rotula gpt-4o-mini', () => {
    const { leer, pedidas } = cacheDeAgosto([GPT])
    expect(decidir(GPT, leer)).toEqual({
      accion: 'corregir',
      claimId: GPT,
      antes: 'verdict-engine:claude-code',
      rotulo: 'verdict-engine:gpt-4o-mini',
      razonar: { backend: 'openai', model: 'gpt-4o-mini', version: 'engine-reason-v1' },
      extraer: { backend: 'openai', model: 'gpt-4o-mini', version: 'engine-extract-v1' },
    })
    // Leyó bajo la clave del primario que decía el rótulo, sin llamar a nadie.
    expect(pedidas.every((p) => p.startsWith('claude-code:'))).toBe(true)
  })

  it('la mixta nombra a los dos, el que razonó primero', () => {
    const { leer } = cacheDeAgosto([MIXTA])
    expect(decidir(MIXTA, leer)).toMatchObject({
      accion: 'corregir',
      rotulo: 'verdict-engine:claude-code+gpt-4o-mini',
      razonar: { backend: 'claude-code', model: 'claude-code:sonnet' },
      extraer: { backend: 'openai', model: 'gpt-4o-mini' },
    })
  })

  it('lo que escribió claude-code ya está bien rotulado: no se toca', () => {
    const { leer } = cacheDeAgosto([CLAUDE])
    expect(decidir(CLAUDE, leer)).toEqual({ accion: 'dejar', porque: 'ya-es-ese' })
  })

  it('sin un razonamiento cuyo corte sea lo publicado, no hay prueba', () => {
    const { leer } = cacheDeAgosto([GPT])
    const otra = entrada(GPT)
    otra.verification = {
      ...otra.verification,
      summary: 'Otra explicación que no es ningún corte.',
    }
    expect(decidir(GPT, leer, otra)).toEqual({ accion: 'dejar', porque: 'sin-procedencia' })
  })

  it('con el razonamiento y sin su extracción, tampoco: no se sabe quién decidió', () => {
    const { leer: completa } = cacheDeAgosto([GPT])
    const sinExtraccion: LectorDeCache = (p, q) =>
      q.promptVersion === 'engine-extract-v1' ? null : completa(p, q)
    expect(decidir(GPT, sinExtraccion)).toEqual({ accion: 'dejar', porque: 'sin-procedencia' })
  })

  it('sólo corrige retractaciones del motor con un rótulo que sabe leer', () => {
    const { leer } = cacheDeAgosto([GPT])
    const curador = { ...entrada(GPT), source: 'curator-downgrade' as const }
    expect(decidir(GPT, leer, curador)).toEqual({ accion: 'dejar', porque: 'no-es-del-motor' })
    // Directa: con `decidir`, un `undefined` explícito toma el valor por defecto.
    expect(decidirCorreccionDeRotulo({ claimId: GPT, entrada: undefined, leer })).toEqual({
      accion: 'dejar',
      porque: 'no-es-del-motor',
    })
    const rara = { ...entrada(GPT), editor: 'verdict-engine' }
    expect(decidir(GPT, leer, rara)).toEqual({ accion: 'dejar', porque: 'rotulo-desconocido' })
  })
})

const FIRMA = {
  motivo:
    'La pasada del 02-08-2026 cayó al respaldo de pago y el guion rotulaba con lo configurado (PR #248).',
  editor: 'civicpulse-curator',
  stamp: '2026-10-06T09:00:00.000Z',
}

function overlayConLasTres(): Overlay {
  return {
    version: 1,
    generatedAt: '2026-10-05T07:00:00.000Z',
    entries: { [GPT]: entrada(GPT), [MIXTA]: entrada(MIXTA), [CLAUDE]: entrada(CLAUDE) },
  }
}

function correccionesDeAgosto(): Extract<DecisionDeRotulo, { accion: 'corregir' }>[] {
  const { leer } = cacheDeAgosto([GPT, MIXTA, CLAUDE])
  return [GPT, MIXTA, CLAUDE]
    .map((id) => decidir(id, leer))
    .filter((d): d is Extract<DecisionDeRotulo, { accion: 'corregir' }> => d.accion === 'corregir')
}

describe('corregirRotulos · cambia el nombre y deja constancia, nada más', () => {
  it('reescribe el rótulo y el prefijo del motivo, y apunta la corrección', () => {
    const antes = overlayConLasTres()
    const { overlay } = corregirRotulos(antes, correccionesDeAgosto(), FIRMA)

    const gpt = overlay.entries[GPT]
    expect(gpt.editor).toBe('verdict-engine:gpt-4o-mini')
    expect(gpt.reason).toBe(
      antes.entries[GPT].reason!.replace(
        'verdict-engine (claude-code)',
        'verdict-engine (gpt-4o-mini)',
      ),
    )
    expect(gpt.labelCorrections).toEqual([
      {
        previous: 'verdict-engine:claude-code',
        reason:
          'Razonó y decidió gpt-4o-mini, según .llm-cache (engine-reason-v1 y engine-extract-v1). ' +
          FIRMA.motivo,
        editor: 'civicpulse-curator',
        correctedAt: FIRMA.stamp,
      },
    ])

    const mixta = overlay.entries[MIXTA]
    expect(mixta.editor).toBe('verdict-engine:claude-code+gpt-4o-mini')
    expect(mixta.reason!.startsWith('verdict-engine (claude-code+gpt-4o-mini) re-judged ')).toBe(
      true,
    )
    expect(mixta.labelCorrections![0].reason).toMatch(
      /^Razonó claude-code y decidió gpt-4o-mini, según \.llm-cache/,
    )
  })

  it('no toca el veredicto, la explicación, la fecha de la decisión ni las demás filas', () => {
    const antes = overlayConLasTres()
    const { overlay } = corregirRotulos(antes, correccionesDeAgosto(), FIRMA)
    for (const id of [GPT, MIXTA]) {
      expect(overlay.entries[id].verification).toEqual(antes.entries[id].verification)
      expect(overlay.entries[id].appliedAt).toBe(antes.entries[id].appliedAt)
      expect(overlay.entries[id].source).toBe('verdict-engine')
    }
    expect(overlay.entries[CLAUDE]).toEqual(antes.entries[CLAUDE])
    expect(antes.entries[GPT].editor, 'mutó la entrada de entrada').toBe(
      'verdict-engine:claude-code',
    )
  })

  it('devuelve el antes y el después de cada fila, para enseñarlos sin escribir', () => {
    const { filas } = corregirRotulos(overlayConLasTres(), correccionesDeAgosto(), FIRMA)
    expect(filas.map((f) => [f.claimId, f.antes.editor, f.despues.editor])).toEqual([
      [GPT, 'verdict-engine:claude-code', 'verdict-engine:gpt-4o-mini'],
      [MIXTA, 'verdict-engine:claude-code', 'verdict-engine:claude-code+gpt-4o-mini'],
    ])
  })

  it('no firma el hueco de una orden sin rellenar, ni sin un porqué', () => {
    const c = correccionesDeAgosto()
    expect(() =>
      corregirRotulos(overlayConLasTres(), c, { ...FIRMA, editor: '<tu nombre>' }),
    ).toThrow(/hueco/)
    expect(() =>
      corregirRotulos(overlayConLasTres(), c, { ...FIRMA, motivo: 'porque sí' }),
    ).toThrow(/20/)
  })
})

describe('volver a pasar sobre lo corregido', () => {
  it('no hay nada que hacer: la caché se busca bajo el rótulo de entonces', () => {
    const { overlay } = corregirRotulos(overlayConLasTres(), correccionesDeAgosto(), FIRMA)
    const { leer } = cacheDeAgosto([GPT, MIXTA])
    expect(decidir(GPT, leer, overlay.entries[GPT])).toEqual({
      accion: 'dejar',
      porque: 'ya-es-ese',
    })
    expect(decidir(MIXTA, leer, overlay.entries[MIXTA])).toEqual({
      accion: 'dejar',
      porque: 'ya-es-ese',
    })
  })
})

describe('validateOverlay · labelCorrections', () => {
  const corregido = () =>
    corregirRotulos(overlayConLasTres(), correccionesDeAgosto(), FIRMA).overlay
  const con = (cambio: (e: OverlayEntry) => void) => {
    const o = corregido()
    cambio(o.entries[GPT])
    return () => validateOverlay(o)
  }

  it('acepta lo que escribe corregirRotulos', () => {
    expect(() => validateOverlay(corregido())).not.toThrow()
  })

  it('sólo en una retractación del motor', () => {
    expect(con((e) => (e.source = 'curator-downgrade'))).toThrow(/labelCorrections/)
  })

  it('el motivo dice el mismo rótulo que la entrada', () => {
    expect(con((e) => (e.reason = e.reason!.replace('(gpt-4o-mini)', '(claude-code)')))).toThrow(
      /rótulo/,
    )
  })

  it('la última corrección cambió algo', () => {
    expect(
      con((e) => {
        e.editor = 'verdict-engine:claude-code'
        e.reason = e.reason!.replace('(gpt-4o-mini)', '(claude-code)')
      }),
    ).toThrow(/no cambió/)
  })

  it('cada corrección lleva firma, porqué y una fecha en orden', () => {
    expect(con((e) => (e.labelCorrections![0].editor = '…'))).toThrow(/editor/)
    expect(con((e) => (e.labelCorrections![0].reason = 'corto'))).toThrow(/20/)
    expect(con((e) => (e.labelCorrections![0].correctedAt = '2026-01-01T00:00:00.000Z'))).toThrow(
      /anterior/,
    )
    expect(con((e) => (e.labelCorrections![0].previous = 'claude-code'))).toThrow(/previous/)
  })
})

/**
 * Las claves con que se guardaron las pasadas que hay que corregir, FIJADAS.
 *
 * La medición del 05-10-2026 encontró 1.248 de las 1.249 entradas del motor
 * con estas claves exactas: estas versiones, esta forma de la entrada y estos
 * esquemas. El motor las cambia —la PR #249 mete la huella de los candidatos en
 * la entrada—, y una CLI que las derivara del motor de hoy daría todas las filas
 * por «sin procedencia». Lo que se fija aquí es un hecho de entonces, no una
 * copia de lo de ahora: no cambia nunca.
 */
describe('CLAVES_DE_LAS_PASADAS · las claves de entonces, fijadas', () => {
  it('versiones y forma de la entrada de cada paso', () => {
    expect(CLAVES_DE_LAS_PASADAS.razonar.versiones).toEqual([
      'engine-reason-v2',
      'engine-reason-v1',
    ])
    expect(CLAVES_DE_LAS_PASADAS.razonar.entrada('x-1')).toEqual({ claimId: 'x-1' })
    expect(CLAVES_DE_LAS_PASADAS.extraer.version).toBe('engine-extract-v1')
    expect(CLAVES_DE_LAS_PASADAS.extraer.entrada('x-1', 'r')).toEqual({
      claimId: 'x-1',
      reasoning: 'r',
    })
  })

  it('el esquema de cada paso, tal como entró en la clave', () => {
    expect(JSON.stringify(zodToJsonSchema(CLAVES_DE_LAS_PASADAS.razonar.schema))).toBe(
      '{"type":"object","properties":{"reasoning":{"type":"string","minLength":1,"maxLength":2000}},"required":["reasoning"],"additionalProperties":false}',
    )
    expect(JSON.stringify(zodToJsonSchema(CLAVES_DE_LAS_PASADAS.extraer.schema))).toBe(
      '{"type":"object","properties":{"verdict":{"type":"string","enum":["verificado","parcial","sin-datos"]},"cites":{"maxItems":5,"type":"array","items":{"type":"object","properties":{"candidateIndex":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"snippet":{"type":"string"}},"required":["candidateIndex","snippet"],"additionalProperties":false}}},"required":["verdict","cites"],"additionalProperties":false}',
    )
  })
})
