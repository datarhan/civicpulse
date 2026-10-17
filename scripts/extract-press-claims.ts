#!/usr/bin/env tsx
/**
 * Extract press claims from public/data/press.json using the
 * press-claim-llm two-stage pipeline (headline triage → body fetch
 * when needed → claim extraction). Writes
 * public/data/press-claims-suggestions.json with requiresHumanApproval
 * stamped on every row.
 *
 * Desde octubre de 2026 el fichero se ACUMULA: cada pasada procesa sólo los
 * artículos pendientes (`elegirPendientes`), anota el desenlace de cada uno en
 * `articulos` y se funde con lo publicado (`fundirExtraccion`). Antes tomaba
 * los `--max` titulares más nuevos y reescribía el fichero entero, así que lo
 * extraído en ventanas anteriores desaparecía y /laboratorio decía «no sacó
 * ninguna afirmación» de artículos que nunca había visto. La historia está en
 * la cabecera de src/scraper/press-extraccion.ts.
 *
 * Usage:
 *   npm run extract:press-claims                       # every pending item
 *   npm run extract:press-claims -- --max 20           # cap pending items
 *   npm run extract:press-claims -- --since 2026-05-01 # date floor
 *   npm run extract:press-claims -- --source levante   # filter by sourceHost substring
 *   npm run extract:press-claims -- --headline-only    # skip body fetch
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractPressClaimsBatch, type PressNewsItem } from '../src/scraper/press-claim-llm'
import { fetchArticleBody } from '../src/scraper/press-fetcher'
import {
  ALLOWED_PRESS_CLAIM_TYPES,
  ALLOWED_CLAIM_TOPICS,
  ALLOWED_ATTRIBUTED_SOURCES,
  validatePressClaimsSnapshot,
  type PressClaim,
  type PressClaimsSnapshot,
} from '../src/scraper/press-claim'
import {
  desenlaceDe,
  elegirPendientes,
  fundirExtraccion,
  pasadaEnRojo,
  sembrarDesdeClaims,
  type ExtraccionArticulo,
} from '../src/scraper/press-extraccion'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'
import { resetBudget } from '../src/llm/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const IN = join(PROJECT_ROOT, 'public/data/press.json')
const OUT = join(PROJECT_ROOT, 'public/data/press-claims-suggestions.json')

// `--flag valor` y `--flag=valor`. Sólo la primera forma se reconocía: un
// `--max=5` caía en «sin `--max`» y mandaba TODOS los pendientes al LLM.
function getFlag(name: string): string | null {
  const conIgual = process.argv.find((a) => a.startsWith(`${name}=`))
  if (conIgual !== undefined) return conIgual.slice(name.length + 1)
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function hasFlag(name: string): boolean {
  return process.argv.some((a) => a === name || a.startsWith(`${name}=`))
}

async function main() {
  resetBudget()

  const since = getFlag('--since')
  const sourceFilter = getFlag('--source')
  // Sin `--max`, sin tope. Con `--max`, su valor tal cual: `elegirPendientes`
  // trata un NaN o un 0 como «nada», nunca como «todo». El `|| Infinity` de
  // antes convertía `--max 0` (y `--max abc`) en «manda todo al LLM».
  const max = hasFlag('--max') ? Number(getFlag('--max')) : Infinity
  const headlineOnly = hasFlag('--headline-only')

  const pressRaw = await readFile(IN, 'utf8')
  const press = JSON.parse(pressRaw) as {
    items: Array<{
      id: string
      title: string
      link: string
      source: string
      sourceHost: string | null
      date: string
      fingerprint: string
    }>
  }

  let items: PressNewsItem[] = press.items.map((i) => ({
    id: i.id,
    title: i.title,
    link: i.link,
    source: i.source,
    sourceHost: i.sourceHost,
    date: i.date,
    fingerprint: i.fingerprint,
  }))

  if (since) items = items.filter((it) => it.date >= since)
  if (sourceFilter) {
    const needle = sourceFilter.toLowerCase()
    items = items.filter(
      (it) =>
        (it.sourceHost ?? '').toLowerCase().includes(needle) ||
        it.source.toLowerCase().includes(needle),
    )
  }
  // Lo publicado, leído ANTES de elegir: es la base de la fusión y la historia
  // que dice qué artículos ya se vieron. Un fichero ilegible no es «no hay
  // nada»: fundir contra él borraría todo lo publicado, así que se para aquí.
  const existingRaw = await readFile(OUT, 'utf8').catch(() => null)
  const prev = existingRaw === null ? null : leerAnterior(existingRaw, press.items)

  // Cuántos había en alcance ANTES de elegir pendientes. Con la ventana de
  // antes (los más nuevos, fichero reescrito entero) la cobertura acumulada
  // era una fracción mínima del feed y nada en el fichero lo decía.
  const allItemsCount = items.length
  // Contra la historia FUNDIDA del disco, nunca contra la de una pasada. La
  // cola entera se cuenta aparte para que el log diga cuántos quedan sin
  // intentar por el tope (regla 2): «0 enviados» no es «nada pendiente».
  const cola = elegirPendientes(items, prev?.articulos ?? [], Infinity)
  items = elegirPendientes(items, prev?.articulos ?? [], max)

  console.log(
    `[extract:press-claims] processing ${items.length} of ${cola.length} pending items` +
      ` (${cola.length - items.length} left for a later run)` +
      (since ? ` (since ${since})` : '') +
      (sourceFilter ? ` (source≈${sourceFilter})` : '') +
      (headlineOnly ? ' (headline-only mode)' : ''),
  )

  const result = await extractPressClaimsBatch(items, {
    bodyFetcher: headlineOnly
      ? undefined
      : async (url: string) => {
          const fr = await fetchArticleBody(url)
          return fr.body || null
        },
    forceHeadlineOnly: headlineOnly,
  })

  const ahora = new Date().toISOString()
  const huellaDe = new Map(items.map((it) => [it.id, it.fingerprint]))
  const run: { articulos: ExtraccionArticulo[]; items: PressClaim[] } = {
    articulos: result.triages.map((t) => ({
      articleId: t.articleId,
      fingerprint: huellaDe.get(t.articleId) as string,
      desenlace: desenlaceDe(t),
      procesadoEl: ahora,
    })),
    items: result.claims,
  }
  const merged = fundirExtraccion(prev, run)
  // Extracciones sin respuesta tras un triaje positivo: `llmUnavailable` sólo
  // cuenta los triajes que no llegaron al modelo. Las dos son artículos que
  // esta pasada no resolvió, y snapshot-write.ts pide contarlas juntas.
  const sinRespuesta = result.triages.filter((t) => t.extraccionSinRespuesta).length
  const unresolved = result.stats.llmUnavailable + sinRespuesta

  const byType: Record<string, number> = Object.fromEntries(
    ALLOWED_PRESS_CLAIM_TYPES.map((t) => [t, 0]),
  )
  const byTopic: Record<string, number> = Object.fromEntries(
    ALLOWED_CLAIM_TOPICS.map((t) => [t, 0]),
  )
  const byAttributedSource: Record<string, number> = Object.fromEntries(
    ALLOWED_ATTRIBUTED_SOURCES.map((s) => [s, 0]),
  )
  const bySource: Record<string, number> = {}
  // Del corpus FUNDIDO: el fichero publica todas las afirmaciones, no las de
  // esta pasada.
  for (const c of merged.items) {
    byType[c.type] = (byType[c.type] || 0) + 1
    byTopic[c.topic] = (byTopic[c.topic] || 0) + 1
    byAttributedSource[c.attributedSource] = (byAttributedSource[c.attributedSource] || 0) + 1
    bySource[c.articleSource] = (bySource[c.articleSource] || 0) + 1
  }

  // Procedencia de la PASADA. Una pasada que no envió ningún artículo (nada
  // pendiente, `--max 0`) no es una pasada: conserva la fecha y la procedencia
  // de la última que sí lo hizo, en vez de publicar «0 procesados, ventana
  // nula» con fecha de hoy, que leído junto a las afirmaciones parecería una
  // extracción que no encontró nada.
  const huboPasada = result.stats.total > 0
  const procedencia =
    !huboPasada && prev
      ? {
          generatedAt: prev.generatedAt,
          articlesProcessed: prev.stats.articlesProcessed,
          articlesAvailable: prev.stats.articlesAvailable,
          llmUnavailable: prev.stats.llmUnavailable,
          extraccionesSinRespuesta: prev.stats.extraccionesSinRespuesta,
          windowFrom: prev.stats.windowFrom,
          windowTo: prev.stats.windowTo,
        }
      : {
          generatedAt: ahora,
          articlesProcessed: result.stats.total,
          articlesAvailable: allItemsCount,
          llmUnavailable: result.stats.llmUnavailable,
          extraccionesSinRespuesta: sinRespuesta,
          // Ya no es una ventana contigua: el más viejo y el más nuevo de los
          // artículos que ESTA pasada envió.
          windowFrom: fechaExtrema(items, 'min'),
          windowTo: fechaExtrema(items, 'max'),
        }

  const snapshot: PressClaimsSnapshot = {
    generatedAt: procedencia.generatedAt,
    source: {
      description: 'Press claims extracted by the laboratory pipeline',
      contract: 'src/scraper/press-claim.ts',
    },
    stats: {
      total: merged.items.length,
      byType: byType as never,
      bySource,
      byTopic: byTopic as never,
      byAttributedSource: byAttributedSource as never,
      articlesProcessed: procedencia.articlesProcessed,
      articlesAvailable: procedencia.articlesAvailable,
      llmUnavailable: procedencia.llmUnavailable,
      extraccionesSinRespuesta: procedencia.extraccionesSinRespuesta,
      windowFrom: procedencia.windowFrom,
      windowTo: procedencia.windowTo,
      articulosVistos: merged.articulos.length,
    },
    articulos: merged.articulos,
    items: merged.items,
  }

  // Sin pasada y sin siembra (prev ya traía `articulos`), el fichero saldría
  // igual que el del disco: no se reescribe.
  if (!huboPasada && prev && !prev.sembrado) {
    console.log(
      `[extract:press-claims] ningún artículo enviado (${cola.length} pendientes) · ` +
        `${OUT} sin cambios`,
    )
    return
  }

  // Decide BEFORE writing. The original code wrote first and only then checked
  // `llmUnavailable`, which meant a run whose every LLM call failed emitted
  // `total: 0, items: []` over the published corpus and *then* exited 1. The
  // old comment justified that with "the partial snapshot is still written
  // above, so progress is kept" — sound for a genuinely partial run, and wrong
  // for a run that achieved nothing. Zero claims from a dead backend is not
  // progress, it is erasure: on 2026-08-09 it deleted a live published claim
  // (gqglxs-0-num) and the pipeline reported the deletion as its result.
  //
  // The rule the guard encodes, therefore, is about DIRECTION, not emptiness:
  // an incomplete run may add claims but may never remove them. A complete run
  // (llmUnavailable === 0) stays authoritative and always writes, including
  // when it honestly found fewer claims than last time. See
  // decideSnapshotWrite in src/scraper/snapshot-write.ts for the pure decision
  // — shared with summarize:press, which needs the identical rule.
  //
  // Con la fusión, `incomingCount` es el corpus FUNDIDO, no lo de esta pasada:
  // la pasada sólo sustituye las afirmaciones de los artículos que reprocesó.
  const decision = decideSnapshotWrite({
    incomingCount: snapshot.items.length,
    unresolvedCount: unresolved,
    existingRaw,
    itemNoun: 'claim',
  })

  if (decision.write) {
    await mkdir(dirname(OUT), { recursive: true })
    await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n')
    console.log(
      `[extract:press-claims] wrote ${OUT}` +
        ` · ${result.stats.claimsEmitted} claims this run, ${merged.items.length} merged · ` +
        `triage=${result.stats.triageHits}/${result.stats.total} hits, ` +
        `body=${result.stats.bodyFetches} fetches` +
        ` · ${merged.articulos.length} articles with a known outcome` +
        (prev?.sembrado ? ` (seeded ${prev.articulos.length} from the previous file)` : '') +
        ` · ${decision.reason}`,
    )
  } else {
    console.error(`[extract:press-claims] NOT WRITING ${OUT} · ${decision.reason}`)
  }

  // Una pasada incompleta no se hace pasar por limpia: cada fallo se dice por
  // stderr, y el artículo queda `llm-no-disponible` para la pasada siguiente.
  // Rojo (exit 1) sólo con la llamada entera caída —ver `pasadaEnRojo`—: el
  // rojo hace que press-lab-pipeline.sh salte verify y lo que cuelga de él, y
  // por un solo titular terco congelaría /laboratorio todas las semanas.
  if (result.stats.llmUnavailable > 0) {
    console.error(
      `[extract:press-claims] WARNING: LLM backend unavailable for ` +
        `${result.stats.llmUnavailable}/${result.stats.total} items ` +
        `(backend=${process.env.LLM_BACKEND ?? 'auto'}). They stay pending ` +
        `(llm-no-disponible) and are retried first on the next run.`,
    )
  }
  if (sinRespuesta > 0) {
    console.error(
      `[extract:press-claims] WARNING: extraction returned nothing for ` +
        `${sinRespuesta}/${result.stats.triageHits} items with a positive triage. ` +
        `They stay pending (llm-no-disponible) and keep any earlier claims.`,
    )
  }
  if (
    pasadaEnRojo({
      total: result.stats.total,
      llmUnavailable: result.stats.llmUnavailable,
      triageHits: result.stats.triageHits,
      sinRespuesta,
    })
  ) {
    console.error(
      `[extract:press-claims] the LLM call is down for this whole run — exit 1 ` +
        `so the pipeline skips the consumers of an unrefreshed corpus.`,
    )
    process.exitCode = 1
  }
}

/** La fecha más vieja o más nueva de los artículos enviados; null si no hubo ninguno. */
function fechaExtrema(items: PressNewsItem[], cual: 'min' | 'max'): string | null {
  if (items.length === 0) return null
  const fechas = items.map((it) => it.date).sort()
  return cual === 'min' ? fechas[0] : fechas[fechas.length - 1]
}

/**
 * Lee el fichero publicado como base de la fusión. Si no trae `articulos`
 * (anterior a octubre de 2026), los siembra de una sola vez con
 * `sembrarDesdeClaims` (press-extraccion.ts), que explica qué se siembra y
 * por qué nada más.
 */
function leerAnterior(
  raw: string,
  pressItems: Array<{ id: string; fingerprint: string }>,
): PressClaimsSnapshot & { articulos: ExtraccionArticulo[]; sembrado: boolean } {
  const snap = validatePressClaimsSnapshot(raw)
  if (snap.articulos) return { ...snap, articulos: snap.articulos, sembrado: false }

  const huellaEnPrensa = new Map(pressItems.map((it) => [it.id, it.fingerprint]))
  const { articulos, sinHuella } = sembrarDesdeClaims(snap.items, snap.generatedAt, huellaEnPrensa)
  for (const id of sinHuella) {
    console.warn(
      `[extract:press-claims] seed: ${id} has no fingerprint in its claim nor in press.json ` +
        `— left out of articulos`,
    )
  }
  return { ...snap, articulos, sembrado: true }
}

main().catch((err) => {
  console.error('[extract:press-claims] failed:', err)
  process.exit(1)
})
