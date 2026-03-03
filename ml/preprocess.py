"""
GoldSense ML Pipeline — Data Preprocessing & Feature Engineering
Parses Gold Rate.csv and USD-INR.csv, merges them, and builds features for XGBoost.
"""

import pandas as pd
import numpy as np
from pathlib import Path
import ta
import warnings
warnings.filterwarnings("ignore")

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATASET_DIR = ROOT / "dataset"
GOLD_CSV = DATASET_DIR / "Gold Rate.csv"
USDINR_CSV = DATASET_DIR / "USD-INR.csv"


# ─── Loaders ──────────────────────────────────────────────────────────────────

def load_gold(path: Path = GOLD_CSV) -> pd.DataFrame:
    """
    Load Gold Rate.csv from investing.com.
    Format: 2 comment lines, then BOM+header, then data rows (newest first).
    Date format: MM/DD/YYYY  (e.g. "03/03/2026")
    Price column: "5,315.36" (comma-separated thousands)
    """
    df = pd.read_csv(
        path,
        skiprows=2,              # skip "# CSV-File created..." lines
        encoding="utf-8-sig",    # handle BOM (\ufeff)
        thousands=",",
    )
    df.columns = df.columns.str.strip()

    # Parse date
    df["Date"] = pd.to_datetime(df["Date"], format="%m/%d/%Y")

    # Clean numeric columns
    for col in ["Price", "Open", "High", "Low"]:
        if col in df.columns:
            df[col] = (
                df[col].astype(str)
                .str.replace(",", "", regex=False)
                .str.strip()
                .replace("", np.nan)
                .astype(float)
            )

    # Clean Vol. column (e.g. "46.50K" → 46500)
    if "Vol." in df.columns:
        df["Vol."] = _parse_volume(df["Vol."])

    # Clean Change % column
    if "Change %" in df.columns:
        df["Change %"] = (
            df["Change %"].astype(str)
            .str.replace("%", "", regex=False)
            .str.strip()
            .replace("", np.nan)
            .astype(float)
        )

    df = df.sort_values("Date").reset_index(drop=True)
    df = df.dropna(subset=["Price"])
    return df[["Date", "Price", "Open", "High", "Low", "Vol.", "Change %"]]


def load_usdinr(path: Path = USDINR_CSV) -> pd.DataFrame:
    """
    Load USD-INR.csv from investing.com.
    Date format: DD-MM-YYYY  (e.g. "03-03-2026")
    """
    df = pd.read_csv(
        path,
        skiprows=2,
        encoding="utf-8-sig",
        thousands=",",
    )
    df.columns = df.columns.str.strip()

    # Parse date — format differs from gold file
    df["Date"] = pd.to_datetime(df["Date"], format="%d-%m-%Y")

    for col in ["Price", "Open", "High", "Low"]:
        if col in df.columns:
            df[col] = (
                df[col].astype(str)
                .str.replace(",", "", regex=False)
                .str.strip()
                .replace("", np.nan)
                .astype(float)
            )

    df = df.sort_values("Date").reset_index(drop=True)
    df = df.dropna(subset=["Price"])
    return df[["Date", "Price"]].rename(columns={"Price": "USD_INR"})


def _parse_volume(series: pd.Series) -> pd.Series:
    """Convert volume strings like '46.50K' or '1.77M' to float."""
    def _convert(v):
        if pd.isna(v) or str(v).strip() in ("", "-"):
            return np.nan
        v = str(v).strip().upper().replace(",", "")
        try:
            if v.endswith("K"):
                return float(v[:-1]) * 1_000
            if v.endswith("M"):
                return float(v[:-1]) * 1_000_000
            if v.endswith("B"):
                return float(v[:-1]) * 1_000_000_000
            return float(v)
        except ValueError:
            return np.nan
    return series.apply(_convert)


# ─── Merge ────────────────────────────────────────────────────────────────────

def merge_datasets(gold_df: pd.DataFrame, usdinr_df: pd.DataFrame) -> pd.DataFrame:
    """
    Inner-join gold price and USD/INR on Date.
    Forward-fill up to 3 days to handle minor gaps (holidays).
    """
    # Create a complete date range and forward-fill USD/INR (forex trades more days)
    date_range = pd.date_range(
        start=max(gold_df["Date"].min(), usdinr_df["Date"].min()),
        end=min(gold_df["Date"].max(), usdinr_df["Date"].max()),
        freq="D",
    )
    usdinr_full = (
        usdinr_df.set_index("Date")
        .reindex(date_range)
        .ffill(limit=3)
        .reset_index()
        .rename(columns={"index": "Date"})
    )

    merged = pd.merge(gold_df, usdinr_full, on="Date", how="inner")
    merged = merged.sort_values("Date").reset_index(drop=True)
    return merged


# ─── Feature Engineering ──────────────────────────────────────────────────────

