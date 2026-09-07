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
import type { SeedPreloadSummary, SeedSource } from './seeds'

export const AGENT_VERSION = 'journalist-v1'

/**
 * Tope por llamada del vigilante del CLI (`LLM_CLI_TIMEOUT_MS`) cuando corre
 * el agente periodista. El defecto general del cliente son 180 s, medidos
 * para extracciones cortas; con `--output-format json` el CLI no escribe nada
 * hasta terminar, y la síntesis de una biografía con 18 evidencias supera los
 * tres minutos. El 06-09-2026 dos ejecuciones seguidas de una v2 murieron
 * así («timed out after 180s (no output; killed)») y el parte decía exit 0
 * con un borrador «sin síntesis». Quien fija la variable manda; si nadie la
 * fija, el agente arranca con este tope.
 */
export const JOURNALIST_CLI_TIMEOUT_MS = 25 * 60_000

export function journalistCliTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.LLM_CLI_TIMEOUT_MS
  if (raw === undefined || raw.trim() === '') return JOURNALIST_CLI_TIMEOUT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : JOURNALIST_CLI_TIMEOUT_MS
}
export const DRAFT_PROMPT_VERSION = `plan=${JOURNALIST_PLAN_VERSION};bio=${JOURNALIST_BIO_VERSION};synth=${JOURNALIST_SYNTH_VERSION};verify=${JOURNALIST_VERIFY_VERSION}`

export const PARTY_TONE: Record<string, string> = {
  PSOE: 'civic',
  PP: 'intel',
  VOX: 'warn',
  Compromís: 'ok',
  Ciudadanos: 'neutral',
  'EU-Podem': 'civic',
  Otro: 'neutral',
}

export interface RunAgentOptions {
  /** Token budget for the whole assignment (default 200K). */
  tokenBudget?: number
  /** Stop after stage N — useful for tests. Defaults to full pipeline. */
  stopAfter?: 'plan' | 'research' | 'synth' | 'verify'
  /**
   * Curator-seeded sources (journalist:run --seed), fetched before the
   * planner runs and ranked ahead of the synth cap. They never travel in the
   * assignment brief, which is public. See ./seeds.ts.
   */
  seedSources?: SeedSource[]
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
      /** Seed accounting: attempted / fetched / manual / failed / notInBody. */
      seeds?: SeedPreloadSummary
    }
  }
}

/**
 * Drop LLM-projected social/account rows whose url would fail the
 * section validator (URL_RE) — a handle without a scheme must not
 * poison the whole draft at persist time (2026-07-29: first v2 bio run
 * died on `accounts[0].url must be URL`). Section-build discipline:
 * unsupported rows are dropped, never guessed.
 */
export function keepValidUrlAccounts<T extends { url?: unknown }>(rows: T[]): T[] {
  return rows.filter((r) => typeof r.url === 'string' && /^https?:\/\/\S+$/.test(r.url))
}
