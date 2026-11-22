/**
 * La pasada del troceador que retiene los literales traducidos o alucinados:
 * que cuente lo que juzgó, que no pise a `sinProcedencia` y que su techo pare
 * una retirada masiva.
 */
import { describe, expect, it } from 'vitest'

import {
  excesoDeLiteralNoServible,
  literalesNoServibles,
  TECHO_LITERAL_NO_SERVIBLE,
} from '../scripts/chunk-pleno-claims'

const SUSTITUIDA =
  '[11610.0 → 11640.0] en la legislatura esta, que acaban de pagar ahora mil millones de euros al Centro de Buenestar, en la casa del abogado'
const VIGENTE = [
  '[11612.1 → 11619.9] (SPEAKER_183) Legislatura que vaig a recordar que governa en València i no vaig a dir tot el que mos deu,',
  "[11620.1 → 11623.8] (SPEAKER_183) que acaben de pagar vora mig milió d'euros al centre Bonestar,",
  "[11624.6 → 11628.8] (SPEAKER_183) en la casa de l'advocat, que duguem més de mig milió d'euros i encara no hem rebut res,",
].join('\n')

const item = (id: string, plenoId: string, verbatim: string) => ({
  claim: { id, plenoId, verbatim },
})

describe('literalesNoServibles', () => {
  const items = [
    item('a-1', 'a', 'que acaban de pagar ahora mil millones de euros al Centro de Buenestar'),
    item('a-2', 'a', "que acaben de pagar vora mig milió d'euros al centre Bonestar"),
    item('a-3', 'a', 'esto no consta en ninguna parte de ninguna transcripción nuestra'),
    item('b-1', 'b', 'que acaban de pagar ahora mil millones de euros al Centro de Buenestar'),
  ]
  const leerVigente = (p: string) => (p === 'a' ? VIGENTE : null)
  const leerSustituidas = (p: string) => (p === 'a' ? [SUSTITUIDA] : [])

  it('retiene la traducida, deja la que consta en la vigente y no juzga sin vigente', () => {
    const r = literalesNoServibles(items, new Set(['a-3']), leerVigente, leerSustituidas)
    expect([...r.porId]).toEqual([['a-1', 'literal-traducido']])
    // a-1 y a-2: a-3 es de sinProcedencia y b-1 no tiene vigente.
    expect(r.evaluadas).toBe(2)
    expect(r.sinVigente).toBe(1)
  })

  it('una sin procedencia no se cuenta dos veces', () => {
    const r = literalesNoServibles(items, new Set(['a-1', 'a-3']), leerVigente, leerSustituidas)
    expect(r.porId.size).toBe(0)
  })
})

describe('excesoDeLiteralNoServible', () => {
  it('para por encima del techo y deja pasar por debajo', () => {
    expect(excesoDeLiteralNoServible(605, 5300)).toBeNull()
    expect(excesoDeLiteralNoServible(0, 0)).toBeNull()
    const juzgadas = 1000
    expect(
      excesoDeLiteralNoServible(Math.ceil(juzgadas * TECHO_LITERAL_NO_SERVIBLE) + 1, juzgadas),
    ).toMatch(/techo/)
  })
})
