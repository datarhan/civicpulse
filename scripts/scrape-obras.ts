import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseObrasList, parseObraFicha } from '../src/scraper/obras'
import { fetchObrasHtml, fetchFichaText, OBRAS_URL } from '../src/scraper/obras-fetch'
import { buildGazetteer, matchNameToGazetteer } from '../src/scraper/place-resolver'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data')
const OUT = join(DATA, 'obras.json')

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function readJson(name: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(join(DATA, name), 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const html = await fetchObrasHtml()
  if (!html) throw new Error('obras: listing fetch failed')
  const list = parseObrasList(html)

  // gazetteer for the deterministic name→point resolution. buildGazetteer's
  // GazetteerInput is { streets?, pois?, zones?, zoneAliases? } — mirror the
  // subset compute-tender-geo uses; streets + pois cover the obra names
  // (Cementerio/Torre/CEIPs = pois, CV rotondas = streets).
  const streets = await readJson('streets.json')
  const pois = await readJson('civic-poi.json')
  const candidates = buildGazetteer({
    streets: streets?.streets ?? [],
    pois: pois?.pois ?? [],
  })

  const obras = []
  for (const item of list) {
    let ficha = {}
    try {
      const text = await fetchFichaText(item.fichaUrl)
      if (text) ficha = parseObraFicha(text)
    } catch (e) {
      console.warn(`obras: ficha parse failed for ${item.nombre}: ${(e as Error).message}`)
    }
    const f = ficha as ReturnType<typeof parseObraFicha>
    const bajaPct =
      f.importeLicitacion && f.importeAdjudicacion && f.importeLicitacion > 0
        ? Math.round(((f.importeLicitacion - f.importeAdjudicacion) / f.importeLicitacion) * 1000) /
          10
        : undefined
    // PlaceMatch.point is a [lat, lng] TUPLE (not {lat,lng}).
    const match = matchNameToGazetteer(item.nombre, candidates)
    obras.push({
      id: slug(item.nombre),
      ...item,
      ...f,
      bajaPct,
      lat: match?.point?.[0],
      lng: match?.point?.[1],
      placeName: match?.name,
      placeKind: match?.kind,
    })
    await new Promise((r) => setTimeout(r, 300))
  }

  await mkdir(DATA, { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), source: OBRAS_URL, obras }, null, 2),
  )
  const located = obras.filter((o) => o.lat != null).length
  console.log(`wrote ${obras.length} obras · ${located} geo-located`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
