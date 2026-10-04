import { describe, expect, it } from 'vitest'

import {
  arrastrarAtribucion,
  type CriterioDeArrastre,
} from '../src/scraper/claim-attribution-carry'

/**
 * Lo que firma una persona vive en `pleno-claim-relabels.json`, no en la base.
 *
 * `carry:attribution` copia el grupo PUBLICADO a la sugerencia de la que sale
 * la base. Con una atribución firmada eso es justo lo que no puede pasar: la
 * base diría el grupo firmado, la entrada del sidecar —que guarda en `from` lo
 * que decía la base al firmarse— quedaría obsoleta, y el grupo se seguiría
 * publicando sin firma. Es la confusión de 472064bd, una firma tomada por un
 * dato de la base. Se salta, y se cuenta por su motivo aunque el mapa de voces
 * la sostuviera: así el parte dice por qué no la copió.
 */

/** Un mapa de voces que da PSOE a cualquier literal de la sesión p1. */
const criterio: CriterioDeArrastre = {
  unEscano: ['VOX', 'EU-Podem', 'Compromís'],
  conMapa: new Set(['p1']),
  resolverDe: (pleno) => (pleno === 'p1' ? () => 'PSOE' : null),
}

const publicada = (marca: boolean) => ({
  claim: {
    id: 'p1-039-cit-aaaaaa',
    plenoId: 'p1',
    speakerGroup: 'PSOE',
    verbatim: 'lo que se dijo en el pleno',
    ...(marca ? { atribucionFirmada: { desde: 4016, hasta: 4095 } } : {}),
  },
})

const sugerida = () => ({
  id: 'p1-039-cit-aaaaaa',
  speakerGroup: null as string | null,
  verbatim: 'lo que se dijo en el pleno',
})

describe('carry:attribution y la atribución firmada', () => {
  it('no copia a la base un grupo firmado, y lo cuenta como «firmada»', () => {
    const s = sugerida()
    const r = arrastrarAtribucion([publicada(true)], [s], criterio)
    expect(s.speakerGroup).toBeNull()
    expect(r.stats.arrastradas).toBe(0)
    expect(r.stats.descartes.firmada).toBe(1)
    // Con su propio motivo, no con el del mapa.
    expect(r.stats.descartes['sin-sosten']).toBe(0)
  })

  it('la misma declaración sin la marca sí se copia: lo que decide es la firma', () => {
    const s = sugerida()
    const r = arrastrarAtribucion([publicada(false)], [s], criterio)
    expect(s.speakerGroup).toBe('PSOE')
    expect(r.stats.arrastradas).toBe(1)
    expect(r.stats.descartes.firmada).toBe(0)
  })
})
