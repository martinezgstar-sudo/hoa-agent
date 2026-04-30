"""
One-time script: Update Victoria Woods address and city in Supabase.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, street_address")
        .ilike("canonical_name", "%Victoria Woods%")
        .execute()
    )

    if not result.data:
        print("ERROR: Victoria Woods not found in communities table")
        sys.exit(1)

    for community in result.data:
        print(f"Found: {community['canonical_name']} (id={community['id']})")
        print(f"  Current city: {community['city']}")
        print(f"  Current address: {community['street_address']}")

        update = supabase.table("communities").update({
            "street_address": "Summit Blvd, West Palm Beach, FL",
            "city": "West Palm Beach",
        }).eq("id", community["id"]).execute()

        if update.data:
            print(f"  Updated: city=West Palm Beach, address=Summit Blvd, West Palm Beach, FL")
        else:
            print(f"  ERROR updating {community['canonical_name']}")


if __name__ == "__main__":
    main()
