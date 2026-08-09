/**
 * Unit tests for the LLM-backed pleno vote extractor. Uses mockClient so
 * tests are fast + deterministic, and runs in the normal `npm test` pass —
 * `vitest.config.ts` includes `tests/**` with no exclusion for this directory.
 *
 * Nothing here measures precision/recall against a real LLM; no such bench
 * exists in this repo. The nearest real-model measurements are `eval:verifier`
 * and `eval:extractor`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { inferVotesWithLlm } from '../../src/scraper/pleno-vote-llm'
import { mockCallLLM, resetMock, stubResponse } from './mockClient'
import {
  PLENO_VOTE_PROMPT_VERSION,
  buildPlenoVoteSystemPrompt,
  buildPlenoVoteUserPrompt,
} from '../../src/llm/prompts'

const CURRENT_SEATS = [
  { bloc: 'PSOE', seats: 11 },
  { bloc: 'PP', seats: 7 },
  { bloc: 'VOX', seats: 2 },
  { bloc: 'Compromís', seats: 1 },
]

const OPTS = {
  plenoId: 'test-1',
  plenoDate: '2026-01-07',
  currentSeats: CURRENT_SEATS,
}

// Realistic transcript — two vote boundaries separated by ≥900 chars of debate
// filler so splitSegments' overlap window doesn't collapse them into one.
const DEBATE_FILLER_1 =
  'Intervención del portavoz del PSOE defendiendo la propuesta con citas al plan estratégico municipal y al presupuesto aprobado. El portavoz del PP manifiesta su rechazo alegando falta de transparencia en la partida. VOX solicita aclaraciones sobre el calendario de ejecución. Compromís apoya con matices. Se cierra el turno de intervenciones y la alcaldesa invita a la secretaría a leer la propuesta formal.'.repeat(
    3,
  )

const DEBATE_FILLER_2 =
  'Siguiente punto del orden del día. Se cede la palabra al concejal ponente que expone los motivos técnicos y jurídicos. El portavoz de PP pide un informe complementario. El grupo Compromís presenta una enmienda in voce. Tras un receso de cinco minutos, la alcaldesa retoma la sesión y anuncia que la enmienda queda incorporada al texto principal. Se abre el turno de votación.'.repeat(
    3,
  )

const TWO_VOTES = `
Punto 3.— Aprobación inicial del presupuesto municipal para 2026.
${DEBATE_FILLER_1}
Se somete a votación. Votan a favor PSOE y Compromís (12), en contra PP (7), se abstiene VOX (2). Queda aprobado.
${DEBATE_FILLER_2}
Punto 4.— Modificación de la ordenanza fiscal.
${DEBATE_FILLER_2}
Se somete a votación. A favor PSOE, PP y Compromís (19); en contra nadie; se abstiene VOX (2). Queda aprobado.
`.trim()

const SINGLE_VOTE = 'Se somete a votación. A favor PSOE. Queda aprobado.'

beforeEach(() => {
  resetMock()
  // Pre-compute the system prompt that the engine will use so we can wire
  // canned responses. The test mirrors the runtime prompt construction so if
  // we ever edit prompts.ts the mock still resolves to the right canned entry.
  // (Nothing dynamic here — the system prompt depends only on plenoDate + seats.)
})

function systemPrompt() {
  return buildPlenoVoteSystemPrompt({
    plenoDate: OPTS.plenoDate,
    currentSeats: CURRENT_SEATS,
  })
}

describe('pleno-vote-llm · TWO_VOTES transcript', () => {
  it('emits two suggestions when each segment returns a vote', async () => {
    // Pre-split the transcript to stub each segment's response precisely.
    const sys = systemPrompt()
    // Build userPrompts using the same splitter the engine uses so mock
    // keys match exactly. The engine runs splitSegments on TWO_VOTES.
    const { splitSegments } = await import('../../src/scraper/pleno-vote-inference')
    const [seg1, seg2] = splitSegments(TWO_VOTES)

    stubResponse(sys, buildPlenoVoteUserPrompt(seg1), {
      vote: {
        itemNumber: 3,
        outcome: 'aprobado',
        votes: [
          { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
          { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
          { bloc: 'PP', direction: 'en_contra', seats: 7 },
          { bloc: 'VOX', direction: 'abstencion', seats: 2 },
        ],
        excerpt: seg1.slice(0, 400),
        confidence: 0.93,
        reasoning: 'Explicit "Queda aprobado" + full seat tally matches 21.',
      },
    })

    stubResponse(sys, buildPlenoVoteUserPrompt(seg2), {
      vote: {
        itemNumber: 4,
        outcome: 'aprobado',
        votes: [
          { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
          { bloc: 'PP', direction: 'a_favor', seats: 7 },
          { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
          { bloc: 'VOX', direction: 'abstencion', seats: 2 },
        ],
        excerpt: seg2.slice(0, 400),
        confidence: 0.88,
        reasoning: 'All four blocs accounted for; total matches 21 seats.',
      },
    })

    const res = await inferVotesWithLlm(TWO_VOTES, OPTS, mockCallLLM)
    expect(res.suggestions).toHaveLength(2)
    expect(res.suggestions[0].itemNumber).toBe(3)
    expect(res.suggestions[0].outcome).toBe('aprobado')
    expect(res.suggestions[0].votes).toHaveLength(4)
    expect(res.suggestions.every((s) => s.requiresHumanApproval === true)).toBe(true)
  })

  it('drops segments the LLM flags as non-votable', async () => {
    const { splitSegments } = await import('../../src/scraper/pleno-vote-inference')
    const [seg1, seg2] = splitSegments(TWO_VOTES)
    const sys = systemPrompt()

    stubResponse(sys, buildPlenoVoteUserPrompt(seg1), { vote: null })
    stubResponse(sys, buildPlenoVoteUserPrompt(seg2), {
      vote: {
        itemNumber: 4,
        outcome: 'aprobado',
        votes: [{ bloc: 'PSOE', direction: 'a_favor' }],
        excerpt: seg2.slice(0, 400),
        confidence: 0.7,
        reasoning: 'one bloc captured',
      },
    })

    const res = await inferVotesWithLlm(TWO_VOTES, OPTS, mockCallLLM)
    expect(res.suggestions).toHaveLength(1)
    expect(res.suggestions[0].itemNumber).toBe(4)
  })

  it('drops suggestions below minConfidence gate', async () => {
    const { splitSegments } = await import('../../src/scraper/pleno-vote-inference')
    const [seg1, seg2] = splitSegments(TWO_VOTES)
    const sys = systemPrompt()

    for (const seg of [seg1, seg2]) {
      stubResponse(sys, buildPlenoVoteUserPrompt(seg), {
        vote: {
          itemNumber: 1,
          outcome: 'aprobado',
          votes: [{ bloc: 'PSOE', direction: 'a_favor' }],
          excerpt: seg.slice(0, 400),
          confidence: 0.4, // below gate
          reasoning: 'low-confidence',
        },
      })
    }

    const res = await inferVotesWithLlm(TWO_VOTES, OPTS, mockCallLLM)
    expect(res.suggestions).toHaveLength(0)
    expect(res.stats.droppedLowConfidence).toBe(2)
  })
})

describe('pleno-vote-llm · sanitize guard', () => {
  it('rejects a bloc not in the current council composition', async () => {
    const sys = systemPrompt()
    stubResponse(sys, buildPlenoVoteUserPrompt(SINGLE_VOTE), {
      vote: {
        itemNumber: null,
        outcome: 'aprobado',
        // Ciudadanos isn't in the 2023-2027 composition — must be filtered out.
        // Leaves PSOE as the only valid entry; still emits because votes.length > 0.
        votes: [
          { bloc: 'Ciudadanos', direction: 'a_favor' },
          { bloc: 'PSOE', direction: 'a_favor' },
        ],
        excerpt: SINGLE_VOTE.slice(0, 400),
        confidence: 0.8,
        reasoning: 'one bloc explicit',
      },
    })
    const res = await inferVotesWithLlm(SINGLE_VOTE, OPTS, mockCallLLM)
    expect(res.suggestions).toHaveLength(1)
    // Ciudadanos must be dropped; only PSOE remains.
    expect(res.suggestions[0].votes.map((v) => v.bloc)).toEqual(['PSOE'])
  })

  it('rejects a suggestion where no blocs remain after filtering', async () => {
    const sys = systemPrompt()
    stubResponse(sys, buildPlenoVoteUserPrompt(SINGLE_VOTE), {
      vote: {
        itemNumber: null,
        outcome: 'aprobado',
        votes: [{ bloc: 'Ciudadanos', direction: 'a_favor' }], // all invalid
        excerpt: SINGLE_VOTE.slice(0, 400),
        confidence: 0.8,
        reasoning: 'bogus',
      },
    })
    const res = await inferVotesWithLlm(SINGLE_VOTE, OPTS, mockCallLLM)
    expect(res.suggestions).toHaveLength(0)
  })

  it('rejects votes with seats > current bloc seat count (guards hallucinated tallies)', async () => {
    const sys = systemPrompt()
    stubResponse(sys, buildPlenoVoteUserPrompt(SINGLE_VOTE), {
      vote: {
        itemNumber: null,
        outcome: 'aprobado',
        votes: [
          // PSOE currently holds 11 seats; 15 is plausible per the global schema cap (21)
          // but impossible in the 2023-2027 composition. The sanitize guard must filter it.
          { bloc: 'PSOE', direction: 'a_favor', seats: 15 },
          { bloc: 'PP', direction: 'en_contra', seats: 7 },
        ],
        excerpt: SINGLE_VOTE.slice(0, 400),
        confidence: 0.8,
        reasoning: 'mixed',
      },
    })
    const res = await inferVotesWithLlm(SINGLE_VOTE, OPTS, mockCallLLM)
    expect(res.suggestions).toHaveLength(1)
    expect(res.suggestions[0].votes.map((v) => v.bloc)).toEqual(['PP'])
  })
})

describe('pleno-vote-llm · prompt version pinning', () => {
  it('passes the versioned prompt string through to the caller', async () => {
    const sys = systemPrompt()
    let capturedVersion = ''
    await inferVotesWithLlm(SINGLE_VOTE, OPTS, async (opts) => {
      capturedVersion = opts.promptVersion
      stubResponse(sys, opts.userPrompt, { vote: null })
      return mockCallLLM(opts)
    })
    expect(capturedVersion).toBe(PLENO_VOTE_PROMPT_VERSION)
  })
})
