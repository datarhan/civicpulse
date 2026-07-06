# CivicPulse — Promotion, Funding & Monetization Strategy

**Date:** 2026-07-06 · **Status:** approved design · **Owner:** Sergei Lutchenko

## Decision profile

Answers gathered during brainstorming, which every choice below is derived from:

| Question | Decision |
|---|---|
| What should CivicPulse become? | **Independent watchdog (nonprofit direction)** — Civio/Maldita lineage. No VC, no B2G SaaS pivot. |
| Funding goal | **Full-time salary** (€40–80k/yr) for the operator. |
| Legal entity | Solo/informal **now**, but converted to dated milestones: **autónomo Oct 2026**, **asociación Q1 2027** (staying informal past Jan 2027 costs ~3× the accessible pipeline). |
| Runway | 12+ months — optimize for expected value, not speed. |
| Public identity | **Fully public** — name, photo, byline, applications in own name. |
| Scope | **Riba-roja is the MVP; the thesis is all of Spain** (~8,100 municipalities), delivered through the tiered model below. |
| Strategic approach | **C — investigation-led credibility**: publish journalism from the machine; the journalism sells the machine. |

## 1 · Positioning & narrative

**Category:** public-interest accountability infrastructure for Spain's municipal
news deserts (mySociety/Civio lineage) + a local watchdog practice that proves
what the infrastructure enables.

**The gap:** Civio investigates national-level; Maldita/Newtral fact-check national
discourse; Political Watch covers Congreso; Decidim does participation. **Nobody
does systematic per-municipality accountability.** ~6,800 of Spain's 8,100
municipalities have no dedicated press coverage.

**Two-part proof:**
- **Riba-roja = depth.** One town covered completely: transcribed plenos →
  LLM-extracted, deterministically-verified claims → curated findings with
  right-of-reply → citizen quejas with LPACAP legal clocks → geolocated
  contract spending. Live, real data, libel discipline.
- **Spain = breadth.** The national sources (PLACSP, BDNS, CONPREL, INE, SEPE,
  BOE, TED) already cover every municipality by INE code. Scaling the data
  layer is engineering, not research.

**Forcing function:** municipal elections **May 2027**. The one-sentence pitch
every funder, editor and journalist parses instantly: *"Before Spaniards vote
for their ayuntamientos again, every voter in [wave N] can see what theirs
actually did."*

**Elevator pitches:**
- **Funder (EN):** "Open-source accountability infrastructure for Spain's 6,800
  municipal news deserts — proven end-to-end in one town, scaling the data
  layer nationally before the May 2027 municipal elections."
- **Editor (ES):** "Cubrimos sistemáticamente lo que ningún medio cubre: qué
  hace de verdad cada ayuntamiento. Datos verificables, metodología publicada,
  derecho de réplica integrado."
- **Citizen (ES):** unchanged from `docs/OUTREACH.md`.

## 2 · Scaling model — what scales vs. what must not

Three tiers gated by libel risk. This is the architectural decision that makes
"all of Spain, solo" honest:

| Tier | Scope | Content | Human requirement |
|---|---|---|---|
| **T1 · Auto** | all ~8,100 | "Ficha de tu municipio": budget (CONPREL), contracts (PLACSP feeds), subsidies (BDNS), padrón (INE), paro (SEPE), BOE/BOP mentions, TED. Zero editorial claims. | none |
| **T2 · Semi** | hundreds | pleno transcription + claim extraction where session video exists; machine-suggested, human-gated publication | curator hours per town |
| **T3 · Editorial** | per-town | findings, promise tracker, quejas bot, right-of-reply — the legally-material surfaces | a **named local curator** — non-negotiable |

**Rollout waves:**
1. **Camp de Túria comarca** (~9 munis) — T1, late 2026. Proves per-town marginal cost.
2. **València province (266 munis) — T1 live before May 2027.** The flagship milestone.
3. **National T1** — after province proves near-zero per-town cost.
4. **T3 grows only where a local curator adopts a town** — the federated
   watchdog network is the endgame (and the co-founder pipeline).

