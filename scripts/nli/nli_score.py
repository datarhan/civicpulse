#!/usr/bin/env python3
"""Batch NLI scorer for the CivicPulse verifier grounding engine (P1).

Reads JSONL `{id, premise, hypothesis}` from stdin, writes JSONL
`{id, entailment, neutral, contradiction, label}` to stdout. The model loads
ONCE; all pairs are scored in batches — the efficient counterpart to the old
per-claim LLM calls.

Default model: mDeBERTa-v3-xnli (multilingual, Spanish/Valencià-capable),
treating premise=evidence-snippet, hypothesis=claim. `NLI_MODEL=minicheck`
switches to the MiniCheck grounding model (English; benchmark only).

Run locally via the venv from scripts/bootstrap-nli.sh — never in CI.
"""
import json
import os
import sys


def eprint(*a):
    print(*a, file=sys.stderr, flush=True)


def read_pairs():
    pairs = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
            pairs.append(
                (str(o["id"]), str(o.get("premise", "") or ""), str(o.get("hypothesis", "") or ""))
            )
        except Exception as e:  # noqa: BLE001 — a bad line must not abort the batch
            eprint(f"[nli] skipping malformed line: {e}")
    return pairs


def _key_for(label: str) -> str:
    lbl = label.lower()
    if "entail" in lbl:
        return "entailment"
    if "contradic" in lbl:
        return "contradiction"
    return "neutral"


def run_mdeberta(model_name, pairs, batch):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)
    model.eval()
    # Map the model's own label order onto our three fixed keys (robust to
    # models that order [contradiction, neutral, entailment] differently).
    id2label = {int(k): str(v) for k, v in model.config.id2label.items()}

    out = []
    with torch.no_grad():
        for i in range(0, len(pairs), batch):
            chunk = pairs[i : i + batch]
            prem = [p[1] for p in chunk]
            hyp = [p[2] for p in chunk]
            enc = tok(
                prem, hyp, truncation=True, padding=True, max_length=512, return_tensors="pt"
            )
            probs = torch.softmax(model(**enc).logits, dim=-1)
            for j, (cid, _, _) in enumerate(chunk):
                scores = {"entailment": 0.0, "neutral": 0.0, "contradiction": 0.0}
                for idx in range(probs.shape[1]):
                    scores[_key_for(id2label.get(idx, "neutral"))] += float(probs[j][idx])
                label = max(scores, key=scores.get)
                out.append(
                    {"id": cid, **{k: round(v, 6) for k, v in scores.items()}, "label": label}
                )
    return out


def run_minicheck(pairs, batch):
    # Benchmark path. The score() return shape can vary by minicheck version;
    # we read the support-probability list defensively.
    from minicheck.minicheck import MiniCheck

    scorer = MiniCheck(model_name="flan-t5-large")
    docs = [p[1] for p in pairs]
    claims = [p[2] for p in pairs]
    result = scorer.score(docs=docs, claims=claims)
    raw = result[1] if isinstance(result, (list, tuple)) and len(result) > 1 else result
    out = []
    for (cid, _, _), s in zip(pairs, raw):
        s = float(s)
        out.append(
            {
                "id": cid,
                "entailment": round(s, 6),
                "neutral": round(1.0 - s, 6),
                "contradiction": 0.0,
                "label": "entailment" if s >= 0.5 else "neutral",
            }
        )
    return out


def main():
    model_name = os.environ.get(
        "NLI_MODEL", "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"
    )
    batch = int(os.environ.get("NLI_BATCH", "16"))
    pairs = read_pairs()
    if not pairs:
        return
    rows = run_minicheck(pairs, batch) if model_name == "minicheck" else run_mdeberta(
        model_name, pairs, batch
    )
    for r in rows:
        sys.stdout.write(json.dumps(r, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
