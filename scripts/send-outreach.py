"""
Send (or dry-run preview) outreach emails to management companies.
Pulls contacts from Supabase outreach_contacts table.
Sends via Gmail (requires scripts/gmail-token.json from gmail-auth.py).

Usage:
  python3 scripts/send-outreach.py --template A --dry-run true --limit 10
  python3 scripts/send-outreach.py --template B --dry-run false --limit 5

Templates:
  A — Introduce HOA Agent to management companies, invite to claim profiles
  B — Follow-up for companies that haven't responded

Rules:
  - dry-run true: print email previews, write to scripts/output/dry-run-emails.txt, NO sending
  - dry-run false: actually send via Gmail API (requires gmail-token.json)
  - Only contacts with status='pending' and a valid email are eligible
  - After sending, update status to 'sent' and record sent_at timestamp
"""
import os
import sys
import json
import argparse
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
TOKEN_FILE = os.path.join(SCRIPT_DIR, "gmail-token.json")
DRY_RUN_FILE = os.path.join(OUTPUT_DIR, "dry-run-emails.txt")

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
FROM_EMAIL = "fieldlogisticfl@gmail.com"
FROM_NAME = "HOA Agent Team"

# ── Email templates ──────────────────────────────────────────────────────────

TEMPLATES = {
    "A": {
        "subject": "Your HOA communities are listed on HOA Agent — claim them free",
        "body": """\
Hi {first_name},

I wanted to reach out because {company_name} manages communities that are listed on \
HOA Agent (hoa-agent.com) — a free directory homebuyers, renters, and real estate \
agents use to research Palm Beach County HOAs before moving in.

Your communities are already there, but the profiles are unverified. Claiming them \
takes about 5 minutes and lets you:

  • Update HOA fees, rules, and amenities
  • Add your contact info so residents can reach you directly
  • Respond to questions homebuyers are asking right now

No cost, no subscription. Just verified, accurate information for your communities.

To claim your profiles, visit:
  https://hoa-agent.com/claim

Or reply to this email and I'll set it up for you.

Best,
Izzy Martinez
HOA Agent
https://hoa-agent.com
""",
    },
    "B": {
        "subject": "Following up — HOA Agent profile claim for {company_name}",
        "body": """\
Hi {first_name},

Just following up on my earlier note about claiming your community profiles on \
HOA Agent (hoa-agent.com).

Homebuyers and renters in Palm Beach County are actively researching HOA communities \
before making decisions. Verified profiles get significantly more views.

If you have 5 minutes, you can claim all your communities at once:
  https://hoa-agent.com/claim

Happy to walk you through it if that's easier — just reply here.

Best,
Izzy Martinez
HOA Agent
https://hoa-agent.com
""",
    },
}


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_KEY == "your_service_role_key_here":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder")
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_pending_contacts(supabase, limit: int) -> List[Dict]:
    result = (
        supabase.table("outreach_contacts")
        .select("id, company_name, email, phone, cities, community_count, status")
        .eq("status", "pending")
        .not_.is_("email", "null")
        .limit(limit)
        .execute()
    )
    return [r for r in (result.data or []) if (r.get("email") or "").strip()]


def guess_first_name(company_name: str) -> str:
    """Extract a plausible first name from a company name, or fall back to 'there'."""
    words = company_name.strip().split()
    # If the first word looks like a person's name (capitalized, not an HOA keyword)
    hoa_words = {"the", "palm", "florida", "south", "north", "east", "west", "beach",
                 "century", "first", "national", "american", "professional", "complete",
                 "total", "premier", "elite", "advanced", "all", "pro", "star"}
    for word in words[:2]:
        clean = word.strip(",.").lower()
        if clean not in hoa_words and len(clean) > 2 and clean.isalpha():
            return word.strip(",.").title()
    return "there"


def render_template(template: Dict, company: Dict) -> Dict:
    first_name = guess_first_name(company["company_name"])
    cities = ", ".join(company.get("cities") or []) or "Palm Beach County"
    count = company.get("community_count", 1)
    context = {
        "first_name": first_name,
        "company_name": company["company_name"],
        "cities": cities,
        "community_count": count,
    }
    subject = template["subject"].format(**context)
    body = template["body"].format(**context)
    return {"subject": subject, "body": body}


