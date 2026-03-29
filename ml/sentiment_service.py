"""
GoldSense ML Pipeline — Global News Sentiment Analysis

Fetches real-time gold market news and computes a daily sentiment score.

Sources (priority order):
  1. Alpha Vantage News Sentiment API (gold-specific, pre-scored) — needs free key
  2. NewsAPI (broad financial news)                               — needs free key
  3. Google News RSS (always free, no key needed)                 — fallback
  4. Yahoo Finance RSS (always free)                              — fallback

Sentiment engine:
  - Primary:  VADER (Valence Aware Dictionary, fast, no model download)
  - Fallback: keyword-based gold sentiment scoring

Output:
  - sentiment_score:  float -1.0 (Bearish) to +1.0 (Bullish)
  - sentiment_label:  "Bullish" | "Neutral" | "Bearish"
  - top_headlines:    list[dict] — title + score per article
  - Daily cache in dataset/sentiment_logs.csv (becomes training feature over time)
"""

import os
import json
import logging
import warnings
import urllib.request
import urllib.parse
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import date, datetime, timedelta
from typing import Optional

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

# ─── Paths ─────────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).parent.parent
DATASET_DIR   = ROOT / "dataset"
SENTIMENT_CSV = DATASET_DIR / "sentiment_logs.csv"
CACHE_FILE    = DATASET_DIR / "sentiment_cache.json"

CACHE_TTL_HOURS = 4   # Re-fetch news every 4 hours

# ─── Gold relevance keywords ────────────────────────────────────────────────────
GOLD_KEYWORDS = [
    "gold", "xau", "bullion", "gold price", "gold futures", "gold etf",
    "precious metal", "gold market", "comex", "spot gold", "gold demand",
    "central bank gold", "gold reserve", "gold rally", "gold selloff",
    "gold rate", "gold import", "mcx gold",
]
BULLISH_KEYWORDS = [
    "rise", "surge", "rally", "gain", "climb", "jump", "soar", "record",
    "bullish", "strong", "high", "buy", "demand", "inflow", "safe haven",
    "geopolitical", "inflation hedge", "rate cut", "dollar weak",
]
BEARISH_KEYWORDS = [
    "fall", "drop", "decline", "crash", "selloff", "bearish", "weak",
    "pressure", "tumble", "plunge", "outflow", "rate hike", "dollar strong",
    "risk-on", "equities rally",
]

# ─── RSS feed sources (no API key needed) ──────────────────────────────────────
RSS_FEEDS = [
    "https://news.google.com/rss/search?q=gold+price+market&hl=en-US&gl=US&ceid=US:en",
    "https://finance.yahoo.com/rss/headline?s=GC%3DF",
    "https://feeds.marketwatch.com/marketwatch/topstories/",
]


# ─── VADER sentiment (lightweight, no model download) ─────────────────────────

def _vader_score(text: str) -> float:
    """Return VADER compound score (-1 to +1) for a text string."""
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        analyzer = SentimentIntensityAnalyzer()
        return float(analyzer.polarity_scores(text)["compound"])
    except ImportError:
        return _keyword_score(text)


def _keyword_score(text: str) -> float:
    """Fallback keyword-based sentiment scorer when VADER is not installed."""
    text_lower = text.lower()
    bull = sum(1 for kw in BULLISH_KEYWORDS if kw in text_lower)
    bear = sum(1 for kw in BEARISH_KEYWORDS if kw in text_lower)
    total = bull + bear
    if total == 0:
        return 0.0
    return round((bull - bear) / total, 3)


def _gold_relevance(text: str) -> float:
    """Return 0.0–1.0 relevance score for gold topic."""
    text_lower = text.lower()
    hits = sum(1 for kw in GOLD_KEYWORDS if kw in text_lower)
    return min(1.0, hits / 2.0)   # 2+ keyword hits → full relevance


# ─── News Fetchers ─────────────────────────────────────────────────────────────

