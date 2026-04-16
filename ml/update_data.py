"""
GoldSense ML pipeline data updater.

Fetches the latest gold price and USD/INR data via a Yahoo Finance provider
stack, normalizes the investing.com-style CSV files, removes duplicate dates,
and keeps files sorted strictly newest-first.
"""

from __future__ import annotations

import sys
import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).parent.parent
DATASET_DIR = ROOT / "dataset"
GOLD_CSV = DATASET_DIR / "Gold Rate.csv"
USDINR_CSV = DATASET_DIR / "USD-INR.csv"

GOLD_TICKER = "GC=F"
USDINR_TICKER = "USDINR=X"
YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
REQUEST_TIMEOUT_SECONDS = 12
REQUEST_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; GoldSenseBot/1.0; +https://gold-sense-five.vercel.app)",
}


def _date_format_for_csv(csv_path: Path) -> str:
    return "%m/%d/%Y" if csv_path.name == "Gold Rate.csv" else "%d-%m-%Y"


def _header_line() -> str:
    return '"Date","Price","Open","High","Low","Vol.","Change %"'


def _read_csv_sections(csv_path: Path) -> tuple[list[str], pd.DataFrame]:
    with open(csv_path, encoding="utf-8-sig") as handle:
        lines = handle.read().splitlines()

    header_index = 0
    for index, line in enumerate(lines):
        if "Date" in line and "Price" in line:
            header_index = index
            break

    comment_lines = lines[:header_index]
    df = pd.read_csv(csv_path, skiprows=3, encoding="utf-8")
    df.columns = df.columns.str.replace("\ufeff", "", regex=False).str.strip('"').str.strip()
    return comment_lines, df


def _format_number(value: object, digits: int) -> str:
    numeric = _to_float(value)
    if numeric is None:
        return ""
    return f"{numeric:.{digits}f}".rstrip("0").rstrip(".")


def _to_float(value: object) -> float | None:
    if value in (None, "", "None") or pd.isna(value):
        return None
    cleaned = str(value).replace(",", "").replace("%", "").strip()
    if cleaned == "":
        return None
    return float(cleaned)


def _normalize_rows(csv_path: Path, df: pd.DataFrame) -> pd.DataFrame:
    fmt = _date_format_for_csv(csv_path)
    work = df.copy()
    work["_source_order"] = range(len(work))
    work["Date"] = pd.to_datetime(work["Date"], format=fmt, errors="coerce")
    work = work.dropna(subset=["Date"])
    work = work.sort_values(["Date", "_source_order"], ascending=[False, True], kind="mergesort")
    work = work.drop_duplicates(subset=["Date"], keep="first")
    work = work.drop(columns=["_source_order"]).reset_index(drop=True)

    price_numeric = work["Price"].apply(_to_float).astype(float)
    previous_close = price_numeric.shift(-1)
    change_values = ((price_numeric - previous_close) / previous_close) * 100

    digits = 2 if csv_path.name == "Gold Rate.csv" else 3
    for column in ("Price", "Open", "High", "Low"):
        work[column] = work[column].apply(lambda value: _format_number(value, digits))
    work["Vol."] = work["Vol."].fillna("").astype(str)
    work["Change %"] = change_values.apply(
        lambda value: "" if pd.isna(value) else f"{value:.2f}%".replace(".00%", "%")
    )
    work["Date"] = work["Date"].dt.strftime(fmt)
    return work[["Date", "Price", "Open", "High", "Low", "Vol.", "Change %"]]


def _write_csv(csv_path: Path, comment_lines: list[str], df: pd.DataFrame) -> None:
    with open(csv_path, "w", encoding="utf-8-sig") as handle:
        if comment_lines:
            handle.write("\n".join(comment_lines) + "\n")
        handle.write(_header_line() + "\n")
        for _, row in df.iterrows():
            values = [
                str(row["Date"]),
                str(row["Price"]),
                str(row["Open"]),
                str(row["High"]),
                str(row["Low"]),
                str(row["Vol."]),
                str(row["Change %"]),
            ]
            handle.write(",".join(f'"{value}"' for value in values) + "\n")


