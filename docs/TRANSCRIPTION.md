# Pleno transcription & speaker identification

Turns council-session video into the transcripts the claim extractor reads.
Affects `bash scripts/transcribe-pleno.sh` and `npm run transcribe:batch` only —
the script header carries the full help.

Everything past step 1 is **opt-in and off by default**. Plain Whisper output
keeps the dependency surface minimal; each stage below buys attribution quality
at a cost in setup, runtime or money.

## 1 · Whisper engine (`WHISPER_ENGINE`)

| Value    | Cost / speed                                  | Notes                                                                                                                                                                                                                                                                                                                        |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai` | ~$0.006/min (~$0.72 per 2 h pleno), 30–60 s   | **The `hallazgos-pipeline` cron default since 2026-07-07.** Zero local GPU/CPU. Needs `OPENAI_API_KEY`.                                                                                                                                                                                                                      |
| `mlx`    | ~5–10× realtime, $0, local                    | lightning-whisper-mlx on the Apple Neural Engine. Better WER on technical terms than whisper-1 (it gets "UNE 93200:2008" where OpenAI produces "norma 1 en 93.200"). Was the nightly default until 2026-07-07 — retired from cron because it pins the local GPU (~30 min/run) and trips the Metal watchdog on 5 h+ sessions. |
| `local`  | ~0.3× realtime, $0                            | faster-whisper CPU int8. The fallback when MLX is not bootstrapped.                                                                                                                                                                                                                                                          |
| `gemini` | **$0** free tier (25 req/day), ~1-2 min/chunk | Gemini 3.5 Transcribe via the Interactions API, verbatim mode + word timestamps. Needs `GEMINI_API_KEY`. **Opt-in only, never a fallback — and MEASURED WORSE than `openai` on the markers that carry attribution; read the A/B result below before using it.**                                                              |

`WHISPER_MODEL` chooses the weights (`large-v3` default; `medium`/`small` trade
WER for speed).

### The Gemini quota, measured rather than read

**25 requests/day**, established on 2026-09-03 by exhausting it and reading the
quota name back out of the 429 (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
`quotaValue: 25`, `model: gemini-3.5-transcribe`). It refills slowly rather than
resetting on a clock — a single request slipped through 13 minutes after the wall,
and a 20-min chunk sent right after did not — so treat it as ~1 request/hour of
headroom once spent, not as "back at midnight".

**The per-minute ceiling for this model is NOT measured.** 15/minute is what
`gemini-3.5-flash-lite` reported (`GenerateRequestsPerMinutePerProjectPerModel-FreeTier`,
`quotaValue: 15`) and these quotas are per-model, so carrying that number across
would be a guess wearing a measurement's clothes. The engine's retry backoff
(60/120/180 s) is sized for an unknown RPM, not for a known one.

Two things follow from the daily budget, and neither is guessable from the
pricing page:

- **It is a different pot from the speaker-map sweep.** The daily budget is
  per-MODEL, and `extract:speaker-map` runs on `gemini-3.5-flash` (20/day,
  measured 2026-08-10). Transcribing does not eat that multi-week backlog burn,
  and the burn does not eat transcription.
- **A pleno must fit in one day.** 25 requests at 20-min chunks is ~8 h of
  audio, about four sessions. `transcribe-pleno.sh` refuses up front rather
  than 429-ing half way and publishing a partial session — a truncated
  transcript is the `rx4hb4` defect, where 44 claims were extracted from 7% of
  a session.

The consumer **Google AI Pro subscription grants none of this.** It is a chat
subscription with no API quota attached; every call above goes through
`GEMINI_API_KEY`. Do not reason about cost from the subscription.

### Speakers stay `UNKNOWN` on the Gemini path, deliberately

`gemini-3.5-transcribe` will diarize, but **at most three speakers**, and this
chamber seats 21 councillors. Asking for it does not fail — it returns three
confident clusters with 21 people folded into them, and those labels feed
`voice-id.ts` and the attribution join the extractor makes. That is a wrong
attribution wearing a confident label: the `Otro` sentinel again, in a new
place. So the engine emits `(UNKNOWN)` and attribution comes from the
speaker-map step, which reads the turn grants the chair says out loud.
`GEMINI_DIARIZE=1` exists for experiments and should not be used on a real
session.

`scripts/transcribe-file.ts` (the curator dashboard's non-pleno ingest) does NOT
have this engine — it still validates `mlx|local|openai` and exits 2 on anything
else. That is a loud failure rather than a silent fall-through, so an exported
`WHISPER_ENGINE=gemini` cannot quietly change what the dashboard does; it just
stops. Wire it there too if the A/B says this engine wins.

### A/B before switching anything

```bash
set -a; source .env; set +a
npm run eval:transcribe -- <plenoId> --start 1800 --secs 1200
```

Transcribes one 20-minute window with the candidate engine and diffs it against
the **published** transcript of the same seconds. It reports word counts,
word-set overlap and a marker table (party names, the contractor, the chair's
turn grants) — not a WER, because no human-verified reference transcript exists
here and a number implying one would be a lie. The markers are the decision: the
published 27-jul-2026 transcript contains `EU-Podem` and `Hidraqua` zero times
in 1,962 lines, and a name the engine cannot hear is a quote that can never be
cited.

### What the A/B actually said: do not adopt this engine (2026-09-03)

Ran on `15uvjew`, window [3600, 4800)s. **`gemini-3.5-transcribe` lost ground on
every marker that carries attribution and gained none:**

| marker         | published (`gpt-4o-transcribe-diarize`) | `gemini-3.5-transcribe` |
| -------------- | --------------------------------------- | ----------------------- |
| Esquerra Unida | 3                                       | **0**                   |
| VOX            | 2                                       | **0**                   |
| Podem          | 5                                       | 1                       |
| Compromís      | 2                                       | 1                       |
| té la paraula  | 1                                       | **0**                   |

Word count 95% of published and word-set overlap 81%, so it is transcribing the
same speech, not a different window. It simply dissolves the Valencian proper
nouns. The passage that settles it, same seconds, both engines:

- published: «aprofitant el vot a favor que tenim per part d'**Esquerra Unida** podem»
- gemini: «aprofitant ehm el vot a favor que tenim eh per part **dels que reunida** Podem»

That is the identical failure mode this repo already documented for the OLD
engine («Compromís, Rafa» → «Más palabras, compromiso, razón») — only now it is
Gemini doing it. Verbatim mode is working (the «ehm»/«eh» are faithfully kept);
what fails is the domain vocabulary.

**The counterintuitive part, and the reason this note exists:** the 2026-08-10
measurement that made a Gemini path look attractive was `gemini-3.5-flash`, the
GENERAL multimodal model, which got those same turn-grants right. The
SPECIALISED speech-to-text model is worse here — presumably it brings less world
knowledge to a proper noun it has never heard. Do not carry a result from one
Gemini model to another; they are not interchangeable, and this engine takes
`GEMINI_TRANSCRIBE_MODEL` precisely so the next candidate can be tried without
new code.

Caveat kept honest: **n = 1 window.** The free-tier quota ran out before a second
one could run. That is enough to stop an adoption, not enough to close the
question — and the cheap next step is `--start 5400`, since the audio is already
cached.

**Audio over 25 min is split into 20-min chunks** re-encoded to 64 kbps mono
opus. whisper-1 fed ONE multi-hour request degenerates into hallucination loops
— that plus a truncated download published 7% of a pleno as if it were the whole
thing (2026-07-29 postmortem, commit `9dd8f07`). Per-chunk uploads also sit far
under the 25 MB cap.

**Every engine's output must clear the degenerate-transcript sanity gate**
(`src/scraper/transcript-sanity.ts`). Repetition-loop, dominant-line and
no-content transcripts are quarantined rather than published, and the pleno
stays in the backlog for retry. Sweep the published corpus any time with
`npm run check:transcripts` (exit 1 on any failure).

**And the second failure mode: the engine TRANSLATES instead of transcribing.**
Whisper returns a passage in English — «but that the readjustment that we have
had in this reorganization in 2023-2024» — with `language='es'` set on both
transcriber paths, so this is not a missing flag: it is the model switching task
mid-session, sometimes inside one speaker's turn. Measured 2026-09-05 across the
44 published transcripts: 12 carry an English run, the longest 6 lines, and
`1r6yy0` reaches 6.9% of the file. It matters for the same reason a repetition
loop does — what gets published is what a named councillor said, and a
translation is not what they said.

`translated-passages` therefore joins the gate, failing above 5% of the judgeable
lines or a run of 8. Both criteria are needed and they see different things: the
share catches an engine that drifts in and out all session, the run catches one
whole stretch translated at once, which in a long file can be a small percentage
and still be an entire intervention put into somebody's mouth in another
language. Lines too short or with no function words either way are excluded from
the denominator rather than counted as clean.

**Never translate it back.** Rendering the passage into Spanish would make it
our sentence, and a quote we wrote is exactly what this repo exists not to
publish. Detect, quarantine, re-transcribe. Where an earlier transcription got
it right the original survives in `pleno-transcripts/superseded/` — that is where
`qz6weg`'s Spanish still is, and why `check:claim-provenance` reads that passage
as `solo-superseded` rather than as missing.

## 2 · Noise reduction (`WHISPER_DENOISE=1`, off)

Re-encodes the downloaded audio through ffmpeg's `afftdn` (FFT noise reduction,
built in) before Whisper sees it — 12 dB with adaptive noise-floor tracking.

Off by default: aggressive denoise clips consonants on already-clean
recordings. A/B the word count first. Worth it for marathon sessions, distant
mics, and echoey post-DANA recovery rooms.

## 3 · Diarization (`WHISPER_DIARIZE=1`, off)

Runs pyannote.audio `speaker-diarization-3.1` after Whisper and tags every line
`(SPEAKER_NN)`. Cuts the extractor's null-`speakerGroup` rate from ~65% to <30%
on real plenos. ~0.5× realtime on CPU.

Bootstrap — or just run `bash scripts/bootstrap-voice-id.sh`, which automates
steps 3–4 and smoke-tests the pipeline:

1. Accept the user agreements at `huggingface.co/pyannote/speaker-diarization-3.1`,
   `…/segmentation-3.0` and `…/speaker-diarization-community-1` (pyannote 4.x
   routes 3.1 model loads through community-1; the bootstrap script detects this
   gate).
2. Set `HUGGINGFACE_TOKEN` in `.env`.
3. `python3.10 -m venv ~/.local/civicpulse-pyannote/venv`
4. `~/.local/civicpulse-pyannote/venv/bin/pip install 'pyannote.audio>=4.0,<5'`

## 4 · Voice ID (`WHISPER_IDENTIFY=1`, off)

Matches each diarized `SPEAKER_NN` cluster to an enrolled councillor voiceprint.
Requires `WHISPER_DIARIZE=1` and ≥1 enrolled voice in `.voiceprints/`.

It slices the longest contiguous segments of each cluster, embeds them with the
same speechbrain ECAPA-TDNN model used at enrollment (192-dim, L2-normalised so
cosine is a dot product), cosine-ranks against the enrolled set, and writes
`pleno-speakers/<plenoId>.json`. Benchmark: same-speaker self-similarity ~0.85,
cross-speaker noise floor ~0.10.

| Tier   | Rule                                        | Effect on the transcript                 |
| ------ | ------------------------------------------- | ---------------------------------------- |
| High   | cosine ≥ 0.6 **and** margin over 2nd ≥ 0.15 | rewritten to `(<councillor name>)`       |
| Medium | below margin                                | `(SPEAKER_NN ≈ <name>?)`, curator review |
| Low    | below threshold                             | stays `(SPEAKER_NN)`                     |

```bash
# Standalone (no env gate; runs against an existing diarized transcript)
npm run identify-pleno-speakers -- <plenoId> [--apply]

