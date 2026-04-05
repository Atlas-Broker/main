import os
import inngest
from dotenv import load_dotenv

# Load env early so INNGEST_BASE_URL (and others) are available when the
# client is constructed — main.py's load_dotenv() runs after imports.
load_dotenv()

# Treat both "production" and "uat" as cloud environments (not local dev)
_is_prod = os.getenv("ENVIRONMENT") in ("production", "uat")
_dev_server = os.getenv("INNGEST_BASE_URL", "http://localhost:8288")

inngest_client = inngest.Inngest(
    app_id="atlas",
    is_production=_is_prod,
    # Explicitly pass dev server URL so out-of-band registrations go to the
    # right port (default is 8288; local dev runs on 8290).
    **({} if _is_prod else {
        "api_base_url": _dev_server,
        "event_api_base_url": _dev_server,
    }),
)
