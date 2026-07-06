# Promotion/Funding Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute §8 of `docs/superpowers/specs/2026-07-06-promotion-funding-strategy-design.md` — open-source pre-flight audit, public transparency pages (`/nosotros` ES + `/about` EN), IFCN weekly-cadence tooling, and the three funding/outreach documents (NLnet draft, JFE partner kit, investigation #1 shortlist).

**Architecture:** Code work follows repo idioms exactly — pure functions in `src/lib/*.js` TDD'd by vitest in `tests/*.test.ts`, pages as `src/pages/*.jsx` with inline styles over CSS variables, CLIs as `npx tsx scripts/*.ts`, e2e per-route Playwright specs. Document work lands in `docs/funding/` (committed) and `editorial/` (gitignored, curator-private).

**Tech Stack:** React 18 + React Router 6, vitest, Playwright, tsx, gitleaks (new dev dependency via Homebrew, not npm).

## Global Constraints

- Libel invariants are untouchable: no changes to `promises.json` contracts, finding validators, `speakerGroup` gates, or any curated-file CLI.
- Editorial body copy is written in Spanish (source-language discipline, matching `AvisoLegal.jsx` which uses no `t()`); only chrome strings (nav label) go through `src/i18n.jsx` with both `es` and `ca` keys (Valencian = AVL spelling).
- Components use inline styles driven by CSS variables — no new `.css` files, no styled-components.
- Every `src/lib` module ships with a vitest suite written FIRST (RED→GREEN).
- License is `AGPL-3.0-only` (spec §6).
- Numeric UI values use the `.mono` class and `toLocaleString('es-ES')`.
- The pre-commit hook runs `npm run lint` — if a commit fails, fix lint errors, never `--no-verify`.
- Contact email published on the new pages is `slutchenko@gmail.com` (the operator's real, working address; migrating to `redaccion@civicpulse.es` is a later DNS task, tracked in the audit doc's flip checklist).
- New routes: `/nosotros` (in NAV) and `/about` (NOT in NAV — English funder audience arrives by direct link; Spanish citizen chrome stays Spanish).

---

### Task 1: Git-history secrets scan (gitleaks)

**Files:**
- Create: `docs/superpowers/audits/2026-07-06-opensource-preflight.md`

**Interfaces:**
- Produces: the audit document that Tasks 2–3 append to. Section headings created here: `## 1 · Secrets scan (gitleaks)`, `## 2 · PII & sensitive-tree history audit`, `## 3 · License`, `## 4 · Flip checklist`, `## 5 · Verdict`.

- [ ] **Step 1: Install gitleaks**

```bash
command -v gitleaks || brew install gitleaks
gitleaks version
```

Expected: a version ≥ 8.x prints.

- [ ] **Step 2: Scan the FULL git history**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
gitleaks detect --source . --report-format json --report-path /tmp/gitleaks-civicpulse.json -v || true
python3 -c "
import json
rows = json.load(open('/tmp/gitleaks-civicpulse.json'))
print('total findings:', len(rows))
seen = {}
for r in rows:
    key = (r['RuleID'], r['File'])
    seen.setdefault(key, 0)
    seen[key] += 1
for (rule, f), n in sorted(seen.items()):
    print(f'{n:4} × {rule:30} {f}')
"
```

Expected: a finding count (likely nonzero — test fixtures contain CSRF tokens and API-shaped strings). The `|| true` is because gitleaks exits 1 when it finds anything.

- [ ] **Step 3: Triage every distinct (rule, file) pair**

For each row decide one of three verdicts:
- **FALSE POSITIVE** — fixture/test data, public tokens (e.g. portalemp `CSRFPTOKEN` echoes in `tests/fixtures/`, WMS URLs, public API endpoints). No action.
- **REAL, ROTATED** — a live credential that was ever committed. Action: rotate the credential at its provider NOW (before any repo flip), then record the commit hash for the history-rewrite decision in Task 2.
- **REAL, STILL LIVE** — blocks the flip until rotated.

- [ ] **Step 4: Write the audit document with the triage table**

Create `docs/superpowers/audits/2026-07-06-opensource-preflight.md`:

```markdown
# Open-source pre-flight audit — 2026-07-06

Purpose: verify the private repo can be flipped public (NLnet submission,
September 2026) without leaking secrets or PII. Spec:
`docs/superpowers/specs/2026-07-06-promotion-funding-strategy-design.md` §6.

## 1 · Secrets scan (gitleaks)

Tool: `gitleaks detect` over full history, <version> — <date>.
Raw report: /tmp/gitleaks-civicpulse.json (not committed).

| Rule | File | Count | Verdict | Action |
|---|---|---|---|---|
| <fill from Step 3 triage — one row per (rule, file) pair> |

Summary: <N> findings — <n1> false positives, <n2> rotated, <n3> blocking.

## 2 · PII & sensitive-tree history audit

(filled by Task 2)

## 3 · License

(filled by Task 3)

## 4 · Flip checklist (September, before NLnet submission)

- [ ] All "blocking" rows above resolved
- [ ] History rewrite executed IF §2 verdict requires it (git-filter-repo; forces re-clone of all local checkouts + cron worktrees)
- [ ] `contactUrl` in `public/data/pleno-findings.json` + `press-findings.json` points at the PRIVATE repo's GitHub issue form — replace with the public repo URL or a mailto before flip (citizens currently cannot open it)
- [ ] README.md written (repo has none — GitHub landing would be empty)
- [ ] `redaccion@civicpulse.es` domain mailbox configured; replace `slutchenko@gmail.com` on `/nosotros` + `/about`
- [ ] GitHub repo settings: disable wiki/projects, enable issue templates only

## 5 · Verdict

(filled by Task 2 — SAFE TO FLIP / BLOCKED ON <list>)
```

Fill the §1 table with actual triage results before saving.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/audits/2026-07-06-opensource-preflight.md
git commit -m "docs(audit): open-source pre-flight — gitleaks history scan + triage"
```

---

### Task 2: PII & sensitive-tree git-history audit

**Files:**
- Modify: `docs/superpowers/audits/2026-07-06-opensource-preflight.md` (fill §2 and §5)

**Interfaces:**
- Consumes: audit doc skeleton from Task 1.
- Produces: the SAFE-TO-FLIP / BLOCKED verdict that gates the September repo flip.

- [ ] **Step 1: Verify the gitignored sensitive trees were NEVER committed**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
for p in .env bot/.env ".voiceprints/*" "bot/data/*" "editorial/*" "scripts/logs/*" ".llm-cache/*" ".research-cache/*" ".curator-jobs/*" "*.db" "*.sqlite" "*.sqlite3"; do
  echo "=== $p ==="
  git log --all --oneline -- "$p" | head -5
