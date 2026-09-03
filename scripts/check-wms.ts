#!/usr/bin/env tsx
/**
 * ¿La capa de riesgo de inundación sigue siendo la que pedimos?
 *
 *   npm run check:wms
 *   npm run check:wms -- --json
 *
 * ## Por qué existe
 *
 * El ICV republicó `tm_infraestructuras/ordenacion_territorial` y los
 * identificadores numéricos de sus capas se corrieron: «Riesgo de Inundación»
 * dejó de ser la 59 y pasó a ser la 60. El mapa siguió pidiendo la 59 durante
 * quién sabe cuánto, y nadie lo vio.
 *
 * Nadie lo vio porque **el servicio no falla**. Medido sobre el término el
 * 3-sep-2026:
 *
 *     layers=59  →  HTTP 200 · image/png ·  2.198 B  (imagen en blanco)
 *     layers=60  →  HTTP 200 · image/png · 14.924 B  (la llanura de inundación)
 *
 * Doscientos, imagen válida, y vacía. El componente ya llevaba escrito el aviso
 * —«ArcGIS numeric layer ids can shift on republish; re-check with
 * GetCapabilities if the overlay ever renders blank»— y fue exacto y no sirvió
 * de nada, porque un aviso en un comentario no lo ejecuta nadie. Ésta es la
 * misma lección que la marca de agua de CARTO, en otro servicio y el mismo día.
 *
 * ## Cómo lo mira
 *
 * Contra el TÍTULO, que es lo que no se mueve, y no contra el número, que es lo
 * que se movió. Si el título aparece bajo otro id, la guarda dice cuál — para
 * que arreglarlo no obligue a repetir la investigación entera.
 *
 * ## Desenlaces
 *
 *   ok            · el número configurado sigue llevando ese título
 *   movida        · el título está, pero en otro id → SALE 1, y lo nombra
 *   sin-capa      · ya no hay ninguna capa con ese título → SALE 1
 *   inalcanzable  · el servicio no contesta → NO COMPROBADO, sale 0
 *
 * `inalcanzable` no bloquea, por el mismo criterio que `check:citations` con
 * sus URLs y que `check:basemap`: una puerta que se pone roja porque se cayó
 * una red ajena se aprende a ignorar. Pero no imprime el visto bueno.
 *
 * ## Por qué no entra en la tabla de inyecciones de `check:guards`
 *
 * Aquí sí habría un fichero que corromper —bastaría cambiar el número en
 * `src/lib/patricova.js`— y aun así no se registra. Aquella tabla anota
 * `fired: true/false`, y esta guarda depende de una red ajena: una noche sin
 * salida a internet devolvería `inalcanzable`, la tabla lo anotaría como «no
 * saltó», y eso se lee como «la guarda no sirve» cuando lo cierto es que no
 * pudo mirar. Es el defecto que este repositorio persigue —doblar «no he
 * podido» dentro de un veredicto— y no se mete justo en el instrumento que
 * existe para cazarlo.
 *
 * La inyección está hecha y se reproduce en un comando:
 *
 *     # con PATRICOVA_FLOOD_LAYER = '59'
 *     npm run check:wms   → ERROR [movida] … es hoy la 60 … (sale 1)
 */
import { PATRICOVA_FLOOD_LAYER, PATRICOVA_URL } from '../src/lib/patricova.js'
import {
  bloqueaWms,
  parseCapasWms,
  valorarWms,
  type ParteWms,
} from '../src/scraper/wms-capabilities.js'

const UA = 'CivicPulse/1.0 (+https://civicpulse.es; monitor ciudadano Riba-roja de Túria)'

async function main(): Promise<ParteWms> {
  const url = `${PATRICOVA_URL}?service=WMS&request=GetCapabilities&version=1.3.0`
  let xml: string
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    xml = await r.text()
  } catch (e) {
    return {
      desenlace: 'inalcanzable',
      idConfigurado: PATRICOVA_FLOOD_LAYER,
      mensaje: `NO COMPROBADO · el servicio del ICV no respondió (${(e as Error).message}); no se afirma nada`,
    }
  }

  const capas = parseCapasWms(xml)
  if (capas.length === 0) {
    // Un documento que llega pero del que no se saca ni una capa no es «no hay
    // capa de inundación»: es que no lo hemos sabido leer. Doblar lo segundo
    // dentro de lo primero es cómo una guarda acusa al servicio de su propio
    // fallo — y pasó de verdad al escribirla: los títulos vienen en CDATA.
    return {
      desenlace: 'inalcanzable',
      idConfigurado: PATRICOVA_FLOOD_LAYER,
      mensaje:
        'NO COMPROBADO · el documento llegó pero no se leyó ninguna capa; ' +
        'probablemente cambió su forma, mirar a mano',
    }
  }

  return valorarWms(PATRICOVA_FLOOD_LAYER, capas)
}

const parte = await main()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(parte, null, 2))
} else {
  const etiqueta = bloqueaWms(parte.desenlace)
    ? 'ERROR'
    : parte.desenlace === 'inalcanzable'
      ? 'AVISO'
      : 'OK'
  console.log(`${etiqueta} [${parte.desenlace}] riesgo de inundación — ${parte.mensaje}`)
  if (parte.desenlace === 'movida') {
    console.log(
      `  arreglo: PATRICOVA_FLOOD_LAYER = '${parte.idEncontrado}' en src/lib/patricova.js`,
    )
  }
}

process.exit(bloqueaWms(parte.desenlace) ? 1 : 0)
