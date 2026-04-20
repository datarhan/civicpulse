# Quejas ciudadanas — end-to-end process design

**Status:** design proposal · not implemented
**Author:** Claude Opus 4.7 research brief · 2026-04-20
**Scope:** Riba-roja de Túria · 24,600 vecinos

---

## Goal

Turn CivicPulse's empty `/quejas` page into the one place where a vecino can
(a) file a queja once and have it become a **legally-binding solicitud** at the
Ayuntamiento's Registro Electrónico, (b) watch the **3-month clock** run
transparently against the department responsible, (c) see **aggregate
response-time dashboards** by departamento + barrio + categoría, and (d) have
**auto-escalation** to the Síndic de Greuges de la Comunitat Valenciana when
the deadline passes without resolution. No fabricated efficiency scores, no
naming of technical staff, no political shaming.

---

## What the research told us (condensed from 3 parallel research agents)

**Spanish legal framework (Ley 39/2015, 7/1985, 19/2013, LO 1/1982, RD 203/2021)**
- A *queja* is only a binding *solicitud* when it enters the municipal **Registro
  Electrónico** — art. 16 LPACAP. That's the only clock the law recognises.
- Without an **electronic signature** (qualified cert / Cl@ve-Firma / Autofirma)
  it's a *sugerencia*, not a solicitud — no silencio rights, no 3-month deadline.
- We **cannot file on the citizen's behalf** without a **Registro Electrónico de
  Apoderamientos (REA)** poder per citizen — art. 6 LPACAP. Too heavy for V1.
- **Silencio administrativo on quejas is negative** (art. 24 LPACAP): after 3
  months of silence the citizen can file a contencioso-administrativo in 2
  months. Display that as explicit guidance, never as "auto-approval".
- **FACe is invoice-only**. No Spain-wide complaints API. Each Ayuntamiento's
  sede electrónica is the only write endpoint. SIR/GEISER relays between
  registros (read-only for us).
- **Ley 19/2013 art. 8.1.i + Valencian Law 1/2022** make publication of
  per-department quality-of-service metrics lawful. Granularity is up to us.
- **Art. 132 LRBRL** — the Comisión Especial de Sugerencias y Reclamaciones
  files an **annual Pleno report**. Optional below the "gran ciudad" threshold
  (Riba-roja qualifies as "optional"). When it exists, it is public — ingest it.
- **LO 1/1982 art. 8** — elected officials acting in their public capacity are
  lawful to name. Private contractors and non-elected personnel: strip before
  publishing. AEPD has sanctioned municipal portals for the opposite.

**What existing civic-tech platforms do (FixMyStreet, SeeClickFix, Decidim, Consul, Avisa Madrid, Open311)**
- **None of the Spanish platforms** (Decidim, Consul, Avisa Madrid) publish
  per-individual-official response time. All aggregate at department / area /
  servicio. Spanish labour law + LO 1/1982 make it the only safe line.
- **FixMyStreet** is the closest architectural model: 7-field schema, per-council
  league tables on median fix time, Open311 GeoReport v2 as the interop format.
  Libel-safe under UK Defamation Act 2013 s.5 — citizen is the publisher; mySociety
  is the platform.
- **Avisa Madrid** publishes AVISA quarterly CSV with (date, category, district,
  street-truncated, state). Individual officials never named. This is the
  template for Spain.
- **No Spanish municipality publishes an Open311 endpoint in 2026.** Adopting it
  as a consumer is pointless; **emitting it** as our public feed (read-only
  `public/data/quejas.json` in Open311 shape) gives free interop if one arrives.
- **Decidim / Consul are the wrong primitives for quejas** — they're for
  deliberation (propuestas, votos, presupuestos participativos), not incident
  reporting. Using Proposals for potholes is documented friction.

**Accountability patterns that hold up legally (Civio, TheyWorkForYou, Qué Hacen Los Diputados, STC 216/2013)**
- "Reportaje neutral" doctrine: faithfully reproduce primary sources with
  attribution → constitutional shield even if later inaccurate.
- Individual-official metrics are publishable **only** when sourced from an
  official register: plenary attendance (acta), votes (acta), asset
  declarations (BOP), salary (plantilla), contracts per área (PLACSP). Never
  from inferred / crowd-collected data.
- Verbatim quote + source URL + ISO date required on any claim naming a person.
  No adjectives — "lento", "ineficaz" are all actionable. "Sin respuesta en
  30 días" is a factual state, not a verdict.