done
```

Expected: EVERY section prints nothing. Any output = that path was committed at some point → record the commits; they force a history-rewrite decision.

- [ ] **Step 2: Verify quejas snapshots never carried PII fields**

The bot's `snapshot.ts` publishes only non-PII fields, but check the full history of the published file:

```bash
git log --all -p -- public/data/quejas.json | grep -oiE '"(name|nombre|phone|telefono|telegram_user_id|username|address|direccion|dni|email)"' | sort | uniq -c
```

Expected: no output. Any hit → identify the commit (`git log --all -S '<field>' -- public/data/quejas.json`), record in §2.

- [ ] **Step 3: Verify queja photos in history all post-date the anonymizer**

```bash
git log --all --diff-filter=A --format='%h %ad' --date=short --name-only -- 'public/data/quejas-photos/*' | head -40
```

Cross-check: the anonymization pipeline (`bot process-photos`) shipped 2026-07-05 (memory: `project_queja_photo_anonymize`). Any photo added BEFORE that date must be manually inspected (open the blob: `git show <hash>:<path> > /tmp/check.jpg`) for un-mosaicked faces/plates/EXIF.

- [ ] **Step 4: Scan for accidental large/binary blobs in history**

```bash
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob" && $3 > 5000000 {print $3, $4}' | sort -rn | head -20
```

Expected: nothing surprising (large JSON snapshots are fine; audio/video/db files are not). Any `.mp3/.wav/.mp4/.db` blob → record for history rewrite.

- [ ] **Step 5: Record the private-repo URL leak surface**

```bash
grep -rn "github.com/datarhan" public/data/*.json src/ --include='*.jsx' --include='*.js' -l | head
```

Record every file in §4's contactUrl checklist row (already seeded for the two findings files; extend if more surface).

- [ ] **Step 6: Write §2 and the §5 verdict**

Fill `## 2` with one subsection per Step (commands + literal output + interpretation), then write `## 5 · Verdict` as exactly one of:
- `SAFE TO FLIP — no history rewrite needed. Remaining items are the §4 checklist.`
- `BLOCKED — history rewrite required for: <commit list>. Plan: git-filter-repo --invert-paths <paths>, then force-push + re-clone every checkout (laptop + any cron worktree). Execute in September flip window, not now.`

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/audits/2026-07-06-opensource-preflight.md
git commit -m "docs(audit): PII + sensitive-tree history audit → flip verdict"
```

---

### Task 3: LICENSE (AGPL-3.0-only)

**Files:**
- Create: `LICENSE`
- Modify: `package.json` (add `license` field)
- Modify: `docs/superpowers/audits/2026-07-06-opensource-preflight.md` (fill §3)

- [ ] **Step 1: Fetch the canonical license text**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
curl -fsS -o LICENSE https://www.gnu.org/licenses/agpl-3.0.txt
head -2 LICENSE
```

Expected: `                    GNU AFFERO GENERAL PUBLIC LICENSE` / `                       Version 3, 19 November 2007`.

- [ ] **Step 2: Add the license field to package.json**

Directly under the `"version"` line at the top of `package.json`, add:

```json
  "license": "AGPL-3.0-only",
```

- [ ] **Step 3: Verify npm parses it**

```bash
node -e "console.log(require('./package.json').license)"
```

Expected: `AGPL-3.0-only`.

- [ ] **Step 4: Fill audit §3**

```markdown
## 3 · License

AGPL-3.0-only adopted (LICENSE + package.json), per spec §6: network-service
copyleft — a hosted fork of the accountability stack must publish its source.
NLnet-compatible. Rationale documented in the strategy spec.
Bot subpackage (`bot/package.json`) intentionally inherits via the repo root.
```

- [ ] **Step 5: Commit**

```bash
git add LICENSE package.json docs/superpowers/audits/2026-07-06-opensource-preflight.md
git commit -m "chore: adopt AGPL-3.0-only license"
```

---

### Task 4: `src/lib/impact-stats.js` — pure impact summarizer (TDD)

**Files:**
- Create: `src/lib/impact-stats.js`
- Test: `tests/impact-stats.test.ts`

**Interfaces:**
- Consumes: snapshot shapes — `plenos.json{items[]}`, `pleno-findings.json{items[{publishedAt:'YYYY-MM-DD'}]}`, `quejas.json{items[]}`, `tenders.json{contracts[]}`.
- Produces: `summarizeImpact({plenos, findings, quejas, tenders}) → {plenosCount:number, findingsCount:number, quejasCount:number, contractsCount:number, lastFindingAt:string|null}` — consumed by Task 5's `/nosotros` page.

- [ ] **Step 1: Write the failing test**

Create `tests/impact-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { summarizeImpact } from '../src/lib/impact-stats'

describe('summarizeImpact', () => {
  it('returns zeros and null date on empty/missing snapshots', () => {
    expect(summarizeImpact({})).toEqual({
      plenosCount: 0,
      findingsCount: 0,
      quejasCount: 0,
      contractsCount: 0,
      lastFindingAt: null,
    })
    expect(summarizeImpact()).toEqual({
      plenosCount: 0,
      findingsCount: 0,
      quejasCount: 0,
      contractsCount: 0,
      lastFindingAt: null,
    })
  })

  it('counts items across the four snapshot shapes', () => {
    const out = summarizeImpact({
      plenos: { items: [{}, {}, {}] },
      findings: { items: [{ publishedAt: '2026-07-01' }] },
      quejas: { items: [{}] },
      tenders: { contracts: [{}, {}] },
    })
    expect(out).toEqual({
      plenosCount: 3,
      findingsCount: 1,
      quejasCount: 1,
      contractsCount: 2,
      lastFindingAt: '2026-07-01',
    })
  })

  it('lastFindingAt is the max publishedAt, tolerating rows without one', () => {
    const out = summarizeImpact({
      findings: {
        items: [{ publishedAt: '2026-07-03' }, {}, { publishedAt: '2026-07-06' }, { publishedAt: '2026-06-01' }],
      },
    })
    expect(out.findingsCount).toBe(4)
    expect(out.lastFindingAt).toBe('2026-07-06')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/impact-stats.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/impact-stats'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/impact-stats.js`:

```js
/**
 * Pure impact-metrics summarizer for the /nosotros transparency page.
 * Takes the raw snapshot objects the existing hooks return and reduces
 * them to the headline counters. Tolerates missing/partial snapshots
 * (every page hook starts as null while loading).
 */
