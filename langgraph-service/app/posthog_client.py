import atexit

from posthog import Posthog

from app.config import POSTHOG_HOST, POSTHOG_PROJECT_TOKEN

posthog_client = Posthog(
    POSTHOG_PROJECT_TOKEN,
    host=POSTHOG_HOST,
    enable_exception_autocapture=True,
)
atexit.register(posthog_client.shutdown)
