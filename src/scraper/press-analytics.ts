/**
 * Press laboratory analytics. Three pure functions over the already-
 * produced JSON snapshots (press.json, press-claims-verified.json,
 * plenos-agendas.json, promises.json):
 *
 *   1. Trust Project indicators (per-article + per-outlet scoreboard).
 *      We don't fetch outlet About pages; instead we infer the
 *      8-indicator subset that is verifiable from our local data trail:
 *       - localCoverage: article URL host belongs to a local Camp de
 *         Túria outlet (`LOCAL_HOSTS`) OR the source name says so. An
 *         administration is never a local outlet (`esFuenteOficial`).
 *       - datedArticle: ISO publish date parses correctly.
 *       - municipalSourceMatch: alguna afirmación cotejada CON DATOS
 *         MUNICIPALES volvió `verificado`; `null` si no se cotejó ninguna
 *         contra ellos. Una fila de evidencia no basta, y el catálogo de
 *         promesas no es un dato municipal: ver `coincidenciaMunicipal`.
 *       - corroboratedAcrossOutlets: `true` when ≥2 INDEPENDENT outlets
 *         (by host; an administration's press note does not count) tell
 *         the same story (clusterArticlesByStory). `null` otherwise, never
 *         `false`: the title clustering misses the same story told in
 *         Valencian and in Castilian, so not finding a second outlet is
 *         not evidence that there is none.
 *       - factualClaimsPresent: extractor emitted ≥1 claim with
 *         confidence ≥0.5; `false` when it processed the headline and
 *         found none; `null` when it never processed it.
 *       - opinionFraction: ratio of opinativa accusations to total
 *         claims. Lower is more "news-y", higher is more "opinion".
 *      We deliberately do NOT rank outlets — ranking with <10 articles
 *      is statistical noise; the lab page sorts by raw article count.
 *
 *   2. Triangulation — for every story told by ≥2 outlets (title
 *      similarity, see clusterArticlesByStory), collect the outlets that
 *      ran it and the verdict mix on their bundled claims. Surfaces "the
 *      same story, told three ways". It does not compare their figures:
 *      see the note on TriangulationCluster.
 *
 *   3. Coverage gaps — pleno agenda items + curated promises with
 *      ZERO press mentions in a 14-day rolling window. Tells the
 *      reader which decisions the local press isn't following.
 *
 * All three functions are pure and synchronous; the CLI wrapper
 * (scripts/compute-press-analytics.ts) does the IO. All three drop classified
 * ads from the feed first (`esAnuncioClasificado`, press-clasificado.ts): a
 * property portal's listing is not press.
 */

import { fingerprintFor } from './press'
import { CORPUS_NO_MUNICIPALES, corpusMunicipales, corpusReales } from './claim-verdicts'
import type { ClaimVerdict } from './claim-verifier'
import type { PressClaim } from './press-claim'
import type { PressClaimVerification } from './press-verifier'
import { desenlaceVigente, type ExtraccionArticulo } from './press-extraccion'
import { esFuenteOficial } from './press-fuente-oficial'
import { sinAnunciosClasificados } from './press-clasificado'

/**
 * Hosts of LOCAL outlets: newsrooms of the Camp de Túria, which is what
 * «Cobertura local» says. The set used to hold Levante-EMV, Las Provincias,
 * Valencia Plaza, elDiario.es and the Cadena SER — regional and national
 * outlets — and the council's own ribarroja.es, which is not an outlet at all;
 * so the chip was lit for most of the feed and meant nothing. Exported so a
 * test pins what it holds (tests/press-analitica-medios.test.ts).
 */
export const LOCAL_HOSTS: ReadonlySet<string> = new Set(['infoturia.com'])

/**
 * Source names that make an outlet local. Only names tied to the comarca or the
 * town: «periòdic» and «comarcal» alone matched any Valencian paper or comarca.
 * An administration that carries the town's name (the Ayuntamiento) is caught
 * by `esFuenteOficial` before this list is read.
 */
const LOCAL_SOURCE_HINTS = ['camp de túria', 'ribarroja', 'riba-roja']

// ─── 1. Trust Project indicators ────────────────────────────────────────────

export interface ArticleTrustRow {
  articleId: string
  articleFingerprint: string
  outlet: string
  outletHost: string | null
  url: string
  date: string
  indicators: {
    localCoverage: boolean
    datedArticle: boolean
    /**
     * `true` alguna afirmación cotejada volvió `verificado` · `false` se cotejó
     * alguna y ninguna volvió `verificado` · `null` NO COTEJADO: del titular no
     * salió ninguna afirmación, o ninguna se cotejó contra un corpus. Los dos
     * últimos se pintaban igual, y el círculo vacío decía «no coincide con los
     * datos municipales» sobre titulares que nadie había comprobado. Ver
     * `coincidenciaMunicipal`.
     */
    municipalSourceMatch: boolean | null
    /**
     * `true` ≥2 independent outlets ran the story · `null` none found. Never
     * `false`: absence of a detected cluster is not evidence of no coverage.
     */
    corroboratedAcrossOutlets: true | null
    /**
     * `true` ≥1 claim with confidence ≥0.5 · `false` the extractor processed
     * this headline and kept none · `null` it never processed it (or the
     * model did not answer), so nothing is known either way.
     */
    factualClaimsPresent: boolean | null
    opinionFraction: number
  }
  score: number
}