def build_mime(to_email: str, subject: str, body: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    return msg


def send_gmail(creds, to_email: str, subject: str, body: str) -> bool:
    try:
        from googleapiclient.discovery import build
        service = build("gmail", "v1", credentials=creds)
        msg = build_mime(to_email, subject, body)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True
    except Exception as e:
        print(f"  Gmail send error: {e}")
        return False


def load_gmail_creds():
    if not os.path.exists(TOKEN_FILE):
        raise FileNotFoundError(
            f"gmail-token.json not found at {TOKEN_FILE}. "
            "Run python3 scripts/gmail-auth.py first."
        )
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    creds = Credentials.from_authorized_user_file(TOKEN_FILE)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        # Save refreshed token
        with open(TOKEN_FILE, "w") as f:
            json.dump({
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": list(creds.scopes or []),
            }, f, indent=2)
    return creds


def main():
    parser = argparse.ArgumentParser(description="Send HOA Agent outreach emails")
    parser.add_argument("--template", choices=list(TEMPLATES.keys()), default="A",
                        help="Email template to use (A or B)")
    parser.add_argument("--dry-run", choices=["true", "false"], default="true",
                        help="If true, preview emails without sending")
    parser.add_argument("--limit", type=int, default=10,
                        help="Maximum number of contacts to process")
    args = parser.parse_args()

    dry_run = args.dry_run.lower() == "true"
    template = TEMPLATES[args.template]
    limit = args.limit

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    mode = "DRY RUN (no emails sent)" if dry_run else "LIVE SEND"
    print(f"=== Outreach Email {'Preview' if dry_run else 'Send'} ===")
    print(f"  Template: {args.template} | Mode: {mode} | Limit: {limit}\n")

    # ── Fetch contacts ───────────────────────────────────────────────────────
    try:
        supabase = get_supabase()
        contacts = fetch_pending_contacts(supabase, limit)
    except RuntimeError as e:
        print(f"WARNING: {e}")
        print("  Cannot fetch contacts without Supabase access.")
        print("  Generating sample preview using placeholder data instead.\n")
        # Provide sample data so the dry-run output file is still useful
        contacts = [
            {"id": "sample-1", "company_name": "Benchmark Management Florida",
             "email": "info@benchmarkfl.example.com", "cities": ["Palm Beach Gardens"],
             "community_count": 4, "status": "pending"},
            {"id": "sample-2", "company_name": "Gateway Management Services",
             "email": "contact@gatewaysvc.example.com", "cities": ["Jupiter", "Tequesta"],
             "community_count": 7, "status": "pending"},
            {"id": "sample-3", "company_name": "Leland Management",
             "email": "hello@lelandmgmt.example.com", "cities": ["North Palm Beach"],
             "community_count": 3, "status": "pending"},
        ][:limit]
        supabase = None

    if not contacts:
        print("No eligible contacts found (status=pending with email).")
        sys.exit(0)

    print(f"Processing {len(contacts)} contact(s)...\n")

    # ── Load Gmail creds (only needed for live send) ─────────────────────────
    gmail_creds = None
    if not dry_run:
        try:
            gmail_creds = load_gmail_creds()
        except (FileNotFoundError, Exception) as e:
            print(f"ERROR: {e}")
            sys.exit(1)

    # ── Process each contact ─────────────────────────────────────────────────
    previews = []
    sent_count = 0
    failed_count = 0

    for i, contact in enumerate(contacts, 1):
        rendered = render_template(template, contact)
        subject = rendered["subject"]
        body = rendered["body"]
        to_email = contact["email"]
        company = contact["company_name"]

        header = f"{'='*70}\nEmail {i}/{len(contacts)}\nTo:      {to_email}\nCompany: {company}\nSubject: {subject}\n{'='*70}"
        preview_block = f"{header}\n\n{body}\n"
        previews.append(preview_block)

        if dry_run:
            print(preview_block)
        else:
            print(f"[{i}/{len(contacts)}] Sending to {to_email} ({company[:40]})...")
            ok = send_gmail(gmail_creds, to_email, subject, body)
            if ok:
                sent_count += 1
                print(f"  ✓ Sent")
                if supabase:
                    try:
                        supabase.table("outreach_contacts").update({
                            "status": "sent",
                            "sent_at": datetime.utcnow().isoformat(),
                        }).eq("id", contact["id"]).execute()
                    except Exception as e:
                        print(f"  Could not update status: {e}")
            else:
                failed_count += 1
                print(f"  ✗ Failed")

    # ── Save preview/log file ────────────────────────────────────────────────
    with open(DRY_RUN_FILE, "w") as f:
        f.write(f"Outreach email preview — {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}\n")
        f.write(f"Template: {args.template} | Mode: {mode} | Contacts: {len(contacts)}\n\n")
        f.write("\n".join(previews))
    print(f"\nOutput saved to: {DRY_RUN_FILE}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n=== Summary ===")
    print(f"  Template:  {args.template}")
    print(f"  Mode:      {mode}")
    print(f"  Contacts:  {len(contacts)}")
    if dry_run:
        print(f"  Previewed: {len(contacts)} (no emails sent)")
    else:
        print(f"  Sent:    {sent_count}")
        print(f"  Failed:  {failed_count}")
    print(f"  Log file:  {DRY_RUN_FILE}")


if __name__ == "__main__":
    main()