- External escalation beats public shame: when a threshold is crossed, link to
  **Síndic de Greuges** / **Defensor del Pueblo** / **CTBG** — the sanction is
  a public body's call, not ours.

---

## The insight: nobody has wired the end-to-end pipeline for a small Spanish muni

**FixMyStreet** has routing + tracking but no Spanish legal anchor. **Avisa
Madrid** has the quarterly dashboard but is internal to one city and doesn't
expose the clock to citizens. **Decidim** has participation but no ticket
lifecycle. **The 15 Síndics of Greuges** publish escalations but don't expose
the pre-escalation SLA.

The defensible MVP for Riba-roja is a thin layer that **stitches existing
public artefacts into a single lifecycle view** — we don't replace the
Ayuntamiento's sede electrónica, we annotate it.

---

## The 7-stage pipeline

```
CAPTURE → TRIAGE → HANDOFF → REGISTRO → TRACK → PUBLISH → ESCALATE
   1         2         3          4         5        6          7
```

### Stage 1 · CAPTURE (civic-tech form)

Public form on `/quejas/nueva`, schema mirrors FixMyStreet:

```
{
  "id": "Q-<ulid>",
  "category": "via_publica" | "limpieza" | "zonas_verdes" | "alumbrado"
            | "trafico" | "mobiliario_urbano" | "ruido" | "agua_saneamiento"
            | "transporte" | "transparencia" | "urbanismo" | "otros",
  "title": "string (max 140)",
  "detail": "string (max 2000)",
  "lat": number, "lng": number,
  "neighborhood": "<OSM slug from geo.json>",
  "photo_url": "string? (EXIF-stripped, face-blurred server-side)",
  "citizen": {
    "contact_email_hash": "sha256(email)",
    "cl_ave_verified": false
  },
  "created_at": "ISO-8601"
}
```

- Required: category + title + detail + lat/lng + photo. Email optional
  (rate-limiting only).
- Photo pipeline: EXIF strip → auto-blur faces + license plates → aggregate
  location to neighborhood centroid before publishing.
- Deduplication: proximity radius (50m) + category + 72h window → merge.

### Stage 2 · TRIAGE (automated + editorial)

- Auto-classify → concejalía via `officials.json` portfolio mapping (we already
  have it).
- Strip PII before the record is ever shown publicly: no exact address, no names
  of non-elected personnel, no plates, no DNI, no faces.
- 24h human moderation window before the queja goes public. Default: publish.
  Moderators can only redact PII or categorise — never edit the citizen's
  verbatim text.
- Severity inference (low/med/high) from category + keyword whitelist — shown
  as a hint, never as a verdict.

### Stage 3 · HANDOFF to the municipal sede

**This is the legally critical step.** Because we cannot file on the citizen's
behalf without REA, we do a **consented signed handoff**:

1. Citizen clicks "Convertir en solicitud oficial" on the queja card.
2. We generate a **pre-filled PDF/XML payload** matching the format of
   Riba-roja's registro electrónico solicitud genérica.
3. Deep-link to `https://sede.ribarroja.es` with a session token carrying the
   payload hash.
4. Citizen signs with Cl@ve-Firma / Autofirma / DNIe on the sede.
5. Sede issues the **recibo** (entry number + CSV hash + timestamp) — this is
   the legal proof.
6. We ask the citizen to paste the recibo back (or auto-capture via deep-link
   return URL if the sede supports it).

The citizen is always the signer. We are always the platform, never the filer.

### Stage 4 · REGISTRO (the clock starts)

Only once a valid **recibo** is attached does the queja's state flip from
`capturada` → `registrada`. The 3-month clock (art. 21.3 LPACAP) starts from
the recibo's timestamp, **not** from our stage-1 capture. Two separate
timestamps are stored and displayed:

- `capturada_at` — informational ("llegó a CivicPulse")
- `registrada_at` — legal ("entró en sede · nº de asiento: XXX · CSV: YYY")

A queja that never reaches `registrada` within 30 days of capture is auto-closed
with status `no_registrada` — we never pretend an unsigned queja is actionable.

### Stage 5 · TRACK (state machine, dual-source)

State enum (mirrors FixMyStreet + art. 21 LPACAP):

```
capturada → registrada → notificada_10d → en_tramite
         → resuelta_estimatoria | resuelta_desestimatoria | silencio_negativo
         → escalada_sindic
```