export interface OutletScorecard {
  outlet: string
  outletHost: string | null
  articleCount: number
  /** Every claim of the outlet's articles, by verdict — checked or not. */
  verdictCounts: Record<ClaimVerdict, number>
  /**
   * How many of those claims were checked against some corpus
   * (`corpusReales(checkedAgainst)` non-empty) — the divisor of the ratios.
   */
  checkedClaims: number
  meanTrustScore: number
  // null (not 0) when the outlet has no CHECKED claims — the UI renders "—",
  // so a monitored-but-unverified outlet never masquerades as "0% verified".
  verifiedRatio: number | null
  contradictedRatio: number | null
}

export interface TrustIndicatorsReport {
  generatedAt: string
  windowDays: number
  articles: ArticleTrustRow[]
  outlets: OutletScorecard[]
}

export interface PressArticleLite {
  id: string
  title: string
  link: string
  source: string
  sourceHost: string | null
  date: string
  fingerprint: string
  /** press.ts stamps it on the council's own feed; see `esFuenteOficial`. */
  official?: boolean
}

export interface VerifiedClaimRow {
  claim: PressClaim
  verification: PressClaimVerification
}

/**
 * «Coincide con datos municipales», en tres estados, y cada uno dice lo que se
 * hizo con las afirmaciones del titular, no lo que hay en su lista de evidencia.
 *
 * `null`, «sin comprobar»: no se cotejó ninguna. Sin claims no hay cotejo, y
 * `[].some(...)` es `false` — el mismo valor que «se cotejó y no coincide». La
 * página pintaba el círculo vacío junto a «Coincide con datos municipales» para
 * el titular del agua potable (55,6 M€ / 17 años), que SÍ está en el snapshot de
 * contratos: lo que pasó es que el extractor no sacó ninguna afirmación, un hecho
 * sobre el extractor y no sobre el contrato. Una claim cuyo `checkedAgainst` no
 * nombra ningún corpus tampoco se cotejó, y el 28-09-2026 cinco titulares salían
 * «○» así. Es la regla 3: un centinela no es un valor.
 *
 * `true`, sólo si alguna cotejada volvió `verificado`. Se encendía con CUALQUIER
 * fila de evidencia, y una fila de evidencia es un documento cotejado, no uno que
 * sostenga la frase: el enum de `stance` no tiene `corroborates` (cabecera de
 * press-verifier.ts). Así la nota municipal de los contenedores (`1lk4zls`,
 * 25-09-2026) salía en verde, y con 6 puntos de 6, por un contrato de pérgolas de
 * 131.336 € colgado de su afirmación `parcial` — y «Parcial» es, en la escala que
 * publica /metodologia, «el detalle no coincide en su totalidad». Por el mismo
 * camino lo habrían encendido una `contradicho`, una `promesa-repetida` o el
 * expediente que «no dice eso» de una `sin-datos`. «Verificado» es el único
 * veredicto que esa escala define como «coincide con el documento municipal».
 *
 * El marcador sigue al indicador: `Number(null)` es 0, igual que `Number(false)`,
 * y el punto sólo lo gana una `verificado`.
 */
function coincidenciaMunicipal(claims: VerifiedClaimRow[]): boolean | null {
  const cotejadas = claims.filter(cotejadaConDatosMunicipales)
  if (cotejadas.length === 0) return null
  return cotejadas.some((c) => c.verification.verdict === 'verificado')
}

// `CORPUS_NO_MUNICIPALES` y `corpusMunicipales` viven en claim-verdicts.ts, junto a
// `corpusReales`: la página (src/lib/press-lab.js) cuenta con la misma regla.
export { CORPUS_NO_MUNICIPALES, corpusMunicipales }

function cotejadaConDatosMunicipales(c: VerifiedClaimRow): boolean {
  return corpusMunicipales(c.verification.checkedAgainst).length > 0
}

/** Checked against some real corpus: a pass marker alone does not count. */
function cotejada(c: VerifiedClaimRow): boolean {
  return corpusReales(c.verification.checkedAgainst).length > 0
}

