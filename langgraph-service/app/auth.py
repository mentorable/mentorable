import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import SUPABASE_URL, SUPABASE_ANON_KEY

bearer = HTTPBearer()


async def verify_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> str:
    """Verify a Supabase JWT and return the user_id. Raises 401 on failure."""
    token = credentials.credentials
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
            timeout=5.0,
        )
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    data = res.json()
    user_id: str | None = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not extract user from token")
    return user_id
