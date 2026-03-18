"""Market data fetcher — wraps yfinance for OHLCV, fundamentals, and news."""

import yfinance as yf


def fetch_ohlcv(ticker: str, period: str = "90d", interval: str = "1d") -> list[dict]:
    df = yf.download(ticker, period=period, interval=interval, progress=False)
    if df.empty:
        return []
    # Flatten multi-level columns (yfinance returns ('Close', 'AAPL') style)
    df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
    df = df.reset_index()
    date_col = "Datetime" if "Datetime" in df.columns else "Date"
    records = []
    for _, row in df.iterrows():
        records.append({
            "date": str(row[date_col])[:10],
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })
    return records


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


def fetch_news(ticker: str) -> list[dict]:
    t = yf.Ticker(ticker)
    news = t.news or []
    return [
        {"title": n.get("content", {}).get("title", ""), "published": n.get("content", {}).get("pubDate", "")}
        for n in news[:10]
    ]
