import { describe, it, expect } from 'vitest'
import {
  retractAttributions,
  onlySpeakerGroupMoved,
  emptyTally,
} from '../src/scraper/retract-attribution'

/**
 * El 3-sep-2026 `check:claim-provenance` señaló CUATRO declaraciones publicadas
 * cuya atribución de bloc contradice la transcripción vigente:
 *
 *   10yl550-200-pro-2264ef  publicado=PP   · la evidencia dice VOX
 *   k4olcs-043-cit-127eeb   publicado=PSOE · la evidencia dice PP
 *   k4olcs-043-cit-a56c90   publicado=PSOE · la evidencia dice PP
 *   k4olcs-058-afi-eb4839   publicado=PP   · la evidencia dice VOX
 *
 * Se retiran a `null`, NO se corrigen al bloc que dice la evidencia. Cambiar
 * PP por VOX es un veredicto que SUBE, y VOX tiene un solo escaño, así que
 * escribirlo nombra a una persona por eliminación. Esta herramienta no sabe
 * escribir un bloc, y ésa es la mitad del diseño.
 */
const claim = (id: string, speakerGroup: string | null) => ({
  id,
  speakerGroup,
  verbatim: `cita de ${id}`,
  topic: 'educacion',
})

describe('scraper/retract-attribution', () => {
  it('pone a null el bloc de los ids señalados y deja el resto intacto', () => {
    const tree = {
      items: [
        { claim: claim('a', 'PP'), verification: { verdict: 'sin-datos' } },
        { claim: claim('b', 'PSOE'), verification: { verdict: 'parcial' } },
      ],
    }
    const t = emptyTally()
    const out = retractAttributions(tree, new Set(['a']), t)

    expect(out.items[0].claim.speakerGroup).toBeNull()
    expect(out.items[1].claim.speakerGroup).toBe('PSOE')
    expect(t.retracted.get('a')).toBe('PP')
    // El veredicto, el verbatim y todo lo demás no se tocan.
    expect(out.items[0].verification.verdict).toBe('sin-datos')
    expect(out.items[0].claim.verbatim).toBe('cita de a')
  })

  it('NO muta el árbol de entrada', () => {
    const tree = { items: [{ claim: claim('a', 'PP') }] }
    retractAttributions(tree, new Set(['a']), emptyTally())
    expect(tree.items[0].claim.speakerGroup).toBe('PP')
  })

  it('un id ya en null es un no-op, no un fallo', () => {
    const tree = { items: [{ claim: claim('a', null) }] }
    const t = emptyTally()
    const out = retractAttributions(tree, new Set(['a']), t)
    expect(out.items[0].claim.speakerGroup).toBeNull()
    expect(t.retracted.size).toBe(0)
    expect(t.alreadyNull.has('a')).toBe(true)
  })

  it('EL EMPAREJAMIENTO PIDE LAS DOS COSAS EN EL MISMO OBJETO', () => {
    // Un `id` suelto en otra parte del árbol —una relación, una cola de
    // curación, una referencia cruzada— no debe alcanzar a un `speakerGroup`
    // vecino que no es suyo. Sin esta condición, retirar la atribución de una
    // declaración borraría la de otra por estar cerca en el JSON.
    const tree = {
      relations: [{ id: 'a', note: 'esta fila SÓLO referencia a la declaración a' }],
      items: [{ claim: claim('otra', 'VOX') }],
    }
    const t = emptyTally()
    const out = retractAttributions(tree, new Set(['a']), t)
    expect(out.items[0].claim.speakerGroup).toBe('VOX')
    expect(t.retracted.size).toBe(0)
  })

  it('no sabe escribir un bloc: sólo existe el camino a null', () => {
    // Contrato explícito. Si algún día alguien añade un parámetro para fijar
    // un bloc, esta prueba es el sitio donde tiene que discutirse primero.
    const src = String(retractAttributions)
    expect(src).not.toMatch(/speakerGroup\s*=\s*['"`]/)
  })

  it('alcanza varias sesiones y varios ficheros en una pasada', () => {
    const tree = {
      items: [
        { claim: claim('10yl550-200-pro-2264ef', 'PP') },
        { claim: claim('k4olcs-043-cit-127eeb', 'PSOE') },
        { claim: claim('k4olcs-043-cit-a56c90', 'PSOE') },
        { claim: claim('k4olcs-058-afi-eb4839', 'PP') },
        { claim: claim('no-tocar', 'Compromís') },
      ],
    }
    const t = emptyTally()
    const out = retractAttributions(
      tree,
      new Set([
        '10yl550-200-pro-2264ef',
        'k4olcs-043-cit-127eeb',
        'k4olcs-043-cit-a56c90',
        'k4olcs-058-afi-eb4839',
      ]),
      t,
    )
    expect(t.retracted.size).toBe(4)
    expect([...t.retracted.values()].sort()).toEqual(['PP', 'PP', 'PSOE', 'PSOE'])
    expect(out.items[4].claim.speakerGroup).toBe('Compromís')
  })
})

describe('scraper/retract-attribution — onlySpeakerGroupMoved', () => {
  it('acepta un cambio que sólo toca speakerGroup', () => {
    const before = { items: [{ claim: claim('a', 'PP') }] }
    const after = retractAttributions(before, new Set(['a']), emptyTally())
    expect(onlySpeakerGroupMoved(before, after)).toBe(true)
  })

  it('RECHAZA cualquier otro byte movido', () => {
    // La prueba de alcance. Una migración que no puede demostrar el suyo es una
    // migración que nadie puede revisar.
    const before = { items: [{ claim: claim('a', 'PP') }] }
    const after = JSON.parse(JSON.stringify(before))
    after.items[0].claim.speakerGroup = null
    after.items[0].claim.verbatim = 'alguien tocó la cita'
    expect(onlySpeakerGroupMoved(before, after)).toBe(false)
  })

  it('rechaza también una fila perdida o añadida', () => {
    const before = { items: [{ claim: claim('a', 'PP') }, { claim: claim('b', 'PP') }] }
    const after = { items: [{ claim: claim('a', null) }] }
    expect(onlySpeakerGroupMoved(before, after)).toBe(false)
  })
})
