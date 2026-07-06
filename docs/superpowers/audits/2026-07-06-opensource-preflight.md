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
