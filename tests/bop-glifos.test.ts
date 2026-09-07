import { describe, it, expect } from 'vitest'
import { desplazar, decodificar, buscarConGlifos } from '../src/scraper/bop-glifos'

/**
 * El PDF del BOP n.º 97 (26-04-2011, candidaturas) saca parte de los nombres
 * con los códigos de glifo desplazados 29 posiciones — «Don» aparece como
 * «'RQ» — porque una de sus fuentes no lleva ToUnicode. Un grep normal los
 * pierde: el 06-09-2026 «GIMENO CALVO» dio 0 sobre ese boletín y la lista del
 * PP llevaba a una Gimeno Calvo en el n.º 13. Las tres líneas de abajo son
 * literales de `pdftotext -layout` sobre ese boletín.
 */
const LINEAS = [
  '1.     Don ROBERTO PASCUAL RAGA GADEA',
  "11. Don VICENTE LUJAN BETORET                                'RxD0$5,$$03$52*,0(12&$/92",
  "12. Don FRANCISCO JAVIER GADEA RODRIGO                     'RQ-$9,(5025(12&2//",
].join('\n')

describe('desplazar / decodificar', () => {
  it('desplaza las letras ASCII 29 posiciones hacia abajo y las recupera', () => {
    expect(desplazar('Don')).toBe("'RQ")
    expect(decodificar("'RQ")).toBe('Don')
  })

  it('la ñ del boletín (glifo 120, «x») vuelve a ser ñ', () => {
    expect(decodificar("'RxD")).toBe('Doña')
  })

  it('el espacio desplazado es el carácter de control 3, que la extracción conserva o pierde: el patrón lo tolera', () => {
    expect(desplazar('GIMENO CALVO')).toBe('*,0(12&$/92')
  })
})

describe('buscarConGlifos', () => {
  it('encuentra el nombre tanto en claro como desplazado y devuelve la línea decodificada', () => {
    const hits = buscarConGlifos(LINEAS, 'GIMENO CALVO')
    expect(hits).toHaveLength(1)
    expect(hits[0].linea).toBe(2)
    expect(hits[0].forma).toBe('desplazada')
    // Los espacios del tramo desplazado se pierden en la extracción: el texto
    // decodificado sale sin ellos, y la parte en claro de la línea queda intacta.
    expect(hits[0].decodificada).toContain('DoñaMARIAAMPAROGIMENOCALVO')
    expect(hits[0].decodificada).toContain('11. Don VICENTE LUJAN BETORET')
  })

  it('en claro cuenta igual, con la forma marcada', () => {
    const hits = buscarConGlifos(LINEAS, 'RAGA GADEA')
    expect(hits.map((h) => [h.linea, h.forma])).toEqual([[1, 'clara']])
  })

  it('un nombre ausente da cero, y cero es cero en las dos formas', () => {
    expect(buscarConGlifos(LINEAS, 'GIMENO CALVO ALBERTO')).toEqual([])
  })

  it('no distingue mayúsculas ni acentos en la forma clara', () => {
    expect(buscarConGlifos('Don Robert Raga Gadea', 'RAGA GADEA')).toHaveLength(1)
    expect(buscarConGlifos('Don José Luján', 'LUJAN')).toHaveLength(1)
  })
})
