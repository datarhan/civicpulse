import { describe, it, expect } from 'vitest'
import {
  GazetteReadError,
  leerBoe,
  leerDogv,
  leerDialnet,
  leerHemeroteca,
  fetchBoeForSubject,
} from '../src/scraper/journalist-tools/gazette'

/**
 * Los lectores de boletines devolvían `[]` ante CUALQUIER fallo (`!res.ok`,
 * excepción de red, 302 sin cuerpo del DOGV), así que `journalist:sondeo` no
 * podía distinguir «busqué y no había nada» de «no pude buscar»: el 06-09-2026
 * un dossier anotó boe/dogv/dialnet/hemeroteca como «vacío» sin que ningún
 * lector hubiera llegado al servidor. Regla 2 de DATA_INTEGRITY: un fallo se
 * cuenta aparte. Los `leer*` lanzan; los `fetch*` (los del agente) siguen
 * degradando a `[]` pero ya no cachean el fallo.
 */
type FetchImpl = typeof fetch

const respuesta = (status: number, body = '', headers: Record<string, string> = {}): FetchImpl =>
  (async () => new Response(body, { status, headers })) as unknown as FetchImpl
const caida = (msg: string): FetchImpl =>
  (async () => {
    throw new TypeError(msg)
  }) as unknown as FetchImpl

describe('lectores de boletín con estado', () => {
  it('leerBoe lanza GazetteReadError con el estado HTTP cuando el servidor no contesta 2xx', async () => {
    await expect(leerBoe('Nombre De Prueba', 8, respuesta(503))).rejects.toThrow(GazetteReadError)
    await expect(leerBoe('Nombre De Prueba', 8, respuesta(503))).rejects.toThrow(/503/)
  })

  it('leerBoe lanza con el motivo de red cuando fetch cae', async () => {
    await expect(leerBoe('Nombre De Prueba', 8, caida('ECONNRESET'))).rejects.toThrow(/ECONNRESET/)
  })

  it('leerDogv trata la redirección del buscador como fallo, no como vacío', async () => {
    // El buscador del DOGV contesta 302 sin cuerpo (medido 06-09-2026); seguir
    // la redirección daba una portada sin resultados que se leía como «vacío».
    await expect(
      leerDogv('Nombre De Prueba', 8, respuesta(302, '', { location: 'https://dogv.gva.es/' })),
    ).rejects.toThrow(/302/)
  })

  it('leerDialnet y leerHemeroteca también lanzan ante un 5xx', async () => {
    await expect(leerDialnet('Nombre De Prueba', 8, respuesta(500))).rejects.toThrow(/500/)
    await expect(leerHemeroteca('Nombre De Prueba', 2019, respuesta(500))).rejects.toThrow(/500/)
  })

  it('un 200 sin coincidencias sigue siendo vacío: lista vacía, sin lanzar', async () => {
    await expect(
      leerBoe('Nombre De Prueba', 8, respuesta(200, '<html><body>nada</body></html>')),
    ).resolves.toEqual([])
  })

  it('un 200 con resultados devuelve las coincidencias', async () => {
    const html =
      '<ul><li><a href="/diario_boe/txt.php?id=BOE-A-2024-1234">Resolución de 3 de marzo de 2024 sobre Nombre De Prueba</a></li></ul>'
    const hits = await leerBoe('Nombre De Prueba', 8, respuesta(200, html))
    expect(hits).toHaveLength(1)
    expect(hits[0].ref).toBe('BOE-A-2024-1234')
    expect(hits[0].url).toBe('https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-1234')
  })

  it('el lector del agente degrada a [] ante el fallo y no lo cachea', async () => {
    // Nombre único para que la caché de disco no tenga nada que ofrecer.
    const nombre = `zz-prueba-sin-cache-${Date.now()}`
    const hits = await fetchBoeForSubject(nombre, 8, caida('ECONNRESET'))
    expect(hits).toEqual([])
    // Una segunda llamada vuelve a intentar (si el fallo se hubiera cacheado,
    // una respuesta 200 posterior no se vería).
    const html =
      '<a href="/diario_boe/txt.php?id=BOE-A-2024-9">Resolución de 3 de marzo de 2024</a>'
    const despues = await fetchBoeForSubject(nombre, 8, respuesta(200, html))
    expect(despues).toHaveLength(1)
  })
})
