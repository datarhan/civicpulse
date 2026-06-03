/**
 * Journalist agent — schemas + validators for the
 * `/laboratorio/agentes` subsystem.
 *
 * The journalist is the first iterative LLM agent in the repo. It receives
 * an investigative assignment (e.g. "compile a biography of alcalde Robert
 * Raga"), mines local snapshots, calls a curated set of research tools
 * (Wikidata, Wikipedia, the official CV URL, Exa web search), and emits a
 * structured report with sections, sources, and warnings. A curator then
 * promotes the draft into a published report visible on the SPA.
 *
 * Three layers, three files (mirroring the promises → claims → findings
 * contract):
 *
 *   public/data/journalist-assignments.json
 *     Curator-seeded. Each row = one task for the agent. Status moves
 *     pending → running → drafted → promoted | failed.
 *
 *   public/data/journalist-reports-suggestions.json
 *     Machine-written. Every row has `requiresHumanApproval:true`. Never
 *     rendered on a public page; only the /curator dashboard shows it.
 *
 *   public/data/journalist-reports.json
 *     Curator-promoted. This is what the public SPA reads. Inherits the
 *     draft's payload + adds promoter, curator notes, corrections trail,
 *     and an optional right-of-reply slot.
 *
 * Libel boundary: this subsystem produces long-form prose about named
 * living elected officials. Three invariants are encoded below:
 *
 *   · `legalSensitivity:'high'` is automatically stamped onto reports
 *     whose source citations contain judicial-case tokens (PA NNNN/YYYY,
 *     "Sentencia", "recurso contencioso-administrativo"). The
 *     promote-report CLI refuses high-sensitivity reports without an
 *     explicit `--ack-legal-review` flag.
 *
 *   · `requiresHumanApproval` is a literal `true` on every draft — not a
 *     boolean field that could be flipped to `false` by a buggy CLI.
 *     The published-report validator forbids the field on its own type
 *     and ignores it in input, so the curator promotion step strips it
 *     by construction.
 *
 *   · Every source citation must carry a `retrievedAt` ISO timestamp and
 *     (for kind:'web') a Wayback `archiveUrl` if one could be obtained
 *     at retrieval time. That preserves an audit trail even if the
 *     upstream URL goes 404 later.
 */

// ───────────────────────────────────────────────────────────────────────────
// Decomposed in the journalist-agent refactor. This file is now a thin barrel
// over ./journalist/* so every existing import from '…/scraper/journalist' keeps
// resolving unchanged. Internals (must, validateSnapshotMeta, the per-kind
// validators) stay module-private; only the original public surface is re-exported.
// ───────────────────────────────────────────────────────────────────────────

export * from './journalist/types'
export { JournalistValidationError } from './journalist/core'
export * from './journalist/validators'