export function summarizeImpact({ plenos, findings, quejas, tenders } = {}) {
  const findingItems = findings?.items ?? []
  const lastFindingAt = findingItems.reduce(
    (max, it) => (it?.publishedAt && it.publishedAt > max ? it.publishedAt : max),
    '',
  )
  return {
    plenosCount: plenos?.items?.length ?? 0,
    findingsCount: findingItems.length,
    quejasCount: quejas?.items?.length ?? 0,
    contractsCount: tenders?.contracts?.length ?? 0,
    lastFindingAt: lastFindingAt || null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/impact-stats.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/impact-stats.js tests/impact-stats.test.ts
git commit -m "feat(nosotros): impact-stats pure summarizer (TDD)"
```

---

### Task 5: `/nosotros` page — quién está detrás + quién financia + impacto

**Files:**
- Create: `src/pages/Nosotros.jsx`
- Modify: `src/App.jsx` (import + route, insert route directly above the `/metodologia` route at line ~131)
- Modify: `src/components/Sidebar.jsx` (NAV entry, appended as the last item of the `NAV` array)
- Modify: `src/i18n.jsx` (add `'nav.nosotros'` to BOTH the `es` and `ca` catalogues, next to the existing `'nav.laboratorio'` keys)

**Interfaces:**
- Consumes: `summarizeImpact` from Task 4; existing named-export hooks `usePlenos()`, `usePlenoFindings()`, `useQuejas()`, `useTenders()` (each returns `{loading, error, data}`); `Card`, `SectionHead` from `../components/Primitives`.
- Produces: route `/nosotros` whose headings Task 7's e2e spec asserts: page h1 `Quiénes somos`, section titles `Identidad y responsabilidad editorial`, `Quién financia esto`, `Impacto en cifras`.

- [ ] **Step 1: Add the i18n nav keys**

In `src/i18n.jsx`, in the `es` block after `'nav.laboratorio': 'Laboratorio',` add:

```js
    'nav.nosotros': 'Quiénes somos',
```

In the `ca` block after the corresponding `'nav.laboratorio'` key add:

```js
    'nav.nosotros': 'Qui som',
```

- [ ] **Step 2: Add the NAV entry**

In `src/components/Sidebar.jsx`, append as the LAST element of the `NAV` array (before the closing `]`):

```js
  {
    to: '/nosotros',
    id: 'nosotros',
    labelKey: 'nav.nosotros',
    label: 'Quiénes somos',
    icon: Ic.people,
    shortcut: 'G S',
  },
```

(`G S` is unused — taken set is H N C P L R E F D Q O B A; `G L`/`G C` collide already, do not add to the collisions.)

- [ ] **Step 3: Create the page**

Create `src/pages/Nosotros.jsx`:

```jsx
import { Card, SectionHead } from '../components/Primitives'
import { usePlenos } from '../hooks/usePlenos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { useQuejas } from '../hooks/useQuejas'
import { useTenders } from '../hooks/useTenders'
import { summarizeImpact } from '../lib/impact-stats'

// Contact: operator's real mailbox. Swap to redaccion@civicpulse.es once the
// domain mailbox exists (tracked in docs/superpowers/audits/…-opensource-preflight.md §4).
const CONTACT_EMAIL = 'slutchenko@gmail.com'

function StatCell({ value, label, loading }) {
  return (
    <div style={{ flex: '1 1 120px', minWidth: 120 }}>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>
        {loading ? '—' : value.toLocaleString('es-ES')}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function ImpactStrip() {
  const plenos = usePlenos()
  const findings = usePlenoFindings()
  const quejas = useQuejas()
  const tenders = useTenders()
  const loading = plenos.loading || findings.loading || quejas.loading || tenders.loading
  const s = summarizeImpact({
    plenos: plenos.data,
    findings: findings.data,
    quejas: quejas.data,
    tenders: tenders.data,
  })
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 6 }}>
        <StatCell value={s.plenosCount} label="plenos indexados" loading={loading} />
        <StatCell value={s.findingsCount} label="hallazgos publicados" loading={loading} />
        <StatCell value={s.contractsCount} label="contratos indexados" loading={loading} />
        <StatCell value={s.quejasCount} label="quejas ciudadanas" loading={loading} />
      </div>
      {s.lastFindingAt && (
        <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 10, marginBottom: 0 }}>
          Último hallazgo publicado: <span className="mono">{s.lastFindingAt}</span>. Cada cifra
          enlaza con su fuente primaria en las secciones correspondientes del panel.
        </p>
      )}
    </div>
  )
}

function OperatorPhoto() {
  return (
    <div style={{ width: 72, height: 72, flexShrink: 0 }}>
      <img
        src="/data/photos/operator.jpg"
        alt="Sergei Lutchenko, responsable de CivicPulse"
        width={72}
        height={72}
        style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover' }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
          e.currentTarget.nextSibling.style.display = 'flex'
        }}
      />
      <div
        aria-hidden="true"
        style={{
          display: 'none',
          width: 72,
          height: 72,
          borderRadius: 12,
          background: 'var(--civic-soft)',
          color: 'var(--civic)',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        SL
      </div>
    </div>
  )
}