# Enrollment — admin only; curator dashboard at /curator
npm run enroll-voice -- --slug <officials-slug> --url <public-audio-url>
npm run enroll-voice -- --slug robert-raga-gadea --audio path/to/sample.mp3
npm run delete-voiceprint -- --slug <officials-slug>
npm run enroll-voices-batch -- --file enrollments.json   # [{slug,url}], serial

# Curator override — auto-match is preserved untouched for audit
npm run override-speaker-assignment -- --pleno-id <id> --speaker SPEAKER_NN \
    --slug <officials-slug> [--reason "…"]
npm run override-speaker-assignment -- --pleno-id <id> --speaker SPEAKER_NN --clear
npm run override-speaker-assignment -- --pleno-id <id> --speaker SPEAKER_NN --remove-override

# Did voice-id actually improve attribution? Two passes over one transcript.
npm run voice-id-ab -- <plenoId>     # cost: 2× a normal extract
```

`.voiceprints/` is local-only and gitignored. Back it up encrypted — the `.f32`
vectors are the genuinely irreplaceable part; audio caches can be re-fetched
from `sourceUrl` in `index.json`:

```bash
bash scripts/backup-voiceprints.sh [output-dir]   # tar + openssl AES-256-CBC
bash scripts/restore-voiceprints.sh <blob.tar.gz.enc>
```

**Curator review surface**: `/curator` → "Voice ID assignments per pleno" lists
every `pleno-speakers/<plenoId>.json` with the auto-match tier, top-3 candidates
and cosine scores, and a dropdown to override. Overrides land in a sibling
`curatorOverride` field. Effective assignment for downstream consumers:
curatorOverride wins → else high-tier match → else nothing. **Medium and low
tier auto-matches never feed the LLM** unless a curator promotes them.
`GET /api/curator/pleno-speakers/<id>/audio/<SPEAKER_NN>` streams an 8-second
mp3 from the midpoint of the cluster's longest segment so the curator can listen
before deciding.

> **Editorial guard — voice-id is signal, not a libel green light.** The LLM
> extractor's `speakerGroup` enum stays bloc-level (PSOE / PP / VOX / Compromís)
> regardless of voiceprint match. A curator promotes individual attribution per
> finding via `promote-claim --individual-speaker auto|<slug>|none`, after
> spot-checking the assignment against the audio. `/hallazgos` renders the
> `individualSpeaker` chip beside the bloc tag — that is the boundary crossing
> where a named person becomes publicly visible.

**Known bias:** enrolling voiceprints from pleno audio makes the diarization
dump 90%+ of a session onto the enrolled speakers — the chair's own lines get
credited to another councillor. Partial in-room enrollment is worse than none,
and the API gives no confidence score to threshold on.

## 5 · Proper-noun second pass (opt-in)

```bash
npm run refine-transcript -- <plenoId> [--apply]
```

Builds a vocabulary from `officials.json` + `geo.json` + `wikidata.json` + the
top-50 contractors in `tenders.json` and asks the LLM (Gemini Pro by default) to
fix Whisper-mistranscribed proper nouns **only**, leaving uncertain tokens
alone. Writes `<id>.txt.refined`; `--apply` applies it after preserving the
pristine original as `<id>.txt.orig` (written once, reversible). Per-replacement
audit log at `scripts/logs/refine-transcript-<id>-<ts>.log`. ~$0 on a Gemini Pro
plan, ~$0.30 metered.
