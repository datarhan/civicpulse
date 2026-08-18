import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  acusacionesQueSuben,
  acusacionesNuevasFundadas,
  ANULAR_GUARDA_ACUSACIONES,
} from '../scripts/verified-rebuild'
import type { VerifiedItem } from '../src/scraper/verified-merge'

/**
 * Un rebuild no puede SUBIR el veredicto de una acusación ya publicada.
 *
 * La regla de la casa —lo automático sólo va a la baja— vivía repartida:
 * `isDowngrade` la aplica al CLI del curador y al motor de veredictos, pero
 * nadie miraba el resultado agregado de un rebuild. Por ahí se coló, el
 * 2026-08-18, lo que cazó una revisión independiente: un arreglo del
 * emparejador (dejar de casar por importe cuando el objeto no coincide) hizo
 * caer esas afirmaciones a la vía sólo-entidad, que compara TÍTULOS y sí
 * devolvía `verificado`. Una acusación pública del PP —«¿cómo puede ser que
 * ustedes quiten 50.000 euros del plan de refugios climáticos?»— pasó de
 * `parcial` a `verificado` sobre el contrato de obras de los refugios, que no
 * acredita ni el recorte ni la cifra.
 *
 * Lo que falló no fue el arreglo, fue la medición: se comprobó la distribución
 * agregada de veredictos, que bajaba en bloque (80 `parcial` → 10), y no la
 * dirección FILA A FILA. Una comprobación que sólo mira el total no distingue
 * «69 bajan y 1 sube» de «70 bajan».
 *
 * Se vigilan las ACUSACIONES y no todo, a propósito: un veredicto puede subir
 * legítimamente porque llegue un contrato nuevo, y bloquear eso entrenaría a
 * poner la escotilla cada noche hasta que dejara de significar nada. Subir una
 * acusación contra un grupo con nombre agrava lo que se afirma de alguien, y
 * eso lo mira una persona.
 */
describe('acusacionesQueSuben', () => {
  const item = (id: string, type: string, verdict: string): VerifiedItem =>
    ({
      claim: { id, type },
      verification: { claimId: id, verdict, summary: '', evidence: [], checkedAgainst: [] },
    }) as unknown as VerifiedItem

  it('caza la subida real que se coló: parcial → verificado en una acusación', () => {
    const suben = acusacionesQueSuben(
      [item('a', 'acusacion_publica', 'parcial')],
      [item('a', 'acusacion_publica', 'verificado')],
    )
    expect(suben).toEqual([{ id: 'a', de: 'parcial', a: 'verificado' }])
  })

  it('y también sin-datos → parcial, que es la misma dirección', () => {
    expect(
      acusacionesQueSuben(
        [item('a', 'acusacion_publica', 'sin-datos')],
        [item('a', 'acusacion_publica', 'parcial')],
      ),
    ).toHaveLength(1)
  })

  it('no se queja de lo que BAJA, que es la dirección permitida', () => {
    expect(
      acusacionesQueSuben(
        [item('a', 'acusacion_publica', 'verificado')],
        [item('a', 'acusacion_publica', 'sin-datos')],
      ),
    ).toEqual([])
  })

  it('no se queja de una fila nueva: no hay «antes» que subir', () => {
    expect(acusacionesQueSuben([], [item('nueva', 'acusacion_publica', 'verificado')])).toEqual([])
  })

  it('mira las acusaciones, no las demás afirmaciones', () => {
    // Una cita que sube puede ser un contrato nuevo; una acusación que sube es
    // otra cosa. La puerta es estrecha a propósito.
    expect(
      acusacionesQueSuben(
        [item('a', 'cita_obra', 'sin-datos')],
        [item('a', 'cita_obra', 'verificado')],
      ),
    ).toEqual([])
  })

  it('el corpus publicado no trae ninguna subida pendiente', () => {
    // Control sobre datos reales: comparar el monolito consigo mismo tiene que
    // dar cero, y de paso prueba que la función sabe leer la forma real de las
    // filas (no sólo el fixture de arriba).
    const ROOT = resolve(__dirname, '..')
    const snap = JSON.parse(
      readFileSync(resolve(ROOT, 'public/data/pleno-claims-verified.json'), 'utf8'),
    ) as { items: VerifiedItem[] }
    expect(snap.items.length).toBeGreaterThan(1000)
    expect(
      snap.items.filter((it) => it.claim?.type === 'acusacion_publica').length,
      'no hay acusaciones en el corpus: este control no mediría nada',
    ).toBeGreaterThan(0)
    expect(acusacionesQueSuben(snap.items, snap.items)).toEqual([])
  })

  it('la escotilla está declarada y nombrada en el mensaje', () => {
    expect(ANULAR_GUARDA_ACUSACIONES).toBe('CLAIMS_REBUILD_ALLOW_ACCUSATION_RAISE')
  })

  it('caza verificado → contradicho, que la escala escrita a mano dejaba pasar', () => {
    // La primera versión traía su propia escala de fuerza y empataba
    // `contradicho` con `verificado`, así que esta transición no era «subida»
    // para ella — mientras que `isDowngrade`, la función que gobierna el CLI
    // del curador, se niega a tratar `contradicho` como destino de una bajada.
    // Dos órdenes escritos a mano que ya discrepaban: la regla 1 de
    // DATA_INTEGRITY aplicada a una relación. Ahora se deriva de `isDowngrade`.
    expect(
      acusacionesQueSuben(
        [item('a', 'acusacion_publica', 'verificado')],
        [item('a', 'acusacion_publica', 'contradicho')],
      ),
    ).toHaveLength(1)
    // Y el sentido contrario sigue siendo una bajada legítima.
    expect(
      acusacionesQueSuben(
        [item('a', 'acusacion_publica', 'contradicho')],
        [item('a', 'acusacion_publica', 'parcial')],
      ),
    ).toEqual([])
  })
})

describe('acusacionesNuevasFundadas', () => {
  const item = (id: string, type: string, verdict: string): VerifiedItem =>
    ({
      claim: { id, type },
      verification: { claimId: id, verdict, summary: '', evidence: [], checkedAgainst: [] },
    }) as unknown as VerifiedItem

  /**
   * El punto ciego de la guarda de arriba, dicho en voz alta: una fila sin
   * «antes» no puede subir, y una re-extracción rehace los ids en bloque —este
   * mismo trabajo cambió dos plenos enteros, 369 ids nuevos, 155 de ellos
   * acusaciones—. No se bloquea (una sesión recién transcrita tiene que poder
   * publicar lo que diga el cotejo), pero se cuenta: «no había nada que mirar»
   * y «no lo miré» no son lo mismo.
   */
  it('cuenta las acusaciones con id nuevo que publican por encima de sin-datos', () => {
    const nuevas = acusacionesNuevasFundadas(
      [item('vieja', 'acusacion_publica', 'sin-datos')],
      [
        item('vieja', 'acusacion_publica', 'sin-datos'),
        item('nueva-fundada', 'acusacion_publica', 'parcial'),
        item('nueva-sin-datos', 'acusacion_publica', 'sin-datos'),
        item('nueva-cita', 'cita_obra', 'verificado'),
      ],
    )
    expect(nuevas).toEqual(['nueva-fundada'])
  })
})
