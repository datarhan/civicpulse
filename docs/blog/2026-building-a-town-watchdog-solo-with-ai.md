# I built a full accountability stack for my Spanish town, solo, with AI — the interesting part is what stops it from lying

_Draft — engineering blog post (EN), targeted at Hacker News / international civic-tech. First-person operator voice, edit freely before publishing. Live site: https://civicpulse.es · Source (AGPL-3.0): https://github.com/datarhan/civicpulse_

---

Around 6,800 of Spain's ~8,100 municipalities have no dedicated press coverage. Not "declining" coverage — none. No reporter sits through the council session, reads the contract register, or checks whether the thing a party promised at election time ever happened. The data to hold these town halls to account is almost all public and open — budgets, contracts, subsidies, the census, the official gazettes — but nobody turns it into anything a resident would actually read.

So I built the thing for one town: **[Riba-roja de Túria](https://civicpulse.es)**, ~24,600 people, near Valencia. Council-session videos transcribed and turned into verifiable claims; an electoral-promise tracker with the verbatim quote and its source; a citizen-complaint pipeline with the actual legal deadlines the town hall is bound by; every public euro the town awarded, mapped street by street. One person, mostly with an AI coding agent.

The "solo, with AI" part is the headline, but it's the least interesting thing here. The AI wrote most of the code. That's not the story. **The story is the engineering that keeps an AI-assisted system from quietly manufacturing a defamation lawsuit** — because the moment you point a language model at "what did this named politician do," a plausible-sounding hallucination isn't a bug, it's a libel risk with a real person's name on it.

Here's how it's built and, more importantly, how it's disciplined.

## The architecture: no backend, on purpose

CivicPulse is a front-end-only single-page app. React + Vite. Every number it shows comes from static JSON committed to the repo and served next to the app. There is **no application server, no database in production, no API to attack or pay for.**

```
28 scrapers ──► public/data/*.json ──► React SPA
(nightly, GitHub Actions)   (committed to git)   (one hook per data domain)
```

A fleet of scrapers runs on a schedule (GitHub Actions, nightly). Each one fetches a public source, parses it into a typed snapshot, and writes a JSON file. The commit lands, a static deploy fires, the site updates. If every scraper broke tomorrow, the site would keep serving the last good snapshot forever.

This sounds almost too simple, and that's the point. For a solo, unfunded, potentially long-lived public-interest project, boring and durable beats clever and fragile:

- **Cost is ~zero.** Static hosting plus scheduled CI. No server bill that eventually kills the project when a grant runs out.
- **It's inspectable.** The entire data layer _is_ the git history. You can `git log` a JSON file and watch a town's budget-execution numbers change over time. The audit trail is free.
- **It scales linearly.** The thesis isn't one town — it's all 8,100. A per-town static build is trivially parallelizable. The national data sources (the state contract platform, the subsidies database, the census, the gazettes) are already indexed by municipality code. Adding a town is mostly engineering, not research.

The one stateful component — a Telegram bot that captures citizen complaints — runs locally against SQLite and exports only an aggregated, non-identifying snapshot into the same static tree. PII never reaches the published JSON, which I verified over the entire git history before open-sourcing (more on that below).

## Scrapers as a TDD contract, not a pile of `requests.get`

Twenty-eight scrapers, each hitting a different government portal, is a maintenance nightmare waiting to happen. The thing that keeps it sane is a hard architectural rule: **the network code and the parsing code never touch.**

Every source is two files:

- `scripts/scrape-X.ts` — the only place a `fetch` is allowed to live. It grabs the raw payload.
- `src/scraper/X.ts` — a **pure function**: bytes in, typed snapshot out. No network, no clock, no filesystem.

The pure parser is pinned by a unit test against a **real payload committed as a fixture**. When I add a source, I snapshot a real response into `tests/fixtures/`, write the test that asserts the exact values I expect (`925455.74`, not "a number"), watch it fail, then write the minimal parser to make it pass. Red, green, wire up. This is where an AI agent is genuinely excellent: given a real fixture and a precise failing test, "write the parser that makes this pass" is a task it nails, and the test is the spec that stops it from drifting.

The payoff is that when a town hall silently reformats a PDF six months from now, one parser test goes red and points at exactly the source that broke — instead of a wrong number quietly shipping to the public.

## Honest nulls: a wrong pin is worse than no pin

The best example of the discipline is the money map. Spain's contract records don't have an address field. A contract is a title, a winner, and an amount — "Repavimentación del Camino de Montealcedo," €14,534. To put it on a map, you have to figure out the place from the _title_.

The naive approach — ask an LLM "where is this?" — is exactly the approach that eventually drops a €400,000 pin on the wrong street and turns your credibility into a correction. So the geocoder is deliberately timid. It's a deterministic resolver over a gazetteer of the town's real streets and public buildings (pulled from OpenStreetMap), and it places a pin **only when the contract title literally names a place that matches**, with a stack of honesty gates:

- match the distinctive _core_ of a name (strip street-type words and connectors), token-bounded;
- drop needles that are just the municipality or province name (that's the postal-address tail, not a location _in_ the town);
- require a street-type word in the title before trusting a street match, so a politician's surname that happens to collide with a street name doesn't fire;
- trust a public-building match only for construction contracts — "supplies for the local police" is _for_ the department, not located _at_ the police station.

The result places a minority of contracts. Most stay unmapped. **That's the correct outcome.** An honest miss is free; a confident wrong pin costs you the whole project's credibility. When I later added an LLM pass to improve recall on cross-language references (Spanish "C/ Mayor" vs. the OSM Valencian "Carrer Major"), I wired it under the same rule: _the LLM reads the place name from the title, but a real gazetteer supplies the coordinate — the model never emits a lat/long._ And nothing it suggests reaches the map until a human promotes it.

I hit this exact failure in development. A school contract kept snapping to a football pitch, because after stripping the municipality name the leftover token matched a sports field before it matched the actual school. The fix wasn't a smarter prompt — it was restricting the candidate set to school buildings _before_ matching. The lesson generalizes: when the cost of a wrong answer is a real person or place misrepresented in public, you make the system under-reach and you make the failure visible, not silent.

## The libel firewall: where the AI is _not_ allowed to decide

This is the core of it. The site makes claims about named elected officials. Those surfaces are engineered as legal architecture, and the design principle is: **machine inference is never the last step before publication.**

**Two files, never merged.** The promise tracker has a human-curated `promises.json` and a machine-written `promise-suggestions.json`. The inference engine can only ever write to the suggestions file. Its return type doesn't even _include_ the dangerous statuses ("broken," "unfulfilled") — it can't propose them at the type level. Suggestions render in the UI as "automatic proposal · pending human review" and never substitute for a published status. A schema validator enforces every invariant (verbatim quote ≥20 chars, source URL, ISO date, allowed enums) at write time. The same pattern governs the editorial findings and the AI-drafted investigative reports: curated file, suggestions file, a validator that refuses to accept a machine-only record on the published shape.

**Bloc-level attribution by default.** When the pipeline extracts a claim from a council transcript, it attributes it to a _party group_, not a person — the prompt is enum-gated to blocs or null, and a write-time guard strips any individual name that isn't backed by a high-confidence voice-ID match whose party even agrees with the claim. Naming the individual is a separate, deliberate step a human takes after checking the audio. That's the crossing point where an individual becomes publicly visible, and a machine is never allowed to cross it alone.

**Verification has no LLM in it.** The claim verifier — the thing that decides whether "we spent X on Y" is supported — is a **pure, deterministic function.** No model, no network. It cross-references the declaration against the contract register, the subsidies database, the budget, and prior claims, and returns a verdict with citations. Opinion statements ("the opposition is incompetent") are hard-skipped as un-verifiable regardless of what evidence sits nearby — that's policy, not a heuristic the model can talk itself out of. The LLM extracts _candidate_ claims from messy transcripts, which it's good at; it never gets to decide whether one is _true_.

**Right of reply is built in, everywhere.** Every finding, promise, and report carries a structured right-of-reply path: a GitHub issue template → a validated CLI → a committed reply in the public record. During electoral-campaign windows, Spanish law (LOREG) imposes a kind of political silence; the tracker enforces its own freeze and goes read-only.

None of this is AI safety in the abstract. It's the concrete answer to "what happens the first time the model is confidently wrong about a named human being" — the answer is _nothing reaches the public_, because a model's output is never the last node in the graph on a legally-material surface.

## What the AI actually did, honestly

Since the title promises "with AI," here's the honest split.

The agent wrote the large majority of the code — parsers, React components, the scraper CLIs, the test suites. Where it's strongest: mechanical, well-specified tasks with a test as the contract. "Here's a real fixture and a failing test asserting these exact values; make it pass." "Here's the layer pattern the other map layers follow; add one for works-in-progress." It's a genuinely excellent implementer when the _contract_ is precise.

Where it's not trusted — and where the design reflects that — is judgment on legally-material output. The schemas, the validators, the honesty gates, the deterministic verifier, the two-file separation: those are the parts that assume the model _will_ eventually be wrong and make that harmless. The interesting engineering was never "prompt the model better." It was building the rails so that being solo-plus-AI doesn't mean being one hallucination away from a lawsuit.

The transcription is a local Whisper model; claim extraction and the drafting agent use an LLM but always write to human-gated suggestion files; the geocoding LLM names places but never emits coordinates. Every one of those is boxed by a deterministic layer downstream.

## Why one town is the whole point

Riba-roja is the depth demo — one town covered completely, with real data and libel discipline. The actual thesis is breadth: the national data sources already cover every Spanish municipality by code, so the pipeline that produces one town's "ficha" produces all of them. I think about it as three tiers gated by libel risk:

- **T1 (all ~8,100 towns):** pure open data — budget, contracts, subsidies, census, unemployment, gazette mentions. Zero editorial claims. Fully automatable.
- **T2 (hundreds):** transcription and claim extraction where session video exists — machine-suggested, human-gated.
- **T3 (per town):** the findings, the promise tracker, the complaint bot — the legally-material surfaces. These require a _named local curator._ Non-negotiable.

The tier model _is_ the legal architecture: the thing that scales to the whole country carries no editorial claims, and the thing that carries editorial claims doesn't scale without a human attached to it. There's a forcing function too — Spain votes for its town halls again in **May 2027**, and "before you vote, see what yours actually did" is a deadline worth building toward.

## Try it / break it

It's live at **[civicpulse.es](https://civicpulse.es)** and open source under AGPL-3.0 at **[github.com/datarhan/civicpulse](https://github.com/datarhan/civicpulse)**. It runs fully offline on the committed snapshots — `npm install && npm run dev` — no keys, no backend. The methodology is published, the corrections are logged openly, and if you find a wrong number, the issue tracker is right there.

If you work in civic tech, data journalism, or just care about the ~6,800 towns nobody's watching, I'd genuinely like to hear where this breaks — technically or editorially. That's the whole point of doing it in the open.