def _load_existing(csv_path: Path) -> tuple[list[str], pd.DataFrame]:
    comments, raw = _read_csv_sections(csv_path)
    normalized = _normalize_rows(csv_path, raw)
    return comments, normalized


def read_last_date(csv_path: Path) -> date:
    _, df = _load_existing(csv_path)
    fmt = _date_format_for_csv(csv_path)
    dates = pd.to_datetime(df["Date"], format=fmt)
    return dates.max().date()


def _previous_close(csv_path: Path) -> float | None:
    _, df = _load_existing(csv_path)
    if df.empty:
        return None
    return float(str(df.iloc[0]["Price"]).replace(",", ""))


def _calculate_change_strings(close_series: pd.Series, previous_close: float | None) -> list[str]:
    changes: list[str] = []
    last_close = previous_close
    for close_value in close_series.astype(float):
        if last_close in (None, 0):
            changes.append("")
        else:
            pct = ((close_value - float(last_close)) / float(last_close)) * 100
            changes.append(f"{pct:.2f}%".replace(".00%", "%"))
        last_close = close_value
    return changes


def _format_volume(volume: float) -> str:
    if pd.isna(volume) or float(volume) == 0:
        return ""
    if volume >= 1_000_000:
        return f"{volume / 1_000_000:.2f}M"
    if volume >= 1_000:
        return f"{volume / 1_000:.2f}K"
    return str(int(volume))


def _fetch_chart_history(ticker: str, start: date, end: date) -> pd.DataFrame:
    start_ts = int(datetime.combine(start, time(0, 0), tzinfo=timezone.utc).timestamp())
    end_ts = int(datetime.combine(end + timedelta(days=1), time(0, 0), tzinfo=timezone.utc).timestamp())
    full_url = f"{YAHOO_CHART_BASE_URL}/{ticker}?{urlencode({'period1': start_ts, 'period2': end_ts, 'interval': '1d', 'includePrePost': 'false', 'events': 'div,splits'})}"

    try:
        request = Request(full_url, headers=REQUEST_HEADERS)
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return pd.DataFrame()

    result = ((payload.get("chart") or {}).get("result") or [None])[0]
    if not result:
        return pd.DataFrame()

    timestamps = result.get("timestamp") or []
    quote = (((result.get("indicators") or {}).get("quote") or [None])[0] or {})
    if not timestamps:
        return pd.DataFrame()

    frame = pd.DataFrame(
        {
            "Open": quote.get("open"),
            "High": quote.get("high"),
            "Low": quote.get("low"),
            "Close": quote.get("close"),
            "Volume": quote.get("volume"),
        },
        index=pd.to_datetime(timestamps, unit="s", utc=True).tz_convert(None),
    )
    frame = frame.dropna(subset=["Close"])
    return frame


def _fetch_history(ticker: str, start: date, end: date) -> pd.DataFrame:
    chart_history = _fetch_chart_history(ticker, start, end)
    if not chart_history.empty:
        return chart_history

    try:
        hist = yf.Ticker(ticker).history(start=str(start), end=str(end + timedelta(days=1)))
        if not hist.empty:
            return hist
    except Exception:
        pass

    try:
        hist = yf.download(
            ticker,
            start=str(start),
            end=str(end + timedelta(days=1)),
            interval="1d",
            auto_adjust=False,
            progress=False,
            threads=False,
        )
        if not hist.empty:
            return hist
    except Exception:
        pass

    return pd.DataFrame()


