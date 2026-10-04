import { describe, it, expect } from 'vitest'
import { recortarResumen, RESUMEN_MAX } from '../../src/scraper/claim-verifier-engine'

/**
 * La explicación del motor de veredictos es la que pinta la tarjeta de cada
 * declaración, tal cual, y se guardaba como `reasoning.slice(0, 300)`. El
 * 04-10-2026, al re-derivar las retractaciones de #185 y #196, las 293
 * explicaciones nuevas medían 300 caracteres justos y 289 acababan a media
 * palabra («…es un contrato de servicios cuyo», «…(Ecnor). No»); 864 de las ya
 * publicadas medían también 300 justos. Una frase cortada puede decir lo
 * contrario de la entera.
 */

const LARGO =
  'La afirmación es una opinión política sin cifras ni fechas. Ningún candidato la respalda de forma genuina. ' +
  'El candidato [0] es un contrato de servicios de mantenimiento del pabellón adjudicado en 2024, que coincide en el tema ' +
  'pero no dice nada de lo que se afirma sobre la salud del edificio ni sobre quién lo mantiene ahora mismo en el municipio.'

describe('recortarResumen', () => {
  it('deja entero lo que cabe, con los espacios normalizados', () => {
    expect(recortarResumen('Una frase  corta.\n')).toBe('Una frase corta.')
  })

  it('corta en la última frase entera que cabe', () => {
    expect(LARGO.length).toBeGreaterThan(RESUMEN_MAX)
    expect(recortarResumen(LARGO)).toBe(
      'La afirmación es una opinión política sin cifras ni fechas. Ningún candidato la respalda de forma genuina.',
    )
  })

  it('sin una frase entera que quepa, corta en una palabra y lo dice con «…»', () => {
    const unaSola = 'palabra '.repeat(60).trim() + '.'
    const r = recortarResumen(unaSola)
    expect(r.endsWith('palabra…')).toBe(true)
    expect(r.length).toBeLessThanOrEqual(RESUMEN_MAX)
  })

  it('nunca pasa del tope ni acaba a media palabra', () => {
    const palabras = LARGO.split(' ')
    for (let n = 1; n <= palabras.length; n++) {
      const texto = palabras.slice(0, n).join(' ')
      const r = recortarResumen(texto)
      expect(r.length, texto).toBeLessThanOrEqual(RESUMEN_MAX)
      if (r !== texto) {
        // Lo recortado acaba en un fin de frase o en «…» tras una palabra entera.
        expect(r, texto).toMatch(/([.!?]["»”)]*|…)$/)
        const sinMarca = r.replace(/…$/, '')
        expect(texto.startsWith(sinMarca), texto).toBe(true)
        // Lo que sigue al corte en el texto entero no es una letra ni una cifra.
        const siguiente = texto[sinMarca.length] ?? ''
        expect(/[\p{L}\p{N}]/u.test(siguiente), `${texto} → ${r}`).toBe(false)
      }
    }
  })

  it('una abreviatura no es un fin de frase, ni el punto de una cifra', () => {
    const t =
      'El Sr. Mazón y el art. 30 de la ley figuran en el contrato «Carta de servicios municipal» de 11.553,08 € adjudicado ' +
      'por el núm. 145 del registro, que coincide en el tema pero no en lo afirmado. ' +
      'Lo demás de este razonamiento ya no cabe en el tope y tiene que quedar fuera de la explicación publicada en la tarjeta.'
    expect(t.length).toBeGreaterThan(RESUMEN_MAX)
    expect(recortarResumen(t)).toBe(
      'El Sr. Mazón y el art. 30 de la ley figuran en el contrato «Carta de servicios municipal» de 11.553,08 € adjudicado ' +
        'por el núm. 145 del registro, que coincide en el tema pero no en lo afirmado.',
    )
  })

  it('una primera frase muy corta no se queda sola: mejor cortar en una palabra', () => {
    const t = 'No. ' + 'El candidato coincide en el tema pero no en lo afirmado y '.repeat(8)
    const r = recortarResumen(t)
    expect(r).not.toBe('No.')
    expect(r.endsWith('…')).toBe(true)
  })
})