/**
 * «Afirmaciones contrastables», en tres estados. Era `claims.some(...)`, y para
 * un titular que el extractor nunca procesó eso es `false`: el 19-10-2026, 38 de
 * los 65 titulares de la ventana salían «○» justo debajo de la frase de la misma
 * tarjeta que dice «Este titular aún no ha pasado por el extractor». Regla 2: «no
 * corrió» no es «no encontró».
 *
 *   · con afirmaciones publicadas: lo que digan sus confianzas;
 *   · procesado sin afirmaciones (`sin-afirmaciones`, `descartado-en-triaje`):
 *     `false`, que es lo que el extractor dijo;
 *   · todo lo demás —sin fila, huella cambiada, `llm-no-disponible`, o
 *     `extraido` con todas retenidas por el filtro editorial, cuya confianza no
 *     se ve—: `null`. Sin bloque `extraccion` (un snapshot anterior) no hay fila
 *     de ningún titular, y uno sin afirmaciones es `null` por lo mismo.
 */
function afirmacionesContrastables(
  claims: VerifiedClaimRow[],
  desenlace: ExtraccionArticulo['desenlace'] | null,
): boolean | null {
  if (claims.length > 0) return claims.some((c) => c.claim.confidence >= 0.5)
  if (desenlace === 'sin-afirmaciones' || desenlace === 'descartado-en-triaje') return false
  return null
}

/** The outlet is the publisher host; with no host, the name is all there is. */
export function claveDeMedio(a: { sourceHost: string | null; source: string }): string {
  return a.sourceHost ?? `name:${a.source}`
}

/**
 * The distinct outlets among `articles`, one name per publisher host.
 *
 * The outlet is the HOST, not the name Google News prints: it gives one site
 * under more than one name. On 2026-10-18 thirteen fotocasa.es listings,
 * twelve named «Fotocasa» and one «Fotocasa.es», counted as two outlets, so
 * /laboratorio marked them «corroborated across outlets» — 13 of its 30.
 * Without a host the name is all there is. The name kept is the
 * alphabetically first, so the published list does not depend on feed order.
 */
export function distinctOutlets(articles: ReadonlyArray<PressArticleLite>): string[] {
  const nameByHost = new Map<string, string>()
  for (const a of articles) {
    const key = claveDeMedio(a)
    const prev = nameByHost.get(key)
    if (prev === undefined || a.source.localeCompare(prev) < 0) nameByHost.set(key, a.source)
  }
  return [...nameByHost.values()].sort()
}

/**
 * The distinct outlets that can corroborate each other: `distinctOutlets`
 * without administrations. On 2026-10-19 seven of the eight published
 * «Cobertura comparada · 2 medios» groups were the Ayuntamiento's press note
 * plus a newspaper reprinting it — one source, counted twice.
 */
export function medioIndependientes(articles: ReadonlyArray<PressArticleLite>): string[] {
  return distinctOutlets(articles.filter((a) => !esFuenteOficial(a)))
}

