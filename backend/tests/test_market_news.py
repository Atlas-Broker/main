# backend/tests/test_market_news.py
"""Tests for fetch_news — verifies Alpaca News API is used for both backtest
(as_of_date set) and live (no as_of_date) code paths."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, call, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_alpaca_article(headline: str, summary: str, created_at: str) -> MagicMock:
    """Build a mock NewsArticle as returned by alpaca-py."""
    article = MagicMock()
    article.headline = headline
    article.summary = summary
    article.created_at = datetime.fromisoformat(created_at)
    return article


# ---------------------------------------------------------------------------
# Backtest path — as_of_date provided
# ---------------------------------------------------------------------------

def test_fetch_news_with_as_of_date_uses_alpaca():
    """When as_of_date is set, NewsClient should be called with end=as_of_date."""
    articles = [
        _make_alpaca_article("Apple beats earnings", "AAPL smashed Q4", "2025-01-14T10:00:00"),
        _make_alpaca_article("iPhone sales surge", "Record quarter for iPhone", "2025-01-13T08:30:00"),
    ]

    mock_news_response = MagicMock()
    mock_news_response.data = {"news": articles}

    mock_client_instance = MagicMock()
    mock_client_instance.get_news.return_value = mock_news_response

    env_vars = {"ALPACA_API_KEY": "test-key", "ALPACA_SECRET_KEY": "test-secret"}
    with patch("agents.data.market.NewsClient", return_value=mock_client_instance) as mock_client_cls, \
         patch.dict("os.environ", env_vars):
        from agents.data.market import fetch_news
        result = fetch_news("AAPL", as_of_date="2025-01-15")

    mock_client_cls.assert_called_once()
    mock_client_instance.get_news.assert_called_once()

    call_args = mock_client_instance.get_news.call_args
    request_arg = call_args[0][0]
    assert request_arg.end == datetime(2025, 1, 15)

    assert len(result) == 2
    assert result[0]["title"] == "Apple beats earnings"
    assert result[0]["published"] == "2025-01-14T10:00:00"
    assert result[1]["title"] == "iPhone sales surge"


# ---------------------------------------------------------------------------
# Live path — no as_of_date
# ---------------------------------------------------------------------------

def test_fetch_news_live_uses_alpaca():
    """When as_of_date is None, Alpaca NewsClient should be used (not yfinance)."""
    articles = [
        _make_alpaca_article("Breaking news AAPL", "Big move today", "2026-04-22T10:00:00"),
    ]
    mock_news_response = MagicMock()
    mock_news_response.data = {"news": articles}

    mock_client_instance = MagicMock()
    mock_client_instance.get_news.return_value = mock_news_response

    env_vars = {"ALPACA_API_KEY": "test-key", "ALPACA_SECRET_KEY": "test-secret"}
    with patch("agents.data.market.NewsClient", return_value=mock_client_instance) as mock_client_cls, \
         patch("agents.data.market.yf") as mock_yf, \
         patch.dict("os.environ", env_vars):
        from agents.data.market import fetch_news
        result = fetch_news("AAPL")

    mock_client_cls.assert_called_once()
    mock_client_instance.get_news.assert_called_once()
    mock_yf.Ticker.assert_not_called()

    assert len(result) == 1
    assert result[0]["title"] == "Breaking news AAPL"


def test_fetch_news_live_applies_7day_lookback():
    """Live mode should request articles from the past 7 days (no end constraint)."""
    mock_news_response = MagicMock()
    mock_news_response.data = {"news": []}

    mock_client_instance = MagicMock()
    mock_client_instance.get_news.return_value = mock_news_response

    before = datetime.now().replace(tzinfo=None) - timedelta(days=8)
    after = datetime.now().replace(tzinfo=None) - timedelta(days=6)

    env_vars = {"ALPACA_API_KEY": "test-key", "ALPACA_SECRET_KEY": "test-secret"}
    with patch("agents.data.market.NewsClient", return_value=mock_client_instance), \
         patch.dict("os.environ", env_vars):
        from agents.data.market import fetch_news
        fetch_news("MSFT")

    call_args = mock_client_instance.get_news.call_args
    request_arg = call_args[0][0]

    # start should be approximately now - 7 days
    assert before <= request_arg.start <= after, (
        f"expected start in [{before}, {after}], got {request_arg.start}"
    )
    # end should be unset (None) — no look-ahead-bias boundary in live mode
    assert request_arg.end is None


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def test_fetch_news_alpaca_error_falls_back_gracefully():
    """When Alpaca NewsClient raises, fetch_news should return [] without crashing."""
    mock_client_instance = MagicMock()
    mock_client_instance.get_news.side_effect = Exception("Alpaca API unavailable")

    with patch("agents.data.market.NewsClient", return_value=mock_client_instance), \
         patch.dict("os.environ", {"ALPACA_API_KEY": "k", "ALPACA_SECRET_KEY": "s"}):
        from agents.data.market import fetch_news
        result = fetch_news("AAPL", as_of_date="2025-01-15")

    assert result == []


def test_fetch_news_live_alpaca_error_falls_back_gracefully():
    """When Alpaca raises in live mode, fetch_news returns [] without crashing."""
    mock_client_instance = MagicMock()
    mock_client_instance.get_news.side_effect = Exception("timeout")

    with patch("agents.data.market.NewsClient", return_value=mock_client_instance), \
         patch.dict("os.environ", {"ALPACA_API_KEY": "k", "ALPACA_SECRET_KEY": "s"}):
        from agents.data.market import fetch_news
        result = fetch_news("TSLA")

    assert result == []
