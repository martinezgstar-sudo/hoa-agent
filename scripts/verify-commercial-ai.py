#!/usr/bin/env python3
"""
verify-commercial-ai.py

For each commercial candidate (and unclear candidate) found by
identify-commercial.py, ask Claude to classify residential vs commercial.

Confidence >= 0.90 + commercial → confirmed-commercial.json (auto-removable)
Confidence >= 0.90 + residential → confirmed-residential.json
Anything else → manual-review-commercial.json

Outputs to scripts/output/.
"""
import argparse
import json
import os
import re
import sys
import time
import warnings

warnings.filterwarnings("ignore")
from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env.local", override=True)

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic library not installed. Run: pip3 install anthropic")
    sys.exit(1)


def score(client, c: dict) -> dict:
    user = (
        f"Classify this Florida property association.\n\n"
        f"Name: {c.get('canonical_name','')}\n"
        f"City: {c.get('city','')}\n"
        f"Property type on file: {c.get('property_type') or 'unknown'}\n"
        f"Unit count: {c.get('unit_count') or 'unknown'}\n"
        f"Management company: {c.get('management_company') or 'unknown'}\n\n"
        "Residential examples: single-family HOAs, condo associations, "
        "townhome communities, age-restricted communities, planned unit developments.\n"
        "Commercial examples: office parks, retail centers, industrial parks, "
        "storage facilities, business parks, medical offices.\n\n"
        "Return exactly JSON:\n"
        "{ \"classification\": \"residential\"|\"commercial\"|\"unclear\","
        " \"confidence\": 0.0-1.0, \"reason\": \"one sentence\" }"
    )
    try:
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=150,
            system="You classify Florida property associations as residential HOA/condo communities or commercial properties. Return JSON only, no other text.",
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except json.JSONDecodeError:
        return {"classification": "unclear", "confidence": 0.0, "reason": "JSON parse failed"}
    except Exception as e:
        return {"classification": "unclear", "confidence": 0.0, "reason": f"API error: {e}"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", default="scripts/output/commercial-candidates.json")
    parser.add_argument("--unclear", default="scripts/output/commercial-unclear.json")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--rate", type=float, default=0.5, help="Seconds between API calls")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = anthropic.Anthropic()

    inputs = []
    for path in (args.candidates, args.unclear):
        if os.path.exists(path):
            with open(path) as f:
                inputs.extend(json.load(f))
    if args.limit:
        inputs = inputs[: args.limit]

    print(f"Scoring {len(inputs)} candidates with Claude…")

    confirmed_commercial = []
    confirmed_residential = []
    manual_review = []

    for i, c in enumerate(inputs, 1):
        ev = score(client, c)
        c_with_ev = {**c, "evaluation": ev}
        cls = ev.get("classification", "unclear")
        conf = float(ev.get("confidence", 0.0) or 0.0)

        if conf >= 0.90 and cls == "commercial":
            confirmed_commercial.append({
                **c, "confidence": conf, "reason": ev.get("reason", ""),
            })
        elif conf >= 0.90 and cls == "residential":
            confirmed_residential.append({
                **c, "confidence": conf, "reason": ev.get("reason", ""),
            })
        else:
            manual_review.append(c_with_ev)

        if i % 20 == 0:
            print(f"  Scored {i}/{len(inputs)}  "
                  f"(commercial={len(confirmed_commercial)} residential={len(confirmed_residential)} review={len(manual_review)})")
        time.sleep(args.rate)

    out_dir = "scripts/output"
    with open(f"{out_dir}/confirmed-commercial.json", "w") as f:
        json.dump(confirmed_commercial, f, indent=2)
    with open(f"{out_dir}/confirmed-residential.json", "w") as f:
        json.dump(confirmed_residential, f, indent=2)
    with open(f"{out_dir}/manual-review-commercial.json", "w") as f:
        json.dump(manual_review, f, indent=2)

    print()
    print(f"Confirmed commercial (>=0.90): {len(confirmed_commercial)}")
    print(f"Confirmed residential (>=0.90): {len(confirmed_residential)}")
    print(f"Manual review needed: {len(manual_review)}")
    print()
    print("Sample confirmed commercial:")
    for c in confirmed_commercial[:8]:
        print(f"  [{c['confidence']:.2f}] {c['canonical_name'][:55]} — {c['reason'][:60]}")


if __name__ == "__main__":
    main()