export function computeTrustIndicators(opts: {
  press: PressArticleLite[]
  verified: VerifiedClaimRow[]
  /**
   * The extractor's per-article outcomes (`extraccion.articulos` of
   * press-claims-verified.json). `null`/absent for a snapshot older than the
   * block: then no headline without claims can be said to have been processed.
   */
  extraccion?: ExtraccionArticulo[] | null
  windowDays?: number
  now?: Date
}): TrustIndicatorsReport {
  const windowDays = opts.windowDays ?? 30
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const press = sinAnunciosClasificados(opts.press).filter((p) => p.date >= cutoff)

  const claimsByArticle = new Map<string, VerifiedClaimRow[]>()
  for (const row of opts.verified) {
    const arr = claimsByArticle.get(row.claim.articleId)
    if (arr) arr.push(row)
    else claimsByArticle.set(row.claim.articleId, [row])
  }

  const filaDe = new Map((opts.extraccion ?? []).map((f) => [f.articleId, f]))

  // Same-story clustering as triangulation — see clusterArticlesByStory for
  // why exact fingerprint identity can never answer this. Only independent
  // outlets count (`medioIndependientes`).
  const outletsByArticleId = new Map<string, number>()
  for (const group of clusterArticlesByStory(press).values()) {
    const outlets = medioIndependientes(group).length
    for (const a of group) outletsByArticleId.set(a.id, outlets)
  }

  const articles: ArticleTrustRow[] = press.map((p) => {
    const claims = claimsByArticle.get(p.id) ?? []
    const opinionCount = claims.filter(
      (c) => c.claim.type === 'acusacion_publica' && c.claim.accusationSubtype === 'opinativa',
    ).length
    const opinionFraction = claims.length === 0 ? 0 : opinionCount / claims.length

    const municipalSourceMatch = coincidenciaMunicipal(claims)

    const ind: ArticleTrustRow['indicators'] = {
      localCoverage:
        !esFuenteOficial(p) &&
        (LOCAL_HOSTS.has(p.sourceHost ?? '') ||
          LOCAL_SOURCE_HINTS.some((h) => p.source.toLowerCase().includes(h))),
      datedArticle: !!p.date && !Number.isNaN(new Date(p.date).getTime()),
      municipalSourceMatch,
      corroboratedAcrossOutlets: (outletsByArticleId.get(p.id) ?? 0) >= 2 ? true : null,
      factualClaimsPresent: afirmacionesContrastables(
        claims,
        desenlaceVigente(p, filaDe.get(p.id)),
      ),
      opinionFraction,
    }

    // The "not opinion" axis only earns credit once claims have actually been
    // extracted. With zero claims, opinionFraction is a vacuous 0 — awarding
    // (1 - 0) would hand every un-analysed article a free trust point it never
    // earned, inflating outlet scores that were never really assessed.
    const score =
      Number(ind.localCoverage) +
      Number(ind.datedArticle) +
      Number(ind.municipalSourceMatch) +
      Number(ind.corroboratedAcrossOutlets) +
      Number(ind.factualClaimsPresent) +
      (claims.length === 0 ? 0 : 1 - ind.opinionFraction)

    return {
      articleId: p.id,
      articleFingerprint: p.fingerprint,
      outlet: p.source,
      outletHost: p.sourceHost,
      url: p.link,
      date: p.date,
      indicators: ind,
      score: Math.round(score * 100) / 100,
    }
  })

  // One row per publisher HOST, named as `distinctOutlets` names it. Grouped by
  // the Google News name, fotocasa.es was two rows on 2026-10-19, «Fotocasa»
  // (11) and «Fotocasa.es» (1) — the defect 18a952e1 fixed for cross-coverage.
  const byOutlet = new Map<string, { rows: ArticleTrustRow[]; host: string | null }>()
  for (const a of articles) {
    const key = claveDeMedio({ sourceHost: a.outletHost, source: a.outlet })
    const entry = byOutlet.get(key)
    if (entry) entry.rows.push(a)
    else byOutlet.set(key, { rows: [a], host: a.outletHost })
  }

  const outlets: OutletScorecard[] = []
  for (const { rows, host } of byOutlet.values()) {
    const outlet = rows.map((r) => r.outlet).sort((a, b) => a.localeCompare(b))[0]
    const articleIds = rows.map((r) => r.articleId)
    const verdictCounts: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    let checkedClaims = 0
    for (const id of articleIds) {
      const claims = claimsByArticle.get(id) ?? []
      for (const c of claims) {
        verdictCounts[c.verification.verdict] += 1
        if (cotejada(c)) checkedClaims += 1
      }
    }
    const meanTrustScore = rows.reduce((acc, r) => acc + r.score, 0) / Math.max(rows.length, 1)
    // El mismo defecto que en `src/lib/press-lab.js`, un nivel más abajo: la
    // tabla de fiabilidad publicaba «Discrepa 0 %» en rojo para cada medio con
    // artículos, sobre unas claims que están todas `sin-datos`. Arreglar sólo
    // la tarjeta de arriba y dejar la tabla diciendo 0 % habría sido media
    // corrección — y la mitad que se lee está en la tabla, medio por medio.
    //
    // La asimetría se mantiene: verificado es una COBERTURA («0 de 30
    // comprobadas» es verdad y es lo que se quiere saber), discrepancia es un
    // HALLAZGO y sobre nada examinado no vale 0, no existe.
    //
    // Y el divisor es lo COTEJADO, no todo lo extraído. El 19-10-2026 la fila del
    // Ayuntamiento decía «0 % · 0 de 26 afirm.» y 21 de esas 26 no se habían
    // buscado en ningún corpus (`checkedAgainst: []`): eran 0 de 5. Una
    // afirmación que nadie cotejó no puede salir verificada ni contradicha, así
    // que tampoco divide; la página dice aparte cuántas quedan sin cotejar. Sin
    // ninguna cotejada, las dos tasas son null.
    const sinResolver = verdictCounts.verificado + verdictCounts.contradicho === 0
    const verifiedRatio = checkedClaims === 0 ? null : verdictCounts.verificado / checkedClaims
    const contradictedRatio =
      sinResolver || checkedClaims === 0 ? null : verdictCounts.contradicho / checkedClaims

    outlets.push({
      outlet,
      outletHost: host,
      articleCount: rows.length,
      verdictCounts,
      checkedClaims,
      meanTrustScore: Math.round(meanTrustScore * 100) / 100,
      verifiedRatio: verifiedRatio === null ? null : Math.round(verifiedRatio * 1000) / 1000,
      contradictedRatio:
        contradictedRatio === null ? null : Math.round(contradictedRatio * 1000) / 1000,
    })
  }
  outlets.sort((a, b) => b.articleCount - a.articleCount)

  return {
    generatedAt: now.toISOString(),
    windowDays,
    articles,
    outlets,
  }
}

