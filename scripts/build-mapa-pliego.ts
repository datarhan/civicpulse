/**
 * Congela el mapa de situación de «matrículas y móviles» en su instantánea
 * (`public/data/reportajes/matriculas-y-moviles.json`, bloque `mapa`).
 *
 *   npm run build:mapa-pliego                     # consulta Overpass
 *   npm run build:mapa-pliego -- --desde <json>   # desde una respuesta guardada
 *   npm run build:mapa-pliego -- --ql             # imprime la consulta y sale
 *
 * El fixture de tests/fixtures/osm_matriculas-pliego_*.json es la respuesta a
 * `--ql`, guardada tal cual la sirvió Overpass.
 *
 * Como toda cifra de un reportaje, el mapa se congela: la nocturna no lo toca,
 * y si OSM cambia el contorno del parque mañana, la figura sigue diciendo lo
 * que decía el día que se publicó, con la fecha de su consulta.
 *
 * Se niega a escribir —sale con 1— si alguna de las tres calles cae dentro del
 * parque: la pieza afirma que ninguno de los aparcamientos está en el Parque
 * Natural, y un mapa que lo contradijera no se publica en silencio; se revisa
 * la frase. Informa de lo que hizo por separado: consultado, dibujado, dentro.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fetchOverpass } from '../src/scraper/overpass-fetch'
import { mapaDelPliego, type ElementoOsm } from '../src/scraper/mapa-pliego'
import { CONFIG_MAPA_PLIEGO as CFG } from '../src/scraper/mapa-pliego-config'

const SNAP = 'public/data/reportajes/matriculas-y-moviles.json'
const [s, w, n, e] = CFG.encuadre
const calles = CFG.aparcamientos.map((a) => a.calle).join('|')
// El recuadro de la consulta, algo mayor que el encuadre (ver abajo).
const caja = [s - 0.01, w - 0.01, n + 0.01, e + 0.01].map((v) => v.toFixed(4)).join(',')

// Las calles y el río se piden dentro de un recuadro algo mayor que el
// encuadre, para que una calle que lo cruza no llegue cortada.
const QL = `[out:json][timeout:90];
(
  relation(${CFG.parque});
  way["highway"]["name"~"^(${calles})$"](${caja});
  node(${CFG.lugar.nodo});
  node(${CFG.pueblo.nodo});
  way["waterway"="river"]["name"="${CFG.rio}"](${caja});
);
out geom;`

async function main() {
  if (process.argv.includes('--ql')) {
    process.stdout.write(QL + '\n')
    return
  }
  const i = process.argv.indexOf('--desde')
  const desde = i > 0 ? process.argv[i + 1] : null
  const raw = desde
    ? JSON.parse(await readFile(desde, 'utf8'))
    : await fetchOverpass(QL, { label: 'mapa-pliego' })
  const consultadoEl = (raw.osm3s?.timestamp_osm_base as string | undefined)?.slice(0, 10) ?? null
  const elementos = (raw.elements ?? []) as ElementoOsm[]

  const mapa = mapaDelPliego(elementos, CFG)
  const dentro = mapa.aparcamientos.filter((a) => a.dentroDelParque)

  console.log(
    `[mapa-pliego] ${desde ? `desde ${desde}` : 'Overpass'} · ${elementos.length} elemento(s) · ` +
      `${mapa.parque.anillos.length} anillo(s) del parque · ` +
      `${mapa.aparcamientos.length}/${CFG.aparcamientos.length} calle(s) dibujada(s) · ` +
      `${dentro.length} dentro del parque · Porxinos ${mapa.lugar.dentroDelParque ? 'dentro' : 'fuera'}`,
  )
  if (dentro.length) {
    console.error(
      `[mapa-pliego] NO SE ESCRIBE: ${dentro.map((a) => a.calle).join(', ')} cae dentro del parque. ` +
        'La pieza dice que ninguno de los aparcamientos lo está: revisa la frase antes que el mapa.',
    )
    process.exit(1)
  }

  const snap = JSON.parse(await readFile(SNAP, 'utf8'))
  snap.mapa = {
    ...mapa,
    fuente: {
      nombre: 'OpenStreetMap',
      licencia: 'ODbL',
      atribucion: '© colaboradores de OpenStreetMap',
      consultadoEl,
      relacion: mapa.parque.id,
      nodo: mapa.lugar.nodo,
    },
  }
  await writeFile(SNAP, JSON.stringify(snap, null, 2) + '\n')
  console.log(`[mapa-pliego] escrito el bloque \`mapa\` en ${SNAP} (OSM a ${consultadoEl})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
