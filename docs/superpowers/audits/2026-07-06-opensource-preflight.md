# Open-source pre-flight audit — 2026-07-06

Purpose: verify the private repo can be flipped public (NLnet submission,
September 2026) without leaking secrets or PII. Spec:
`docs/superpowers/specs/2026-07-06-promotion-funding-strategy-design.md` §6.

## 1 · Secrets scan (gitleaks)

Tool: `gitleaks detect` over full history, v8.30.1 — 2026-07-06.
Scope: 639 commits, ~48 MB scanned. Raw report: /tmp/gitleaks-civicpulse.json
(not committed).

| Rule | File | Count | Verdict | Action |
|---|---|---|---|---|
| `generic-api-key` | `scripts/searxng/settings.yml` | 2 | REAL · LOW-RISK (non-blocking) | Hardcoded `server.secret_key` for the **localhost-only** journalist SearXNG instance (`base_url: http://localhost:8888/`, `public_instance: false`). It signs only UI links (never used) + CSRF tokens — **not** an external-provider credential; discloses no API access, no PII, no cost. Regenerate the 32-hex value as hygiene before flip (edit `settings.yml` + restart container). No provider to rotate at; no history rewrite warranted. Introduced @ `f8ad2b8`, still in working tree. |
| `generic-api-key` | `tests/fixtures/corporacion_2026-04-19.html` | 1 | FALSE POSITIVE | None. Public `$omb.init({ key: '…' })` client-side widget embed key, scraped verbatim from the town-hall public website and shipped to every visitor's browser. Public data, not a secret. |
| `generic-api-key` | `tests/fixtures/rr_pleno_20_abril_2026.html` | 1 | FALSE POSITIVE | None. Same public `$omb` website-widget key captured in a scraped-HTML test fixture. |
| `generic-api-key` | `tests/fixtures/rr_plenos_2023_2026-04-19.html` | 1 | FALSE POSITIVE | None. Same public `$omb` website-widget key captured in a scraped-HTML test fixture. |
| `generic-api-key` | `tests/fixtures/rr_plenos_2024_2026-04-19.html` | 1 | FALSE POSITIVE | None. Same public `$omb` website-widget key captured in a scraped-HTML test fixture. |
| `generic-api-key` | `tests/fixtures/rr_plenos_2025_2026-04-19.html` | 1 | FALSE POSITIVE | None. Same public `$omb` website-widget key captured in a scraped-HTML test fixture. |
| `generic-api-key` | `tests/fixtures/rr_plenos_2026_2026-04-19.html` | 1 | FALSE POSITIVE | None. Same public `$omb` website-widget key captured in a scraped-HTML test fixture. |

Summary: 8 findings across 7 (rule, file) pairs — 6 false positives (one public
`$omb` website-widget embed key, re-detected in 6 scraped-HTML fixtures), 1 real
but low-risk hardcoded localhost SearXNG session-signing key (regenerate as
hygiene, non-blocking), 0 rotated, **0 blocking**.

**Key negative result (the reassuring one):** no external-provider credential
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `BOT_TOKEN`,
`HUGGINGFACE_TOKEN`, `EXA_API_KEY`) ever entered git history. `.env` and
`bot/.env` were gitignored from the first commit and are absent from all 639
commits (`git log --all -- .env bot/.env` is empty). A supplementary pickaxe
sweep over all refs for the real key prefixes (`sk-ant-`, `sk-proj-`, `hf_`,
`AIzaSy`, `OPENAI_API_KEY=sk`, `EXA_API_KEY=`) surfaced only documentation
placeholders and a mock, all confirmed non-live:

- `sk-ant-test` — mock key in `tests/llm/client.test.ts`.
- `OPENAI_API_KEY=sk-…` (ellipsis) — usage comment in `scripts/transcribe-pleno.sh`.
- `hf_xxx` / `hf_token` — literal placeholders in `scripts/bootstrap-voice-id.sh` + `scripts/diarize-pleno.sh`.
- `EXA_API_KEY=…` (ellipsis in `CLAUDE.md`) + empty `EXA_API_KEY=` in `.env.example`.
- `.env.example` documents every provider var with an **empty** value by design; gitleaks correctly flagged none of them.

