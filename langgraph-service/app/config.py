import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
# Optional on purpose: the service must still boot before these are set, and each
# is only needed once something is actually routed to that provider.
GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
BRAVE_API_KEY: str = os.environ.get("BRAVE_API_KEY", "")
DATABASE_URL: str = os.environ["DATABASE_URL"]  # direct Postgres connection for checkpointer
CORS_ORIGIN: str = os.environ.get("CORS_ORIGIN", "*")
# Gmail sending for the outreach agent (Beaker). All optional: without the
# client id and secret the agent still drafts, and students copy or save instead.
GOOGLE_OAUTH_CLIENT_ID: str = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET: str = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")
# Where Google sends the student back. Must match the redirect URI registered
# on the OAuth client; when unset it is built from the request (https forced
# unless the host is localhost).
GOOGLE_OAUTH_REDIRECT_URI: str = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "")
# Fernet key that encrypts each student's Gmail refresh token. Changing it
# makes every saved connection unreadable (everyone reconnects).
GMAIL_TOKEN_KEY: str = os.environ.get("GMAIL_TOKEN_KEY", "")
# The web app, where the OAuth callback returns the student.
APP_URL: str = os.environ.get("APP_URL", "https://mentorable.net").rstrip("/")
POSTHOG_PROJECT_TOKEN: str = os.environ.get("POSTHOG_PROJECT_TOKEN", "")
POSTHOG_HOST: str = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com")
DEV_BYPASS_EMAILS: list[str] = [
    e.strip() for e in os.environ.get("DEV_BYPASS_EMAILS", "app.mentora.ai@gmail.com").split(",") if e.strip()
]