Engineering notes: static-JSON architecture scales linearly (per-town builds);
contract data for towns without a Gobierto instance comes via PLACSP open-data
syndication feeds (the route Civio/Gobierto use — known-brittle, budget time).
Riba-roja T3 depth continues uninterrupted; it is the demo that sells everything.

## 3 · Promotion plan — four audiences

### 3.1 Citizens (Riba-roja)
Execute `docs/OUTREACH.md` unchanged (AAVV/AMPA visits, QR posters, WhatsApp
loops; 50 users / 6 weeks target). Add: weekly `/cambios` shareables tied to
the findings cadence. This audience feeds impact metrics for every grant
application.

### 3.2 Data-journalism & civic-tech community (national + international) — highest leverage
- **2–3 paid investigations** placed with Valencia Plaza / elDiario.es CV /
  Levante-EMV under own byline, credited "con datos de CivicPulse". Being
  citable IS the promotion. Freelance fees are secondary but nonzero.
- **One English engineering blog post** — "I built a full accountability stack
  for my Spanish town, solo, with AI" — targeted at Hacker News + international
  civic-tech. Cheap, high variance, exactly the story that travels to funders.
- **Open-source the repo** (currently private). Required by NLnet anyway;
  treat the flip as a launch event. **Pre-flight audit first** (§6).
- Community presence: GIJN, Menéame, X/Bluesky/LinkedIn, Congreso de
  Periodismo de Huesca (March 2027), dataharvest (May 2027) if budget allows.

### 3.3 Funders
- English `/about` page: thesis, tiers, roadmap, operator bio.
- **Impact-metrics page** (auto-generated from existing snapshots): plenos
  transcribed, claims verified, findings published, quejas resolved, press
  citations. Funders fund self-measuring projects.
- **"Quién financia esto" transparency page** — every € source disclosed. For
  a watchdog, funding transparency is itself marketing (and an IFCN pillar).

### 3.4 Future node operators (post-province-launch)
Local journalists / civic groups who adopt their town at T3. Activated Q2 2027:
"Adopta tu municipio" CTA + talks at journalism programs (UV, UMH, UJI).

### Assets checklist
1. "Quién está detrás" page (name + photo + bio + contact) — transparency
   standard, required before any application
2. English about/impact pages
3. Press kit (1-pager ES + EN, screenshots, logo, methodology summary)
4. Engineering blog post (EN)
5. 60–90s demo video (reuses OUTREACH.md Loom plan)
6. Repo README worthy of the open-source flip

## 4 · Funding roadmap

All instrument facts verified against official pages 2026-07-06 (background
research pass; flagged items were re-checked on primary sources).

### 4.1 Verified landscape — what's real in 2026

**Open to individuals, no entity:**
- **NLnet open call** — reopens ~Sept 2026 ("after the summer"; NGI0 Commons
  closed Jun 2026, successor cascade **Restack** announced). €5k–50k,
  individuals explicitly eligible. THE best fit. nlnet.nl/propose
- **JournalismFund Europe — Local Cross-border**: deadlines 9 Jul + **1 Oct
  2026**. Freelancers eligible; requires ≥2 journalists from ≥2 European
  countries. €2–14k+ working grants. grants.journalismfund.eu
- **IJ4EU Freelancer Support Scheme** — refunded €2.5M for 2026-27; up to
  €20k; freelancer teams, cross-border; **opens 1 Dec 2026**.
- **European Press Prize** — Innovation category; entries open **1 Oct 2026**;
  €10,000.
- **Sigma Awards** — data journalism, individual category, free entry;
  ~Dec 2026–Jan 2027 window.
- **Goteo.org** — open to personas físicas TODAY; standing Matchfunding Pool
  gives 1:1 institutional match; caps €4–20k.
- **Wikimedia Rapid Fund** — $500–5k, individuals, next deadline 1 Sep 2026 —
  only for a Wikidata-enrichment spin-off (municipal data → Wikidata), not the
  platform itself. Optional.
