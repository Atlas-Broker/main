"""Market data fetcher — wraps yfinance for OHLCV and fundamentals.

News is sourced exclusively from the Alpaca News API for both backtest and live
runs.  Backtest calls pass an `end` bound equal to `as_of_date` to prevent
look-ahead bias.  Live calls apply a 7-day `start` bound for recency.
"""

import logging
import os
import time
from datetime import datetime, timedelta

import yfinance as yf
from alpaca.data.historical import NewsClient
from alpaca.data.requests import NewsRequest

logger = logging.getLogger(__name__)

_INFO_KEYS = [
    "shortName", "sector", "industry",
    "trailingPE", "forwardPE", "priceToBook",
    "revenueGrowth", "earningsGrowth", "profitMargins",
    "debtToEquity", "returnOnEquity", "currentRatio",
    "marketCap", "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
    "currentPrice", "targetMeanPrice", "recommendationMean",
]


def _safe_float(val) -> float:
    """Convert a value that may be a pandas Series or scalar to float."""
    if hasattr(val, "iloc"):
        return float(val.iloc[0])
    return float(val)


def _ticker_history(ticker: str, retries: int = 3, **kwargs):
    """Fetch OHLCV via yf.Ticker.history() with exponential backoff.

    Using Ticker.history() instead of yf.download() avoids the MultiIndex
    column structure that causes 'float() argument must be a Series' errors
    when iterating rows.
    """
    t = yf.Ticker(ticker)
    for attempt in range(retries):
        try:
            df = t.history(**kwargs)
            if df is not None and not df.empty:
                return df
        except Exception as exc:
            logger.warning("yfinance history attempt %d for %s: %s", attempt + 1, ticker, exc)
        if attempt < retries - 1:
            time.sleep(2 ** attempt)  # 1s, 2s, 4s
    return None


def fetch_ohlcv(
    ticker: str,
    period: str = "90d",
    interval: str = "1d",
    as_of_date: str | None = None,
) -> list[dict]:
    try:
        if as_of_date:
            end_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
            start_dt = end_dt - timedelta(days=90)
            # end is exclusive — add 1 day to include as_of_date
            df = _ticker_history(
                ticker,
                start=start_dt.strftime("%Y-%m-%d"),
                end=(end_dt + timedelta(days=1)).strftime("%Y-%m-%d"),
                interval=interval,
                auto_adjust=True,
            )
        else:
            df = _ticker_history(ticker, period=period, interval=interval, auto_adjust=True)

        if df is None or df.empty:
            return []

        df = df.reset_index()
        # Ticker.history() uses 'Datetime' for intraday, 'Date' for daily
        date_col = next((c for c in ("Datetime", "Date") if c in df.columns), df.columns[0])

        rows = []
        for _, row in df.iterrows():
            try:
                rows.append({
                    "date":   str(row[date_col])[:10],
                    "open":   round(_safe_float(row["Open"]),   4),
                    "high":   round(_safe_float(row["High"]),   4),
                    "low":    round(_safe_float(row["Low"]),    4),
                    "close":  round(_safe_float(row["Close"]),  4),
                    "volume": int(_safe_float(row["Volume"])),
                })
            except (TypeError, ValueError, KeyError):
                continue
        return rows
    except Exception as exc:
        logger.warning("fetch_ohlcv failed for %s (as_of=%s): %s", ticker, as_of_date, exc)
        return []


def fetch_next_open(ticker: str, after_date: str) -> float | None:
    """Return the first available open price strictly after after_date."""
    try:
        start_dt = datetime.strptime(after_date, "%Y-%m-%d") + timedelta(days=1)
        end_dt = start_dt + timedelta(days=7)  # buffer for weekends/holidays
        df = _ticker_history(
            ticker,
            start=start_dt.strftime("%Y-%m-%d"),
            end=end_dt.strftime("%Y-%m-%d"),
            interval="1d",
            auto_adjust=True,
        )
        if df is None or df.empty:
            return None
        return float(df["Open"].iloc[0])
    except Exception as exc:
        logger.warning("fetch_next_open failed for %s after %s: %s", ticker, after_date, exc)
        return None


def fetch_info(ticker: str) -> dict:
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
    except Exception as exc:
        logger.warning("yfinance fetch_info failed for %s: %s", ticker, exc)
        info = {}
    return {k: info.get(k) for k in _INFO_KEYS}


def fetch_news(ticker: str, as_of_date: str | None = None) -> list[dict]:
    """Fetch recent news for *ticker* via Alpaca News API.

    Args:
        ticker: Stock ticker symbol (e.g. "AAPL").
        as_of_date: ISO date string (``"YYYY-MM-DD"``).  When provided, only
            articles published **before** this date are returned — preventing
            look-ahead bias in backtests.  When ``None`` (live mode), articles
            from the past 7 days are returned.

    Returns:
        List of dicts with ``title`` and ``published`` keys (max 10 items).
        Returns an empty list on error rather than raising.
    """
    return _fetch_news_alpaca(ticker, as_of_date)


def _fetch_news_alpaca(ticker: str, as_of_date: str | None = None) -> list[dict]:
    """Fetch news via Alpaca News API.

    Backtest path: ``as_of_date`` set — applies ``end`` bound to prevent look-ahead bias.
    Live path: ``as_of_date`` is None — applies ``start = now - 7d`` for recency.
    """
    try:
        api_key = os.environ["ALPACA_API_KEY"]
        secret_key = os.environ["ALPACA_SECRET_KEY"]
        client = NewsClient(api_key=api_key, secret_key=secret_key)
        if as_of_date:
            end_dt = datetime.strptime(as_of_date, "%Y-%m-%d")
            request = NewsRequest(symbols=ticker, end=end_dt, limit=10)
        else:
            start_dt = datetime.now().replace(tzinfo=None) - timedelta(days=7)
            request = NewsRequest(symbols=ticker, start=start_dt, limit=10)
        news_set = client.get_news(request)
        # NewsSet.data is {"news": [News, ...]}
        articles = news_set.data.get("news", []) if hasattr(news_set, "data") else []
        return [
            {
                "title": a.headline,
                "published": a.created_at.isoformat() if a.created_at else "",
            }
            for a in articles
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alpaca news fetch failed for %s (as_of=%s): %s", ticker, as_of_date, exc)
        return []


def _fetch_news_yfinance(ticker: str) -> list[dict]:
    """Deprecated — superseded by _fetch_news_alpaca for all code paths.

    Retained for reference only; not called from fetch_news.
    """
    import warnings
    warnings.warn(
        "_fetch_news_yfinance is deprecated; use _fetch_news_alpaca instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    t = yf.Ticker(ticker)
    news = t.news or []
    return [
        {
            "title": n.get("content", {}).get("title", ""),
            "published": n.get("content", {}).get("pubDate", ""),
        }
        for n in news[:10]
    ]
