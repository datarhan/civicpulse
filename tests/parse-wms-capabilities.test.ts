/**
 * La capa de riesgo de inundación dejó de pintarse y nadie se enteró.
 *
 * El ICV republicó `tm_infraestructuras/ordenacion_territorial` y los
 * identificadores numéricos de sus capas se corrieron: «Riesgo de Inundación»
 * dejó de ser la 59 y pasó a ser la 60. El comentario del componente ya avisaba
 * de que esto podía pasar —«ArcGIS numeric layer ids can shift on republish»—
 * y aun así no había nada que lo comprobara.
 *
 * Lo que lo hace invisible es que el servicio NO falla. Medido el 3-sep-2026
 * sobre el término de Riba-roja:
 *
 *     layers=59  →  HTTP 200 · image/png ·  2.198 B  (imagen en blanco)
 *     layers=60  →  HTTP 200 · image/png · 14.924 B  (la llanura de inundación)
 *
 * Doscientos, imagen válida, y vacía. Es la misma firma que la marca de agua de
 * CARTO: un fallo que no se puede ver por HTTP, sólo mirando lo que llega.
 *
 * El identificador se queda en el código —pedir 112 KB de GetCapabilities en
 * cada carga para averiguar un número sería peor— y lo que se añade es la
 * guarda: `npm run check:wms` comprueba contra el servicio vivo que el número
 * configurado sigue siendo el de la capa que decimos pintar. Aquí se fija el
 * contrato contra el documento REAL que devolvió el servicio ese día.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCapasWms, valorarWms, esRiesgoDeInundacion } from '../src/scraper/wms-capabilities'
import { PATRICOVA_FLOOD_LAYER } from '../src/lib/patricova'

const XML = readFileSync(
  join(__dirname, 'fixtures', 'icv_ordenacion_territorial_wms_capabilities_2026-09-03.xml'),
  'utf8',
)

describe('GetCapabilities del ICV', () => {
  it('saca las capas con nombre, no los grupos sin él', () => {
    const capas = parseCapasWms(XML)
    expect(capas.length).toBeGreaterThan(40)
    // Todas con id y título: una entrada a medias es lo que haría que la
    // búsqueda por título fallara en silencio.
    expect(capas.every((c) => c.id && c.titulo)).toBe(true)
  })

  it('encuentra la capa de riesgo de inundación por su título', () => {
    const capas = parseCapasWms(XML)
    const riesgo = capas.filter((c) => esRiesgoDeInundacion(c.titulo))
    expect(riesgo).toHaveLength(1)
    expect(riesgo[0].id).toBe('60')
  })

  it('no confunde «Estudios de Inundabilidad» con el riesgo', () => {
    // Están las dos en el servicio y hablan de lo mismo a ojo. Un patrón más
    // laxo cogería la que no es y la guarda diría que todo va bien.
    const capas = parseCapasWms(XML)
    const inundabilidad = capas.find((c) => /inundabilidad/i.test(c.titulo))
    expect(inundabilidad).toBeTruthy()
    expect(esRiesgoDeInundacion(inundabilidad!.titulo)).toBe(false)
  })

  it('el identificador que usa el mapa es el que el servicio da hoy', () => {
    // Ésta es la que estaba roja: el componente pedía la 59, que ya no existe.
    const parte = valorarWms(PATRICOVA_FLOOD_LAYER, parseCapasWms(XML))
    expect(parte.desenlace).toBe('ok')
  })

  it('cuando el número se ha corrido, lo dice Y nombra el nuevo', () => {
    // Inyección de fallo: es exactamente lo que pasó. Una guarda que sólo
    // dijera «mal» obligaría a repetir a mano la investigación de hoy.
    const parte = valorarWms('59', parseCapasWms(XML))
    expect(parte.desenlace).toBe('movida')
    expect(parte.idEncontrado).toBe('60')
    expect(parte.mensaje).toMatch(/60/)
  })

  it('si la capa desapareciera del todo, no se confunde con «se ha movido»', () => {
    const parte = valorarWms('59', [{ id: '1', titulo: 'Otra cosa' }])
    expect(parte.desenlace).toBe('sin-capa')
  })
})
