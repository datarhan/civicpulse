/**
 * The auto-curation synthesis prompt is a legally material surface: 44 of the
 * 52 findings published on `/hallazgos` were written by it, about named
 * political groups.
 *
 * Until v3 its rule 4 read «Cite at least one corroborating record by its
 * title», and the user prompt headed the candidate list «REGISTROS QUE
 * CORROBORAN … cita al menos uno». Handed a list of nearest matches and told it
 * must cite one as corroborating, the model picked the closest-looking row and
 * wrote the link — a documentary relationship no step of this pipeline
 * evaluates. A review of all 52 findings attributed ~33 of 40 defects to it.
 *
 * The assertions below run on the BUILT strings and import the prompt's own
 * constants; a copy of the wording restated here would pass while production
 * drifted, which is how six suites in this repo stayed green matching nothing.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  AUTO_CURATE_BANNED_SUPPORT_VERBS,
  AUTO_CURATE_NO_RECORD_CLAUSE,
  AUTO_CURATE_PROMPT_VERSION,
  buildAutoCurateSystemPrompt,
  buildAutoCurateUserPrompt,
  type AutoCurateBundle,
} from '../../src/llm/prompts'

const BUNDLE: AutoCurateBundle = {
  plenoId: 'p-2026-01-19',
  plenoDate: '2026-01-19',
  plenoTitle: 'Pleno ordinario de enero',
  topic: 'urbanismo',
  blocs: ['PSOE', 'PP'],
  quotes: [
    {
      speakerGroup: 'PSOE',
      verdict: 'verificado',
      confidence: 0.85,
      verbatim: 'el complejo deportivo La Mallá fue presupuestado en el año 2006',
    },
  ],
  evidenceSnippets: ['[tender] Servicio mantenimiento instalaciones complejo La Mallá'],
}

/**
 * The prompts are hand-wrapped at ~72 columns, so a phrase the model reads as
 * one instruction is often a newline plus nine spaces in the source. A literal
 * `not.toContain('el registro municipal incluye')` PASSED against the defective
 * prompt for exactly that reason — the string it was hunting was split across
 * two lines, so the assertion measured nothing while looking like a gate.
 *
 * Every content assertion below therefore runs on the flattened text. The
 * digest pin at the bottom is the one thing that reads the raw string, because
 * there whitespace is part of what must not drift unnoticed.
 */
const flat = (s: string) => s.replace(/\s+/g, ' ')
const system = () => flat(buildAutoCurateSystemPrompt())
const user = () => flat(buildAutoCurateUserPrompt(BUNDLE))
const both = () => `${system()}\n${user()}`

describe('auto-curate prompt · citing a record is conditional, never mandated', () => {
  it('nowhere instructs the model to cite a record', () => {
    // Both spellings of the old mandate, in both prompts. The English one lived
    // in rule 4, the Spanish one in the user prompt's list heading.
    expect(both()).not.toMatch(/at least one/i)
    expect(both()).not.toMatch(/cita al menos uno/i)
    expect(both()).not.toMatch(/\bcorroborating\b/i)
  })

  it('does not label the candidate list as records that corroborate', () => {
    expect(user()).not.toMatch(/REGISTROS QUE CORROBORAN/i)
    // The heading has to say where the rows came from, not what they prove.
    expect(user()).toMatch(/CRUCE/i)
  })

  it('names every support relation the prose may not assert', () => {
    // Imported, not restated: adding a verb to the exported list must fail
    // until the prompt actually forbids it.
    for (const verb of AUTO_CURATE_BANNED_SUPPORT_VERBS) {
      expect(system()).toContain(verb)
    }
    expect(system()).toMatch(/NEVER write, or imply by juxtaposition/)
  })

  it('CAN say that nothing in the record bears on the debate', () => {
    expect(system()).toContain(AUTO_CURATE_NO_RECORD_CLAUSE)
    expect(system()).toMatch(/Naming NO record is the normal, expected outcome/)
  })

  it('scopes the no-record clause to what was checked, not to the world', () => {
    // «ninguno de los expedientes cotejados» — an absence in a partial index is
    // not an absence. The prompt must not license "no such contract exists".
    expect(AUTO_CURATE_NO_RECORD_CLAUSE).toContain('cotejados')
    expect(system()).toMatch(/The index is partial/)
  })

  it('does not offer «el registro municipal incluye» as an approved verb', () => {
    // It was the one exemplar in rule 2's list that was about documents rather
    // than about speech, and it landed verbatim in 11 published summaries: a
    // verb list is a template list. The honest way to mention a record is
    // rule 4's, which states what the cross-reference did and stops.
    expect(system()).not.toContain('el registro municipal incluye')
  })

  it('does not force a length the truth may not fill', () => {
    // «2-3 sentences» over a 40-char floor is a padding instruction, and in this
    // domain padding means inventing a link.
    expect(system()).not.toMatch(/2-3 sentence/i)
    expect(system()).toMatch(/1-3 sentences/)
    expect(system()).toMatch(/shortest summary that is true/)
  })
})

describe('auto-curate prompt · attribution', () => {
  it('tells the model to attribute to nobody rather than to a placeholder', () => {
    // The old rule said «Use null when the group is unclear» in a prompt whose
    // schema is two strings: there is no field to null out, so the instruction
    // could only produce a placeholder — the thing the same rule bans.
    expect(system()).not.toMatch(/Use null when the group is unclear/)
    expect(system()).toMatch(/attribute it to nobody/)
    expect(system()).toMatch(/Never\s+emit a placeholder token/)
  })
})

/**
 * `promptVersion` is part of the content-addressed LLM cache key
 * (src/llm/client.ts:cacheKey). Editing a prompt without bumping it serves
 * every draft from `.llm-cache` — written by the prompt you just replaced —
 * and the run reports a cache hit as work done.
 *
 * That is not hypothetical here: `corroboration[]` was renamed to
 * `crossChecked[]` in 339fc58 precisely because the name was making the model
 * assert corroboration, and the instruction that said so outright survived the
 * rename untouched for months. Pinning the pair makes a prompt edit and a
 * version bump one action instead of two.
 */
describe('auto-curate prompt · version pin', () => {
  const PINNED_VERSION = 'auto-curate-v3'
  const PINNED_DIGEST = 'd2e2d1e15c5f9bee'

  it('bumps AUTO_CURATE_PROMPT_VERSION whenever the prompt text changes', () => {
    const raw = `${buildAutoCurateSystemPrompt()}\n${buildAutoCurateUserPrompt(BUNDLE)}`
    const digest = createHash('sha256').update(raw).digest('hex').slice(0, 16)
    expect(
      { version: AUTO_CURATE_PROMPT_VERSION, digest },
      'The auto-curate prompt changed. Bump AUTO_CURATE_PROMPT_VERSION in ' +
        'src/llm/prompts.ts and update PINNED_VERSION/PINNED_DIGEST here — ' +
        'otherwise .llm-cache keeps serving drafts written by the old prompt.',
    ).toEqual({ version: PINNED_VERSION, digest: PINNED_DIGEST })
  })

  it('is not still on the version that mandated a corroborating citation', () => {
    expect(AUTO_CURATE_PROMPT_VERSION).not.toBe('auto-curate-v2')
  })
})
