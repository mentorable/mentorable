import threading

from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# Service role client — used for all server-side DB reads/writes.
# Never exposed to the client; never use the anon key here.
#
# One client per thread. The sync client speaks HTTP/2 over one connection,
# and that connection is not safe to share: the routers run service calls on
# worker threads, so two requests at once (a page's parallel first loads)
# could interleave on it and fail with "[Errno 11] Resource temporarily
# unavailable". A thread's own client never sees another thread's traffic.
_local = threading.local()


def get_supabase() -> Client:
    client = getattr(_local, "client", None)
    if client is None:
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        _local.client = client
    return client
