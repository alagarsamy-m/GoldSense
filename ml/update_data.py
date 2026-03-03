"""
GoldSense ML Pipeline — Data Updater
Fetches latest gold price and USD/INR data via yfinance,
appends new rows to Gold Rate.csv and USD-INR.csv.
"""

import sys
import pandas as pd
import numpy as np
import yfinance as yf
from pathlib import Path
from datetime import date, timedelta

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATASET_DIR = ROOT / "dataset"
GOLD_CSV = DATASET_DIR / "Gold Rate.csv"
USDINR_CSV = DATASET_DIR / "USD-INR.csv"

# yfinance tickers
GOLD_TICKER = "GC=F"      # Gold Futures (USD/troy oz)
USDINR_TICKER = "USDINR=X"  # USD/INR spot rate


def read_last_date(csv_path: Path, date_col: str = "Date") -> date:
    """Read the last date in an existing CSV (accounting for comment lines + BOM)."""
    df = pd.read_csv(csv_path, skiprows=2, encoding="utf-8-sig", nrows=5)
    df.columns = df.columns.str.strip()

    # Try MM/DD/YYYY (Gold) and DD-MM-YYYY (USD-INR)
    for fmt in ["%m/%d/%Y", "%d-%m-%Y"]:
        try:
            last_date = pd.to_datetime(df[date_col], format=fmt).max().date()
            return last_date
        except (ValueError, KeyError):
            continue
    raise ValueError(f"Cannot parse date in {csv_path}")


def fetch_gold_prices(start: date, end: date) -> pd.DataFrame:
    """
    Fetch gold futures prices via yfinance.
    Returns DataFrame with columns: Date, Price, Open, High, Low, Vol., Change %
    Date format: MM/DD/YYYY to match investing.com format
    """
    print(f"  Fetching gold prices: {start} → {end}")
    ticker = yf.Ticker(GOLD_TICKER)
    hist = ticker.history(start=str(start), end=str(end + timedelta(days=1)))

    if hist.empty:
        print("  No new gold data available.")
        return pd.DataFrame()

    hist.index = pd.to_datetime(hist.index).tz_localize(None)

    df = pd.DataFrame({
        "Date": hist.index.strftime("%m/%d/%Y"),
        "Price": hist["Close"].round(2),
        "Open": hist["Open"].round(2),
        "High": hist["High"].round(2),
        "Low": hist["Low"].round(2),
        "Vol.": hist["Volume"].apply(_format_volume),
        "Change %": _calculate_change_pct(hist["Close"]),
    })

    print(f"  Fetched {len(df)} new gold rows")
    return df


def fetch_usdinr(start: date, end: date) -> pd.DataFrame:
    """
    Fetch USD/INR exchange rate via yfinance.
    Returns DataFrame with columns: Date, Price, Open, High, Low, Vol., Change %
    Date format: DD-MM-YYYY to match investing.com format
    """
    print(f"  Fetching USD/INR rates: {start} → {end}")
    ticker = yf.Ticker(USDINR_TICKER)
    hist = ticker.history(start=str(start), end=str(end + timedelta(days=1)))

    if hist.empty:
        print("  No new USD/INR data available.")
        return pd.DataFrame()

    hist.index = pd.to_datetime(hist.index).tz_localize(None)

    df = pd.DataFrame({
        "Date": hist.index.strftime("%d-%m-%Y"),
        "Price": hist["Close"].round(3),
        "Open": hist["Open"].round(3),
        "High": hist["High"].round(3),
        "Low": hist["Low"].round(3),
        "Vol.": "",
        "Change %": _calculate_change_pct(hist["Close"]),
    })

    print(f"  Fetched {len(df)} new USD/INR rows")
    return df


def _format_volume(vol: float) -> str:
    """Format volume number to string like '46.50K'."""
    if pd.isna(vol) or vol == 0:
        return ""
    if vol >= 1_000_000:
        return f"{vol/1_000_000:.2f}M"
    if vol >= 1_000:
        return f"{vol/1_000:.2f}K"
    return str(int(vol))


def _calculate_change_pct(close: pd.Series) -> pd.Series:
    """Calculate daily % change."""
    pct = close.pct_change() * 100
    return pct.round(2).astype(str).replace("nan", "") + "%"


def append_to_csv(csv_path: Path, new_rows: pd.DataFrame):
    """
    Append new rows to an investing.com-format CSV.
    Maintains the comment header and existing data intact.
    New rows are prepended (newest first — investing.com convention).
    """
    if new_rows.empty:
        return

    # Read existing file contents
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        content = f.read()

    lines = content.split("\n")

    # Find header line index (first line starting with "Date" or containing "Price")
    header_idx = 0
    for i, line in enumerate(lines):
        if "Date" in line and "Price" in line:
            header_idx = i
            break

    comment_lines = "\n".join(lines[:header_idx])
    header_line = lines[header_idx]
    data_lines = "\n".join(lines[header_idx + 1:])

    # Format new rows as CSV strings (matching investing.com format with quotes)
    new_csv_rows = []
    for _, row in new_rows.iterrows():
        parts = [f'"{row["Date"]}"', f'"{row["Price"]}"', f'"{row["Open"]}"',
                 f'"{row["High"]}"', f'"{row["Low"]}"', f'"{row.get("Vol.", "")}"',
                 f'"{row["Change %"]}"']
        new_csv_rows.append(",".join(parts))

    # Reconstruct file: comments + header + new rows + existing data
    new_content = (
        comment_lines + "\n" +
        header_line + "\n" +
        "\n".join(new_csv_rows) + "\n" +
        data_lines
    )

    with open(csv_path, "w", encoding="utf-8-sig") as f:
        f.write(new_content)

    print(f"  Appended {len(new_rows)} rows to {csv_path.name}")


def update_datasets():
    """Main function: fetch new data and update both CSV files."""
    print("=" * 55)
    print("GoldSense — Dataset Update (yfinance)")
    print("=" * 55)

    today = date.today()

    # ── Gold Price ─────────────────────────────────────────────────
    print("\n[Gold Rate.csv]")
    gold_last_date = read_last_date(GOLD_CSV)
    print(f"  Last date in CSV: {gold_last_date}")

    gold_start = gold_last_date + timedelta(days=1)
    if gold_start > today:
        print("  Already up to date.")
    else:
        gold_new = fetch_gold_prices(gold_start, today)
        if not gold_new.empty:
            append_to_csv(GOLD_CSV, gold_new)

    # ── USD/INR ────────────────────────────────────────────────────
    print("\n[USD-INR.csv]")
    usdinr_last_date = read_last_date(USDINR_CSV)
    print(f"  Last date in CSV: {usdinr_last_date}")

    usdinr_start = usdinr_last_date + timedelta(days=1)
    if usdinr_start > today:
        print("  Already up to date.")
    else:
        usdinr_new = fetch_usdinr(usdinr_start, today)
        if not usdinr_new.empty:
            append_to_csv(USDINR_CSV, usdinr_new)

    print("\nDataset update complete.")
    return True


if __name__ == "__main__":
    try:
        update_datasets()
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
