# ribarroja.es data-source audit — July 2026

Scout of the (redesigned) municipal site for data CivicPulse doesn't yet take.
Two passes: a Portal-de-Transparencia deep-dive (same-origin `fetch` from the
page context, bypassing the WAF) + a 12-section sweep. Ranked by value to the
app, with the surface each would feed and rough scrapeability.

**WAF/fetch note:** the main `www.ribarroja.es` CMS is fetchable. The
`oficinavirtual.ribarroja.es` PortalCiudadania app + the farmacias widget are
JS/cert-gated (client-rendered), so those were characterized indirectly and
need a browser or a located static listing to scrape.

**Currently taken from this site:** corporación (officials), plenos + agendas,
noticias RSS, eventos RSS, Transparencia (only the RPT + councillor-CV PDF
index), tenders via ribalicita/Gobierto, empleo via portalemp. Everything below
is beyond that.

---

## TIER 1 — build next (high value, feasible)

### 1. Actas de las Mesas de Contratación  ·  Transparencia cat. 4
- **What:** award-committee minutes = the **real contract prices**.
- **Why it's the top pick:** fixes the PLACSP "€100 artifact" our memory
  documents (the importe field is a 0–100 score on SDA/framework call-offs, not
  the price). Montealcedo exp.251/2023: PLACSP €100 vs acta €14.534,31. The acta
  *is* the truth. **Directly upgrades the DANA reconstrucción reportaje** (real
  awarded amounts instead of artifacts).
- **Scrapeability:** medium — PDFs linked from the contratación transparency
  pages / mesa-de-contratación section.
- **Feeds:** `tenders.json` amount-correction, the reconstrucción reportaje, `/presupuesto`.

### 2. Tablón de edictos (official electronic edicts board)
- **What:** municipal-level BOP — sanciones, licencias, notificaciones,
  aprobación inicial/definitiva de ordenanzas/presupuestos, expropiaciones —
  tagged by **departamento + nº de expediente**, 10-business-day window.
- **Why:** fresher and more granular than the *provincial* BOP we already
  scrape; the freshest legal signal the town emits.
- **Scrapeability:** medium-hard — the PortalCiudadania board is JS/cert-gated,
  BUT edicts publish as PDFs via `ribarroja.es/contenidos.downloadatt.action?id=<id>`,
  so **locate the public HTML listing first** (browser, not WebFetch).
- **Feeds:** a new "Edictos municipales" surface; enriches `/quejas` legal-clock + `/departamentos`.

### 3. Budget EXECUTION (quarterly) + modificaciones presupuestarias  ·  Transparencia cat. 3
- **What:** actual spend vs. approved, updated ≥ quarterly, + budget
  modifications approved by Pleno/JGL. Plus financial indicators (autonomía
  fiscal, capacidad/necesidad de financiación). The "Visor Presupuestario"
  resolves to the Hacienda `/es/hacienda/1_presupuesto` area.
- **Why:** we only have the *approved* budget (MinHac CONPREL). Execution is
  where accountability lives (what got spent, what got moved).
- **Scrapeability:** medium — PDFs / the Hacienda budget area.
- **Feeds:** `/presupuesto`, `/datos`.

---

## TIER 2 — strong additions

### 4. Modificaciones de contratos  ·  Transparencia cat. 4
Cost overruns / contract mods. On-point for "adjudicado ≠ ejecutado" — DANA
contracts that grew after award. Feeds the reportaje + `/presupuesto`.

### 5. Procesos selectivos (municipal hiring / oposiciones)  ·  `/es/noticia/publicaciones-procesos-selectivos`
Bases, listas provisionales/definitivas, tribunales, results — **distinct from
the ADL `/empleo`** (which brokers *external* jobs; this is *municipal*
recruitment). Public-employment / nepotism-watch transparency. HTML list +
per-process PDFs. New "Empleo público" surface or `/departamentos` (RRHH).

### 6. Registro Municipal de Asociaciones (dated PDF, current 2026-05-28)
Civil-society map **and** a named-local-partner outreach list — dual-purpose,
directly serves the nonprofit-watchdog strategy (T3 curator recruitment).
Single dated PDF to parse. Feeds an "entidades" directory + outreach.

### 7. Urbanismo, obras públicas y medioambiente  ·  Transparencia cat. 5
Obras-públicas listing + planeamiento (PGOU / PATRICOVA flood zones). DANA-
relevant geo. Feeds the reconstrucción map + `/presupuesto`.

---

## TIER 3 — nice to have

- **8. FOI annual memorias (derecho de acceso, 2018→2024 PDFs)** — requests
  received/resolved; meta-transparency that pairs with our silencio-administrativo
  clock. `/datos` transparency-health metric.
- **9. Convenios y encomiendas de gestión** (cat 4) — agreements PLACSP doesn't carry.
- **10. Áreas/Concejalías pages** — per-área councillor contact + área PDFs/maps
  (industrial-zone map w/ street names, huerta parcel map — both DANA-relevant).
  Enriches `/departamentos` + the landing map.
- **11. Asignaciones económicas a grupos políticos** (cat 4) + **declaraciones
  de bienes y actividades** de concejales (cat 1) — accountability, libel-sensitive.
- **12. Morosidad / PMP / operaciones con proveedores, rendición de cuentas
  (memorias anuales)** — financial-health indicators. `/datos`.

---

## Excluded (already covered or low value)

- **Avisos** (`/es/listado-titulares/aviso`) — the live head is all **pleno
  convocatorias**, already captured by the plenos scraper.
- **Obituario** — death notices; no accountability value + PII. Skip.
- **BIM (Boletín de Información Municipal)** — PR magazine, unstructured.
- **Buzón / Plan Antifraude** — external redirect to `antifraucv.es`; only a
  `/metodologia` reference.
- **Fil directe amb l'alcalde** — write-only contact form, no public output.
- **Farmacias de guardia** — low accountability. *Honorable mention:* the
  municipal app REST backend `webapp.appriba-roja.es/contents/categories/...`
  looks JSON-backed — a clean feed if a landing "servicios hoy" chip is ever wanted.

---

## Immediate tie-in to current work

**Actas de las Mesas de Contratación (#1) + modificaciones de contratos (#4)**
would directly strengthen the DANA reconstrucción reportaje: real awarded
prices instead of PLACSP score-artifacts, and post-award cost growth. That's the
highest-leverage next scraper for the investigation already in flight.