State transitions driven by:
- **Registro CSV polling** (if the municipality exposes `sede.ribarroja.es`
  estado-de-expediente — many do under RD 203/2021 art. 28).
- **Citizen-reported confirmations** (the vecino pastes the notificación PDF
  or marks "respuesta recibida").
- **Clock automation**: `registrada_at + 10d` without `notificada_10d` → flag
  `sin_acuse`; `registrada_at + 90d` without `resuelta_*` → flag
  `silencio_negativo` (art. 24 LPACAP).

Never auto-derive guilt. "Silencio" is factual; it doesn't imply the department
did anything wrong — it's just the legal state.

### Stage 6 · PUBLISH (aggregated + source-cited)

Three public surfaces:

**A · `/quejas` public feed** — individual quejas visible with PII stripped,
aggregated to neighborhood centroid, with state + clock visible. Schema exposed
as **Open311 GeoReport v2** at `public/data/quejas.json` (interop, zero cost).

**B · `/quejas/dashboard` — department × category × barrio**
Metrics published (mirrors Avisa Madrid's quarterly CSV pattern):

| Metric | Unit | Visibility |
|---|---|---|
| Volume per month | Count | Public |
| Median acknowledgement time | Hours | Public |
| Median resolution time | Days | Public |
| SLA-met % (vs. Carta de Servicios if published) | % | Public |
| Backlog > 30 days | Count | Public |
| Silencio negativo count | Count | Public |
| Escalations to Síndic | Count | Public |

**Aggregation keys (always):** `concejalía × categoría × barrio × trimestre`.
**Never published:** individual staffer names, exact street+number, citizen
identity, photos of private faces/plates.

**C · `/cargos/<concejal>` profile** — individual concejal cards show only
data from **official registers**:

- Plenary attendance (from `plenos.json` + official actas)
- Votes cast on each pleno agenda item (from actas)
- Asset declaration (from BOP)
- Salary (from plantilla municipal)
- Contracts awarded under their área (from `tenders.json` / PLACSP)
- Number of quejas assigned to their *concejalía* (aggregate, not personal)

**Never shown per-concejal:** resolution time, SLA performance. Those belong to
the department, not the political figure.

### Stage 7 · ESCALATE (external institutions do the sanctioning)

When `registrada_at + 90d` elapses without `resuelta_*`, the queja card surfaces
a pre-filled template for **Síndic de Greuges de la Comunitat Valenciana**
(https://www.elsindic.com). The Síndic:

- Accepts ciudadano-directly-filed quejas about municipal non-response.
- Publishes its resoluciones (naming the non-cooperative Ayuntamiento) at
  https://www.elsindic.com/resolucions.
- Has statutory authority to name negligent administrations — we don't.

If the original queja was a **transparency request** under Ley 19/2013 and the
municipality silenced it, the escalation target is the **CTBG** (national) or
the Valencian **Consell de Transparència**. We already scrape BDNS + contract
portals; we'd add a feed of CTBG resoluciones naming Riba-roja.

---

## Legal contract (the editorial line `/metodologia` + `/aviso-legal` must carry)

1. **Published verbatim, aggregated by default.** Individual quejas appear
   neighborhood-truncated. No individual non-elected personnel named.
2. **Only elected officials named** in their public-act capacity, and only with
   data from official registers — never from crowd reports.
3. **"Sin respuesta" is factual, not a verdict.** No adjectives on dashboards.
4. **Right of reply wired in.** Every queja + every department + every concejal
   card links a pre-filled `.github/ISSUE_TEMPLATE` form (same flow as `/promesas`).
   Approved replies render verbatim alongside the claim.
5. **LOREG freeze mode** (already implemented on `/promesas`): during electoral
   periods the escalation auto-tags are suspended; the dashboard is read-only.
6. **External escalation only.** The platform never pronounces sanction —
   Síndic / CTBG / Defensor do. We surface the state and the path.
7. **Takedown on 72h notice** if a redaction complaint is credible. Archived
   with the reason (audit log public).

---

## Anti-weaponisation

- Email + Cl@ve verification for filing (identity required to influence, not
  to read).
- Rate limits: max 3 quejas / email / 24h; max 10 / IP / 24h.
- Category taxonomy excludes political speech — "transparencia" category
  accepts only documentable facts (budget line, contract ID, pleno point).
  Non-operational grievances are redirected to formal instruments (moción
  ciudadana, queja al Síndic, PR to the promesas tracker).
- Duplicate merge on proximity + category.
- Public moderation log for every redaction.

---

## Build plan

**Sprint A — Read-only skeleton** (2 days)
- Schema + `public/data/quejas.json` empty seed + Open311 GeoReport v2 emit
- `/quejas` feed UI showing "aún no hay quejas registradas — sé el primero"
- Dashboard at `/quejas/dashboard` with empty stats
- Adapter to ingest the Comisión de Sugerencias y Reclamaciones annual report
  if Riba-roja's Pleno publishes one (`scripts/scrape-comision-sugerencias.ts`)

**Sprint B — Capture form** (3 days, TDD)
- `/quejas/nueva` form with category + geo + photo
- Server-side: EXIF strip + face/plate blur + PII redact
- Deduplication + 24h moderation queue
- Still no registro handoff — capture only produces `capturada` state quejas

**Sprint C — Handoff + tracking** (4 days, TDD)
- Pre-filled PDF/XML solicitud genérica generator
- Deep-link to `sede.ribarroja.es` with payload hash
- Recibo capture flow (citizen pastes back entry nº + CSV)
- Clock automation: 10d acuse, 90d silencio

**Sprint D — Escalation + scorecard** (2 days, TDD)
- Síndic de Greuges template generator
- CTBG resoluciones scraper for any mentioning Riba-roja
- `/quejas/dashboard` aggregate metrics (median, SLA-met, backlog, silencio)
- `/cargos/<id>` integration: queja counts per concejalía (not per concejal)

**Sprint E — Legal + right of reply** (1 day)
- `.github/ISSUE_TEMPLATE/queja-response.yml` (mirrors promise-response.yml)
- `npm run queja-reply` curator CLI (mirrors `npm run reply`)
- `/metodologia` + `/aviso-legal` updates
- LOREG freeze hook reuse

**Total: ~12 dev-days end-to-end.** TDD with the same RED→GREEN→wire cadence
as the 13 existing adapters; 106-test suite extended to cover each new
contract.

---

## Success metrics (for the dashboard itself, after 12 months live)

- **≥50 quejas registradas in sede** (i.e. reached stage 4) — proves the
  handoff UX works.
- **Median `capturada → registrada` time < 5 min** — proves the pre-fill is good.
- **Median municipal acknowledgement time published per concejalía** — that's
  the real output for vecinos.
- **≥1 queja escalated to Síndic with published resolución** — proves the
  pipeline has teeth.
- **Zero AEPD / LO 1/1982 complaints upheld against us** — proves the legal
  line held.

---

## What this does NOT do (by design)

- Does not rank individual municipal employees by speed. Illegal under LOPDGDD
  + Spanish labour law without union agreement.
- Does not "approve" quejas automatically. Silencio is negative — we explain
  the contencioso-administrativo path, we don't simulate approval.
- Does not replace the Ayuntamiento's sede. We annotate it, adding clock + map
  + dashboard — the legal act still happens in `sede.ribarroja.es`.
- Does not call any official "corrupto", "negligente" or "incompetente". Ever.
  Those are judicial findings, not dashboard tags.

---

## Primary sources (for `/aviso-legal`)

**Legal framework**
- Ley 39/2015 LPACAP — https://www.boe.es/buscar/act.php?id=BOE-A-2015-10565
- Ley 7/1985 LRBRL — https://www.boe.es/buscar/act.php?id=BOE-A-1985-5392
- Ley 19/2013 Transparencia — https://www.boe.es/buscar/act.php?id=BOE-A-2013-12887
- LO 1/1982 Honor — https://www.boe.es/buscar/act.php?id=BOE-A-1982-11196
- LO 3/2018 LOPDGDD — https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673
- RD 203/2021 eAdmin — https://www.boe.es/buscar/act.php?id=BOE-A-2021-5032
- Ley 1/2022 CValenciana — https://www.boe.es/buscar/act.php?id=BOE-A-2022-7837

**Architectural precedents**
- FixMyStreet — https://www.fixmystreet.com · github.com/mysociety/fixmystreet
- Avisa Madrid AVISA dataset — https://datos.madrid.es
- Decidim — https://decidim.org
- Open311 GeoReport v2 — http://www.open311.org
- Civio (Spanish editorial precedent) — https://civio.es
- Sindicatura de Greuges CV — https://www.elsindic.com
- CTBG — https://www.consejodetransparencia.es