No live credential requires rotation. The only committed real secret is the
SearXNG localhost session-signer above, which is low-risk and non-blocking.

## 2 · PII & sensitive-tree history audit

Scope: full history, every ref (all checks run with `git log --all` /
`git rev-list --all`; 660 commits reachable at audit time) — 2026-07-06. Five
checks below. Per the audit's PII policy, no PII value is reproduced here; the
one photo finding is referenced by commit + path only.

### 2.1 · Gitignored sensitive trees were never committed

```bash
for p in .env bot/.env ".voiceprints/*" "bot/data/*" "editorial/*" \
         "scripts/logs/*" ".llm-cache/*" ".research-cache/*" \
         ".curator-jobs/*" "*.db" "*.sqlite" "*.sqlite3"; do
  echo "=== $p ==="; git log --all --oneline -- "$p" | head -5
done
```

Literal output — every path header printed with **no commits under it**:

```
=== .env ===
=== bot/.env ===
=== .voiceprints/* ===
=== bot/data/* ===
=== editorial/* ===
=== scripts/logs/* ===
=== .llm-cache/* ===
=== .research-cache/* ===
=== .curator-jobs/* ===
=== *.db ===
=== *.sqlite ===
=== *.sqlite3 ===
```

**Interpretation:** none of the 12 sensitive path patterns was ever committed
on any ref. Provider secrets (`.env`, `bot/.env`), the ECAPA-TDNN voiceprint
vectors (`.voiceprints/`), the bot's SQLite database + WAL (`bot/data/`, `*.db`,
`*.sqlite*`), the curator-only editorial queue (`editorial/`), scraper/LLM logs,
the LLM + research response caches, and the curator-jobs spool are all absent
from history. Clean — nothing to rewrite.

### 2.2 · The published quejas snapshot never carried PII fields

```bash
git log --all -p -- public/data/quejas.json \
  | grep -oiE '"(name|nombre|phone|telefono|telegram_user_id|username|address|direccion|dni|email)"' \
  | sort | uniq -c
```

Literal output: **no output** (grep matched nothing across the full `-p` diff
history of the file).

**Interpretation:** across every revision of the published `public/data/quejas.json`,
none of the enumerated PII field names ever appeared. The `bot/src/services/snapshot.ts`
non-PII-projection contract (only aggregated, non-identifying queja fields reach
the public snapshot) held across all history, not just at HEAD. Clean.

### 2.3 · Queja photos in history vs. the anonymizer — the one substantive finding

```bash
git log --all --diff-filter=A --format='%h %ad' --date=short --name-only \
  -- 'public/data/quejas-photos/*' | head -40
```

Literal output:

```
0a14730 2026-07-04

public/data/quejas-photos/q-kjy6xsvg.jpg
```

Supplementary sweeps confirmed this is the **only** queja photo blob ever
committed on any ref (`git rev-list --objects --all | grep quejas-photos` →
one blob, `6806a01…`), still present at HEAD.

**Finding + inspection.** Its add-date (2026-07-04) is one day earlier than the
anonymizer ship date recorded in project memory (2026-07-05), so per the brief
it required manual inspection. Inspected the blob out-of-tree
(`git show 0a14730:public/data/quejas-photos/q-kjy6xsvg.jpg`); content **not
reproduced here** per PII policy. Result — the photo **is anonymized**:

- **Metadata (byte-level):** the JPEG opens `FF D8 FF DB` (SOI → straight to
  DQT) with **no JFIF APP0, no EXIF/APP1, no GPS, no ICC, no camera make/model,
  and no ASCII metadata strings** — the `sharp` re-encode signature, with all
  EXIF/GPS stripped.
- **Visual:** depicts a **public outdoor municipal space** (park/playground with
  a maintenance building, outdoor gym equipment, covered picnic area). One wall
  region is **hard-mosaicked**, and a global softening/degrade is present — both
  fingerprints of the `process-photos` anonymizer. **No visible faces and no
  readable licence plate.**

