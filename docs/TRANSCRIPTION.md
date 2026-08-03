# Pleno transcription & speaker identification

Turns council-session video into the transcripts the claim extractor reads.
Affects `bash scripts/transcribe-pleno.sh` and `npm run transcribe:batch` only —
the script header carries the full help.

Everything past step 1 is **opt-in and off by default**. Plain Whisper output
keeps the dependency surface minimal; each stage below buys attribution quality
at a cost in setup, runtime or money.

## 1 · Whisper engine (`WHISPER_ENGINE`)

| Value    | Cost / speed                                | Notes                                                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai` | ~$0.006/min (~$0.72 per 2 h pleno), 30–60 s | **The `hallazgos-pipeline` cron default since 2026-07-07.** Zero local GPU/CPU. Needs `OPENAI_API_KEY`.                                                                                                                                                                                                                      |
| `mlx`    | ~5–10× realtime, $0, local                  | lightning-whisper-mlx on the Apple Neural Engine. Better WER on technical terms than whisper-1 (it gets "UNE 93200:2008" where OpenAI produces "norma 1 en 93.200"). Was the nightly default until 2026-07-07 — retired from cron because it pins the local GPU (~30 min/run) and trips the Metal watchdog on 5 h+ sessions. |
| `local`  | ~0.3× realtime, $0                          | faster-whisper CPU int8. The fallback when MLX is not bootstrapped.                                                                                                                                                                                                                                                          |

`WHISPER_MODEL` chooses the weights (`large-v3` default; `medium`/`small` trade
WER for speed).

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
