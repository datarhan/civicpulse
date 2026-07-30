---
name: biografia-concejal
description: Generate, forensically review, and publish a journalist-agent biography for a Riba-roja councillor or official — assign → run (claude-code) → curator review against primary documents → enrichment (elección, declaración de bienes, comprobaciones) → promote → ship. Use when asked to create/update a biography ("biografía de <concejal>", "run the journalist agent for X").
---

# Biografía de concejal (journalist agent, end to end)

Operating procedure distilled from the Robert Raga (v4) and Rafael Gómez Sánchez
arcs (2026-07). The pipeline generates the draft; the CURATOR REVIEW is where the
editorial value and libel safety live — never skip it, never promote a raw draft.

**Input:** the councillor's name or slug (`$ARGUMENTS`). Resolve against
`public/data/officials.json` first — get exact `slug`, `name`, `party`, `portfolios`.

## Phase 0 — Prerequisites

- SearXNG up: `docker ps | grep searxng` (else `npm run searxng:up`) and `SEARXNG_URL` in `.env`.
- Env: the repo has NO dotenv — always `set -a && source .env && set +a` before metered/LLM commands.
- Backend policy: `LLM_BACKEND=claude-code LLM_CONCURRENCY=1` ($0 Max plan). NEVER default to
  metered openai for curation; NEVER auto-start ollama.
- Embed corpus for semantic recall exists (`.embed-cache/agent-corpus.jsonl`); rebuild only if stale.

## Phase 1 — Assign

```bash
npm run journalist:assign -- --id a-<slug-short>-bio --kind biography \
  --subject-slug <slug> --subject-name "<Full Name>" --subject-kind official \
  --brief "Biografía de registro público de <name>, concejal (<party>) de <portfolios> en Riba-roja de Túria: identidad y formación, trayectoria previa, elección y nombramiento, retribución, patrimonio declarado, actividad plenaria y menciones en boletines oficiales."
```

## Phase 2 — Run (background, 15–40 min)

```bash
set -a && source .env && set +a && LLM_BACKEND=claude-code LLM_CONCURRENCY=1 \
  npm run journalist:run -- a-<id> 2>&1 | tee $CLAUDE_JOB_DIR/tmp/journalist-run-<slug>.log
```

Output: draft in `journalist-reports-suggestions.json` + chunk
`public/data/journalist-reports/a-<id>.draft.json`.

## Phase 3 — Forensic curator review (MANDATORY before promote)

Read the draft's sections, sources, warnings. Then:

1. **Adjudicate every verify-stage warning deterministically — most are false.**
   - "cites src-X, absent from sources" → check the actual ledger (`jq .sources[]`); the verify
     LLM sees a truncated list. If the id exists, the warning is false.
   - "claim unsupported/uncited" → read the cited source's actual excerpt; the fact is often
     there verbatim (e.g. the secretaria general named in the acta).
   - grounding number-flags → check if the "figures" are docket numbers or dates present in
     the cited excerpts (e.g. «02, 18» = Informe 02/2021 of 18-06).
   - Keep only true caveats, rewritten in Spanish. The self-declared-CV caveat is usually the
     one real warning.
2. **Recurring draft bugs (check every run):**
   - `identity.sourceIds` cites the officials snapshot instead of the CV that carries the birth
     data → repoint to the CV source.
   - `career-political` missing the CURRENT mandate (2023–, cite officials + dedicaciones).
   - Timeline sparse or with routine-session filler → rebuild as dated, cited milestones.
3. **Verify every load-bearing claim against the PRIMARY document on disk** (transcripts in
   `public/data/pleno-transcripts/`, PDFs re-fetched). Grep case-FOLDED (uppercase names in actas).
4. **Homonym scan:** list cited vs uncited sources. Only CITED noise matters (promote prunes
   uncited automatically). «Rafael Gómez»-class names attract heavy noise — the subject-surname
   pair must appear in any cited excerpt.
5. **Apply fixes to the DRAFT** via a one-shot validated script (pattern: read
   `journalist-reports-suggestions.json`, mutate, `writeSnapshot(..., validateDraftsSnapshot)`,
   `rewriteJsonIfPresent` the `.draft.json` chunk, delete script after run).

## Phase 4 — Enrichment (the blocks the raw agent won't fully build)

**A. Elección y nombramiento (appointment chain).** For the 2023-2027 corporation the chain is
verbatim in two transcripts:
- `9jatoj.txt` — sesión constitutiva 17-06-2023: the 21 electos + proclamation (~L12-33), oath
  order (~L66-92), heads-of-lists rule (~L98-101), investidura votes + proclamation (~L114-132).
- `16ujrlm.txt` — organización 07-07-2023: grupos políticos rosters (~L103-130), the delegation
  decree with ONE numbered item per governing concejal (~L275-305), dedicaciones, JGL composition
  (~L690-704).
