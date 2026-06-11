/**
 * Promise inference — the SUGGESTION layer.
 *
 * Scans press headlines + pleno sessions for evidence that relates to
 * each promise, and emits a proposed status with a reasoning chain.
 *
 *   * NEVER mutates the input promises array.
 *   * NEVER writes to public/data/promises.json.
 *   * Every output record carries `requiresHumanApproval: true`.
 *   * Proposed statuses are bounded: the engine cannot propose
 *     `inviable`; only a human curator can set that, and only with
 *     explicit additional evidence.
 *
 * The CLI (scripts/scrape-promise-suggestions.ts) writes the output to
 * a separate JSON file so curators can review pending suggestions and
 * merge accepted ones into promises.json via a normal PR.
 */

import type { Promise as CurPromise, Status } from './promises'

// Press + plenos input shape (deliberately loose; we only need what we
// pattern-match against, so this module stays decoupled from press.ts /
// plenos.ts and is easy to fake in tests).
interface PressItem {
  id?: string
  title: string
  link: string
  source?: string
  sourceHost?: string | null
  date: string
}
interface PlenoItem {
  id?: string
  title: string
  date: string
  kind?: string
  link: string
}

interface InferenceInput {
  press?: { items?: PressItem[] } | null
  plenos?: { items?: PlenoItem[] } | null
}

export interface Reasoning {
  url: string
  date: string
  quote: string
  kind: 'press' | 'pleno' | 'budget' | 'bdns' | 'otro'
  publisher?: string
  matchedKeywords: string[]
}

export type ProposedStatus = Exclude<Status, 'inviable'> // engine may not propose inviable

export interface PromiseSuggestion {
  promiseId: string
  proposedStatus: ProposedStatus
  confidence: number // 0..1
  reasoning: Reasoning[]
  requiresHumanApproval: true
  generatedAt: string
}

const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'o',
  'en',
  'a',
  'al',
  'por',
  'con',
  'un',
  'una',
  'unos',
  'unas',
  'para',
  'que',
  'es',
  'son',
  'se',
  'su',
  'sus',
  'lo',
  'le',
  'les',
  'este',
  'esta',
  'estos',
  'estas',
  'ha',
  'más',
  'mas',
  'muy',
  'sobre',
  'como',
  'pero',
  'si',
  'no',
  'ya',
  'le',
  'ribarroja',
  'riba',
  'roja',
  'turia',
  'túria',
  'ayuntamiento',
  'municipal',
])

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Very light Spanish stemming — strip common plural / adjective suffixes so
// "refugios" / "refugio" and "climáticos" / "climatico" match the same root.
export function stem(w: string): string {
  let s = w
  if (s.endsWith('es') && s.length > 4) s = s.slice(0, -2)
  else if (s.endsWith('s') && s.length > 4) s = s.slice(0, -1)
  if (s.endsWith('os') && s.length > 4) s = s.slice(0, -2)
  else if (s.endsWith('as') && s.length > 4) s = s.slice(0, -2)
  return s
}

export function extractKeywords(text: string): string[] {
  const tokens = normalize(text).split(' ')
  return Array.from(new Set(tokens.filter((t) => t.length >= 4 && !STOP_WORDS.has(t)).map(stem)))
}

function commonKeywords(a: string[], b: string[]): string[] {
  const setB = new Set(b)
  return a.filter((t) => setB.has(t))
}

// Score the match between a promise's keywords and a candidate text.
// Returns 0..1 based on proportion of promise keywords hit, with a
// small boost for longer matches.
function matchScore(
  promiseKw: string[],
  candidateText: string,
): { score: number; matched: string[] } {
  if (promiseKw.length === 0) return { score: 0, matched: [] }
  const candidateKw = extractKeywords(candidateText)
  const matched = commonKeywords(promiseKw, candidateKw)
  if (matched.length === 0) return { score: 0, matched: [] }
  const ratio = matched.length / Math.min(promiseKw.length, 8) // cap to top-8
  return { score: Math.min(1, ratio + 0.1 * (matched.length - 1)), matched }
}