def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build all XGBoost features:
    - Lag features (1, 2, 3, 5, 7, 14, 21, 30 days)
    - Rolling statistics (mean, std, min, max)
    - Technical indicators (RSI, MACD, Bollinger Bands)
    - Date features
    - USD/INR features
    - Derived features
    """
    df = df.copy()
    price = df["Price"]

    # ── Lag features ──────────────────────────────────────────────────────────
    for lag in [1, 2, 3, 5, 7, 14, 21, 30]:
        df[f"price_lag_{lag}"] = price.shift(lag)

    # ── Rolling statistics ────────────────────────────────────────────────────
    for window in [7, 14, 30]:
        df[f"rolling_mean_{window}"] = price.shift(1).rolling(window).mean()
        df[f"rolling_std_{window}"] = price.shift(1).rolling(window).std()
    df["rolling_min_7"] = price.shift(1).rolling(7).min()
    df["rolling_max_7"] = price.shift(1).rolling(7).max()

    # ── Technical indicators (using `ta` library) ─────────────────────────────
    # RSI (14-period)
    df["rsi_14"] = ta.momentum.RSIIndicator(close=price.shift(1), window=14).rsi()

    # MACD
    macd_obj = ta.trend.MACD(close=price.shift(1))
    df["macd"] = macd_obj.macd()
    df["macd_signal"] = macd_obj.macd_signal()
    df["macd_diff"] = macd_obj.macd_diff()

    # Bollinger Bands (20-period, 2 std)
    bb = ta.volatility.BollingerBands(close=price.shift(1), window=20, window_dev=2)
    df["bb_upper"] = bb.bollinger_hband()
    df["bb_lower"] = bb.bollinger_lband()
    df["bb_width"] = bb.bollinger_wband()
    df["bb_pct"] = bb.bollinger_pband()

    # ATR (Average True Range) — needs High/Low
    if "High" in df.columns and "Low" in df.columns:
        df["atr_14"] = ta.volatility.AverageTrueRange(
            high=df["High"].shift(1),
            low=df["Low"].shift(1),
            close=price.shift(1),
            window=14,
        ).average_true_range()

    # ── Date features ─────────────────────────────────────────────────────────
    df["day_of_week"] = df["Date"].dt.dayofweek   # 0=Mon, 4=Fri
    df["month"] = df["Date"].dt.month
    df["quarter"] = df["Date"].dt.quarter
    df["year"] = df["Date"].dt.year
    df["is_month_end"] = df["Date"].dt.is_month_end.astype(int)
    df["is_quarter_end"] = df["Date"].dt.is_quarter_end.astype(int)
    df["day_of_year"] = df["Date"].dt.dayofyear

    # ── USD/INR features ──────────────────────────────────────────────────────
    usd_inr = df["USD_INR"]
    df["usd_inr_lag_1"] = usd_inr.shift(1)
    df["usd_inr_lag_7"] = usd_inr.shift(7)
    df["usd_inr_rolling_mean_7"] = usd_inr.shift(1).rolling(7).mean()
    df["usd_inr_rolling_std_7"] = usd_inr.shift(1).rolling(7).std()
    df["usd_inr_pct_change"] = usd_inr.pct_change(1)

    # ── Derived features ──────────────────────────────────────────────────────
    df["price_pct_change"] = price.pct_change(1)
    df["price_pct_change_7"] = price.pct_change(7)
    if "High" in df.columns and "Low" in df.columns:
        df["daily_range"] = df["High"] - df["Low"]
        df["daily_range_pct"] = df["daily_range"] / price

    # Volatility (realized 5-day)
    df["volatility_5d"] = price.pct_change().shift(1).rolling(5).std()

    # Gold in INR (base, no duties) — informational feature
    df["gold_inr_base"] = price * usd_inr / 31.1035

    # ── Target variable ───────────────────────────────────────────────────────
    df["next_day_price"] = price.shift(-1)

    return df


def get_feature_columns() -> list:
    """Return the ordered list of feature columns used by the model."""
    return [
        # Lag
        "price_lag_1", "price_lag_2", "price_lag_3", "price_lag_5",
        "price_lag_7", "price_lag_14", "price_lag_21", "price_lag_30",
        # Rolling stats
        "rolling_mean_7", "rolling_mean_14", "rolling_mean_30",
        "rolling_std_7", "rolling_std_14", "rolling_std_30",
        "rolling_min_7", "rolling_max_7",
        # Technical
        "rsi_14", "macd", "macd_signal", "macd_diff",
        "bb_upper", "bb_lower", "bb_width", "bb_pct", "atr_14",
        # Date
        "day_of_week", "month", "quarter", "year",
        "is_month_end", "is_quarter_end", "day_of_year",
        # USD/INR
        "USD_INR", "usd_inr_lag_1", "usd_inr_lag_7",
        "usd_inr_rolling_mean_7", "usd_inr_rolling_std_7", "usd_inr_pct_change",
        # Derived
        "price_pct_change", "price_pct_change_7",
        "daily_range", "daily_range_pct",
        "volatility_5d", "gold_inr_base",
    ]


# ─── Main Pipeline ────────────────────────────────────────────────────────────

def build_dataset() -> pd.DataFrame:
    """Full pipeline: load → merge → feature engineering → return clean df."""
    print("Loading Gold Rate CSV...")
    gold = load_gold()
    print(f"  Gold rows: {len(gold)} | Range: {gold['Date'].min().date()} → {gold['Date'].max().date()}")

    print("Loading USD/INR CSV...")
    usdinr = load_usdinr()
    print(f"  USD/INR rows: {len(usdinr)} | Range: {usdinr['Date'].min().date()} → {usdinr['Date'].max().date()}")

    print("Merging datasets...")
    df = merge_datasets(gold, usdinr)
    print(f"  Merged rows: {len(df)}")

    print("Building features...")
    df = add_features(df)

    # Drop rows where target or required features are NaN
    feature_cols = get_feature_columns()
    available_features = [c for c in feature_cols if c in df.columns]
    df = df.dropna(subset=available_features + ["next_day_price"])
    print(f"  Final rows (after dropna): {len(df)}")

    return df


if __name__ == "__main__":
    df = build_dataset()
    print("\nSample (last 3 rows):")
    print(df[["Date", "Price", "USD_INR", "next_day_price", "rsi_14", "rolling_mean_7"]].tail(3))
    print(f"\nFeature columns available: {[c for c in get_feature_columns() if c in df.columns]}")