// ─── 2. Triangulation ──────────────────────────────────────────────────────

export interface TriangulationCluster {
  // A cluster spans MULTIPLE articles/fingerprints (the same story across
  // outlets), so it can't be keyed by a single title fingerprint. `clusterId`
  // is a deterministic representative key (smallest member fingerprint);
  // consumers join to articles via `articleIds`, not this field.
  clusterId: string
  articleIds: string[]
  /** The INDEPENDENT outlets that ran the story, one per host; ≥2 by construction. */
  outlets: string[]
  /**
   * Administrations whose press note is in the group (`esFuenteOficial`). Named
   * apart because they do not corroborate: they are the source, not a witness.
   */
  fuentesOficiales: string[]
  earliestDate: string
  latestDate: string
  // Ninguna cifra. El grupo publicaba `amountDrift` —el máximo menos el mínimo de
  // TODAS las `amountEuros` de sus artículos— y /laboratorio lo pintaba como
  // «cifras divergen». Medido el 28-09-2026 sobre su historial, ninguna de las
  // siete historias a las que puso cifras era una divergencia: dos eran una parte
  // contra su total (los 180.000 € de una adjudicación contra los 135.000 € que
  // paga el PSTD, en una misma nota; los 100.000 € de fachadas contra los
  // 140.000 € del programa, uno en cada medio) y cinco daban la misma cifra en
  // todos sus medios, publicada como «divergen €0». Ningún campo dice qué
  // magnitud mide cada cifra, y sin eso compararlas es poner juntas dos cifras
  // ciertas sin el puente que las cuadra. Una discrepancia real entre medios es
  // un hallazgo y la firma una persona curadora. La historia entera, con las
  // filas: tests/triangulacion-cifras.test.ts.
  verdictMix: Record<ClaimVerdict, number>
}

export interface TriangulationReport {
  generatedAt: string
  clusters: TriangulationCluster[]
  stats: {
    totalClusters: number
    triangulated3Plus: number
  }
}

// Two headlines describe "the same story" when their significant-token sets
// (>4 chars, see `tokenise`) overlap strongly. The upstream feed is deduped by
// exact-title fingerprint (press.ts), so cross-outlet coverage ALWAYS arrives
// as distinct fingerprints — clustering must key on similarity, not the hash.
// Tuned for precision (a false cross-outlet cluster misleads readers): require
// both a floor of shared distinctive tokens AND a Jaccard threshold.
const TRIANGULATION_MIN_SHARED_TOKENS = 2
const TRIANGULATION_MIN_JACCARD = 0.34

function titlesSameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  if (shared < TRIANGULATION_MIN_SHARED_TOKENS) return false
  const union = a.size + b.size - shared
  return union > 0 && shared / union >= TRIANGULATION_MIN_JACCARD
}

/**
 * The same test on two headlines, for a caller that pairs them itself:
 * /cambios (`prensa-por-noticia.ts`) adds a date and an outlet condition, so it
 * cannot reuse the components `clusterArticlesByStory` builds.
 */
export function titularesDeLaMismaHistoria(a: string, b: string): boolean {
  return titlesSameStory(new Set(tokenise(a)), new Set(tokenise(b)))
}

/**
 * Group articles that tell the same story, by title-token similarity.
 *
 * Connected components (union-find). O(n²) similarity scan is fine at feed
 * scale (≤ a few hundred articles).
 *
 * Shared deliberately. `computeTrustIndicators` used to answer the same
 * question — "did another outlet cover this?" — by comparing exact
 * `fingerprint` hashes, which cannot ever be true: press.ts fingerprints the
 * first six significant words of the title and DROPS the second outlet on a
 * collision, so cross-outlet coverage arrives as distinct fingerprints by
 * construction. The result was measurable nonsense inside one pipeline run —
 * triangulation reported 5 cross-outlet clusters spanning 13 articles while
 * the trust table reported 0 corroborated articles, silently docking every
 * article one of its six trust points.
 */
export function clusterArticlesByStory(
  articles: PressArticleLite[],
): Map<number, PressArticleLite[]> {
  const tokenSets = articles.map((p) => new Set(tokenise(p.title)))
  const parent = articles.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (i: number, j: number) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj)
  }
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (titlesSameStory(tokenSets[i], tokenSets[j])) union(i, j)
    }
  }
  const components = new Map<number, PressArticleLite[]>()
  for (let i = 0; i < articles.length; i++) {
    const root = find(i)
    const arr = components.get(root)
    if (arr) arr.push(articles[i])
    else components.set(root, [articles[i]])
  }
  return components
}

