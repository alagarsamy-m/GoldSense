"""
Shared market data utilities for GoldSense.

This module centralizes:
- live provider fallback (Alpha Vantage -> Yahoo chart/yfinance -> dataset close)
- Mumbai retail pricing conversion
- trading-calendar helpers used by API responses, evaluation, and snapshots
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd

TROY_OUNCE_TO_GRAMS = 31.1035
DEFAULT_CUSTOMS_DUTY = 0.06
DEFAULT_GST = 0.03
DEFAULT_MUMBAI_PREMIUM_PCT = 0.0
ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query"
YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
REQUEST_TIMEOUT_SECONDS = 12
MARKET_LOCATION = "Mumbai"
DEFAULT_REQUEST_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; GoldSenseBot/1.0; +https://gold-sense-five.vercel.app)",
}


@dataclass
class MarketContext:
    usd_per_oz: float
    usd_inr_rate: float
    as_of: str
    source: str
    market_status: str
    is_live: bool
    verified_date: str
    location: str = MARKET_LOCATION

    def to_dict(self) -> dict[str, Any]:
        return {
            "usd_per_oz": round(float(self.usd_per_oz), 2),
            "usd_inr_rate": round(float(self.usd_inr_rate), 4),
            "as_of": self.as_of,
            "source": self.source,
            "market_status": self.market_status,
            "is_live": self.is_live,
            "verified_date": self.verified_date,
            "location": self.location,
        }


def get_customs_duty() -> float:
    return float(os.environ.get("GOLDSENSE_CUSTOMS_DUTY", DEFAULT_CUSTOMS_DUTY))


def get_gst_rate() -> float:
    return float(os.environ.get("GOLDSENSE_GST", DEFAULT_GST))


def get_mumbai_premium_pct() -> float:
    return float(os.environ.get("GOLDSENSE_MUMBAI_PREMIUM_PCT", DEFAULT_MUMBAI_PREMIUM_PCT))


def build_mumbai_price_breakdown(
    usd_per_oz: float,
    usd_inr_rate: float,
    customs_duty: Optional[float] = None,
    gst_rate: Optional[float] = None,
    premium_pct: Optional[float] = None,
) -> dict[str, Any]:
    customs_duty = get_customs_duty() if customs_duty is None else float(customs_duty)
    gst_rate = get_gst_rate() if gst_rate is None else float(gst_rate)
    premium_pct = get_mumbai_premium_pct() if premium_pct is None else float(premium_pct)

    base_per_gram = (float(usd_per_oz) * float(usd_inr_rate)) / TROY_OUNCE_TO_GRAMS
    landed_per_gram = base_per_gram * (1 + customs_duty)
    taxed_per_gram = landed_per_gram * (1 + gst_rate)
    price_24k = taxed_per_gram * (1 + premium_pct)
    price_22k = price_24k * (22 / 24)

    return {
        "location": MARKET_LOCATION,
        "base_per_gram": round(base_per_gram, 2),
        "price_24k_per_gram": round(price_24k, 2),
        "price_22k_per_gram": round(price_22k, 2),
        "price_24k_per_10g": round(price_24k * 10, 2),
        "price_22k_per_10g": round(price_22k * 10, 2),
        "pricing_formula": {
            "base_formula": "(USD_per_oz * USDINR) / 31.1035",
            "customs_duty_pct": round(customs_duty * 100, 3),
            "gst_pct": round(gst_rate * 100, 3),
            "mumbai_premium_pct": round(premium_pct * 100, 3),
            "notes": "Mumbai spot is modelled from international gold, FX, duty, GST, and a configurable city premium.",
        },
    }


def is_trading_day(day: date) -> bool:
    return day.weekday() < 5


def next_trading_day(day: date) -> date:
    nxt = day + timedelta(days=1)
    while not is_trading_day(nxt):
        nxt += timedelta(days=1)
    return nxt


def previous_trading_day(day: date) -> date:
    prev = day - timedelta(days=1)
    while not is_trading_day(prev):
        prev -= timedelta(days=1)
    return prev


def current_week_bounds(day: Optional[date] = None) -> tuple[date, date]:
    day = day or date.today()
    monday = day - timedelta(days=day.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def current_week_dates(day: Optional[date] = None) -> list[date]:
    monday, _ = current_week_bounds(day)
    return [monday + timedelta(days=offset) for offset in range(7)]


def _request_json(url: str, params: dict[str, Any], headers: Optional[dict[str, str]] = None) -> dict[str, Any]:
    full_url = f"{url}?{urlencode(params)}"
    request = Request(full_url, headers=headers or {})
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def _walk_numeric_candidates(payload: Any, preferred_keys: Iterable[str]) -> Optional[float]:
    preferred_keys = tuple(k.lower() for k in preferred_keys)

    def parse_number(value: Any) -> Optional[float]:
        try:
            if value in (None, "", "None"):
                return None
            return float(str(value).replace(",", "").strip())
        except (TypeError, ValueError):
            return None

    def walk(node: Any) -> Optional[float]:
        if isinstance(node, dict):
            ranked: list[tuple[int, Any]] = []
            for key, value in node.items():
                key_lower = str(key).lower()
                score = 0
                if any(token in key_lower for token in preferred_keys):
                    score += 10
                if "price" in key_lower or "rate" in key_lower or "value" in key_lower or "close" in key_lower:
                    score += 5
                ranked.append((score, value))
            for _, value in sorted(ranked, key=lambda item: item[0], reverse=True):
                parsed = parse_number(value)
                if parsed is not None:
                    return parsed
                nested = walk(value)
                if nested is not None:
                    return nested
        elif isinstance(node, list):
            for item in node:
                parsed = walk(item)
                if parsed is not None:
                    return parsed
        return None

    return walk(payload)


def _fetch_alpha_vantage_gold(apikey: str) -> Optional[float]:
    if not apikey:
        return None
    try:
        payload = _request_json(
            ALPHA_VANTAGE_BASE_URL,
            {
                "function": "GOLD_SILVER_SPOT",
                "symbol": "XAU",
                "apikey": apikey,
            },
        )
        if "Note" in payload or "Information" in payload or "Error Message" in payload:
            return None
        return _walk_numeric_candidates(payload, ("gold", "xau", "price", "spot"))
    except Exception:
        return None


def _fetch_alpha_vantage_fx(apikey: str) -> Optional[float]:
    if not apikey:
        return None
    try:
        payload = _request_json(
            ALPHA_VANTAGE_BASE_URL,
            {
                "function": "CURRENCY_EXCHANGE_RATE",
                "from_currency": "USD",
                "to_currency": "INR",
                "apikey": apikey,
            },
        )
        if "Note" in payload or "Information" in payload or "Error Message" in payload:
            return None
        return _walk_numeric_candidates(payload, ("exchange rate", "inr", "usd"))
    except Exception:
        return None


def _fetch_yfinance_quote(ticker: str) -> Optional[float]:
    try:
        payload = _request_json(
            f"{YAHOO_CHART_BASE_URL}/{ticker}",
            {
                "interval": "1d",
                "range": "5d",
                "includePrePost": "false",
                "events": "div,splits",
            },
            headers=DEFAULT_REQUEST_HEADERS,
        )
        result = ((payload.get("chart") or {}).get("result") or [None])[0]
        if result:
            meta = result.get("meta") or {}
            for field in ("regularMarketPrice", "previousClose"):
                value = meta.get(field)
                if value not in (None, "", "None"):
                    return float(value)

            quote = (((result.get("indicators") or {}).get("quote") or [None])[0] or {})
            closes = [value for value in (quote.get("close") or []) if value not in (None, "", "None")]
            if closes:
                return float(closes[-1])
    except Exception:
        pass

    try:
        import yfinance as yf

        hist = yf.Ticker(ticker).history(period="2d")
        if hist.empty:
            return None
        return float(hist["Close"].iloc[-1])
    except Exception:
        return None


def build_market_context(
    last_verified_usd: float,
    last_verified_usd_inr: float,
    last_verified_date: date,
    alpha_vantage_key: str = "",
) -> MarketContext:
    now = datetime.now(timezone.utc)
    live_gold = _fetch_alpha_vantage_gold(alpha_vantage_key)
    live_fx = _fetch_alpha_vantage_fx(alpha_vantage_key)
    source = "alpha_vantage"
    is_live = True
    market_status = "live"

    if live_gold is None or live_fx is None:
        live_gold = _fetch_yfinance_quote("GC=F")
        live_fx = _fetch_yfinance_quote("USDINR=X")
        source = "yfinance"

    if live_gold is None or live_fx is None:
        live_gold = float(last_verified_usd)
        live_fx = float(last_verified_usd_inr)
        source = "dataset_close"
        is_live = False
        market_status = "delayed"

    return MarketContext(
        usd_per_oz=float(live_gold),
        usd_inr_rate=float(live_fx),
        as_of=now.isoformat().replace("+00:00", "Z"),
        source=source,
        market_status=market_status,
        is_live=is_live,
        verified_date=str(last_verified_date),
    )


def market_context_from_dataframe(df: pd.DataFrame, alpha_vantage_key: str = "") -> MarketContext:
    last_row = df.iloc[-1]
    return build_market_context(
        last_verified_usd=float(last_row["Price"]),
        last_verified_usd_inr=float(last_row["USD_INR"]),
        last_verified_date=last_row["Date"].date(),
        alpha_vantage_key=alpha_vantage_key,
    )


def append_market_metadata(payload: dict[str, Any], market: MarketContext) -> dict[str, Any]:
    payload.update(
        {
            "as_of": market.as_of,
            "source": market.source,
            "market_status": market.market_status,
            "is_live": market.is_live,
            "location": market.location,
        }
    )
    return payload


def read_last_verified_close(dataset_dir: Path) -> Optional[dict[str, Any]]:
    gold_path = dataset_dir / "Gold Rate.csv"
    fx_path = dataset_dir / "USD-INR.csv"
    if not gold_path.exists() or not fx_path.exists():
        return None

    gold = pd.read_csv(gold_path, skiprows=3)
    fx = pd.read_csv(fx_path, skiprows=3)

    gold.columns = gold.columns.str.replace("\ufeff", "", regex=False).str.strip('"').str.strip()
    fx.columns = fx.columns.str.replace("\ufeff", "", regex=False).str.strip('"').str.strip()

    gold["Date"] = pd.to_datetime(gold["Date"], format="%m/%d/%Y")
    fx["Date"] = pd.to_datetime(fx["Date"], format="%d-%m-%Y")
    gold["Price"] = gold["Price"].astype(str).str.replace(",", "", regex=False).astype(float)
    fx["Price"] = fx["Price"].astype(str).str.replace(",", "", regex=False).astype(float)

    gold = gold.sort_values("Date")
    fx = fx.sort_values("Date")
    merged = pd.merge(gold[["Date", "Price"]], fx[["Date", "Price"]], on="Date", how="inner", suffixes=("_usd", "_inr"))
    if merged.empty:
        return None
    last_row = merged.iloc[-1]
    return {
        "date": str(last_row["Date"].date()),
        "usd": float(last_row["Price_usd"]),
        "usd_inr": float(last_row["Price_inr"]),
    }


def market_close_label(day: date) -> str:
    if is_trading_day(day):
        return "trading_session"
    return "market_closed"


def anchor_datetime(day: date) -> str:
    return datetime.combine(day, time(0, 0), tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