- **Reuters Institute Fellowship** — reopens Jan 2027; £2k/mo + fees, Oxford;
  requires arguing the "equivalent expertise" clause with published output.
  Long shot, cheap to apply.

**Behind autónomo (≈€80/mo tarifa plana year 1):**
- **GVA ayudas foment del valencià en mitjans** — €2.5M pool 2026, €420k
  digital-media line; **autónomos with registered media activity eligible**;
  annual window ~Jan (was 14 Jan–10 Feb 2026). CivicPulse already publishes
  in valencià. Lowest-barrier Spanish public money. proc. G17358.

**Behind asociación (3 founders, ~€40, weeks):**
- **GVA participación ciudadana/transparencia** (proc. 16280) — €1.2M+ pool;
  €8k (local) – €30k (regional entity); the 2026 window (≈ late July 2026) is
  unreachable without an already-registered entity; target the **2027
  convocatoria**. Funds exactly "plataformas digitales que
  favorezcan la participación ciudadana". Regional money = clean of the
  municipality-independence constraint.
- **CERV** — 2026 CHAR-LITI (civic space, ≥€75k lump sums) closes 15 Sep 2026 —
  out of reach this cycle (natural persons ineligible); realistic entry =
  **CERV re-granting intermediaries** (Liberties STRIVE €10–20k, ECF
  micro-grants €1–10k) which accept small/new associations. 2027 wave.
- **Civitates** — public-interest journalism core funding €160k/2yr, Spain
  eligible, nonprofits only; 3rd call unannounced — watch.
- **IFCN signatory** → requires legal entity + 12 months of ≥1 fact-check/week
  (Spain has >5 signatories so full 12-month track record applies). Start the
  weekly cadence clock NOW; apply ~mid-2027; unlocks **Global Fact Check Fund
  SUSTAIN** (flat $30k, 2027 round anticipated).
- **Bertha Challenge** — up to $64.9k income + $15k funds, but **host
  organization mandatory**; 2027 call unannounced as of today. The asociación
  (or a partner NGO) can host a 2028 application.

**Dead ends (verified, do not spend time):** Desafío Aporta (dormant since
2022) · EMIF (wound down) · Landecker/HIA fellowship (dormant) · Kit Digital
(closed; reopening enabled but unconvoked) · Code for All (inactive since
2023) · Google News Initiative (no open EU fund).

**Watch list (2027+):** European Democracy Shield "Media Resilience Programme"
+ AgoraEU (money lands 2028+ MFF) · Creative Europe Journalism Partnerships
2027 sub-calls via EXPJOU/IJ4EU intermediaries (news-desert sub-grants,
entities) · Horizon Europe CL2-2026 DEMOCRACY-04 "media viability" (23 Sep
2026, join a research consortium as partner only if invited — do not lead).

### 4.2 The calendar

| When | Actions | Money at stake |
|---|---|---|
| **Jul–Aug 2026** | Draft NLnet proposal · recruit ONE partner journalist in a 2nd EU country (via GIJN/dataharvest networks) for JFE · pitch investigation #1 to regional outlets · Goteo campaign prep · **weekly findings cadence starts** (IFCN clock) · publish "quién está detrás" + English pages · open-source pre-flight audit | — |
| **Sept 2026** | **Submit NLnet** the week the call reopens · publish investigation #1 · launch Goteo (target €6–10k + 1:1 match) · repo goes public + engineering blog post | NLnet €5–50k |
| **Oct 2026** | **JFE Local Cross-border (1 Oct)** · **European Press Prize entry (opens 1 Oct)** · **alta de autónomo** timed to first income | JFE €2–14k · EPP €10k |
| **Nov–Dec 2026** | **IJ4EU Freelancer (opens 1 Dec)** · **Sigma entry** · comarca T1 ships · investigation #2 | IJ4EU ≤€20k |
| **Jan 2027** | **GVA valencià media line** (autónomo eligible) · Reuters fellowship application · Sigma deadline | GVA €5–15k |
| **Q1 2027** | **Found asociación** (3 members from collaborators accumulated) · province T1 build · investigation #3 | unlocks entity tier |
| **Apr–May 2027** | **Province launch before the municipal elections** — flagship press event · election accountability coverage | visibility → everything |
| **Mid 2027** | GVA participación 2027 (€8–30k) · CERV-cascade micro-grants · IFCN application · membership programme launch · Civitates if call opens | entity tier |
| **2028** | CERV lead application (≥€75k) · Bertha with host org · Media Resilience Programme · news-desert sub-grant wave | scale tier |