def fetch_gold_prices(start: date, end: date, previous_close: float | None) -> pd.DataFrame:
    print(f"  Fetching gold prices: {start} -> {end}")
    hist = _fetch_history(GOLD_TICKER, start, end)
    if hist.empty:
        print("  No new gold data available.")
        return pd.DataFrame()

    hist.index = pd.to_datetime(hist.index).tz_localize(None)
    close = hist["Close"].round(2)
    df = pd.DataFrame(
        {
            "Date": hist.index.strftime("%m/%d/%Y"),
            "Price": close,
            "Open": hist["Open"].round(2),
            "High": hist["High"].round(2),
            "Low": hist["Low"].round(2),
            "Vol.": hist["Volume"].apply(_format_volume),
            "Change %": _calculate_change_strings(close, previous_close),
        }
    )
    print(f"  Fetched {len(df)} new gold rows")
    return df


def fetch_usdinr(start: date, end: date, previous_close: float | None) -> pd.DataFrame:
    print(f"  Fetching USD/INR rates: {start} -> {end}")
    hist = _fetch_history(USDINR_TICKER, start, end)
    if hist.empty:
        print("  No new USD/INR data available.")
        return pd.DataFrame()

    hist.index = pd.to_datetime(hist.index).tz_localize(None)
    close = hist["Close"].round(3)
    df = pd.DataFrame(
        {
            "Date": hist.index.strftime("%d-%m-%Y"),
            "Price": close,
            "Open": hist["Open"].round(3),
            "High": hist["High"].round(3),
            "Low": hist["Low"].round(3),
            "Vol.": "",
            "Change %": _calculate_change_strings(close, previous_close),
        }
    )
    print(f"  Fetched {len(df)} new USD/INR rows")
    return df


def merge_and_write_csv(csv_path: Path, new_rows: pd.DataFrame) -> int:
    comments, existing = _load_existing(csv_path)
    if not new_rows.empty:
        combined = pd.concat([new_rows, existing], ignore_index=True)
    else:
        combined = existing

    normalized = _normalize_rows(csv_path, combined)
    existing_dates = set(existing["Date"].astype(str))
    appended_count = sum(1 for value in new_rows.get("Date", []) if str(value) not in existing_dates)
    _write_csv(csv_path, comments, normalized)
    return appended_count


def update_datasets():
    print("=" * 55)
    print("GoldSense - Dataset Update (Yahoo Finance)")
    print("=" * 55)

    today = date.today()

    print("\n[Gold Rate.csv]")
    gold_last_date = read_last_date(GOLD_CSV)
    gold_previous_close = _previous_close(GOLD_CSV)
    print(f"  Last date in CSV: {gold_last_date}")

    gold_start = gold_last_date + timedelta(days=1)
    if gold_start > today:
        print("  Already up to date.")
        appended = merge_and_write_csv(GOLD_CSV, pd.DataFrame())
        print(f"  Normalized {GOLD_CSV.name} (appended {appended} rows)")
    else:
        gold_new = fetch_gold_prices(gold_start, today, gold_previous_close)
        appended = merge_and_write_csv(GOLD_CSV, gold_new)
        print(f"  Appended {appended} rows to {GOLD_CSV.name}")

    print("\n[USD-INR.csv]")
    usdinr_last_date = read_last_date(USDINR_CSV)
    usdinr_previous_close = _previous_close(USDINR_CSV)
    print(f"  Last date in CSV: {usdinr_last_date}")

    usdinr_start = usdinr_last_date + timedelta(days=1)
    if usdinr_start > today:
        print("  Already up to date.")
        appended = merge_and_write_csv(USDINR_CSV, pd.DataFrame())
        print(f"  Normalized {USDINR_CSV.name} (appended {appended} rows)")
    else:
        usdinr_new = fetch_usdinr(usdinr_start, today, usdinr_previous_close)
        appended = merge_and_write_csv(USDINR_CSV, usdinr_new)
        print(f"  Appended {appended} rows to {USDINR_CSV.name}")

    print("\nDataset update complete.")
    return True


if __name__ == "__main__":
    try:
        update_datasets()
        sys.exit(0)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
