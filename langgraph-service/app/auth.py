from typing import Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY
from app.costs import current_user

bearer = HTTPBearer()

# One client for the life of the process, so each request reuses a warm
# connection to Supabase Auth instead of opening (and TLS-handshaking) a new one.
_client: Optional[httpx.AsyncClient] = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=5.0)
    return _client


async def verify_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> str:
    """Verify a Supabase JWT and return the user_id. Raises 401 on failure.

    Also marks the request as this student's in the cost ledger (app/costs.py),
    so every paid call the request makes is charged to them."""
    token = credentials.credentials
    try:
        res = await _http().get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Could not check your sign-in. Try again in a moment.")
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    data = res.json()
    user_id: str | None = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not extract user from token")
    current_user.set(user_id)
    return user_id
