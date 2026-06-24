/**
 * Parser for a regmeet.com session page (the platform each pleno's `link` in
 * plenos.json points to). The page is server-rendered (KumbiaPHP) and lists, in
 * its results section, each orden-del-día point as
 *     <p ...>N. <title> (HH:MM:SS)</p> … <span class="label label-X">OUTCOME</span>
 * where OUTCOME ∈ Aprobada / Rechazada / Retirada / Dar cuenta / Debate.
 *
 * This is the AUTHORITATIVE source for per-item OUTCOME + title — used to
 * cross-check the LLM-extracted vote suggestions (catches informational
 * "dar cuenta" items the LLM wrongly records as votes, and outcome mismatches).
 * It does NOT expose per-bloc tallies (who voted how) — those stay
 * transcript-derived until the official acta publishes.
 *
 * Pure (no network) — the CLI fetches the HTML and passes it in.
 */

/** Normalised outcome. `dar-cuenta` / `debate` are NOT votes (informational). */
export type RegmeetOutcome =
  | 'aprobada'
  | 'rechazada'
  | 'retirada'
  | 'aplazada'
  | 'dar-cuenta'
  | 'debate'
  | 'otro'

export interface RegmeetItem {
  number: number
  title: string
  outcome: RegmeetOutcome
  /** The label text verbatim, for audit. */
  rawLabel: string
}

const LABEL_MAP: Array<[RegExp, RegmeetOutcome]> = [
  [/aprovad|aprobad/i, 'aprobada'],
  [/rebutj|rechazad|denegad/i, 'rechazada'],
  [/retirad/i, 'retirada'],
  [/aplazad|ajornad/i, 'aplazada'],
  [/dar cuenta|donar compte|daci[oó] compte|daci[oó]n de cuenta|quedar? enterad/i, 'dar-cuenta'],
  [/debate/i, 'debate'],
]

/** Map a regmeet label's text to a normalised outcome (defaults to 'otro'). */
export function normalizeRegmeetLabel(text: string): RegmeetOutcome {
  for (const [re, outcome] of LABEL_MAP) if (re.test(text)) return outcome
  return 'otro'
}

/** True when the item is informational, not a real vote. */
export function isNonVote(outcome: RegmeetOutcome): boolean {
  return outcome === 'dar-cuenta' || outcome === 'debate'
}

const TS = /\(\s*\d{1,2}:\d{2}:\d{2}\s*\)\s*$/ // trailing (HH:MM:SS)

/**
 * Extract the orden-del-día points + outcomes. Walks the page in order: each
 * point paragraph (`N. title (time)`) binds to the NEXT label span. First
 * occurrence per item number wins (the page repeats sections).
 */
export function parseRegmeetOutcomes(html: string): RegmeetItem[] {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  // One regex, two alternations: a point <p> OR a label <span>, scanned in order.
  const tokenRe =
    /<p\b[^>]*>\s*(\d{1,2})\.\s*([^<]+?)\s*<\/p>|<span\b[^>]*class="[^"]*\blabel\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/gi
  const items: RegmeetItem[] = []
  const seen = new Set<number>()
  let pending: { number: number; title: string } | null = null
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(noScript)) !== null) {
    if (m[1] !== undefined) {
      const number = Number(m[1])
      const title = m[2].replace(TS, '').trim()
      pending = { number, title }
    } else if (m[3] !== undefined && pending && !seen.has(pending.number)) {
      items.push({
        number: pending.number,
        title: pending.title,
        outcome: normalizeRegmeetLabel(m[3]),
        rawLabel: m[3].trim(),
      })
      seen.add(pending.number)
      pending = null
    }
  }
  return items.sort((a, b) => a.number - b.number)
}