function toIsoDate(iso: string): string {
  return iso.slice(0, 10)
}

export function inferPromiseSuggestions(
  promises: CurPromise[],
  input: InferenceInput,
  // Injectable clock — identical inputs must produce identical output so
  // tests can snapshot the result; the CLI passes nothing (real clock).
  nowIso: string = new Date().toISOString(),
): PromiseSuggestion[] {
  const now = nowIso
  const pressItems = input.press?.items ?? []
  const plenoItems = input.plenos?.items ?? []

  const suggestions: PromiseSuggestion[] = []

  for (const p of promises) {
    const promiseText = `${p.title} ${p.quote} ${p.topic}`
    const kw = extractKeywords(promiseText)

    // Find related press headlines published on or after promise date.
    const pressMatches: Array<{ item: PressItem; score: number; matched: string[] }> = []
    for (const item of pressItems) {
      const { score, matched } = matchScore(kw, item.title)
      if (score < 0.3) continue // confidence floor
      if (toIsoDate(item.date) < p.madeAt) continue // pre-promise news doesn't count
      pressMatches.push({ item, score, matched })
    }
    pressMatches.sort((a, b) => b.score - a.score)

    const plenoMatches: Array<{ item: PlenoItem; score: number; matched: string[] }> = []
    for (const item of plenoItems) {
      const { score, matched } = matchScore(kw, item.title)
      if (score < 0.25) continue
      if (toIsoDate(item.date) < p.madeAt) continue
      plenoMatches.push({ item, score, matched })
    }
    plenoMatches.sort((a, b) => b.score - a.score)

    const reasoning: Reasoning[] = [
      ...pressMatches.slice(0, 5).map((m) => ({
        url: m.item.link,
        date: toIsoDate(m.item.date),
        quote: m.item.title,
        kind: 'press' as const,
        publisher: m.item.source,
        matchedKeywords: m.matched,
      })),
      ...plenoMatches.slice(0, 3).map((m) => ({
        url: m.item.link,
        date: m.item.date,
        quote: m.item.title,
        kind: 'pleno' as const,
        matchedKeywords: m.matched,
      })),
    ]

    // Proposed status: intentionally CONSERVATIVE.
    //   - No evidence → stay documentada, confidence 0.
    //   - Evidence exists and mentions words like "pone en marcha / inaugura
    //     / abre / termina / finaliza / cumple" → propose `en-progreso`.
    //   - Evidence exists and mentions "cumpli" or an explicit budget execution
    //     → propose `parcial` (we still gate to `en-progreso` by default to
    //     avoid misclassifying partial delivery as completion).
    //   - Evidence only mentions the topic without progress verbs → stay
    //     documentada.
    //   - The engine NEVER proposes `cumplida`, `no-ejecutada`, or `inviable`.
    //     Those require a curator-signed evidence trail.
    let proposed: ProposedStatus = 'documentada'
    let confidence = 0
    if (reasoning.length > 0) {
      const joined = reasoning
        .map((r) => r.quote)
        .join(' ')
        .toLowerCase()
      const progressVerbs =
        /pone en marcha|abre|inaugur|termin|finaliz|completa|firma|apruebla?\b|adjudic/i
      if (progressVerbs.test(joined)) {
        proposed = 'en-progreso'
        confidence = Math.min(0.7, pressMatches[0]?.score ?? 0.3)
      } else {
        proposed = 'documentada'
        confidence = Math.min(0.4, (pressMatches[0]?.score ?? 0) * 0.5)
      }
    }

    suggestions.push({
      promiseId: p.id,
      proposedStatus: proposed,
      confidence: Number(confidence.toFixed(3)),
      reasoning,
      requiresHumanApproval: true,
      generatedAt: now,
    })
  }

  return suggestions
}
