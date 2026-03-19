# backend/tests/test_market_news.py
"""Tests for fetch_news — verifies Alpaca API is used for historical dates
and yfinance is used for live (no as_of_date) requests."""

from datetime import datetime
from unittest.mock import MagicMock, patch


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


def _make_yfinance_news_item(title: str, pub_date: str) -> dict:
    """Build a mock yfinance news dict (nested content structure)."""
    return {"content": {"title": title, "pubDate": pub_date}}


# ---------------------------------------------------------------------------
# test_fetch_news_with_as_of_date_uses_alpaca
# ---------------------------------------------------------------------------

def test_fetch_news_with_as_of_date_uses_alpaca():
    """When as_of_date is set, NewsClient should be called with end=as_of_date."""
    articles = [
        _make_alpaca_article("Apple beats earnings", "AAPL smashed Q4", "2025-01-14T10:00:00"),
        _make_alpaca_article("iPhone sales surge", "Record quarter for iPhone", "2025-01-13T08:30:00"),
    ]

    mock_news_response = MagicMock()
    mock_news_response.__iter__ = MagicMock(return_value=iter(articles))

    mock_client_instance = MagicMock()
    mock_client_instance.get_news.return_value = mock_news_response

    env_vars = {"ALPACA_API_KEY": "test-key", "ALPACA_SECRET_KEY": "test-secret"}
    with patch("agents.data.market.NewsClient", return_value=mock_client_instance) as mock_client_cls, \
         patch.dict("os.environ", env_vars):
        from agents.data.market import fetch_news
        result = fetch_news("AAPL", as_of_date="2025-01-15")

    # NewsClient must be instantiated
    mock_client_cls.assert_called_once()

    # get_news must be called
    mock_client_instance.get_news.assert_called_once()

    # The NewsRequest end date must match as_of_date
    call_args = mock_client_instance.get_news.call_args
    request_arg = call_args[0][0]  # positional arg
    assert request_arg.end == datetime(2025, 1, 15)

    # Result should be a list of dicts with title and published keys
    assert len(result) == 2
    assert result[0]["title"] == "Apple beats earnings"
    assert result[0]["published"] == "2025-01-14T10:00:00"
    assert result[1]["title"] == "iPhone sales surge"


# ---------------------------------------------------------------------------
# test_fetch_news_without_as_of_date_uses_yfinance
# ---------------------------------------------------------------------------

def test_fetch_news_without_as_of_date_uses_yfinance():
    """When as_of_date is None, yfinance .news should be used (live behavior)."""
    yf_news = [
        _make_yfinance_news_item("Apple announces new product", "2025-03-01T09:00:00"),
        _make_yfinance_news_item("Market rally continues", "2025-03-01T08:00:00"),
    ]

    mock_ticker = MagicMock()
    mock_ticker.news = yf_news

    with patch("agents.data.market.yf.Ticker", return_value=mock_ticker) as mock_yf_ticker:
        from agents.data.market import fetch_news
        result = fetch_news("AAPL")  # no as_of_date

    mock_yf_ticker.assert_called_once_with("AAPL")
    assert len(result) == 2
    assert result[0]["title"] == "Apple announces new product"
    assert result[1]["title"] == "Market rally continues"


# ---------------------------------------------------------------------------
# test_fetch_news_alpaca_error_falls_back_gracefully
# ---------------------------------------------------------------------------

def test_fetch_news_alpaca_error_falls_back_gracefully():
    """When Alpaca NewsClient raises, fetch_news should return [] without crashing."""
    mock_client_instance = MagicMock()
    mock_client_instance.get_news.side_effect = Exception("Alpaca API unavailable")

    with patch("agents.data.market.NewsClient", return_value=mock_client_instance):
        from agents.data.market import fetch_news
        result = fetch_news("AAPL", as_of_date="2025-01-15")

    assert result == []