export function computeTriangulation(opts: {
  press: PressArticleLite[]
  verified: VerifiedClaimRow[]
  windowDays?: number
  now?: Date
}): TriangulationReport {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? 30
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const recent = sinAnunciosClasificados(opts.press).filter((p) => p.date >= cutoff)

  const components = clusterArticlesByStory(recent)

  const verByArticle = new Map<string, VerifiedClaimRow[]>()
  for (const v of opts.verified) {
    const arr = verByArticle.get(v.claim.articleId)
    if (arr) arr.push(v)
    else verByArticle.set(v.claim.articleId, [v])
  }

  const clusters: TriangulationCluster[] = []
  for (const articles of components.values()) {
    const outlets = medioIndependientes(articles)
    // Triangulation = corroboration ACROSS outlets; a same-outlet echo isn't it,
    // and neither is a newspaper reprinting the council's own press note.
    if (outlets.length < 2) continue
    const dates = articles.map((a) => a.date).sort()
    const verdictMix: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    for (const a of articles) {
      for (const c of verByArticle.get(a.id) ?? []) verdictMix[c.verification.verdict] += 1
    }
    clusters.push({
      clusterId: articles.map((a) => a.fingerprint).sort()[0],
      articleIds: articles.map((a) => a.id).sort(),
      outlets,
      fuentesOficiales: distinctOutlets(articles.filter((a) => esFuenteOficial(a))),
      earliestDate: dates[0],
      latestDate: dates[dates.length - 1],
      verdictMix,
    })
  }

  clusters.sort(
    (a, b) => b.outlets.length - a.outlets.length || a.clusterId.localeCompare(b.clusterId),
  )

  return {
    generatedAt: now.toISOString(),
    clusters,
    stats: {
      totalClusters: clusters.length,
      triangulated3Plus: clusters.filter((c) => c.outlets.length >= 3).length,
    },
  }
}

// ─── 3. Coverage gaps ──────────────────────────────────────────────────────
//
// «Lo que la prensa local no está siguiendo»: los puntos del pleno y las promesas
// de los últimos 14 días que ningún titular de un medio independiente recoge.
//
// Un candidato tiene eco cuando UN titular comparte con su título al menos
// `MIN_PALABRAS_COMPARTIDAS` palabras de contenido (`palabrasDeContenido`). Hasta
// el 19-10-2026 bastaba UNA palabra de más de cuatro letras, y se buscaba en la
// bolsa de las palabras de TODOS los titulares de la ventana. En el pleno zrbgic
// (5-10-2026) salían «seguidos» cinco puntos y una promesa, y cuatro de los cinco
// puntos lo eran por casualidad: el
// servicio de transportes por «proyecto» (una pieza de Interempresas sobre las
// canteras), la moción del PP y VOX por «túria» (en 20 titulares, 12 de ellos
// anuncios de Fotocasa), el césped del estadio por «suministro» (el del agua) y
// «Dar cuenta de las Resoluciones» por «cuenta» (la Cuenta General). Y la promesa
// de congelar la tarifa del agua, por «nuevo». Lo medido está en
// tests/press-lagunas-cobertura.test.ts, con las filas de ese día.
//
// Tres reglas más, cada una por un caso de ese día:
//
//   · Una sola palabra no basta, por distintiva que parezca. «Veolia» está en el
//     titular de Valencia Plaza sobre el contrato del agua, y la promesa es
//     congelar la tarifa: el mismo asunto no es la misma noticia.
//   · La nota de prensa de una administración (`esFuenteOficial`) no es eco: es
//     la fuente contándose a sí misma. La única pieza que comparte palabras con la
//     moción del 9 d'Octubre es la nota del Ayuntamiento sobre su propio acto.
//   · Los trámites fijos del orden del día (`esTramiteDePleno`) no son candidatos:
//     que ningún periódico titule «Ruegos y preguntas» no es una laguna.
//
// El error contrario existe —un eco real contado con otras palabras, o en
// valenciano, sale como laguna—, y la tarjeta dice cómo se cuenta.

export interface CoverageGapItem {
  kind: 'pleno-item' | 'promise'
  refId: string
  label: string
  date: string
  /** Siempre '': un candidato sin eco no tiene palabra. Se queda por compatibilidad. */
  keyword: string
}

/** Un candidato que sí tiene eco: con qué titular, de qué medio, y qué palabras comparte. */
export interface CoverageEcho {
  kind: 'pleno-item' | 'promise'
  refId: string
  label: string
  date: string
  articleId: string
  outlet: string
  shared: string[]
}

