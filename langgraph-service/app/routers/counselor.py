"""
The counselor dashboard's one backend route: the daily email digest.

POST /internal/counselor-digest is called once a day by the database's
scheduler (the 'counselor-digest' pg_cron job, the way 'keep-backend-awake'
pings /health). The scheduler has no JWT to send, so the route is guarded by a
shared secret instead: the job reads it from Supabase Vault and sends it in an
X-Digest-Secret header, and it must equal DIGEST_SECRET here.

Any call without the right secret is answered 404, exactly as a path that does
not exist, and does nothing: no read, no claim, no email. The same goes for
every call while DIGEST_SECRET is not set. The route runs the whole job (who is
due, a claim, a call to the mail provider and a release for each), so left
open it would let a stranger run that on a loop, send a counselor's one email
of the day hours early, and learn from the counts when students ask for
meetings. The body is ignored.

To the scheduler it never answers with an error. A run that goes wrong is
counted in "failed" and logged, so its call always completes and the next
day's run starts clean. The rules live in app/nodes/counselor/digest.py.
"""
import hmac
import logging
import time

from fastapi import APIRouter, HTTPException, Request

from app import config
from app.nodes.counselor import digest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["counselor"])

SECRET_HEADER = "X-Digest-Secret"
# A wrong secret is logged at most this often (seconds), so the scheduler's own
# daily miss shows up when the two copies of the secret differ, and a stranger
# guessing cannot fill the log.
WRONG_SECRET_LOG_EVERY = 3600.0

# An unset secret is a setup mistake worth one line per process, not one per call.
_said_unset = False
_said_wrong_at = None


def _allowed(given) -> bool:
    """True only for the scheduler's secret. Closed when none is configured.
    Neither secret, the given one or ours, is ever logged."""
    global _said_unset, _said_wrong_at
    secret = config.DIGEST_SECRET
    if not secret:
        if not _said_unset:
            _said_unset = True
            logger.warning("[counselor] digest: DIGEST_SECRET is not set; the route answers 404 "
                           "and nothing is read, claimed or sent")
        return False
    if not isinstance(given, str) or not given:
        return False
    # Bytes, because compare_digest refuses text that is not plain ASCII, and a
    # header can carry anything. The comparison takes the same time wherever
    # the two first differ.
    if hmac.compare_digest(given.encode("utf-8"), secret.encode("utf-8")):
        return True
    now = time.monotonic()
    if _said_wrong_at is None or now - _said_wrong_at >= WRONG_SECRET_LOG_EVERY:
        _said_wrong_at = now
        logger.warning("[counselor] digest: a call carried the wrong secret and was answered 404. If the "
                       "daily email has stopped, DIGEST_SECRET and the Vault's counselor_digest_secret differ")
    return False


@router.post("/internal/counselor-digest", include_in_schema=False)
async def counselor_digest(request: Request):
    if not _allowed(request.headers.get(SECRET_HEADER)):
        raise HTTPException(status_code=404)
    try:
        return await digest.send_due()
    except Exception as exc:
        # send_due does not raise; this is the last line of that promise. The
        # error's text stays out of the log: it could carry an address.
        logger.error(f"[counselor] digest run failed: {type(exc).__name__}")
        return {"sent": 0, "skipped": 0, "failed": 1}