The narrative explains HOW the subject obtained the office: proclamado electo → juramento →
(investidura for alcalde) → grupo → delegación del alcalde → dedicación. Party vote shares
(elections.json source) are context, not the story. Opposition concejales have no delegation —
their chain ends at electo + oath + grupo (+ portavoz role if the acta records it).

**B. Declaración de bienes y actividades (statutory).** Consolidated per-mandate PDF on the
portal — 2023-2027:
`https://www.ribarroja.es/sites/www.ribarroja.es/files/migrate/4549352/filesGroup/20231017-20230905-BIEN-ACTIV-CONCEJALES---TOMA-POSESIN---ANUNC-1.pdf`
(navigate: portal_de_transparencia → declaracion_de_bienes_patrimoniales; expte. 3971/2023/GEN,
Decreto 191/2010; Mozilla UA required against the WAF; parse with pdf-parse). ALL 21 councillors
are in it — slice the subject's rows:
- Bienes table columns AS EXTRACTED: inmuebles + otros = activo total, 4th number = pasivo
  (verify the arithmetic before publishing).
- Actividades table: cargo/entidad/fecha — a subject with only the concejalía listed gets the
  explicit `business` NEGATIVE row («sin actividad empresarial declarada»).
Publish as: `financial` rows (`declared-assets` with amount, `business` with description) + a
«Patrimonio y actividades declaradas» narrative + `official-doc` sources with verbatim windows.
`FINANCIAL_SOURCE_ALLOW` already admits ribarroja.es for these.

**C. Comprobaciones (conflict checks — contracts-first, NEVER social-graph-first).**
- Nominal sweep: subject surnames vs all contract assignees in `tenders.json`.
- Competition indicators of the subject's áreas vs corpus baseline (fields `numberOfProposals`,
  `minorContract`; filter titles by área keywords, awardDate ≥ mandate start).
- Publish ROBUST aggregates + the checks themselves in a «Conexiones documentadas y
  comprobaciones de este medio» narrative (cite a `local-snapshot` source with the deterministic
  summary as excerpt). Weak small-n signals go to curatorNotes as «VIGILANCIA», never public.
- Declared limits in the narrative: Registro Mercantil (homonymy), personal relations
  (untraceable in public sources, never published without a document).

**D. Relations graph.** Documented administrative edges only: JGL membership, delegation decree,
grupo, second public cargos from the declaración (e.g. consortium presidencies). Every edge
cites a source. Surname adjacency is NOT association (139/19 lesson).

**Source excerpts: ≤500 chars, contiguous verbatim windows only** — split long acta passages
into multiple windows and multi-cite; never stitch elided assemblies.

## Phase 5 — Promote

```bash
npm run promote-report -- a-<id> --curator "Sergei Lutchenko" \
  --curator-notes "REVISIÓN DE CURADURÍA <date>: <what was verified against which primary docs, which warnings were removed and why, homonym sweep result>"
```

- `legalSensitivity=high` requires `--ack-legal-review` — only after genuinely reviewing the
  judicial material against primary documents.
- Promote auto-prunes uncited ledger rows (published contract = cited sources).
- Post-promotion edits to a PUBLISHED report: narrative/quote-attribution via
  `npm run correct-journalist-report` (public bitácora); other payloads via a validated one-shot
  script + dated curatorNotes entry (both write snapshot + chunk).

## Phase 6 — Ship & verify

1. `npx vitest run` + `npm run typecheck` + `npm run lint` — all green before commit.
2. Commit data files: `journalist-assignments.json`, `journalist-reports-suggestions.json`,
   `journalist-reports.json`, `journalist-reports/a-<id>.json` + `.draft.json` (draft chunks ARE
   tracked). Message in Spanish, `data(journalist): …`, ends with the Claude co-author line.
3. Push; watch CI (e2e + Deploy) for the sha in a background poll.
4. Verify LIVE by fetching `https://www.civicpulse.es/data/journalist-reports/a-<id>.json` and
   asserting content (never trust HTTP 200 alone — the SPA catch-all serves HTML shells).
5. The `/cargos` card's «Biografía →» auto-wires via the assignments×reports join
   (`bioReportRoutes`) — no code change needed; confirm the slug appears in the join.

## Editorial boundaries (non-negotiable)

- Bloc-level attribution by default; individuals only via the documented promotion paths.
- Self-declared (CV) data is always attributed as such and mirrored in «Lagunas detectadas»;
  the statutory declaración (sworn, Secretaría-published) upgrades but does not erase the
  self-origin nuance.
- Never publish an association without a document; never build rosters of private citizens
  (classmates, colleagues) — no lawful source, and nominal matching in a 24.6k town manufactures
  base-rate false positives.
- In multi-announcement bulletins, a docket row requires the subject's surname pair within
  proximity (the synthesizer enforces ±800 chars; apply the same rule to manual additions).
- Honest empties beat padding: report a clean sweep as a clean sweep.
- Update `/metodologia` via PR whenever the pipeline's behavior changes.