def _fetch_alpha_vantage(api_key: str, max_articles: int = 50) -> list[dict]:
    """
    Fetch gold news sentiment from Alpha Vantage News Sentiment API.
    Free tier: 25 requests/day — perfect for one daily fetch.
    https://www.alphavantage.co/documentation/#news-sentiment
    """
    try:
        params = urllib.parse.urlencode({
            "function": "NEWS_SENTIMENT",
            "tickers": "GLD",
            "topics": "commodities",
            "sort": "LATEST",
            "limit": max_articles,
            "apikey": api_key,
        })
        url = f"https://www.alphavantage.co/query?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "GoldSense/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        articles = []
        for item in data.get("feed", []):
            # Find GLD-specific sentiment from ticker_sentiment array
            gld_sentiment = 0.0
            relevance     = 0.0
            for ts in item.get("ticker_sentiment", []):
                if ts.get("ticker") == "GLD":
                    gld_sentiment = float(ts.get("ticker_sentiment_score", 0))
                    relevance     = float(ts.get("relevance_score", 0))
                    break

            # Fallback: use overall article sentiment if no ticker match
            if relevance == 0:
                gld_sentiment = float(item.get("overall_sentiment_score", 0))
                relevance     = _gold_relevance(item.get("title", "") + " " + item.get("summary", ""))

            articles.append({
                "title":     item.get("title", ""),
                "source":    item.get("source", "Alpha Vantage"),
                "score":     round(gld_sentiment, 4),
                "relevance": round(relevance, 4),
                "url":       item.get("url", ""),
                "published": item.get("time_published", ""),
            })

        logger.info(f"Alpha Vantage: fetched {len(articles)} articles")
        return articles

    except Exception as e:
        logger.warning(f"Alpha Vantage fetch failed: {e}")
        return []


def _fetch_newsapi(api_key: str, max_articles: int = 30) -> list[dict]:
    """
    Fetch gold news from NewsAPI.
    Free tier: 100 requests/day, articles from last 30 days.
    https://newsapi.org/docs/endpoints/everything
    """
    try:
        yesterday = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
        params = urllib.parse.urlencode({
            "q":          "gold price OR gold market OR XAU",
            "from":       yesterday,
            "sortBy":     "publishedAt",
            "language":   "en",
            "pageSize":   max_articles,
            "apiKey":     api_key,
        })
        url = f"https://newsapi.org/v2/everything?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "GoldSense/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())

        articles = []
        for item in data.get("articles", []):
            text = (item.get("title") or "") + " " + (item.get("description") or "")
            articles.append({
                "title":     item.get("title", ""),
                "source":    (item.get("source") or {}).get("name", "NewsAPI"),
                "score":     _vader_score(text),
                "relevance": _gold_relevance(text),
                "url":       item.get("url", ""),
                "published": item.get("publishedAt", ""),
            })

        logger.info(f"NewsAPI: fetched {len(articles)} articles")
        return articles

    except Exception as e:
        logger.warning(f"NewsAPI fetch failed: {e}")
        return []


def _fetch_rss(max_per_feed: int = 15) -> list[dict]:
    """
    Fetch gold news from free RSS feeds (no API key needed).
    Uses feedparser if available, falls back to urllib + basic XML parsing.
    """
    articles = []

    for feed_url in RSS_FEEDS:
        try:
            feed_articles = _parse_rss_feed(feed_url, max_per_feed)
            articles.extend(feed_articles)
            logger.info(f"RSS {feed_url[:50]}...: {len(feed_articles)} articles")
        except Exception as e:
            logger.debug(f"RSS feed failed ({feed_url[:40]}): {e}")

    return articles


def _parse_rss_feed(url: str, max_items: int) -> list[dict]:
    """Parse an RSS feed URL and return article list."""
    try:
        import feedparser
        feed = feedparser.parse(url)
        entries = feed.entries[:max_items]
    except ImportError:
        # feedparser not installed: basic XML parsing
        entries = _parse_rss_xml(url, max_items)

    results = []
    for entry in entries:
        if isinstance(entry, dict):
            title   = entry.get("title", "")
            summary = entry.get("summary", "") or entry.get("description", "")
            link    = entry.get("link", "") or entry.get("url", "")
            source  = entry.get("source", {}).get("title", "RSS") if isinstance(entry.get("source"), dict) else "RSS"
        else:
            title   = getattr(entry, "title", "")
            summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
            link    = getattr(entry, "link", "")
            source  = getattr(getattr(entry, "source", None), "title", "RSS") if hasattr(entry, "source") else "RSS"

        text      = f"{title} {summary}"
        relevance = _gold_relevance(text)

        # Only include articles with some gold relevance
        if relevance > 0 or any(kw in text.lower() for kw in ["gold", "xau"]):
            results.append({
                "title":     title[:200],
                "source":    source,
                "score":     _vader_score(text),
                "relevance": relevance,
                "url":       link,
                "published": "",
            })

    return results