export interface CoverageGapsReport {
  generatedAt: string
  windowDays: number
  items: CoverageGapItem[]
  covered: CoverageEcho[]
  stats: {
    plenoItemsUncovered: number
    promisesUncovered: number
    /**
     * How many pleno items + promises fell inside the window and were looked at
     * (procedural items excluded). Zero means "nothing to check", which the UI
     * must not render as "the press covered everything".
     */
    candidatesExamined: number
    /** Puntos del pleno de la ventana que son trámite y no se examinan. */
    tramitesExcluidos: number
    /** Titulares contra los que se buscó: de medios independientes, sin anuncios. */
    titularesConsiderados: number
  }
}

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4)
}

/** Cuántas palabras de contenido tiene que compartir UN titular con un candidato. */
export const MIN_PALABRAS_COMPARTIDAS = 2

/**
 * Lo que no es contenido, ya sin tildes: el nombre del pueblo, palabras vacías de
 * más de cuatro letras, y las fórmulas de trámite y de nota de prensa que salen en
 * cualquier punto del pleno o en cualquier titular. «cuenta» NO está: sola no basta
 * (hacen falta dos), y con «general» es la Cuenta General, que sí es noticia; el
 * «Dar cuenta de las Resoluciones» que casaba por ella es un trámite y ya no entra.
 */
const NO_CONTENIDO: ReadonlySet<string> = new Set([
  // El municipio y la comunidad: salen en casi todos los titulares.
  'ribarroja',
  'turia',
  'valencia',
  'valenciana',
  'comunitat',
  // Vacías, castellano y valenciano.
  'sobre',
  'desde',
  'entre',
  'hasta',
  'hacia',
  'contra',
  'durante',
  'segun',
  'donde',
  'cuando',
  'porque',
  'aunque',
  'mientras',
  'ademas',
  'tambien',
  'todos',
  'todas',
  'otros',
  'otras',
  'mismo',
  'misma',
  'antes',
  'despues',
  'siendo',
  'estos',
  'estas',
  'nuestro',
  'nuestra',
  'puede',
  'pueden',
  'tiene',
  'tienen',
  'durant',
  'despres',
  'abans',
  'segons',
  'perque',
  'totes',
  'altres',
  'aquest',
  'aquesta',
  'aquests',
  'aquestes',
  'nostre',
  'nostra',
  'mentre',
  'sense',
  // Fórmulas de trámite y de nota de prensa.
  'acuerdo',
  'acord',
  'aprobacion',
  'aprueba',
  'aprobado',
  'aprobada',
  'aprovacio',
  'aprova',
  'inicio',
  'inicia',
  'expediente',
  'expedient',
  'proyecto',
  'proyectos',
  'projecte',
  'nuevo',
  'nueva',
  'nuevos',
  'nuevas',
  'servicio',
  'servicios',
  'servei',
  'serveis',
  'suministro',
  'subministrament',
  'contrato',
  'contratos',
  'contracte',
  'contratacion',
  'contractacio',
  'licitacion',
  'licitacio',
  'procedimiento',
  'procediment',
  'adjudicacion',
  'adjudicacio',
  'municipal',
  'municipales',
  'municipals',
  'municipio',
  'municipi',
  'ayuntamiento',
  'ajuntament',
  'pleno',
  'mocion',
  'mocio',
  'grupo',
  'grupos',
  'grups',
  'asunto',
  'asuntos',
  'urgencia',
  'modificacion',
  'modificacio',
  'relativo',
  'relativa',
  'correspondiente',
  'propuesta',
  'proposta',
  'dictamen',
  'euros',
  'millones',
  'milions',
])

const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Las palabras de contenido de un título, en su orden y sin repetir: en minúsculas
 * y sin tildes («césped» y «cesped» son la misma), de más de cuatro letras, con
 * alguna letra (un número de expediente no es contenido) y fuera de `NO_CONTENIDO`.
 */
export function palabrasDeContenido(titulo: string): string[] {
  const out: string[] = []
  for (const w of sinTildes(titulo.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)) {
    if (w.length <= 4 || !/\p{L}/u.test(w) || NO_CONTENIDO.has(w) || out.includes(w)) continue
    out.push(w)
  }
  return out
}

/**
 * Los trámites fijos del orden del día, en castellano y en valenciano: aprobar el
 * acta anterior, dar cuenta de la lista de resoluciones de la alcaldía, ruegos y
 * preguntas, y el epígrafe «Asuntos de urgencia» sin asunto detrás. Una dación de
 * cuenta con sustancia —una sentencia, una auditoría— no es trámite: que la prensa
 * no la siga sí es una laguna.
 */
