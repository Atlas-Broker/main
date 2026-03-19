# backend/tests/test_market_as_of_date.py
from unittest.mock import patch
import pandas as pd


def _make_ohlcv_df(dates, opens=None):
    """Helper: build a minimal yfinance-style DataFrame."""
    n = len(dates)
    opens = opens or [100.0] * n
    data = {
        ("Open",   "AAPL"): opens,
        ("High",   "AAPL"): [101.0] * n,
        ("Low",    "AAPL"): [99.0]  * n,
        ("Close",  "AAPL"): [100.5] * n,
        ("Volume", "AAPL"): [1_000_000] * n,
    }
    idx = pd.to_datetime(dates)
    return pd.DataFrame(data, index=idx)


def test_fetch_ohlcv_with_as_of_date_calls_yfinance_with_date_range():
    mock_df = _make_ohlcv_df(["2026-01-05", "2026-01-06"])
    with patch("agents.data.market.yf.download", return_value=mock_df) as mock_dl:
        from agents.data.market import fetch_ohlcv
        result = fetch_ohlcv("AAPL", as_of_date="2026-01-10")
    call_kwargs = mock_dl.call_args[1]
    assert "start" in call_kwargs
    assert "end" in call_kwargs
    assert "period" not in call_kwargs
    assert len(result) == 2


def test_fetch_ohlcv_without_as_of_date_uses_period():
    mock_df = _make_ohlcv_df(["2026-01-05"])
    with patch("agents.data.market.yf.download", return_value=mock_df) as mock_dl:
        from agents.data.market import fetch_ohlcv
        fetch_ohlcv("AAPL")
    call_kwargs = mock_dl.call_args[1]
    assert "period" in call_kwargs
    assert "start" not in call_kwargs


def test_fetch_next_open_returns_first_available_open():
    mock_df = _make_ohlcv_df(["2026-01-06"], opens=[246.0])
    with patch("agents.data.market.yf.download", return_value=mock_df):
        from agents.data.market import fetch_next_open
        price = fetch_next_open("AAPL", after_date="2026-01-05")
    assert price == 246.0


def test_fetch_next_open_returns_none_when_no_data():
    empty_df = pd.DataFrame()
    with patch("agents.data.market.yf.download", return_value=empty_df):
        from agents.data.market import fetch_next_open
        price = fetch_next_open("AAPL", after_date="2026-01-05")
    assert price is None