**Provenance reconciliation.** The anonymizer feature commit
`423fc32 feat(quejas): auto-anonymize + publish citizen photos` is timestamped
`2026-07-04T15:54:56+02:00` — **9 minutes AFTER** the photo snapshot
`0a14730 chore(quejas): snapshot from local bot`
(`2026-07-04T15:46:01+02:00`, authored by the local bot `munigraph-local`), and
is not an ancestor of it. This is the documented "local-export runs the WORKING
TREE" behavior (memory: `project_queja_photo_anonymize`): `local-export.sh`
chains `process-photos` before `export`, so the anonymizer ran from uncommitted
WIP and produced the mosaicked/stripped blob before its own code was committed
minutes later. The blob's own anonymization fingerprints confirm this
independently of commit order.

Also observed in the same image sweep: **21 councillor portrait blobs** under
`public/data/photos/*.jpg` (added `8857ba0`/`dd07b34`/`63f7f0f`). These are
official portraits re-hosted from the Ayuntamiento's own public publication
(public officials in public office) — public data by design, **not** a PII
finding. (Same category as the `public/data/pleno-transcripts/` files: named
public officials speaking in public session — public speech by design, not PII.)

**Interpretation:** the single committed queja photo is anonymized
(EXIF/GPS-stripped + region-mosaicked, public outdoor scene, no faces/plates);
the 21 official portraits + transcripts are public-by-design. **Not blocking** —
no un-anonymized citizen imagery exists in history.

### 2.4 · No accidental large/binary blobs in history

```bash
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '$1=="blob" && $3 > 5000000 {print $3, $4}' | sort -rn | head -20
```

Literal output (18 rows):

```
8218367 public/data/pleno-claims-verified.json
8056047 public/data/pleno-claims-verified.json
8033282 public/data/pleno-claims-verified.json
7377423 public/data/pleno-claims-verified.json
6895096 public/data/pleno-claims-verified.json
6891886 public/data/pleno-claims-verified.json
6890902 public/data/pleno-claims-verified.json
6876526 public/data/pleno-claims-verified.json
6865864 public/data/pleno-claims-verified.json
6822525 public/data/pleno-claims-verified.json
6726729 public/data/pleno-claims-verified.json
6718581 public/data/pleno-claims-verified.json
6717648 public/data/pleno-claims-verified.json
6710653 public/data/pleno-claims-verified.json
6650241 public/data/pleno-claims-verified.json
6648858 public/data/pleno-claims-verified.json
5832723 public/data/pleno-claims-verified.json
5040418 public/data/pleno-claims-suggestions.json
```

**Interpretation:** every blob over 5 MB is a machine-generated JSON snapshot
(`pleno-claims-verified.json` 5.8–8.2 MB across nightly regenerations, plus one
`pleno-claims-suggestions.json` at 5.0 MB) — expected for the growing
verified-claims corpus, and safe to ship public. **No** `.mp3` / `.wav` / `.mp4`
audio-video and **no** `.db` / `.sqlite` database blobs are present. Clean —
nothing to rewrite. (Optional future hygiene: these large regenerated JSONs
inflate clone size, but that is a `.gitattributes`/LFS optimisation, not a
PII/secret concern.)

### 2.5 · Private-repo URL leak surface

Brief command (its `--include` filters restrict matching to `*.jsx`/`*.js`, so
`public/data/*.json` is not searched by this invocation):

```bash
grep -rn "github.com/datarhan" public/data/*.json src/ \
  --include='*.jsx' --include='*.js' -l | head
```

Literal output:

```
src/components/journalist/HeroBand.jsx
src/pages/AgenteReporte.jsx
src/pages/Laboratorio.jsx
```

Supplementary sweep with no `--include` filter, over `public/data` + `src`,
to capture the full surface:

```bash
grep -rn "github.com/datarhan" public/data src
```