export default function Nosotros() {
  return (
    <div
      className="cp-page"
      style={{ padding: '24px', maxWidth: 860, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        Transparencia editorial
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        Quiénes somos
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="Quién está detrás" title="Identidad y responsabilidad editorial" />
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 8 }}>
          <OperatorPhoto />
          <div>
            <p style={{ marginTop: 0 }}>
              <strong>Sergei Lutchenko</strong> — creador y responsable editorial de CivicPulse.
              Desarrollador de software. Diseña los sistemas de datos, cura cada hallazgo publicado
              y asume personalmente la responsabilidad editorial que describe el{' '}
              <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
                aviso legal
              </a>
              .
            </p>
            <p>
              CivicPulse no pertenece a ningún partido, administración ni grupo empresarial. La
              metodología completa — de dónde salen los datos, cómo se verifica una declaración,
              cuándo se publica un hallazgo — está en{' '}
              <a href="/metodologia" style={{ color: 'var(--civic)' }}>
                /metodologia
              </a>
              .
            </p>
            <p style={{ marginBottom: 0 }}>
              Contacto, correcciones y derecho de réplica:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--civic)' }}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Financiación" title="Quién financia esto" />
        <p>
          A fecha de julio de 2026, CivicPulse no ha recibido ningún ingreso externo: está{' '}
          <strong>autofinanciado por su responsable</strong>. Este apartado se actualizará con cada
          fuente de financiación que se incorpore — subvención, beca, donación o premio — indicando
          origen, importe y fecha.
        </p>
        <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
          <li>Sin publicidad.</li>
          <li>
            Sin fondos de ninguna administración bajo investigación editorial activa de este
            proyecto — empezando por el Ayuntamiento de Riba-roja de Túria.
          </li>
          <li>Ninguna fuente de financiación superará el 40 % de los ingresos anuales.</li>
          <li>Toda financiación se publica en esta página.</li>
        </ul>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Datos reales, en producción" title="Impacto en cifras" />
        <ImpactStrip />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="El proyecto" title="Qué es CivicPulse" />
        <p>
          Un monitor independiente de lo que hace el Ayuntamiento: plenos transcritos y
          verificados, presupuesto y contratos geolocalizados, promesas electorales con su fuente
          verbatim, y un canal de quejas vecinales con reloj legal. Riba-roja de Túria es el
          municipio piloto; el objetivo es que el mismo estándar de rendición de cuentas llegue a
          cualquier municipio español.
        </p>
        <p style={{ marginBottom: 0 }}>
          <a href="/metodologia" style={{ color: 'var(--civic)' }}>
            Metodología
          </a>
          {' · '}
          <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
            Aviso legal
          </a>
          {' · '}
          <a href="/datos" style={{ color: 'var(--civic)' }}>
            Catálogo de datos
          </a>
          {' · '}
          <a href="/about" style={{ color: 'var(--civic)' }}>
            About (English)
          </a>
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Wire the route**

In `src/App.jsx`, add the import next to the other page imports:

```js
import Nosotros from './pages/Nosotros'
```

and directly ABOVE the `/metodologia` route line add:

```jsx
              <Route path="/nosotros" element={<Nosotros />} />
```

- [ ] **Step 5: Verify build + lint + existing suites stay green**

```bash
npm run lint && npx vitest run tests/impact-stats.test.ts && npm run build
```

Expected: lint 0 errors, 3 tests pass, vite build completes. (The `/about` link 404-redirects to `/` until Task 6 lands — acceptable inside the same wave.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Nosotros.jsx src/App.jsx src/components/Sidebar.jsx src/i18n.jsx
git commit -m "feat(nosotros): quién está detrás + quién financia + impacto page"
```

---

### Task 6: `/about` — English funder-facing page

**Files:**
- Create: `src/pages/About.jsx`
- Modify: `src/App.jsx` (import + route directly above `/metodologia`)

**Interfaces:**
- Consumes: `Card`, `SectionHead` from `../components/Primitives`; `CONTACT_EMAIL` duplicated as a local const (pages don't share constants in this repo).
- Produces: route `/about`; h1 text `CivicPulse — municipal accountability infrastructure` asserted by Task 7's spec.

- [ ] **Step 1: Create the page**

Create `src/pages/About.jsx`:

```jsx
import { Card, SectionHead } from '../components/Primitives'

// English page for international funders/partners. Deliberately NOT in the
// sidebar NAV and NOT in i18n — the citizen-facing chrome stays Spanish, and
// this copy is funder-facing content, not chrome.
const CONTACT_EMAIL = 'slutchenko@gmail.com'

const TIER_ROWS = [
  ['T1 · Auto', 'all ~8,100 municipalities', 'budget, contracts, subsidies, census, unemployment, official-gazette mentions — national open sources, zero editorial claims'],
  ['T2 · Semi', 'hundreds', 'full-council transcription + claim extraction where session video exists; machine-suggested, human-gated'],
  ['T3 · Editorial', 'per town', 'verified findings, promise tracker, citizen complaints with legal clocks, right of reply — only with a named local curator'],
]

export default function About() {
  return (
    <div
      className="cp-page"
      style={{ padding: '24px', maxWidth: 860, margin: '0 auto', fontSize: 14, lineHeight: 1.6 }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        For international partners &amp; funders
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
        CivicPulse — municipal accountability infrastructure
      </h1>

      <Card style={{ marginTop: 22 }}>
        <SectionHead eyebrow="The problem" title="Spain's municipal news deserts" />
        <p>
          Roughly 6,800 of Spain's 8,100 municipalities have no dedicated press coverage. Local
          government there operates without systematic scrutiny: council sessions go
          untranscribed, contracts unexamined, electoral promises untracked. National watchdogs
          (Civio, Maldita, Newtral) work at state level; nobody does per-municipality
          accountability at scale.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The proof" title="One town, covered completely" />
        <p>
          CivicPulse runs live for Riba-roja de Túria (pop. ~24,600, València): 28 nightly
          scrapers over public-sector open data, Whisper-transcribed council sessions,
          LLM-extracted claims verified deterministically against the procurement/budget/subsidy
          record, human-curated findings with a built-in right of reply, geolocated contract
          spending, and a Telegram complaints channel with statutory response clocks. Every
          editorial surface is gated by documented libel discipline (
          <a href="/metodologia" style={{ color: 'var(--civic)' }}>
            methodology, in Spanish
          </a>
          ).
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="The thesis" title="Scale what's safe to scale" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['Tier', 'Scope', 'Content'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px 6px 0',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--ink60)',
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIER_ROWS.map(([tier, scope, what]) => (
                <tr key={tier}>
                  <td style={{ padding: '6px 10px 6px 0', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {tier}
                  </td>
                  <td style={{ padding: '6px 10px 6px 0', whiteSpace: 'nowrap' }}>{scope}</td>
                  <td style={{ padding: '6px 0' }}>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ marginBottom: 0 }}>
          Rollout: the Camp de Túria comarca (9 municipalities) in late 2026, the province of
          València (266) before the May 2027 municipal elections, then national. The data layer is
          built on sources that already cover every municipality by INE code.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionHead eyebrow="Who + funding" title="Operator and independence" />
        <p>
          Built and edited by <strong>Sergei Lutchenko</strong>, software developer, as an
          independent public-interest project — nonprofit direction, no ads, no venture capital,
          no money from any administration under active editorial investigation. All funding is
          disclosed publicly on{' '}
          <a href="/nosotros" style={{ color: 'var(--civic)' }}>
            /nosotros
          </a>
          . As of July 2026 the project is fully self-funded.
        </p>
        <p style={{ marginBottom: 0 }}>
          Contact:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--civic)' }}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Wire the route**

In `src/App.jsx` add the import next to `Nosotros`:

```js
import About from './pages/About'
```

and directly above the `/metodologia` route:

```jsx
              <Route path="/about" element={<About />} />
```

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/pages/About.jsx src/App.jsx
git commit -m "feat(about): English funder-facing about page"
```

---

### Task 7: e2e specs + a11y strict-pass for the two new routes

**Files:**
- Create: `tests/e2e/nosotros.spec.ts`
- Create: `tests/e2e/about.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts` (add both routes to `STRICT_ROUTES`)

**Interfaces:**
- Consumes: headings produced by Tasks 5–6 (`Quiénes somos`, `Quién financia esto`, `Impacto en cifras`, `CivicPulse — municipal accountability infrastructure`).

- [ ] **Step 1: Write the /nosotros spec**

Create `tests/e2e/nosotros.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Nosotros (/nosotros)', () => {
  test('renders identity, funding transparency and impact sections', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/nosotros', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByText('Identidad y responsabilidad editorial').first()).toBeVisible()
    await expect(page.getByText('Quién financia esto').first()).toBeVisible()
    await expect(page.getByText('Impacto en cifras').first()).toBeVisible()
    // Funding-independence commitment is the page's editorial core.
    await expect(page.getByText(/Sin publicidad/).first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})
```

- [ ] **Step 2: Write the /about spec**

Create `tests/e2e/about.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('About (/about, English)', () => {
  test('renders the funder-facing thesis page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/about', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'CivicPulse — municipal accountability infrastructure' }),
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByText("Spain's municipal news deserts").first()).toBeVisible()
    await expect(page.getByText('T1 · Auto').first()).toBeVisible()
    await expect(page.getByText('Operator and independence').first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})
```

- [ ] **Step 3: Add both routes to the a11y strict list**

In `tests/e2e/a11y.spec.ts`, inside `STRICT_ROUTES` after the `'/laboratorio/agentes'` entry, add:

```ts
  '/nosotros',
  '/about',
```

- [ ] **Step 4: Run the new specs**

```bash
npx playwright test tests/e2e/nosotros.spec.ts tests/e2e/about.spec.ts --project=chromium-desktop
```

Expected: 2 passed.

- [ ] **Step 5: Run the a11y strict pass for the two routes**

```bash
npx playwright test tests/e2e/a11y.spec.ts --project=chromium-desktop -g "/nosotros|/about"
```

Expected: 2 passed (no critical/serious axe violations). If a violation fires, fix the page (likely: link contrast → use `var(--civic)` only on `--paper` backgrounds; image alt already set).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/nosotros.spec.ts tests/e2e/about.spec.ts tests/e2e/a11y.spec.ts
git commit -m "test(e2e): nosotros + about route specs + a11y strict-pass"
```

---

### Task 8: `src/lib/findings-cadence.js` — ISO-week cadence (TDD)

**Files:**
- Create: `src/lib/findings-cadence.js`
- Test: `tests/findings-cadence.test.ts`

**Interfaces:**
- Produces: `isoWeekKey(isoDate:string) → 'YYYY-Www'|null` and `weeklyCadence(items:Array<{publishedAt?:string}>, {now:string}) → {firstWeek, currentWeek, totalWeeks, coveredWeeks, coverageRatio, currentWeekCount, gapWeeks:string[], perWeek:Array<{week,count}>} | null` — consumed by Task 9's CLI.

- [ ] **Step 1: Write the failing test**

Create `tests/findings-cadence.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isoWeekKey, weeklyCadence } from '../src/lib/findings-cadence'

describe('isoWeekKey', () => {
  it('computes ISO 8601 week keys (Thursday-anchored)', () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    // 2025-12-29 is the Monday of that same ISO week → belongs to ISO-year 2026.
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01')
    // 2026-06-01 is a Monday → week 23.
    expect(isoWeekKey('2026-06-01')).toBe('2026-W23')
    expect(isoWeekKey('2026-07-06')).toBe('2026-W28')
  })

  it('returns null for garbage', () => {
    expect(isoWeekKey('not-a-date')).toBe(null)
  })
})

describe('weeklyCadence', () => {
  it('returns null when nothing has been published', () => {
    expect(weeklyCadence([], { now: '2026-07-06' })).toBe(null)
    expect(weeklyCadence([{}, { publishedAt: undefined }], { now: '2026-07-06' })).toBe(null)
  })

  it('enumerates every week from first publication to now, counting gaps', () => {
    const items = [
      { publishedAt: '2026-06-01' }, // W23
      { publishedAt: '2026-06-03' }, // W23
      { publishedAt: '2026-06-15' }, // W25
    ]
    const r = weeklyCadence(items, { now: '2026-06-18' }) // Thursday of W25
    expect(r).not.toBe(null)
    expect(r!.firstWeek).toBe('2026-W23')
    expect(r!.currentWeek).toBe('2026-W25')
    expect(r!.totalWeeks).toBe(3)
    expect(r!.coveredWeeks).toBe(2)
    expect(r!.coverageRatio).toBeCloseTo(2 / 3)
    expect(r!.currentWeekCount).toBe(1)
    expect(r!.gapWeeks).toEqual(['2026-W24'])
    expect(r!.perWeek).toEqual([
      { week: '2026-W23', count: 2 },
      { week: '2026-W24', count: 0 },
      { week: '2026-W25', count: 1 },
    ])
  })

  it('flags an uncovered current week', () => {
    const r = weeklyCadence([{ publishedAt: '2026-06-01' }], { now: '2026-06-10' })
    expect(r!.currentWeekCount).toBe(0)
    expect(r!.gapWeeks).toEqual(['2026-W24'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/findings-cadence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/findings-cadence.js`:

```js
/**
 * ISO-8601 weekly publication cadence over published findings.
 * IFCN signatory eligibility requires ≥1 published fact-check per week over a
 * 12-month track record — this module is the clock (spec §4.1). Pure: no I/O.
 */

const WEEK_MS = 7 * 86400000

/** 'YYYY-MM-DD' → 'YYYY-Www' (ISO week), or null on garbage. */
export function isoWeekKey(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3) // this ISO week's Thursday
  const isoYear = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)) // Jan 4 is always in ISO week 1
  const jan4Day = (jan4.getUTCDay() + 6) % 7
  const week1Thu = new Date(Date.UTC(isoYear, 0, 4 - jan4Day + 3))
  const week = 1 + Math.round((d.getTime() - week1Thu.getTime()) / WEEK_MS)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

function mondayOf(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d
}

/**
 * items: rows with an optional publishedAt 'YYYY-MM-DD'. now: 'YYYY-MM-DD'.
 * Returns null when nothing has ever been published (clock not started).
 */
export function weeklyCadence(items, { now }) {
  const dates = (items ?? [])
    .map((it) => it?.publishedAt)
    .filter((s) => typeof s === 'string' && isoWeekKey(s) !== null)
    .sort()
  if (!dates.length) return null

  const counts = new Map()
  for (const s of dates) {
    const k = isoWeekKey(s)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }

  const perWeek = []
  const cursor = mondayOf(dates[0])
  const end = mondayOf(now)
  while (cursor.getTime() <= end.getTime()) {
    const k = isoWeekKey(cursor.toISOString().slice(0, 10))
    perWeek.push({ week: k, count: counts.get(k) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 7)
  }

  const coveredWeeks = perWeek.filter((w) => w.count > 0).length
  return {
    firstWeek: perWeek[0].week,
    currentWeek: perWeek[perWeek.length - 1].week,
    totalWeeks: perWeek.length,
    coveredWeeks,
    coverageRatio: coveredWeeks / perWeek.length,
    currentWeekCount: perWeek[perWeek.length - 1].count,
    gapWeeks: perWeek.filter((w) => w.count === 0).map((w) => w.week),
    perWeek,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/findings-cadence.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/findings-cadence.js tests/findings-cadence.test.ts
git commit -m "feat(ifcn): ISO-week findings-cadence pure lib (TDD)"
```

---

### Task 9: `ifcn:cadence` CLI + pipeline wire-in

**Files:**
- Create: `scripts/ifcn-cadence.ts`
- Modify: `package.json` (add script)
- Modify: `scripts/hallazgos-pipeline.sh` (informational check after the auto-curate block, BEFORE the `# ---- commit + push` section)

**Interfaces:**
- Consumes: `weeklyCadence` from Task 8; `public/data/pleno-findings.json` + `press-findings.json` (both shaped `{items:[…]}`).
- Produces: `npm run ifcn:cadence` (exit 0 always) and `npm run ifcn:cadence -- --strict` (exit 2 when the current ISO week has zero published findings, or when the clock hasn't started).

- [ ] **Step 1: Write the CLI**

Create `scripts/ifcn-cadence.ts`:

```ts
/**
 * IFCN weekly-cadence report. Reads the two published-findings snapshots and
 * reports ISO-week publication coverage since the first finding — the
 * 12-month ≥1/week track the IFCN signatory application requires.
 *
 *   npm run ifcn:cadence              # informational, always exit 0
 *   npm run ifcn:cadence -- --strict  # exit 2 when the current week is empty
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { weeklyCadence } from '../src/lib/findings-cadence.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

function itemsOf(file: string): Array<{ publishedAt?: string }> {
  try {
    return JSON.parse(readFileSync(path.join(root, 'public/data', file), 'utf8')).items ?? []
  } catch {
    return []
  }
}

const items = [...itemsOf('pleno-findings.json'), ...itemsOf('press-findings.json')]
const now = new Date().toISOString().slice(0, 10)
const report = weeklyCadence(items, { now })

if (!report) {
  console.log('ifcn-cadence: no published findings yet — the IFCN clock has not started.')
  process.exit(strict ? 2 : 0)
}

console.log(
  `ifcn-cadence · ${report.firstWeek} → ${report.currentWeek} · ` +
    `${report.coveredWeeks}/${report.totalWeeks} weeks covered ` +
    `(${Math.round(report.coverageRatio * 100)}%) · current week: ${report.currentWeekCount} finding(s)`,
)
if (report.gapWeeks.length) console.log(`gap weeks: ${report.gapWeeks.join(' ')}`)
if (report.currentWeekCount === 0) {
  console.log('⚠ current ISO week has NO published finding — promote one to keep the IFCN cadence.')
  if (strict) process.exit(2)
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, next to the `"llm:cost"` entry, add:

```json
    "ifcn:cadence": "npx tsx scripts/ifcn-cadence.ts",
```

- [ ] **Step 3: Run it against real data**

```bash
npm run ifcn:cadence
```

Expected (with today's 42 pleno findings, newest `publishedAt: 2026-07-06`): a line of the form `ifcn-cadence · 2026-Wxx → 2026-W28 · …` with `current week: ≥1 finding(s)`, exit 0. Then:

```bash
npm run ifcn:cadence -- --strict; echo "exit=$?"
```

Expected: `exit=0` this week (findings published 2026-07-06).

- [ ] **Step 4: Wire the informational check into the nightly pipeline**

In `scripts/hallazgos-pipeline.sh`, AFTER the auto-curate block (the `env -u OPENAI_API_KEY … npm run auto-curate …` command and its `|| log …` line) and BEFORE the `# ---- commit + push the regenerated data` comment, insert:

```bash
# ---- IFCN weekly-cadence check (informational, never fatal) -----------
# The IFCN signatory track requires ≥1 published finding per ISO week.
npm run ifcn:cadence --silent -- --strict \
  || log "warn: IFCN cadence gap — no finding published this ISO week yet; promote one manually"
```

- [ ] **Step 5: Verify the pipeline script still parses**

```bash
bash -n scripts/hallazgos-pipeline.sh && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/ifcn-cadence.ts package.json scripts/hallazgos-pipeline.sh
git commit -m "feat(ifcn): cadence CLI + nightly pipeline warning"
```

---

### Task 10: NLnet proposal draft

**Files:**
- Create: `docs/funding/nlnet-proposal-2026.md`

**Interfaces:**
- Consumes: strategy spec §4.1 (NLnet facts) + §2 (tier model).
- Produces: submission-ready draft; final submission happens manually in September when nlnet.nl/propose reopens.

- [ ] **Step 1: Write the draft**

Create `docs/funding/nlnet-proposal-2026.md`:

```markdown
# NLnet open call — proposal draft (submit when the call reopens, ~Sept 2026)

Form: https://nlnet.nl/propose · Status 2026-07-06: regular call paused,
"reopens after the summer"; NGI0 Commons closed Jun 2026; successor cascade
"Restack" announced 2026-01-31. Check which fund is open at submission time
and re-verify field names against the live form.

## Contact
- Name: Sergei Lutchenko (individual applicant — no legal entity; NLnet
  explicitly accepts individuals)
- Email: slutchenko@gmail.com
- Country: Spain
- Project website: https://www.civicpulse.es (code: repository goes public at
  grant start — AGPL-3.0-only, license already adopted)

## Project name
CivicPulse — open accountability infrastructure for Spain's municipal news deserts

## Abstract (form limit ~1200 chars — this draft is ~1080, re-count before submitting)

Roughly 6,800 of Spain's 8,100 municipalities have no dedicated press
coverage. Local government there runs without systematic scrutiny: council
sessions untranscribed, contracts unexamined, promises untracked. CivicPulse
is a working, live counter-example for one town (Riba-roja de Túria, pop.
24,600): 28 nightly scrapers over public open-data sources, locally-run
Whisper transcription of council sessions, LLM-assisted claim extraction
verified deterministically against the procurement/budget/subsidy record,
human-gated editorial findings with built-in right of reply, and a citizen
complaints channel with statutory response clocks. This grant funds turning
the town-specific pilot into reusable open-source infrastructure: (1) a
municipality-parameterized data layer working for any Spanish town by INE
code (budget, contracts, subsidies, census, unemployment, official
gazettes); (2) per-town static-site builds cheap enough to run for a whole
province; (3) deployment + curator documentation so local journalists and
civic groups can adopt their town. Target: the province of València (266
municipalities) live before Spain's May 2027 municipal elections.

## Requested amount
EUR 50,000

## Explain what the requested budget will be used for

12 months of development (solo maintainer, ~0.7 FTE):
- WP1 (€14k): municipality-parameterization of the data layer — refactor the
  28 Riba-roja adapters into INE-code-parameterized modules; add the PLACSP
  open-data syndication feed adapter (national procurement, replaces the
  town-specific Gobierto mirror).
- WP2 (€10k): per-town build + deploy pipeline — static JSON + SPA build per
  municipality, CI matrix, cost target < €0.10/town/month.
- WP3 (€8k): comarca pilot (9 towns) → province of València rollout (266
  towns), with data-quality dashboards and per-source health gates.
- WP4 (€8k): curator tooling hardening — the human-gated editorial layer
  (claim verification, findings, right-of-reply) packaged so a non-developer
  local journalist can run it for their town.
- WP5 (€6k): documentation + adoption — deployment guide, curator handbook
  (Spanish), data-source licensing audit per autonomous community.
- WP6 (€4k): security + privacy review before/after the public-repo flip
  (secrets/PII history audit already done privately; external review).

## Compare your own project with existing or historical efforts
- Gobierto (ES, commercial): per-municipality procurement dashboards for
  councils that pay; no editorial layer, no citizen channel, closed service.
- Civio (ES, nonprofit): excellent national-level investigations; does not
  operate per-municipality infrastructure.
- mySociety/TheyWorkForYou (UK): the closest philosophical relative, at
  national-parliament scale; CivicPulse applies the model to the municipal
  long tail with a verification pipeline over open procurement data.
- OpenSpending/similar budget viewers: data display without the
  accountability loop (claims → verification → findings → right of reply).
CivicPulse's differentiator: the full loop is already running in production
for one town, with published libel discipline; the grant scales the safe
tiers of it.

## Technical challenges
- PLACSP syndication feeds are large, inconsistently encoded, and
  per-platform; building a robust incremental parser is the hardest WP1 item.
- Keeping per-town cost near zero (static builds, no backend) while data
  volume grows two orders of magnitude.
- Preserving the human-gate architecture at scale: the system must make it
  structurally impossible to publish machine-generated accusations without a
  named curator (this is a design invariant, not a policy).

## Ecosystem
Direct beneficiaries: local journalists and civic groups in Spanish
municipalities without press coverage; Spanish data-journalism community
(all data re-published as open JSON); researchers (municipal-government
corpus). The stack is reusable for any EU country with national open
procurement/budget data. All outputs AGPL-3.0; data snapshots CC-BY.

## Have you been involved with projects or organisations relevant to this project before?
Sole developer and editor of CivicPulse since 2025 — live at
https://www.civicpulse.es with the full pipeline in production for
Riba-roja de Túria.

## Previous funding
None. The project is self-funded to date; funding disclosure policy at
https://www.civicpulse.es/nosotros.

## Submission checklist (September)
- [ ] Re-verify form fields + which fund (Restack / Open Internet Stack) is open
- [ ] Re-count abstract length against the live limit
- [ ] Repo public + README + LICENSE visible (pre-flight audit §4 complete)
- [ ] /nosotros + /about live (reviewers WILL visit)
- [ ] Budget still matches reality (adjust WP amounts if the pilot advanced)
```

- [ ] **Step 2: Sanity-check the abstract length**

```bash
python3 - <<'EOF'
import re
text = open('docs/funding/nlnet-proposal-2026.md').read()
m = re.search(r'## Abstract.*?\n\n(.*?)\n\n## Requested', text, re.S)
print('abstract chars:', len(m.group(1).replace('\n', ' ')))
EOF
```

Expected: a number ≤ 1200. If over, trim the abstract.

- [ ] **Step 3: Commit**

```bash
git add docs/funding/nlnet-proposal-2026.md
git commit -m "docs(funding): NLnet proposal draft for the September call"
```

---

### Task 11: JournalismFund Europe — partner outreach kit

**Files:**
- Create: `docs/funding/jfe-local-crossborder-2026.md`

**Interfaces:**
- Consumes: strategy spec §4.1 (JFE facts: freelancers eligible, ≥2 journalists from ≥2 European countries, deadline 1 Oct 2026, €2–14k working grants).
- Produces: the outreach email that goes out THIS summer; the concept note reused in the actual application.

- [ ] **Step 1: Write the kit**

Create `docs/funding/jfe-local-crossborder-2026.md`:

```markdown
# JournalismFund Europe · European Local Cross-border Grants — kit

Deadline: 1 Oct 2026 (per grants.journalismfund.eu — re-verify; the strand
is missing from the main /grants page, platform schedule is operative).
Requirement: team of ≥2 journalists/outlets from ≥2 European countries.
Freelancers eligible; working grants pay freelancer time. €2–14k typical.

## Investigation concept (working title)

**"Who watches the small spenders?" — EU recovery money in Europe's
municipal news deserts.**

NextGenerationEU routed billions through town halls too small for any
newsroom to watch. Above-threshold contracts surface in TED for every
member state — the same feed CivicPulse already ingests for Riba-roja
(54 notices). The investigation: pick N small municipalities per country
(ES + partner country), pull their complete TED + national-procurement
trail 2021–2026, and answer identical questions — how much arrived, who
won it, how concentrated were the winners, what got delivered late or
never. The Spanish leg rides CivicPulse's existing pipeline (tenders,
TED, BDNS, BOE); the partner replicates with their national sources.
Output: one co-published longform + a shared open dataset + a reusable
"audit your town's EU money" method box.

Why it fits JFE Local: hyper-local accountability, structurally
cross-border (same EU money, same TED source, different national
transparency), publishable in regional outlets both countries.

## Partner profile

- Freelance data/accountability journalist OR small investigative outlet
- In another European country with usable national procurement data
  (Portugal: base.gov.pt · Italy: ANAC open data · both strong fits)
- Comfortable with data-driven method; local-government interest
- Has a publishing outlet (JFE wants a publication plan)

## Candidate partners (first-contact list)

| Who | Country | Why | Channel |
|---|---|---|---|
| Divergente | PT | investigative, data-driven, longform | redaccao@ contact form |
| Fumaça | PT | investigative radio/longform, EU-funds coverage | site contact |
| IrpiMedia | IT | procurement/mafia-adjacent money-flows expertise | redazione@ |
| Pod črto | SI | small-country procurement watchdogs, EDJNet | info@ |
| EDJNet members list | any | the network exists exactly for this | edjnet.eu/partners |
| Dataharvest attendee list | any | ask EJC for intro after posting in the community | — |

Rule: 3 personalized emails/week until one yes; track in this file's log.

## Outreach email (EN, personalize the first paragraph per recipient)

Subject: Cross-border pitch: EU recovery money in towns nobody covers (JFE Local, Oct 1)

Hi <name>,

I run CivicPulse (civicpulse.es) — an open-source accountability platform
covering a Spanish town of 24,600 that no newsroom covers: transcribed
council sessions, verified claims, geolocated procurement. I'm looking for
one partner journalist in <country> for a JournalismFund Europe Local
Cross-border application (deadline Oct 1, working grants pay our time).

The idea: "Who watches the small spenders?" — identical audits of
NextGenerationEU money in small municipalities in Spain and <country>,
built on TED plus our national procurement sources. My side of the
pipeline already runs in production; yours replicates with <national
source>. One co-published longform, a shared open dataset, and a method
box any local journalist can reuse.

15-minute call this week or next? I'll bring a one-pager and the working
demo.

Un saludo,
Sergei Lutchenko — civicpulse.es/about

## Application skeleton (fill with partner)

- Team: S. Lutchenko (ES, data + reporting) + <partner> (<country>, reporting)
- Budget: €9,600 = 2 × 24 days × €200/day working grant, no expenses beyond
  data/FOI fees (€400)
- Timeline: Nov 2026 research → Feb 2027 co-publication (before May
  municipal elections in ES)
- Publication plan: <partner outlet> + Valencia Plaza/elDiario CV (pitch
  letter Task 12) + civicpulse.es
- Data-security + libel plan: reuse CivicPulse published methodology

## Contact log

| Date | Who | Result |
|---|---|---|
```

- [ ] **Step 2: Commit**

```bash
git add docs/funding/jfe-local-crossborder-2026.md
git commit -m "docs(funding): JFE local cross-border partner kit + concept note"
```

---

### Task 12: Investigation #1 — shortlist memo + pitch (curator-private)

**Files:**
- Create: `editorial/investigation-1-shortlist.md` — **`editorial/` is gitignored by design (curator-only tree); this file is NEVER committed.** No commit step in this task.

**Interfaces:**
- Consumes: live snapshots in `public/data/` (probes below).
- Produces: the chosen story + a pitch email ready to send to two regional editors.

- [ ] **Step 1: Run the story-mill probes**

```bash
cd /Users/sergeilutchenko/Documents/CivicPulse
python3 - <<'EOF'
import json
def load(f): return json.load(open('public/data/'+f))

# A · DANA-related situated spending (tender-geo)
tg = load('tender-geo.json')
print('tender-geo keys:', list(tg.keys()))
places = tg.get('places', [])
print('situated places:', len(places), '· situated total €',
      sum(p.get('amount', 0) for p in places))
# Print any DANA flag fields present on the rows:
if places: print('place[0] keys:', sorted(places[0].keys()))

# B · Plazos vencidos (department accountability)
ag = load('plenos-agendas.json')
print('plazosVencidosCount:', ag.get('stats', {}).get('plazosVencidosCount'))

# C · Silencio administrativo on quejas
q = load('quejas.json')
from collections import Counter
print('queja states:', Counter(x.get('state') for x in q.get('items', [])))

# D · Contractor concentration
t = load('tenders.json')
c = Counter()
for row in t.get('contracts', []):
    if row.get('assignee') and row.get('amount'):
        c[row['assignee']] += row['amount']
top = c.most_common(10)
total = sum(c.values())
print('top-10 contractor share:', round(sum(v for _, v in top) / total * 100, 1), '%')
for name, v in top[:5]: print(f'  {v:>12,.0f} €  {name[:60]}')

# E · Findings severity distribution (existing editorial backlog)
f = load('pleno-findings.json')
print('findings by severity:', Counter(x.get('severity') for x in f.get('items', [])))
EOF
```

Expected: five labelled blocks of real numbers. Copy the output verbatim into the memo (Step 2).

- [ ] **Step 2: Write the shortlist memo**

Create `editorial/investigation-1-shortlist.md`:

```markdown
# Investigación nº1 — shortlist (privado · no commitear)

Probes ejecutadas <fecha>, salida literal:

<pegar aquí la salida completa del Step 1>

## Candidatas

### A · «El dinero de la reconstrucción, calle a calle»
El gasto post-DANA geolocalizado: qué obras se adjudicaron, a quién, en qué
calles, y qué sigue sin ejecutar. Base: tender-geo (places + DANA), actas.
- Fuerza: visual (mapa), emocional, inédita a nivel calle.
- Riesgo libel: bajo (hechos administrativos publicados).
- Esfuerzo: medio — el dato ya está situado.

### B · «Los compromisos con plazo vencido»
Acuerdos de pleno con dueBy + dueBySource verbatim ya vencidos, cruzados
con la ejecución real (contratos/BOP). Base: pleno-votes, plenos-agendas
(plazosVencidosCount del probe).
- Fuerza: accountability pura, cita verbatim del acta.
- Riesgo libel: medio — mitigado por dueBySource ≥20 chars ya exigido.
- Esfuerzo: bajo — el dashboard /departamentos ya lo computa.

### C · «¿Quién se lleva los contratos?»
Concentración de adjudicaciones 2018–2026: share del top-10 (probe D),
procedimientos, bajas medias, SDA call-offs. Base: tenders + TED.
- Fuerza: la pregunta clásica que nadie ha hecho a este ayuntamiento.
- Riesgo libel: medio-alto — correlación ≠ irregularidad; encuadre
  descriptivo obligatorio; revisar isScoreArtifactAmount (los «€100» de
  PLACSP son artefacto, NO fraude — memoria del repo).
- Esfuerzo: medio.

## Matriz de selección (1–5)

| Criterio | A | B | C |
|---|---|---|---|
| Impacto vecinal | | | |
| Solidez probatoria hoy | | | |
| Riesgo legal (5 = más seguro) | | | |
| Esfuerzo (5 = menos) | | | |
| Atractivo para un editor regional | | | |
| **Total** | | | |

Rellenar tras leer los números del probe. Ganadora: ___

## Pitch (ES — enviar a Valencia Plaza y elDiario CV, en ese orden, 5 días de exclusiva cada uno)

Asunto: Exclusiva con datos: <titular de la ganadora> en Riba-roja de Túria

Hola <nombre>,

Soy Sergei Lutchenko, desarrollador de CivicPulse (civicpulse.es), un
monitor independiente que transcribe los plenos, geolocaliza los contratos
y verifica las declaraciones del Ayuntamiento de Riba-roja de Túria.

Os propongo una pieza con datos inéditos: <2 frases con las cifras
concretas del probe — p. ej. «X contratos por Y € situados calle a calle»
o «N compromisos de pleno con el plazo vencido»>. Todo el dato es
verificable: cada cifra enlaza a su fuente primaria (PLACSP, actas, BOP)
y la metodología está publicada.

Puedo entregar: el análisis completo, los gráficos/mapas, y el texto en
borrador — o firmarla conjuntamente con vuestra redacción. Los datos en
crudo quedan abiertos para cualquier verificación.

¿15 minutos esta semana?

Un saludo,
Sergei · civicpulse.es · slutchenko@gmail.com
```

- [ ] **Step 3: Fill the matrix and pick the winner**

Read the probe numbers, score the matrix, write the winner + the two concrete pitch sentences. Verify the chosen story's key numbers once more against the live snapshots before any email goes out.

- [ ] **Step 4: Verify the file is NOT tracked**

```bash
git status --porcelain editorial/ ; git check-ignore -v editorial/investigation-1-shortlist.md
```

Expected: no `git status` output for the file; `check-ignore` prints the `.gitignore` rule (`editorial/`).

---

## Self-review (done at plan-writing time)

- **Spec coverage:** §8.1 audit → Tasks 1–3 · §8.2 pages → Tasks 4–7 · §8.3 NLnet → Task 10 · §8.4 JFE → Task 11 · §8.5 investigation → Task 12 · §8.6 cadence → Tasks 8–9. Full.
- **Placeholder scan:** the only fill-in slots are data values produced by earlier steps in the same task (probe outputs, gitleaks triage) — dependencies, not placeholders.
- **Type consistency:** `summarizeImpact` shape matches between Task 4 test/impl and Task 5 usage; `weeklyCadence` return shape matches between Task 8 and Task 9's CLI; e2e assertions in Task 7 match the exact strings rendered in Tasks 5–6.