const TRAMITES: readonly RegExp[] = [
  /^(aprobaci[oó]n|aprovaci[oó])\s+(de\s+(las?\s+|les\s+|l['’]\s*))?actas?\b/i,
  /^(dar|donar)\s+(cuenta|compte)\s+de\s+(las|les)\s+resoluci(ones|ons)\b/i,
  /^(ruegos\s+y\s+preguntas|precs\s+[iy]\s+preguntes)\s*\.?$/i,
  /^asuntos?\s+de\s+urgencia\s*\.?$/i,
]

export function esTramiteDePleno(titulo: string): boolean {
  const t = titulo.trim()
  return TRAMITES.some((r) => r.test(t))
}

interface Titular {
  id: string
  outlet: string
  palabras: Set<string>
}

/** El titular que más palabras comparte con `palabras`, si llega al mínimo. */
function ecoEn(
  palabras: string[],
  titulares: Titular[],
): { titular: Titular; shared: string[] } | null {
  let mejor: { titular: Titular; shared: string[] } | null = null
  for (const t of titulares) {
    const shared = palabras.filter((w) => t.palabras.has(w))
    if (shared.length < MIN_PALABRAS_COMPARTIDAS) continue
    if (!mejor || shared.length > mejor.shared.length) mejor = { titular: t, shared }
  }
  return mejor
}

export function computeCoverageGaps(opts: {
  press: PressArticleLite[]
  agendas?: {
    plenos?: Array<{
      id: string
      date: string
      agenda?: Array<{ number: number; title: string; department?: string }>
    }>
  }
  promises?: { items?: Array<{ id: string; title: string; madeAt: string }> }
  windowDays?: number
  now?: Date
}): CoverageGapsReport {
  const windowDays = opts.windowDays ?? 14
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  // Agenda + promise dates are YYYY-MM-DD; comparing them against a full ISO
  // timestamp excluded anything dated ON the cutoff day.
  const cutoffDay = cutoff.slice(0, 10)

  // Prensa: sin anuncios clasificados ni notas de una administración, en la
  // ventana. Ordenada por fecha e id para que el eco elegido no dependa del feed.
  const titulares: Titular[] = sinAnunciosClasificados(opts.press)
    .filter((p) => p.date >= cutoff && !esFuenteOficial(p))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, outlet: p.source, palabras: new Set(palabrasDeContenido(p.title)) }))

  const items: CoverageGapItem[] = []
  const covered: CoverageEcho[] = []

  const examinar = (c: Omit<CoverageGapItem, 'keyword'>, titulo: string): boolean => {
    const eco = ecoEn(palabrasDeContenido(titulo), titulares)
    if (eco) {
      covered.push({
        ...c,
        articleId: eco.titular.id,
        outlet: eco.titular.outlet,
        shared: eco.shared,
      })
      return true
    }
    items.push({ ...c, keyword: '' })
    return false
  }

  const agendas = opts.agendas?.plenos ?? []
  let plenoItemsUncovered = 0
  let tramitesExcluidos = 0
  // How many things we actually looked at. Without this the report cannot
  // tell "the press covered everything" apart from "nothing happened inside
  // the window", and the page asserted the first while meaning the second:
  // the newest pleno was 2026-07-03 and the newest promise 2026-07-02, both
  // outside a 14-day window ending 2026-08-01, so every candidate was skipped
  // by `continue` and the card still read "Sin lagunas detectadas".
  let candidatesExamined = 0
  for (const session of agendas) {
    // Compare date-to-date: `session.date` is YYYY-MM-DD and `cutoff` is a full
    // ISO timestamp, so a session ON the cutoff day sorted as "before" it.
    if (session.date < cutoffDay) continue
    for (const item of session.agenda ?? []) {
      if (esTramiteDePleno(item.title)) {
        tramitesExcluidos += 1
        continue
      }
      candidatesExamined += 1
      const seguido = examinar(
        {
          kind: 'pleno-item',
          refId: `${session.id}:${item.number}`,
          label: `${item.department ? item.department + ' · ' : ''}${item.title}`,
          date: session.date,
        },
        item.title,
      )
      if (!seguido) plenoItemsUncovered += 1
    }
  }

  let promisesUncovered = 0
  for (const promise of opts.promises?.items ?? []) {
    if (promise.madeAt < cutoffDay) continue
    candidatesExamined += 1
    const seguido = examinar(
      { kind: 'promise', refId: promise.id, label: promise.title, date: promise.madeAt },
      promise.title,
    )
    if (!seguido) promisesUncovered += 1
  }

  const porFecha = (a: { date: string; refId: string }, b: { date: string; refId: string }) =>
    b.date.localeCompare(a.date) || a.refId.localeCompare(b.refId, 'en', { numeric: true })
  items.sort(porFecha)
  covered.sort(porFecha)

  return {
    generatedAt: now.toISOString(),
    windowDays,
    items,
    covered,
    stats: {
      plenoItemsUncovered,
      promisesUncovered,
      candidatesExamined,
      tramitesExcluidos,
      titularesConsiderados: titulares.length,
    },
  }
}

export { fingerprintFor }
