#!/usr/bin/env python3
"""mission-goal-snapshot.py
Snapshot all 580 recently-updated registered_agent rows BEFORE cleanup.
Output: /Users/izzymartinez/Agents/hoa-agent/logs/snapshots/registered-agent-pre-cleanup-2026-05-21.json
"""
import os, json
from datetime import datetime, timedelta, timezone
import warnings
warnings.filterwarnings("ignore")
import requests
from dotenv import load_dotenv

REPO = "/Users/izzymartinez/Documents/hoa-agent"
load_dotenv(os.path.join(REPO, ".env.local"), override=True)
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H_R = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

SNAP_DIR = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots"
os.makedirs(SNAP_DIR, exist_ok=True)
SNAP_PATH = os.path.join(SNAP_DIR, "registered-agent-pre-cleanup-2026-05-21.json")


def main():
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,state_entity_number,registered_agent,updated_at"
            f"&status=eq.published"
            f"&registered_agent=not.is.null"
            f"&updated_at=gte.{cutoff}"
            f"&order=updated_at.desc"
            f"&limit=1000&offset={offset}",
            headers=H_R,
        )
        chunk = r.json()
        if not isinstance(chunk, list) or not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
        if offset > 30000:
            break

    with open(SNAP_PATH, "w") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cutoff": cutoff,
            "row_count": len(rows),
            "rows": rows,
        }, f, indent=2, default=str)
    print(f"Snapshot: {len(rows)} rows → {SNAP_PATH}")


if __name__ == "__main__":
    main()
