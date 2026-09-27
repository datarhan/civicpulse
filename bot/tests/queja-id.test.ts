import { describe, it, expect } from 'vitest'
import { ID_QUEJA, idDeQueja, nuevoIdDeQueja } from '../src/services/queja-id'

/**
 * Un id de queja, de una sola forma, en un solo sitio.
 *
 * Había cuatro copias del lector. Las tres de `/estado`, `/apoyar` y
 * `/escalar` quitaban una Q inicial y tomaban el resto como sufijo, pero el
 * sufijo es base32 de Crockford y puede empezar por Q: el bot imprime
 * `/estado_q…` en minúsculas, y una de cada 32 quejas llevaba a OTRA (o a
 * «no encuentro»). La de `/olvidar` sólo aceptaba el id con su «Q-».
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// Ids de verdad, del generador que usa el bot…
const REALES = Array.from({ length: 2000 }, () => nuevoIdDeQueja())
// …y, porque es un ULID MONÓTONO —dentro de un milisegundo sólo sube el final—,
// uno por cada primer carácter posible: 2000 seguidos pueden no traer ninguno
// que empiece por Q.
const POR_INICIAL = [...CROCKFORD].map(
  (c, i) => `Q-${c}${CROCKFORD.slice(i, i + 7).padEnd(7, '0')}`,
)
const IDS = [...REALES, ...POR_INICIAL]

describe('idDeQueja', () => {
  it('mira algo: los ids son del formato, y hay sufijos que empiezan por Q', () => {
    expect(IDS.every((id) => ID_QUEJA.test(id))).toBe(true)
    expect(IDS.filter((id) => id.startsWith('Q-Q')).length).toBeGreaterThan(0)
  })

  it('cada forma aceptada de cada id lleva a ese id', () => {
    for (const id of IDS) {
      const sufijo = id.slice(2)
      const formas = [
        id,
        id.toLowerCase(),
        `Q_${sufijo}`,
        `Q${sufijo}`,
        sufijo,
        sufijo.toLowerCase(), // lo que llega de `/estado_q…`
        `  ${id}  `,
      ]
      for (const f of formas) expect(idDeQueja(f), `${f} → ${id}`).toBe(id)
    }
  })

  it('las letras que Crockford confunde se leen como las cifras', () => {
    expect(idDeQueja('Q-O0I1L0O0')).toBe('Q-00111000')
  })

  it('lo que no es un id no se convierte en otro', () => {
    for (const malo of [
      undefined,
      null,
      '',
      'Q-',
      'Q-ABC',
      'Q-ABCDEFG', // 7
      'Q-ABCDEFGHJ', // 9 tras el guion
      'ABCDEFGHJ', // 9 sin Q
      'Q-ABCDEFGU', // la U no está en el alfabeto
      'Q-ABCD-FGH',
      'hola',
    ]) {
      expect(idDeQueja(malo), String(malo)).toBeNull()
    }
  })
})
