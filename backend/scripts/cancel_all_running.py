"""
cancel_all_running.py

Admin utility: force-cancels all backtest_jobs rows whose status is
'running' or 'queued'. Useful after a backend restart when in-process
runner state has been lost and stale jobs would otherwise sit forever.

Usage:
    cd backend
    python scripts/cancel_all_running.py
"""
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(url, key)

STALE_STATUSES = ("running", "queued")

now_iso = datetime.now(timezone.utc).isoformat()

response = (
    sb.table("backtest_jobs")
    .update(
        {
            "status": "cancelled",
            "completed_at": now_iso,
            "error_message": "Force-cancelled by admin",
        }
    )
    .in_("status", list(STALE_STATUSES))
    .execute()
)

updated_rows = response.data if response.data else []
print(f"Updated {len(updated_rows)} row(s) to 'cancelled'.")
