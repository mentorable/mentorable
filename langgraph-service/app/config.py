import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
BRAVE_API_KEY: str = os.environ.get("BRAVE_API_KEY", "")
DATABASE_URL: str = os.environ["DATABASE_URL"]  # direct Postgres connection for checkpointer
CORS_ORIGIN: str = os.environ.get("CORS_ORIGIN", "*")
DEV_BYPASS_EMAILS: list[str] = [
    e.strip() for e in os.environ.get("DEV_BYPASS_EMAILS", "app.mentora.ai@gmail.com").split(",") if e.strip()
]