def _parse_rss_xml(url: str, max_items: int) -> list[dict]:
    """Minimal RSS XML parser when feedparser is unavailable."""
    import re
    req = urllib.request.Request(url, headers={"User-Agent": "GoldSense/1.0"})
    with urllib.request.urlopen(req, timeout=8) as resp:
        content = resp.read().decode("utf-8", errors="ignore")

    titles = re.findall(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", content, re.DOTALL)
    links  = re.findall(r"<link>(.*?)</link>", content, re.DOTALL)

    results = []
    for title, link in zip(titles[1:max_items + 1], links[1:max_items + 1]):
        title = title.strip()
        results.append({
            "title":     title[:200],
            "source":    "RSS",
            "score":     _vader_score(title),
            "relevance": _gold_relevance(title),
            "url":       link.strip(),
            "published": "",
        })
    return results


# ─── Composite Sentiment Score ─────────────────────────────────────────────────

def compute_sentiment_score(articles: list[dict]) -> dict:
    """
    Compute a weighted composite sentiment score from a list of articles.

    Weighting: relevance × (0.5 + 0.5 × recency_boost)
    Higher relevance articles contribute more to the final score.

    Returns:
        dict with score (-1 to +1), label, article count, and top headlines.
    """
    if not articles:
        return {
            "score":      0.0,
            "label":      "Neutral",
            "confidence": "low",
            "article_count": 0,
            "top_headlines": [],
        }

    # Filter out irrelevant articles (relevance < 0.1 and no gold keyword)
    relevant = [a for a in articles if a["relevance"] > 0.0]
    if not relevant:
        relevant = articles  # use all if nothing is specifically gold-relevant

    # Weighted average score (relevance as weight)
    scores     = np.array([a["score"]     for a in relevant])
    relevances = np.array([a["relevance"] for a in relevant])
    weights    = relevances + 0.1   # add small base weight so low-relevance still counts

    weighted_score = float(np.average(scores, weights=weights))
    weighted_score = max(-1.0, min(1.0, weighted_score))  # clip to [-1, +1]

    # Label
    if weighted_score >= 0.05:
        label = "Bullish"
    elif weighted_score <= -0.05:
        label = "Bearish"
    else:
        label = "Neutral"

    # Confidence based on article count and relevance
    if len(relevant) >= 10 and relevances.mean() > 0.3:
        confidence = "high"
    elif len(relevant) >= 5:
        confidence = "medium"
    else:
        confidence = "low"

    # Top 5 most relevant articles (sorted by |score| × relevance)
    top = sorted(relevant, key=lambda a: abs(a["score"]) * (a["relevance"] + 0.1), reverse=True)[:5]

    return {
        "score":         round(weighted_score, 4),
        "label":         label,
        "confidence":    confidence,
        "article_count": len(relevant),
        "top_headlines": [
            {
                "title":     a["title"],
                "source":    a["source"],
                "sentiment": round(a["score"], 3),
                "label":     "Bullish" if a["score"] >= 0.05 else ("Bearish" if a["score"] <= -0.05 else "Neutral"),
                "url":       a["url"],
            }
            for a in top
        ],
    }


# ─── Cache helpers ─────────────────────────────────────────────────────────────

def _load_cache() -> Optional[dict]:
    """Load cached sentiment if it's fresh (< CACHE_TTL_HOURS old)."""
    if not CACHE_FILE.exists():
        return None
    try:
        with open(CACHE_FILE) as f:
            cache = json.load(f)
        fetched_at = datetime.fromisoformat(cache.get("fetched_at", "2000-01-01"))
        age_hours  = (datetime.utcnow() - fetched_at).total_seconds() / 3600
        if age_hours < CACHE_TTL_HOURS:
            logger.info(f"Sentiment from cache ({age_hours:.1f}h old)")
            return cache
    except Exception:
        pass
    return None


def _save_cache(result: dict):
    """Save current sentiment to cache file."""
    cache = {**result, "fetched_at": datetime.utcnow().isoformat()}
    CACHE_FILE.parent.mkdir(exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def log_daily_sentiment(result: dict, today: date = None):
    """
    Append today's sentiment score to the historical log CSV.
    This CSV is used as a training feature once enough data is collected.
    """
    if today is None:
        today = date.today()

    row = {
        "date":          str(today),
        "sentiment_score": result["score"],
        "sentiment_label": result["label"],
        "confidence":    result["confidence"],
        "article_count": result["article_count"],
        "created_at":    datetime.utcnow().isoformat(),
    }

    SENTIMENT_CSV.parent.mkdir(exist_ok=True)
    if SENTIMENT_CSV.exists():
        df = pd.read_csv(SENTIMENT_CSV)
        # Avoid duplicate entries for the same date
        if str(today) not in df["date"].values:
            df = pd.concat([pd.DataFrame([row]), df], ignore_index=True)
            df.to_csv(SENTIMENT_CSV, index=False)
    else:
        pd.DataFrame([row]).to_csv(SENTIMENT_CSV, index=False)


def load_sentiment_history(lookback_days: int = 90) -> pd.DataFrame:
    """
    Load historical daily sentiment scores.
    Used by preprocess.py to add sentiment as a training feature.
    """
    if not SENTIMENT_CSV.exists():
        return pd.DataFrame(columns=["date", "sentiment_score", "sentiment_label"])

    df = pd.read_csv(SENTIMENT_CSV)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date", ascending=False).head(lookback_days)
    return df


# ─── Main Entry Point ──────────────────────────────────────────────────────────

def get_gold_sentiment(
    alpha_vantage_key: str = None,
    newsapi_key:       str = None,
    force_refresh:     bool = False,
) -> dict:
    """
    Fetch and return current gold market sentiment.

    Priority:
      1. Return cached result if fresh (< 4 hours old) — unless force_refresh=True
      2. Alpha Vantage News Sentiment API (if key provided)
      3. NewsAPI (if key provided)
      4. RSS feeds (always available, no key needed)

    Returns:
        {
          "score":         float,     # -1.0 (Bearish) to +1.0 (Bullish)
          "label":         str,       # "Bullish" | "Neutral" | "Bearish"
          "confidence":    str,       # "high" | "medium" | "low"
          "article_count": int,
          "top_headlines": list[dict],
          "source":        str,       # which data source was used
          "fetched_at":    str,       # ISO timestamp
        }
    """
    # Try cache first
    if not force_refresh:
        cached = _load_cache()
        if cached:
            return cached

    # ── Resolve API keys from environment if not passed directly ──
    av_key  = alpha_vantage_key or os.environ.get("ALPHAVANTAGE_KEY", "")
    news_key = newsapi_key      or os.environ.get("NEWSAPI_KEY", "")

    articles = []
    source   = "rss"

    # Priority 1: Alpha Vantage (pre-scored, gold-specific)
    if av_key:
        articles = _fetch_alpha_vantage(av_key)
        if articles:
            source = "alpha_vantage"

    # Priority 2: NewsAPI
    if not articles and news_key:
        articles = _fetch_newsapi(news_key)
        if articles:
            source = "newsapi"

    # Priority 3: RSS feeds (always works, no key)
    if not articles:
        articles = _fetch_rss()
        source   = "rss"

    result = compute_sentiment_score(articles)
    result["source"]     = source
    result["fetched_at"] = datetime.utcnow().isoformat()
    result["date"]       = str(date.today())

    # Persist
    _save_cache(result)
    log_daily_sentiment(result)

    logger.info(
        f"Sentiment: {result['label']} ({result['score']:+.3f}) "
        f"from {result['article_count']} articles [{source}]"
    )
    return result


def sentiment_signal(sentiment_score: float, price_trend: str) -> str:
    """
    Classify whether sentiment supports or contradicts the price prediction.

    Args:
        sentiment_score: float -1.0 to +1.0
        price_trend:     "up" | "down" | "stable"

    Returns:
        "Supports"    — news aligns with prediction direction
        "Contradicts" — news opposes prediction direction
        "Neutral"     — sentiment is neutral or trend is stable
    """
    if abs(sentiment_score) < 0.05 or price_trend == "stable":
        return "Neutral"

    bullish = sentiment_score > 0
    predicting_up = price_trend == "up"

    if bullish == predicting_up:
        return "Supports"
    else:
        return "Contradicts"


if __name__ == "__main__":
    import sys

    force = "--refresh" in sys.argv
    av_key = os.environ.get("ALPHAVANTAGE_KEY")
    news_key = os.environ.get("NEWSAPI_KEY")

    print("=" * 55)
    print("GoldSense — News Sentiment Analysis")
    print("=" * 55)

    result = get_gold_sentiment(
        alpha_vantage_key=av_key,
        newsapi_key=news_key,
        force_refresh=force,
    )

    print(f"\nSentiment Score: {result['score']:+.4f}")
    print(f"Label:           {result['label']}")
    print(f"Confidence:      {result['confidence']}")
    print(f"Articles:        {result['article_count']}")
    print(f"Source:          {result['source']}")
    print(f"Fetched at:      {result['fetched_at']}")

    print(f"\nTop Headlines:")
    for i, h in enumerate(result["top_headlines"], 1):
        print(f"  {i}. [{h['label']:7}] {h['title'][:80]}")
        print(f"     Score: {h['sentiment']:+.3f} | {h['source']}")
