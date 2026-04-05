# backend/api/routes/watchlist.py
"""
GET /v1/watchlist  — return the user's watchlist
PUT /v1/watchlist  — replace the user's watchlist (full overwrite)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator

from api.dependencies import get_current_user
from services.watchlist_service import get_watchlist, save_watchlist

router = APIRouter(prefix="/v1/watchlist", tags=["watchlist"])


class WatchlistEntry(BaseModel):
    ticker: str
    schedule: str

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, v: str) -> str:
        v = v.strip().upper()
        if not v or not v.isalpha() or len(v) > 5:
            raise ValueError("Ticker must be 1–5 letters")
        return v

    @field_validator("schedule")
    @classmethod
    def validate_schedule(cls, v: str) -> str:
        if v not in ("1x", "3x", "6x"):
            raise ValueError("schedule must be 1x, 3x, or 6x")
        return v


class WatchlistSaveRequest(BaseModel):
    entries: list[WatchlistEntry]


@router.get("")
def read_watchlist(user_id: str = Depends(get_current_user)) -> list[dict]:
    return get_watchlist(user_id)


@router.put("")
def write_watchlist(
    body: WatchlistSaveRequest,
    user_id: str = Depends(get_current_user),
) -> list[dict]:
    save_watchlist(user_id, [e.model_dump() for e in body.entries])
    return get_watchlist(user_id)
