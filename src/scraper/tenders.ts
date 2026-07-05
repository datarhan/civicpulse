import { parse } from 'csv-parse/sync'
import { isScoreArtifactAmount } from '../lib/tenders'

// ---------------------------------------------------------------------------
// Status normalisation
// ---------------------------------------------------------------------------
const CONTRACT_STATUS = new Set<ContractStatus>([
  'awarded',
  'revoked',
  'in_progress',
  'open',
  'finalized',
  'draft',
  'pending',
  'closed',
  'unknown',
])

const TENDER_STATUS = new Set<TenderStatus>([
  'awarded',
  'open',
  'evaluation',
  'revoked',
  'finalized',
  'draft',
  'closed',
  'unknown',
  'withdrawn',
])

function normStatus<T extends string>(value: unknown, allowed: Set<T>): T {
  if (typeof value !== 'string') return 'unknown' as T
  const v = value.trim().toLowerCase()
  return (allowed.has(v as T) ? v : 'unknown') as T
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(/\s/g, '').replace(/,/g, '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function nullable(v: unknown): string | null {
  const s = str(v)
  return s === '' ? null : s
}

function csvRows(text: string): Record<string, string>[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[]
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export type ContractStatus =
  | 'awarded'
  | 'revoked'
  | 'in_progress'
  | 'open'
  | 'finalized'
  | 'draft'
  | 'pending'
  | 'closed'
  | 'unknown'

export type TenderStatus =
  | 'awarded'
  | 'open'
  | 'evaluation'
  | 'revoked'
  | 'finalized'
  | 'draft'
  | 'closed'
  | 'unknown'
  | 'withdrawn'

export interface Contract {
  id: string
  title: string
  permalink: string | null
  status: ContractStatus
  contractType: string | null
  processType: string | null
  minorContract: boolean
  startDate: string | null
  endDate: string | null
  awardDate: string | null
  formalizedDate: string | null
  /** Contracted execution period, in days (Gobierto `duration`). */
  duration: number
  /** Winning firm (Gobierto `assignee`) — the adjudicatario. */
  assignee: string | null
  /** Contracting body (Gobierto `contractor`) — usually the Ayuntamiento. */
  contractor: string | null
  contractorId: string | null
  contractorType: string | null
  categoryId: string | null
  categoryTitle: string | null
  cpvs: string[]
  initialAmount: number
  initialAmountNoTaxes: number
  finalAmount: number
  finalAmountNoTaxes: number
  /** Valor estimado del contrato (Gobierto `estimated_value`). */
  estimatedValue: number
  numberOfProposals: number
}

export interface Tender {
  id: string
  title: string
  documentNumber: string | null
  permalink: string | null
  status: TenderStatus
  contractType: string | null
  processType: string | null
  minorContract: boolean
  submissionDate: string | null
  openProposalsDate: string | null
  contractor: string | null
  contractValue: number
  initialAmount: number
  initialAmountNoTaxes: number
  categoryTitle: string | null
  cpvs: string[]
  numberOfBatches: number
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
// Deterministic id derived from content when the source CSV leaves it blank.
function fallbackId(row: Record<string, string>): string {
  const seed = [
    str(row.title).slice(0, 80),
    str(row.permalink),
    str(row.initial_amount),
    str(row.start_date),
    str(row.submission_date),
    str(row.award_date),
    str(row.contractor_id),
  ].join('|')
  // Short non-cryptographic FNV-1a-ish hash is enough for uniqueness.
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return 'auto-' + h.toString(36)
}

export function parseRibalicitaContracts(csv: string): Contract[] {
  const rows = csvRows(csv)
  const out: Contract[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    let id = str(row.id)
    if (!id) id = fallbackId(row)
    // Ensure uniqueness by disambiguating with a counter when necessary
    let candidate = id
    let i = 1
    while (seen.has(candidate)) {
      candidate = `${id}#${i++}`
    }
    id = candidate
    seen.add(id)
    if (!id) continue
    const contract: Contract = {
      id,
      title: str(row.title),
      permalink: nullable(row.permalink),
      status: normStatus<ContractStatus>(row.status, CONTRACT_STATUS),
      contractType: nullable(row.contract_type),
      processType: nullable(row.process_type),
      minorContract: String(row.minor_contract).toLowerCase() === 't',
      startDate: nullable(row.start_date),
      endDate: nullable(row.end_date),
      awardDate: nullable(row.award_date),
      formalizedDate: nullable(row.formalized_date),
      duration: num(row.duration),
      assignee: nullable(row.assignee),
      contractor: nullable(row.contractor),
      contractorId: nullable(row.contractor_id),
      contractorType: nullable(row.contractor_type),
      categoryId: nullable(row.category_id),
      categoryTitle: nullable(row.category_title),
      cpvs: str(row.cpvs)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      initialAmount: num(row.initial_amount),
      initialAmountNoTaxes: num(row.initial_amount_no_taxes),
      finalAmount: num(row.final_amount),
      finalAmountNoTaxes: num(row.final_amount_no_taxes),
      estimatedValue: num(row.estimated_value),
      numberOfProposals: num(row.number_of_proposals),
    }
    // PLACSP publishes framework / SDA call-offs with the 0–100 award-criterion
    // SCORE in the importe field instead of the euro amount (e.g. a "€100" award
    // on a €14.983 budget → a spurious −99% baja). Drop that bogus figure so the
    // award price reads as unknown rather than a €100 win; the real budget
    // (initialAmount) is kept. See src/lib/tenders.js:isScoreArtifactAmount.
    if (isScoreArtifactAmount(contract)) {
      contract.finalAmount = 0
      contract.finalAmountNoTaxes = 0
    }
    out.push(contract)
  }
  return out
}

// ---------------------------------------------------------------------------
// Tenders
// ---------------------------------------------------------------------------
export function parseRibalicitaTenders(csv: string): Tender[] {
  const rows = csvRows(csv)
  const list: Tender[] = []
  for (const row of rows) {
    const id = str(row.id) || str(row.title).slice(0, 80)
    if (!id) continue
    list.push({
      id,
      title: str(row.title),
      documentNumber: nullable(row.document_number),
      permalink: nullable(row.permalink),
      status: normStatus<TenderStatus>(row.status, TENDER_STATUS),
      contractType: nullable(row.contract_type),
      processType: nullable(row.process_type),
      minorContract: String(row.minor_contract).toLowerCase() === 't',
      submissionDate: nullable(row.submission_date),
      openProposalsDate: nullable(row.open_proposals_date),
      contractor: nullable(row.contractor),
      contractValue: num(row.contract_value),
      initialAmount: num(row.initial_amount),
      initialAmountNoTaxes: num(row.initial_amount_no_taxes),
      categoryTitle: nullable(row.category_title),
      cpvs: str(row.cpvs)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      numberOfBatches: num(row.number_of_batches),
    })
  }
  // Newest-first by submission_date (null last).
  list.sort((a, b) => {
    const ad = a.submissionDate ? new Date(a.submissionDate).getTime() : -Infinity
    const bd = b.submissionDate ? new Date(b.submissionDate).getTime() : -Infinity
    return bd - ad
  })
  return list
}
