/**
 * Journalist agent — shared constants + the public RunAgent option/result
 * types. Extracted so the orchestrator (../journalist-agent) and the builders
 * (./builders) can both depend on them without a cycle.
 */
import {
  JOURNALIST_BIO_VERSION,
  JOURNALIST_PLAN_VERSION,
  JOURNALIST_SYNTH_VERSION,
  JOURNALIST_VERIFY_VERSION,
} from '../../llm/prompts'
import type {
  JournalistPlanResponse,
  JournalistSynthResponse,
  JournalistVerifyResponse,
} from '../../llm/schemas'
import type { JournalistReportDraft } from '../journalist'

export const AGENT_VERSION = 'journalist-v1'
export const DRAFT_PROMPT_VERSION = `plan=${JOURNALIST_PLAN_VERSION};bio=${JOURNALIST_BIO_VERSION};synth=${JOURNALIST_SYNTH_VERSION};verify=${JOURNALIST_VERIFY_VERSION}`

export const PARTY_TONE: Record<string, string> = {
  PSOE: 'civic',
  PP: 'intel',
  VOX: 'warn',
  Compromís: 'ok',
  Ciudadanos: 'neutral',
  Otro: 'neutral',
}

export interface RunAgentOptions {
  /** Token budget for the whole assignment (default 200K). */
  tokenBudget?: number
  /** Stop after stage N — useful for tests. Defaults to full pipeline. */
  stopAfter?: 'plan' | 'research' | 'synth' | 'verify'
}

export interface RunAgentResult {
  draft: JournalistReportDraft
  debug: {
    plan: JournalistPlanResponse | null
    synth: JournalistSynthResponse | null
    verify: JournalistVerifyResponse | null
    researchSummary: {
      localHits: number
      pressHits: number
      plenoClaimHits: number
      promiseHits: number
      wikidataOk: boolean
      wikipediaOk: boolean
      webResults: number
      urlFetches: number
      auditRuns: number
    }
  }
}
