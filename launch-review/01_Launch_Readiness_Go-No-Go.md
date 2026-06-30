# CivicPulse — Launch Readiness Review (Go / No-Go)

**Date:** 29 June 2026
**Reviewer roles:** Product Manager · QA Engineer · Marketing
**Scope under review:** MVP go-live with the data-accountability core — Quejas, Government dashboard (Cargos / Departamentos), Promesas, and Tenders / money-flow (Presupuesto). All other surfaces assessed for publish-vs-hold.
**Target town:** Riba-roja de Túria (pop. ~24,600), Comunitat Valenciana.

---

## Recommendation: **GO — conditional**

CivicPulse is in strong technical shape and ready to launch the accountability core, provided three pre-launch conditions are met (below). The codebase is clean (typecheck, lint, production build, and the full unit/integration suite all pass), the legally-sensitive subsystems are carefully built with the right guardrails, and the launch features render correctly with real public data. The one true launch-blocker — a public AI-generated biography of the sitting mayor — has been fixed during this review by gating that surface out of the production build.

The honest caveat: **"Quejas" is launch-ready as a product, but currently has zero citizen complaints in it.** It should launch as an open, "be the first" channel rather than as a populated feed — see condition 2.

---

## Pre-launch conditions (must clear before flipping live)

1. ~~**Deploy current `main`.**~~ **CLEARED (30 Jun).** `deploymentEnabled: false` is intentional — deploys run via `deploy-vercel.yml` on push + green-nightly `workflow_run`, verified firing success on 06-30. Pushing this branch ships the Periodistas fix live. (Detail: `02_QA_Bug_List.md` P1-2.)
2. **Decide Quejas framing.** *(Still open — the one genuine condition.)* The feed is empty (0 complaints). Launch it as an open channel ("Denuncia un bache en 10 segundos" + "sé el primero") — which the current empty-state already does well — and make sure the Telegram bot (`@munigraph_bot`) is actually running and reachable on launch day.
3. ~~**Confirm the nightly data pipeline is green.**~~ **CLEARED (30 Jun).** The pipeline was never stalled — it commits nightly through 06-30 (the review's local checkout was 6 commits stale). The recurring ~1-in-3-night red was a flaky `scrape:paro` SEPE timeout, now retried + made non-fatal. (Detail: `02_QA_Bug_List.md` P1-3.)

---

## What was tested

| Test type | Method | Result |
|---|---|---|
| Type safety | `tsc --noEmit` | ✅ Pass |
| Unit / integration | Vitest (94 test files) | ✅ Pass — only 17 environmental sandbox failures (file-unlink permission), which pass on macOS |
| Lint | ESLint (src, scripts, bot) | ✅ Pass |
| Production build | `vite build` | ✅ Pass — clean code-split, largest chunk ~68 kB gzip |
| Live visual walkthrough | Drove a real browser through the deployed site, all launch routes + editorial surfaces | ✅ Renders correctly; 0 console errors; 1 cosmetic ticker glitch |
| Data freshness | Inspected all 58 `public/data/*.json` snapshots | ⚠️ Fresh but 5 days old; Quejas empty |
| Code / security review | Guardrails, secrets, route gating | ✅ No secrets in client bundle; Curator dev-gated; libel guardrails intact |

---

## Feature-by-feature: publish vs. hold

### ✅ Publish — ready (the launch core)

- **Presupuesto / money-flow** — the strongest surface. €43.5M income / €41.6M spend, +€1.9M balance, €1,689/resident, an "where does the money go in public works" map, plus "who receives the money" and "spending types" tabs. Fully populated from CONPREL + PLACSP + BDNS. This is the headline feature.
- **Cargos** (government dashboard) — mayor + 20 councillors with photos, ISPA salaries (anonymized except the mayor, as legally required), portfolios, plantilla (340 staff, 52% women). Real, current.
- **Departamentos** — per-portfolio accountability grid. Honest null states ("sin concejal asignado", "0 aprobados" from the conservative vote-join). Solid.
- **Promesas** — 16 tracked promises with verbatim quotes, source links, evidence chains, "documentada / en verificación" states, machine-suggestion blocks clearly labelled "pendiente de revisión humana", and right-of-reply on every card. The legal design is working as intended.
- **Plenos** — 58 sessions, 30 analyzed, 316 agenda points, vote tallies and finding counts. Fully populated.
- **Datos**, **Metodología**, **Aviso legal**, **Novedades/Cambios** — supporting surfaces, ready.

### ⚠️ Publish — with eyes open (your call, kept live per your decision)

- **Quejas** — product-ready, data-empty. Launch as an open channel, not a populated feed (see condition 2). Privacy/publish rules are clearly stated and correct (never identifies the complainant; aggregates to neighborhood).
- **Hallazgos** + **Declaraciones** — editorial findings about *parties* (bloc-level, never named individuals), each with verbatim quotes, corroborating evidence, and right-of-reply. Medium legal risk, but carefully built and defensible. Currently 17 findings, 0 critical.
- **Laboratorio (press lab)** — live but thin: 67 articles audited, 0 verified claims, 0 findings, 0% across the reliability table. Low risk, low current value — a scaffold. Fine to keep, but it won't impress on day one.

### 🛑 Hold — fixed during this review

- **Periodistas IA** (`/laboratorio/agentes`) — **the one true blocker.** It publicly served an AI-drafted biography of the *named sitting mayor* whose brief references "expedientes judiciales abiertos" (open judicial proceedings). Its own internal warnings even flagged wrong-identity source contamination (a toy doll, a footballer named Robert Sánchez) that "must be purged to prevent accidental citation." Auto-generated biographical claims about a living, named official are the highest libel exposure on the site and are outside the launch core.
  - **Fix applied:** gated behind `VITE_ENABLE_PERIODISTAS` (default off in production). Hidden from the public site, chunks tree-shaken out of the production build, nav item removed, direct URLs redirect home. Still fully available in `npm run dev` for curators. Reversible by setting the env var to `true` in Vercel and redeploying.

---

## Risk register

| Risk | Severity | Status / mitigation |
|---|---|---|
| Public AI biography of named mayor (libel) | **Critical** | ✅ Fixed — gated out of production |
| Stale Vercel deploy on launch | High | Condition 1 — fresh deploy required |
| Empty Quejas feed undercuts flagship | High | Condition 2 — launch as open channel; ensure bot is live |
| Nightly pipeline stalled (5-day-old data) | Medium | Condition 3 — verify Action is green |
| Hallazgos/Declaraciones party claims | Medium | Defensible by design (bloc-level + evidence + right-of-reply); monitor |
| Department heads all show one party | Low | Verify coalition portfolios are attributed correctly in `officials.json` |
| Ticker marquee left-edge overlap | Low | Cosmetic; fix post-launch |

---

## Bottom line

Ship the accountability core. It's polished, honest, legally careful, and genuinely useful — the money-flow and promise-tracking surfaces are standout. Clear the three conditions, keep Periodistas IA hidden until it's had a human-curated legal pass, and launch Quejas as an invitation rather than a finished feed. Full defect list in `02_QA_Bug_List.md`; launch messaging in `03_Launch_Marketing_Kit.md`.