surfaced these additional user-facing references (byte content elided; file:line
only): `public/data/pleno-findings.json:5` (contactUrl),
`public/data/press-findings.json:5` (contactUrl),
`public/data/journalist-reports.json:{4,5}` (legalNotice + contactUrl),
`public/data/promises.json:{5,6}` (legalNotice + contactUrl),
`public/data/souls/robert-raga-gadea.md:102` (correction notice) — plus a
second category of **outbound scraper `User-Agent` identifiers** in
`src/scraper/*.ts` (`tenders-ted-fetch`, `catastro`, `press-fetcher`,
`overpass-fetch`, `boe-fetch`, `wayback`, `bop-fetch`, `factcheck`,
`journalist-tools/internal`) and the soul-export template
`src/scraper/journalist-soul-export.ts:141`.

**Interpretation:** `github.com/datarhan/civicpulse` is the repo's own slug, not
a secret or PII value; nothing here forces a history rewrite. Two impact
classes:

1. **User-facing right-of-reply / contact links** (they 404 for the public
   while the repo is private, so citizens cannot currently open a réplica):
   `pleno-findings.json`, `press-findings.json`, `journalist-reports.json`,
   `promises.json`, `souls/robert-raga-gadea.md`, plus the rendered issue-form
   hrefs in `HeroBand.jsx`, `Laboratorio.jsx`, `AgenteReporte.jsx`. These are
   the actionable pre-flip items — recorded in the §4 checklist row.
2. **Outbound `User-Agent` strings + the soul-export template** — not
   user-facing; they simply self-identify the scraper. They become valid links
   the moment the repo is public, so they need no pre-flip change.

**Not blocking.**

## 3 · License

(filled by Task 3)

## 4 · Flip checklist (September, before NLnet submission)

- [ ] All "blocking" rows above resolved
- [ ] History rewrite executed IF §2 verdict requires it (git-filter-repo; forces re-clone of all local checkouts + cron worktrees)
- [ ] Private-repo (`github.com/datarhan/civicpulse`) user-facing right-of-reply / contact links point at a repo the public cannot open today — fix at/before flip (full surface from §2.5): `contactUrl` in `public/data/pleno-findings.json`, `press-findings.json`, `journalist-reports.json`, `promises.json`; the correction notice in `public/data/souls/robert-raga-gadea.md`; and the rendered issue-form hrefs in `src/components/journalist/HeroBand.jsx`, `src/pages/Laboratorio.jsx`, `src/pages/AgenteReporte.jsx`. Flipping the repo public makes these resolve automatically; alternatively swap to a `mailto:` if a working réplica path is needed pre-flip. (Scraper `User-Agent` strings in `src/scraper/*.ts` + the soul-export template also carry the slug but are outbound-only and self-heal at flip — no action.)
- [ ] README.md written (repo has none — GitHub landing would be empty)
- [ ] `redaccion@civicpulse.es` domain mailbox configured; replace `slutchenko@gmail.com` on `/nosotros` + `/about`
- [ ] GitHub repo settings: disable wiki/projects, enable issue templates only

## 5 · Verdict

SAFE TO FLIP — no history rewrite needed. Remaining items are the §4 checklist.

Basis: §1 found 0 blocking secrets (one real but low-risk localhost-only SearXNG
session-signing key, plus false-positive public website-widget keys; no external
provider credential ever entered history). §2 found 0 blocking PII across all
five checks — no sensitive tree was ever committed (§2.1), the published quejas
snapshot never carried a PII field (§2.2), the single committed queja photo is
anonymized (EXIF/GPS-stripped + region-mosaicked, public outdoor scene, no
faces/plates; the 21 official portraits + pleno transcripts are public-by-design)
(§2.3), no audio/video/database blobs exist in history (§2.4), and the only
`github.com/datarhan` references are the repo's own public slug (§2.5). None of
these require rewriting git history. The residual work is the §4 pre-flip
checklist (regenerate the SearXNG key as hygiene, repoint the private-repo
right-of-reply links, write a README, configure the project mailbox, lock down
repo settings) plus Task 3's license note — none of which is a
history-integrity blocker.
