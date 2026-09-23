import { describe, it, expect } from 'vitest'
import {
  adjuntarCuerpos,
  LARGO_EXTRACTO,
  type ItemDescubrimiento,
} from '../src/scraper/promise-discovery-bodies'

/**
 * El descubrimiento de promesas pedía una cita LITERAL de 20–1500 caracteres y
 * sólo mandaba título, URL y fecha. El modelo salía a buscar el artículo con
 * herramientas que tenía denegadas, y 17 pasadas de 17 murieron sin respuesta.
 * Ahora cada fuente viaja con un extracto de su cuerpo, y la que no tiene cuerpo
 * NO viaja sólo con el titular: se aparta y se cuenta, con su motivo.
 */
const item = (n: number): ItemDescubrimiento => ({
  title: `Titular ${n}`,
  url: `https://ejemplo.es/noticia-${n}`,
  date: '2026-09-20',
  publisher: 'Levante-EMV',
})

describe('adjuntarCuerpos', () => {
  it('pone un extracto del cuerpo en `snippet`, acotado', async () => {
    const largo = 'x'.repeat(LARGO_EXTRACTO * 3)
    const r = await adjuntarCuerpos([item(1)], async () => ({ body: largo, robotsAllowed: true }))
    expect(r.items).toHaveLength(1)
    expect(r.items[0].snippet).toHaveLength(LARGO_EXTRACTO)
    expect(r.sinCuerpo).toEqual([])
  })

  it('una fuente sin cuerpo se aparta con su motivo, no viaja con el titular solo', async () => {
    const r = await adjuntarCuerpos([item(1), item(2), item(3)], async (url) => {
      if (url.endsWith('-1'))
        return { body: 'El alcalde se compromete a construir 40 viviendas.', robotsAllowed: true }
      if (url.endsWith('-2')) return { body: '', robotsAllowed: false }
      throw new Error('ETIMEDOUT')
    })
    expect(r.items.map((i) => i.url)).toEqual(['https://ejemplo.es/noticia-1'])
    expect(r.sinCuerpo).toEqual([
      { url: 'https://ejemplo.es/noticia-2', motivo: 'robots' },
      { url: 'https://ejemplo.es/noticia-3', motivo: 'error: ETIMEDOUT' },
    ])
  })

  it('un cuerpo en blanco cuenta como sin cuerpo', async () => {
    const r = await adjuntarCuerpos([item(1)], async () => ({ body: '  \n ', robotsAllowed: true }))
    expect(r.items).toEqual([])
    expect(r.sinCuerpo).toEqual([{ url: 'https://ejemplo.es/noticia-1', motivo: 'vacío' }])
  })

  it('pide los cuerpos de uno en uno: el ritmo lo pone el fetcher, no un Promise.all', async () => {
    let enVuelo = 0
    let maximo = 0
    await adjuntarCuerpos([item(1), item(2), item(3)], async () => {
      enVuelo++
      maximo = Math.max(maximo, enVuelo)
      await new Promise((r) => setTimeout(r, 5))
      enVuelo--
      return { body: 'cuerpo', robotsAllowed: true }
    })
    expect(maximo).toBe(1)
  })
})
