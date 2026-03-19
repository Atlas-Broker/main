"""Market data fetcher — wraps yfinance for OHLCV, fundamentals, and news.

For historical (backtest) runs, news is sourced from the Alpaca News API so
that only articles published before `as_of_date` are included — eliminating
look-ahead bias.  Live runs continue to use yfinance news.
"""

import logging
import os
from datetime import datetime, timedelta

import yfinance as yf
from alpaca.data.historical import NewsClient
from alpaca.data.requests import NewsRequest

logger = logging.getLogger(__name__)


def fetch_ohlcv(
    ticker: str,
    period: str = "90d",
    interval: str = "1d",
    as_of_date: str | None = None,
) -> list[dict]:
    if as_of_date:
        end_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
        start_dt = end_dt - timedelta(days=90)
        # end is exclusive in yfinance — add 1 day to include as_of_date
        df = yf.download(
            ticker,
            start=start_dt.strftime("%Y-%m-%d"),
            end=(end_dt + timedelta(days=1)).strftime("%Y-%m-%d"),
            interval=interval,
            progress=False,
        )
    else:
        df = yf.download(ticker, period=period, interval=interval, progress=False)

    if df.empty:
        return []
    # Flatten multi-level columns (yfinance returns ('Close', 'AAPL') style)
    df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
    df = df.reset_index()
    # Detect the date column — yfinance names it 'Datetime' (intraday) or 'Date' (daily);
    # unnamed indexes become 'index' after reset_index (e.g. in tests)
    if "Datetime" in df.columns:
        date_col = "Datetime"
    elif "Date" in df.columns:
        date_col = "Date"
    else:
        date_col = "index"
    return [
        {
            "date": str(row[date_col])[:10],
            "open":   round(float(row["Open"]),   4),
            "high":   round(float(row["High"]),   4),
            "low":    round(float(row["Low"]),    4),
            "close":  round(float(row["Close"]),  4),
            "volume": int(row["Volume"]),
        }
        for _, row in df.iterrows()
    ]


def fetch_next_open(ticker: str, after_date: str) -> float | None:
    """Return the first available open price strictly after after_date."""
    start_dt = datetime.strptime(after_date, "%Y-%m-%d") + timedelta(days=1)
    end_dt = start_dt + timedelta(days=7)  # buffer for weekends/holidays
    df = yf.download(
        ticker,
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
        interval="1d",
        progress=False,
    )
    if df.empty:
        return None
    df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
    return float(df["Open"].iloc[0])


def fetch_info(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    info = t.info or {}
    keys = [
        "shortName", "sector", "industry",
        "trailingPE", "forwardPE", "priceToBook",
        "revenueGrowth", "earningsGrowth", "profitMargins",
        "debtToEquity", "returnOnEquity", "currentRatio",
        "marketCap", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
        "currentPrice", "targetMeanPrice", "recommendationMean",
    ]
    return {k: info.get(k) for k in keys}


def fetch_news(ticker: str, as_of_date: str | None = None) -> list[dict]:
    """Fetch recent news for *ticker*.

    Args:
        ticker: Stock ticker symbol (e.g. "AAPL").
        as_of_date: ISO date string (``"YYYY-MM-DD"``).  When provided, the
            Alpaca News API is used so that only articles published **before**
            this date are returned — preventing look-ahead bias in backtests.
            When ``None``, yfinance is used (live trading, current news).

    Returns:
        List of dicts with ``title`` and ``published`` keys (max 10 items).
        Returns an empty list on error rather than raising.
    """
    if as_of_date:
        return _fetch_news_alpaca(ticker, as_of_date)
    return _fetch_news_yfinance(ticker)


def _fetch_news_alpaca(ticker: str, as_of_date: str) -> list[dict]:
    """Use the Alpaca News API to fetch articles published before *as_of_date*."""
    try:
        api_key = os.environ["ALPACA_API_KEY"]
        secret_key = os.environ["ALPACA_SECRET_KEY"]
        end_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
        client = NewsClient(api_key=api_key, secret_key=secret_key)
        request = NewsRequest(symbols=ticker, end=end_dt, limit=10)
        news = client.get_news(request)
        return [
            {
                "title": article.headline,
                "published": article.created_at.isoformat() if article.created_at else "",
            }
            for article in news
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alpaca news fetch failed for %s (as_of=%s): %s", ticker, as_of_date, exc)
        return []


def _fetch_news_yfinance(ticker: str) -> list[dict]:
    """Use yfinance to fetch current news (live trading path)."""
    t = yf.Ticker(ticker)
    news = t.news or []
    return [
        {
            "title": n.get("content", {}).get("title", ""),
            "published": n.get("content", {}).get("pubDate", ""),
        }
        for n in news[:10]
    ]
