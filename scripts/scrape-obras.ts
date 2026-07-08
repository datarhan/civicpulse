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
    // Geo-resolve on a normalised name: strip the GVA program prefix "Pla
    // Edificant" (a funding-line label, not a place) so the school obras match
    // their CEIP POI — matchNameToGazetteer requires EVERY input token to hit,
    // and "pla"/"edificant" have no gazetteer counterpart. Display `nombre`
    // stays full. PlaceMatch.point is a [lat, lng] TUPLE (not {lat,lng}).
    const geoName = item.nombre.replace(/^\s*pla\s+edificant\s+/i, '')
    let match = matchNameToGazetteer(geoName, candidates)
    // School-consistency guard: a CEIP/escola obra's tokens can be sparse enough
    // to collide with an unrelated place once the municipality name is stripped
    // ("CEIP Camp de Túria" → "camp" → a football field). A school obra may only
    // map to a school POI; otherwise honest null beats a wrong pin.
    const isSchool = /ceip|col·?legi|colegio|escola|escuela/i.test(item.nombre)
    if (match && isSchool && !/col·?legi|colegio|ceip|escola|escuela|educaci/i.test(match.name)) {
      match = null
    }
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
