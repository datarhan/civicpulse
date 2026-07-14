import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseObrasList,
  parseObraFicha,
  parseRenoveList,
  parseRenoveFicha,
} from '../src/scraper/obras'
import { fetchObrasHtml, fetchFichaText, OBRAS_URL, RENOVE_URL } from '../src/scraper/obras-fetch'
import {
  buildGazetteer,
  matchNameToGazetteer,
  resolvePlace,
  foldTitle,
  type Candidate,
  type PlaceMatch,
} from '../src/scraper/place-resolver'
import { ZONE_ALIASES } from '../src/scraper/tender-geo'
import {
  validateGazetteerSupplement,
  supplementToGazetteerInput,
} from '../src/scraper/gazetteer-supplement'

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

const geoFields = (match: PlaceMatch | null) => ({
  lat: match?.point?.[0],
  lng: match?.point?.[1],
  placeName: match?.name,
  placeKind: match?.kind,
})

/** FEDER 2019–2020 lote — "obras de infraestructuras en curso" fichas. */
async function scrapeFeder(candidates: Candidate[]) {
  const html = await fetchObrasHtml(OBRAS_URL)
  if (!html) throw new Error('obras: FEDER listing fetch failed')
  const list = parseObrasList(html)

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
    // School-consistency: a CEIP/escola obra's tokens can be sparse enough to
    // collide with an unrelated place once the municipality name is stripped
    // ("Camp de Túria" → "camp" → a football pitch). Restrict the candidate pool
    // to school POIs BEFORE matching (a positive filter, not match-then-reject)
    // so the correct school wins even when a same-token non-school POI sorts
    // first, and no non-school pin can slip in for a school obra.
    const SCHOOL_RE = /col·?legi|colegio|ceip|escola|escuela|educaci|institut|ies\b/i
    const isSchool = SCHOOL_RE.test(item.nombre)
    const pool = isSchool ? candidates.filter((c) => SCHOOL_RE.test(c.name)) : candidates
    const match = matchNameToGazetteer(geoName, pool)
    obras.push({
      id: slug(item.nombre),
      programa: 'feder' as const,
      ...item,
      ...f,
      bajaPct,
      ...geoFields(match),
    })
    await new Promise((r) => setTimeout(r, 300))
  }
  return obras
}

/** Plan RENOVE de viales — fichas feb 2024 under urbanismo/vias_y_obras. */
async function scrapeRenove(candidates: Candidate[]) {
  const html = await fetchObrasHtml(RENOVE_URL)
  if (!html) throw new Error('obras: RENOVE listing fetch failed')
  const list = parseRenoveList(html)

  const obras = []
  for (const item of list) {
    let ficha = {}
    try {
      const text = await fetchFichaText(item.fichaUrl)
      if (text) ficha = parseRenoveFicha(text)
    } catch (e) {
      console.warn(`obras: renove ficha parse failed for ${item.nombre}: ${(e as Error).message}`)
    }
    const f = ficha as ReturnType<typeof parseRenoveFicha>
    // The zona afectada names the actual streets/urbanización — scan it with
    // the same honesty-gated resolver the tender map uses (street matches need
    // a street-type word, which the zona text carries: C/, Calle, Avda…).
    // Fall back to the listing name ("Asfaltado La Llobatera II") if the zona
    // is missing. No match → no pin, never a guess.
    const match =
      (f.zona ? resolvePlace(foldTitle(f.zona), candidates) : null) ??
      matchNameToGazetteer(item.nombre, candidates)
    obras.push({
      id: slug(item.nombre),
      programa: 'renove' as const,
      ...item,
      ...f,
      ...geoFields(match),
    })
    await new Promise((r) => setTimeout(r, 300))
  }
  return obras
}

async function main() {
  // gazetteer for the deterministic name→point resolution. Streets + POIs
  // cover the FEDER obra names (Cementerio/Torre/CEIPs = pois, CV rotondas =
  // streets); zones + curated aliases let a RENOVE zona like "Urb. La
  // Llobatera" resolve when none of its streets are in the gazetteer.
  const streets = await readJson('streets.json')
  const pois = await readJson('civic-poi.json')
  const geo = await readJson('geo.json')
  const zones = (geo?.neighborhoods ?? []).map(
    (n: { slug: string; name: string; centroid: [number, number] }) => ({
      slug: n.slug,
      name: n.name,
      centroid: n.centroid,
    }),
  )
  // Curated gazetteer supplement — same merge as compute-tender-geo.ts.
  const suppSnap = await readJson('gazetteer-supplement.json')
  if (suppSnap) validateGazetteerSupplement(suppSnap)
  const supp = suppSnap
    ? supplementToGazetteerInput(suppSnap)
    : { streets: [], pois: [], zones: [], zoneAliases: {} }
  const candidates = buildGazetteer({
    streets: [...(streets?.streets ?? []), ...supp.streets],
    pois: [...(pois?.pois ?? []), ...supp.pois],
    zones: [...zones, ...supp.zones],
    zoneAliases: { ...ZONE_ALIASES, ...supp.zoneAliases },
  })

  // Newest lote first (RENOVE 2023–24, then FEDER 2019–20). Each lote is
  // fatal on listing-fetch failure so a WAF change can't silently shrink the
  // snapshot to one source.
  const renove = await scrapeRenove(candidates)
  const feder = await scrapeFeder(candidates)
  const obras = [...renove, ...feder]

  await mkdir(DATA, { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: OBRAS_URL,
        sources: { feder: OBRAS_URL, renove: RENOVE_URL },
        obras,
      },
      null,
      2,
    ),
  )
  const located = obras.filter((o) => o.lat != null).length
  console.log(
    `wrote ${obras.length} obras (${renove.length} renove + ${feder.length} feder) · ${located} geo-located`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
