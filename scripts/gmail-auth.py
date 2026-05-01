"""
Gmail OAuth setup for fieldlogisticfl@gmail.com.
Initiates the OAuth 2.0 flow, opens a browser window for Google login,
and saves the token to scripts/gmail-token.json.

Prerequisites:
  1. Go to console.cloud.google.com
  2. Create a project (or reuse existing)
  3. Enable the Gmail API
  4. OAuth consent screen → add fieldlogisticfl@gmail.com as a test user
  5. Create OAuth credentials → Desktop application
  6. Download credentials JSON → save as scripts/credentials.json
  7. Run: python3 scripts/gmail-auth.py
"""
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_FILE = os.path.join(SCRIPT_DIR, "credentials.json")
TOKEN_FILE = os.path.join(SCRIPT_DIR, "gmail-token.json")

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def main():
    print("=== Gmail OAuth Setup ===\n")

    # Check credentials file exists
    if not os.path.exists(CREDENTIALS_FILE):
        print("ERROR: credentials.json not found.")
        print(f"  Expected at: {CREDENTIALS_FILE}")
        print()
        print("  Steps to create it:")
        print("  1. Go to https://console.cloud.google.com")
        print("  2. Create or select a project")
        print("  3. Enable the Gmail API")
        print("  4. OAuth consent screen → add fieldlogisticfl@gmail.com as a test user")
        print("  5. Credentials → Create → OAuth client ID → Desktop application")
        print("  6. Download JSON → save as scripts/credentials.json")
        print("  7. Re-run this script")
        sys.exit(1)

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError as e:
        print(f"ERROR: Missing Google auth library: {e}")
        print("  Run: pip3 install google-auth-oauthlib google-api-python-client")
        sys.exit(1)

    creds = None

    # Check for existing valid token
    if os.path.exists(TOKEN_FILE):
        print(f"Found existing token: {TOKEN_FILE}")
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
            if creds and creds.valid:
                print("  Token is valid — no re-auth needed.")
                verify_token(creds)
                return
            elif creds and creds.expired and creds.refresh_token:
                print("  Token expired — refreshing...")
                creds.refresh(Request())
                save_token(creds)
                print("  Token refreshed successfully.")
                verify_token(creds)
                return
        except Exception as e:
            print(f"  Could not load existing token ({e}) — starting fresh OAuth flow.")
            creds = None

    # Start OAuth flow
    print("Starting OAuth flow — a browser window will open...")
    print("  Sign in as: fieldlogisticfl@gmail.com\n")
    try:
        flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
        creds = flow.run_local_server(port=0, prompt="consent",
                                      authorization_prompt_message="")
    except Exception as e:
        print(f"ERROR: OAuth flow failed: {e}")
        sys.exit(1)

    save_token(creds)
    print(f"\nToken saved to: {TOKEN_FILE}")
    verify_token(creds)


def save_token(creds):
    import json
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else [],
    }
    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f, indent=2)
    os.chmod(TOKEN_FILE, 0o600)  # restrict permissions


def verify_token(creds):
    """Quick verification: call Gmail profile endpoint."""
    try:
        from googleapiclient.discovery import build
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
        email = profile.get("emailAddress", "unknown")
        messages_total = profile.get("messagesTotal", "?")
        print(f"\nVerification OK:")
        print(f"  Authenticated as: {email}")
        print(f"  Total messages in mailbox: {messages_total}")
        print(f"\nSetup complete. Token file: {TOKEN_FILE}")
    except Exception as e:
        print(f"\nVerification failed (token may still be valid): {e}")


if __name__ == "__main__":
    main()