### 4.3 Honest revenue expectation

Year 1 (Jul 2026–Jul 2027): **€15k (unlucky) → €70k (lucky), central ~€35–50k**
from NLnet + Goteo + freelance fees + prizes + GVA media line. Full-salary
stability (€40–80k/yr recurring) arrives in **year 2** through entity-tier
funding (CERV cascade, GVA participación, Civitates, IFCN SUSTAIN) +
memberships. The 12-month runway covers exactly this gap; that is why the
sequencing works.

Portfolio discipline: ~10 applications/entries in year 1; expect 3–5 hits;
no single funder >40% of income at any point.

## 5 · Monetization (entity era) & the NO list

**Yes, in order of expected weight:** foundation/EU core support → memberships
(Goteo campaign converts to own recurring donations; Maldita-style community)
→ paid data services for newsrooms (public JSON stays free forever; paid tier
= SLAs, custom feeds, historical exports) → training/workshops for node
operators → syndication fees.

**Never:**
- Advertising.
- Money from any government body under active T3 editorial investigation
  (the Ayuntamiento de Riba-roja above all). Regional (GVA) / national /
  EU money is acceptable while they are not T3 subjects — all disclosed on
  the transparency page.
- VC equity (incompatible with watchdog mission).
- Paywalls on public data.

## 6 · Risks & guardrails

| Risk | Guardrail |
|---|---|
| Libel at scale | T3 human-gate inviolable; T1 carries zero editorial claims; the tier model IS the legal architecture |
| Solo burnout | **One flagship per quarter.** The calendar above already encodes this; new opportunities displace, never stack |
| Funder capture | No source >40%; all funding public on "quién financia esto" |
| Open-sourcing leaks | Pre-flight before flipping public: secrets scan, git-history PII audit (early quejas data, photos pre-anonymization), `.voiceprints/` + `.env` verification, license choice (AGPL-3.0 recommended for network-service copyleft; NLnet-compatible) |
| Personal exposure (small town, named operator) | Funding transparency + prominent right-of-reply are the shields; every accusation traces to published methodology; LOREG freeze discipline already built |
| PLACSP scaling brittleness | Budget engineering time for the syndication-feed route; comarca wave exists precisely to measure this cost before promising the province |
| Grant-cycle slippage (NLnet "after the summer" etc.) | Portfolio of ~10 shots; no single decision blocks the calendar; traction workstream is funder-independent |

## 7 · Success metrics (reviewed monthly)

- Findings published per week (≥1 — the IFCN clock)
- Press citations of CivicPulse data (target: 5 by Dec 2026, 20 by May 2027)
- Investigations placed (3 by May 2027)
- Riba-roja active queja users (per OUTREACH.md: 30–50 by Sept 2026)
- Municipalities on T1 (9 by Jan 2027 · 266 by May 2027)
- Funding pipeline: applications out / decisions pending / € won
- First external T3 curator interest (≥3 conversations by mid-2027)

## 8 · Immediate next actions (the first two weeks)

1. Open-source pre-flight audit (secrets, git history PII, license).
2. "Quién está detrás" page + English about page.
3. NLnet proposal draft (project plan + budget €40–50k / 12 months).
4. Shortlist + first contact: partner journalist in 2nd EU country (JFE).
5. Investigation #1 selection from existing findings backlog + pitch email to
   Valencia Plaza / elDiario CV.
6. Weekly findings cadence: pick the publication day, automate the reminder.
