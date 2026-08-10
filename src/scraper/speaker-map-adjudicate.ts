/**
 * Second opinion on the one evidence class the deterministic gates cannot judge.
 *
 * `speaker-map-validate.ts` confirms a `turn-grant` or a `reply` positionally:
 * the labelled speaker is the next segment, or the previous one. A
 * `back-reference` names someone at arbitrary distance — «l'exposició de motius
 * que ha plantejat David» — and nothing about the segment sequence can say
 * whether that line *identifies* the labelled speaker or merely mentions that
 * person. Those rows are kept and marked `weak`, and `blocForLabel` refuses
 * them, so they are safe but useless.
 *
 * This asks a model, on text alone, whether the line identifies the speaker.
 *
 * ## What it is not allowed to do
 *
 * It never proposes a speaker. It is shown one candidate the deterministic pass
 * already produced and answers accept / reject about that candidate only. A
 * model given the freedom to name someone would name someone, and the whole
 * point of the map is that identities come from the chair's own words.
 *
 * ## Three outcomes, not two
 *
 * `r?.verdict ?? reject` turns a dead backend into a confident answer, which is
 * the shape that let `check:contract-drift` print an all-clear on a backend
 * that was not running. So a null, an error or an unparseable reply is
 * **`not-adjudicated`**: the row stays `weak`, and the count is reported apart
 * from both accepts and rejects. Same vocabulary as `check:relations`.
 */
import { z } from 'zod'
import { callLLM } from '../llm/client'
import type { LlmCaller } from './pleno-claim-llm'
import type { RawSegment, SpeakerMapRow } from './speaker-map'

/** Bump when the prompt changes — it is part of the cache key. */
export const ADJUDICATE_PROMPT_VERSION = 'speaker-map-adjudicate-v1'

/**
 * How many segments of context either side of the cited line the model sees.
 * Enough to tell a turn boundary from a passing mention; short enough that the
 * model cannot go looking for a different speaker to nominate.
 */
export const CONTEXT_SEGMENTS = 6

export const AdjudicationSchema = z.object({
  identifies: z.boolean(),
  reasoning: z.string().min(5).max(300),
})

export type AdjudicationOutcome = 'accepted' | 'rejected' | 'not-adjudicated'

export interface AdjudicationResult {
  label: string
  outcome: AdjudicationOutcome
  reasoning: string | null
}

export function buildAdjudicationPrompt(): string {
  return `Eres un revisor de transcripciones de plenos municipales. Te doy un fragmento de transcripción y UNA hipótesis ya formada por otro sistema. Tu único trabajo es aceptarla o rechazarla.

La hipótesis siempre tiene la misma forma: «la frase citada identifica a quien habla bajo la etiqueta X».

Responde \`identifies: true\` SÓLO si la frase citada permite saber que quien habla bajo esa etiqueta es la persona nombrada. Responde \`false\` si la frase se limita a MENCIONAR a esa persona —hablar de ella, responderle, citarla, atacarla— sin decir que sea quien tiene la palabra bajo esa etiqueta.

En un debate plenario lo segundo es lo habitual: los intervinientes se nombran unos a otros constantemente. «Como ha dicho María» no convierte a quien habla en María; normalmente significa justo lo contrario.

Reglas:
- No propongas a nadie. No puedes decir quién es en realidad, sólo si la hipótesis se sostiene.
- Si dudas, responde \`false\`. Una etiqueta sin identificar no hace daño; una mal identificada nombra a la persona equivocada.
- \`reasoning\`: una frase, en castellano, diciendo qué te hace aceptarla o rechazarla.`
}

function buildUserPrompt(row: SpeakerMapRow, segments: readonly RawSegment[]): string {
  const ev = row.evidence[0]
  const at = segments.findIndex((s) => ev.at >= s.start && ev.at < s.end)
  const from = Math.max(0, at - CONTEXT_SEGMENTS)
  const to = Math.min(segments.length, at + CONTEXT_SEGMENTS + 1)
  const window = segments
    .slice(from, to)
    .map((s) => `[${s.start.toFixed(1)}] (${s.speaker}) ${s.text}`)
    .join('\n')

  return `FRAGMENTO
${window}

FRASE CITADA
La dice ${ev.spokenBy} en el segundo ${ev.at.toFixed(1)}: «${ev.quote}»

HIPÓTESIS
Esa frase identifica a quien habla bajo la etiqueta ${row.label} como ${row.heardAs ?? 'la persona nombrada'}${row.bloc ? ` (${row.bloc})` : ''}.

¿Se sostiene?`
}

export interface AdjudicateOptions {
  rows: readonly SpeakerMapRow[]
  segments: readonly RawSegment[]
  /** Ceiling on model calls for this map. Rows past it stay `weak`. */
  max?: number
  caller?: LlmCaller
}

export interface AdjudicationRun {
  results: AdjudicationResult[]
  /** Rows never sent, because the cap was reached. NOT the same as rejected. */
  skipped: number
  tally: Record<AdjudicationOutcome, number>
}

/**
 * Adjudicate the weak rows. Returns a verdict per row and leaves the caller to
 * apply them — this module decides nothing about the map.
 */
export async function adjudicateWeakRows(opts: AdjudicateOptions): Promise<AdjudicationRun> {
  const caller = opts.caller ?? callLLM
  const max = opts.max ?? 12
  const weak = opts.rows.filter((r) => r.weak && r.evidence.length > 0)
  const systemPrompt = buildAdjudicationPrompt()

  const results: AdjudicationResult[] = []
  let skipped = 0

  for (const row of weak) {
    if (results.length >= max) {
      skipped += 1
      continue
    }
    let response: z.infer<typeof AdjudicationSchema> | null = null
    try {
      response = await caller({
        systemPrompt,
        userPrompt: buildUserPrompt(row, opts.segments),
        promptVersion: ADJUDICATE_PROMPT_VERSION,
        schema: AdjudicationSchema,
        input: { label: row.label, at: row.evidence[0].at, quote: row.evidence[0].quote },
      })
    } catch {
      response = null
    }
    // A backend that did not answer has not rejected anything.
    if (!response) {
      results.push({ label: row.label, outcome: 'not-adjudicated', reasoning: null })
      continue
    }
    results.push({
      label: row.label,
      outcome: response.identifies ? 'accepted' : 'rejected',
      reasoning: response.reasoning,
    })
  }

  const tally: Record<AdjudicationOutcome, number> = {
    accepted: 0,
    rejected: 0,
    'not-adjudicated': 0,
  }
  for (const r of results) tally[r.outcome] += 1

  return { results, skipped, tally }
}

/**
 * Fold verdicts back into the rows.
 *
 * `accepted` clears `weak`, so `blocForLabel` will vouch for it. `rejected`
 * drops the row entirely. `not-adjudicated` and anything never sent stay
 * exactly as they were — weak, present, and unusable for attribution, which is
 * the correct resting state for evidence nobody could confirm.
 */
export function applyAdjudications(
  rows: readonly SpeakerMapRow[],
  results: readonly AdjudicationResult[],
): SpeakerMapRow[] {
  const byLabel = new Map(results.map((r) => [r.label, r.outcome]))
  const out: SpeakerMapRow[] = []
  for (const row of rows) {
    const verdict = byLabel.get(row.label)
    if (verdict === 'rejected') continue
    out.push(verdict === 'accepted' ? { ...row, weak: false } : row)
  }
  return out
}
