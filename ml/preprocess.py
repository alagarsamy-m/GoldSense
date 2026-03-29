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
MACRO_CSV = DATASET_DIR / "macro_data.csv"

# Macro tickers: DXY (inverse gold), VIX (safe-haven), TNX (real rates), OIL (inflation proxy)
MACRO_TICKERS = {
    "DX-Y.NYB": "DXY",
    "^VIX":     "VIX",
    "^TNX":     "TNX",
    "CL=F":     "OIL",
}


# ─── Macro Data ───────────────────────────────────────────────────────────────

def fetch_and_cache_macro(start_date: str = "2000-01-01", end_date: str = None) -> pd.DataFrame:
    """
    Download DXY, VIX, TNX, OIL from Yahoo Finance and cache to CSV.
    Re-downloads if cache is missing or stale (>7 days old).
    Returns DataFrame with columns: Date, DXY, VIX, TNX, OIL.
    """
    import yfinance as yf
    from datetime import datetime, timedelta

    if end_date is None:
        end_date = datetime.today().strftime("%Y-%m-%d")

    # Use cache if fresh (updated within 7 days)
    if MACRO_CSV.exists():
        age_days = (datetime.today() - datetime.fromtimestamp(MACRO_CSV.stat().st_mtime)).days
        if age_days < 7:
            df = pd.read_csv(MACRO_CSV, parse_dates=["Date"])
            df["Date"] = pd.to_datetime(df["Date"]).dt.tz_localize(None)
            print(f"  Macro data loaded from cache ({age_days}d old, {len(df)} rows)")
            return df

    print("Fetching macro data from Yahoo Finance...")
    frames = []
    for ticker, col_name in MACRO_TICKERS.items():
        try:
            hist = yf.download(ticker, start=start_date, end=end_date, progress=False, auto_adjust=True, timeout=15)
            if not hist.empty:
                if isinstance(hist.columns, pd.MultiIndex):
                    close = hist["Close"].squeeze()
                else:
                    close = hist["Close"]
                # Handle case where squeeze returns a scalar (single row)
                if not isinstance(close, pd.Series):
                    print(f"  Warning: Only 1 row for {ticker} — skipping")
                    continue
                close = close.rename(col_name)
                close.index = pd.to_datetime(close.index).tz_localize(None)
                frames.append(close)
                print(f"  {col_name} ({ticker}): {len(close)} rows")
            else:
                print(f"  WARNING: No data returned for {ticker} — check ticker symbol")
        except Exception as e:
            print(f"  WARNING: Could not fetch {ticker}: {e}")
            import traceback
            traceback.print_exc()

    if not frames:
        print("  Warning: No macro data available — skipping macro features")
        return pd.DataFrame(columns=["Date"] + list(MACRO_TICKERS.values()))

    macro = pd.concat(frames, axis=1).reset_index().rename(columns={"index": "Date"})
    macro["Date"] = pd.to_datetime(macro["Date"]).dt.tz_localize(None)

    # Forward-fill up to 5 days (weekends + holidays)
    full_range = pd.date_range(macro["Date"].min(), macro["Date"].max(), freq="D")
    macro = macro.set_index("Date").reindex(full_range).ffill(limit=5).reset_index()
    macro = macro.rename(columns={"index": "Date"})

    MACRO_CSV.parent.mkdir(exist_ok=True)
    macro.to_csv(MACRO_CSV, index=False)
    print(f"  Macro data cached: {MACRO_CSV} ({len(macro)} rows)")
    return macro


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
        skiprows=3,              # skip 2 comment lines + 1 empty line
        encoding="utf-8",
    )
    # Strip BOM (\ufeff) + surrounding quotes that appear on the header line
    df.columns = df.columns.str.replace('\ufeff', '', regex=False).str.strip('"').str.strip()

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
        skiprows=3,              # skip 2 comment lines + 1 empty line
        encoding="utf-8",
    )
    # Strip BOM (\ufeff) + surrounding quotes that appear on the header line
    df.columns = df.columns.str.replace('\ufeff', '', regex=False).str.strip('"').str.strip()

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

def merge_datasets(
    gold_df: pd.DataFrame,
    usdinr_df: pd.DataFrame,
    macro_df: pd.DataFrame = None,
) -> pd.DataFrame:
    """
    Inner-join gold price, USD/INR, and optional macro indicators on Date.
    Forward-fill up to 5 days to handle gaps (holidays, weekends).
    """
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

    # Merge macro data (left join — macro is optional)
    if macro_df is not None and not macro_df.empty:
        macro_cols = [c for c in macro_df.columns if c != "Date"]
        macro_full = (
            macro_df[["Date"] + macro_cols]
            .set_index("Date")
            .reindex(date_range)
            .ffill(limit=5)
            .reset_index()
            .rename(columns={"index": "Date"})
        )
        merged = pd.merge(merged, macro_full, on="Date", how="left")
        # Forward-fill any remaining NaN in macro cols (early dates before DXY/VIX history)
        merged[macro_cols] = merged[macro_cols].ffill().bfill()

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
    df["usd_inr_pct_change"] = usd_inr.pct_change(1).shift(1)

    # ── Derived features (all shifted by 1 to prevent look-ahead bias) ────────
    df["price_pct_change"] = price.pct_change(1).shift(1)
    df["price_pct_change_7"] = price.pct_change(7).shift(1)
    if "High" in df.columns and "Low" in df.columns:
        df["daily_range"] = (df["High"] - df["Low"]).shift(1)
        df["daily_range_pct"] = (df["daily_range"] / price.shift(1))

    # Volatility (realized 5-day)
    df["volatility_5d"] = price.pct_change().shift(1).rolling(5).std()

    # Gold in INR (base, no duties) — use previous day's values
    df["gold_inr_base"] = price.shift(1) * usd_inr.shift(1) / 31.1035

    # ── Log return features (key signals for predicting next-day direction) ───
    price_returns = np.log(price / price.shift(1))
    df["log_return_1"] = price_returns             # Today's log return
    df["log_return_2"] = price_returns.shift(1)    # Yesterday's log return
    df["log_return_3"] = price_returns.shift(2)    # 2 days ago
    df["log_return_5"] = np.log(price / price.shift(5))   # 5-day return
    df["log_return_7"] = np.log(price / price.shift(7))   # Weekly return

    # ── Rolling return statistics (scale-free, better for log return target) ──
    df["return_mean_5"] = price_returns.shift(1).rolling(5).mean()
    df["return_mean_14"] = price_returns.shift(1).rolling(14).mean()
    df["return_std_5"] = price_returns.shift(1).rolling(5).std()
    df["return_std_14"] = price_returns.shift(1).rolling(14).std()

    # ── Normalized volatility ratio (current vs historical) ──────────────────
    df["vol_ratio"] = df["rolling_std_7"] / df["rolling_std_30"].replace(0, np.nan)

    # ── Mean reversion signals (gold tends to revert to rolling mean) ─────────
    # Positive value = price is above its historical average (may revert down)
    df["price_vs_mean_7"] = price / df["rolling_mean_7"] - 1
    df["price_vs_mean_30"] = price / df["rolling_mean_30"] - 1

    # ── USD/INR log return (currency movement as signal) ─────────────────────
    df["usd_inr_return"] = np.log(usd_inr / usd_inr.shift(1))

    # ── Macro features (DXY, VIX, TNX, OIL) — key gold price drivers ────────
    # DXY: US Dollar Index — strong inverse correlation with gold (-0.8)
    if "DXY" in df.columns:
        dxy = df["DXY"]
        df["dxy_lag_1"]          = dxy.shift(1)
        df["dxy_lag_5"]          = dxy.shift(5)
        df["dxy_return"]         = np.log(dxy / dxy.shift(1))           # today's DXY move
        df["dxy_rolling_mean_5"] = dxy.shift(1).rolling(5).mean()
        df["dxy_rolling_std_5"]  = dxy.shift(1).rolling(5).std()
        df["gold_dxy_ratio"]     = price.shift(1) / dxy.shift(1)        # gold/dollar ratio

    # VIX: Fear index — rising VIX = flight to gold (safe haven)
    if "VIX" in df.columns:
        vix = df["VIX"]
        df["vix_lag_1"]          = vix.shift(1)
        df["vix_change"]         = vix.diff(1).shift(1)                  # VIX acceleration
        df["vix_rolling_mean_5"] = vix.shift(1).rolling(5).mean()
        df["vix_high"]           = (vix.shift(1) > 25).astype(int)      # fear regime flag

    # TNX: 10-Year Treasury Yield — rising real rates = falling gold
    if "TNX" in df.columns:
        tnx = df["TNX"]
        df["tnx_lag_1"]   = tnx.shift(1)
        df["tnx_change"]  = tnx.diff(1).shift(1)                        # yield curve move
        df["tnx_change_5"]= tnx.diff(5).shift(1)                        # 5-day yield trend

    # OIL: Crude oil — inflation proxy, positively correlated with gold
    if "OIL" in df.columns:
        oil = df["OIL"]
        df["oil_lag_1"]   = oil.shift(1)
        df["oil_return"]  = np.log(oil / oil.shift(1)).shift(1)
        df["oil_rolling_mean_5"] = oil.shift(1).rolling(5).mean()

    # ── News Sentiment features (from daily sentiment_logs.csv cache) ────────────
    # Populated gradually as the sentiment service runs; defaults to 0 (neutral)
    # for historical dates. Once 30+ days are logged, these become real signals.
    if "sentiment_score" in df.columns:
        df["sentiment_1d"]     = df["sentiment_score"].shift(1).fillna(0)  # yesterday's score
        df["sentiment_3d_avg"] = df["sentiment_score"].shift(1).rolling(3, min_periods=1).mean().fillna(0)
        df["sentiment_7d_avg"] = df["sentiment_score"].shift(1).rolling(7, min_periods=1).mean().fillna(0)
        df["sentiment_bull"]   = (df["sentiment_score"].shift(1) > 0.05).astype(int)
        df["sentiment_bear"]   = (df["sentiment_score"].shift(1) < -0.05).astype(int)

    # ── Target variable: next-day log return (stationary — model learns ±% change)
    # This dramatically improves accuracy: model only predicts small daily change,
    # and at inference time, price = live_price * exp(pred_return)
    df["next_day_return"] = np.log(price.shift(-1) / price)
    # Keep absolute price for backward compatibility
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
        # Log returns, mean reversion & return statistics
        "log_return_1", "log_return_2", "log_return_3",
        "log_return_5", "log_return_7",
        "return_mean_5", "return_mean_14",
        "return_std_5", "return_std_14",
        "vol_ratio",
        "price_vs_mean_7", "price_vs_mean_30",
        "usd_inr_return",
        # ── Macro features (optional — present only when macro_data.csv exists) ──
        # DXY: US Dollar Index (strongest gold inverse signal)
        "dxy_lag_1", "dxy_lag_5", "dxy_return",
        "dxy_rolling_mean_5", "dxy_rolling_std_5", "gold_dxy_ratio",
        # VIX: Fear index (safe-haven demand)
        "vix_lag_1", "vix_change", "vix_rolling_mean_5", "vix_high",
        # TNX: 10-Year Treasury Yield (real rate pressure on gold)
        "tnx_lag_1", "tnx_change", "tnx_change_5",
        # OIL: Crude oil (inflation proxy)
        "oil_lag_1", "oil_return", "oil_rolling_mean_5",
        # ── News Sentiment (only active once sentiment_logs.csv has 30+ rows) ──
        "sentiment_1d", "sentiment_3d_avg", "sentiment_7d_avg",
        "sentiment_bull", "sentiment_bear",
    ]


# ─── Main Pipeline ────────────────────────────────────────────────────────────

def build_dataset(use_macro: bool = True) -> pd.DataFrame:
    """Full pipeline: load → merge → feature engineering → return clean df."""
    print("Loading Gold Rate CSV...")
    gold = load_gold()
    print(f"  Gold rows: {len(gold)} | Range: {gold['Date'].min().date()} → {gold['Date'].max().date()}")

    print("Loading USD/INR CSV...")
    usdinr = load_usdinr()
    print(f"  USD/INR rows: {len(usdinr)} | Range: {usdinr['Date'].min().date()} → {usdinr['Date'].max().date()}")

    macro = None
    if use_macro:
        start = gold["Date"].min().strftime("%Y-%m-%d")
        macro = fetch_and_cache_macro(start_date=start)

    print("Merging datasets...")
    df = merge_datasets(gold, usdinr, macro)
    macro_cols_expected = ["DXY", "VIX", "TNX", "OIL"]
    macro_present = [c for c in macro_cols_expected if c in df.columns and df[c].notna().any()]
    macro_missing = [c for c in macro_cols_expected if c not in macro_present]
    print(f"  Merged rows: {len(df)} | Macro features active: {macro_present or 'NONE'}")
    if macro_missing and use_macro:
        print(f"  WARNING: Macro features missing: {macro_missing} — model accuracy will be reduced")

    # Merge daily sentiment history (left join — neutral fill for historical dates)
    sentiment_csv = DATASET_DIR / "sentiment_logs.csv"
    if sentiment_csv.exists():
        sent_df = pd.read_csv(sentiment_csv)
        sent_df["Date"] = pd.to_datetime(sent_df["date"])
        sent_df = sent_df[["Date", "sentiment_score"]].drop_duplicates("Date")
        df = pd.merge(df, sent_df, on="Date", how="left")
        df["sentiment_score"] = df["sentiment_score"].fillna(0.0)
        print(f"  Sentiment rows merged: {sent_df['Date'].nunique()} daily scores")
    else:
        df["sentiment_score"] = 0.0

    print("Building features...")
    df = add_features(df)

    # Only require non-macro features — macro features are optional
    core_features = [
        "price_lag_1", "rolling_mean_7", "rsi_14", "USD_INR",
        "log_return_1", "next_day_price", "next_day_return",
    ]
    df = df.dropna(subset=[c for c in core_features if c in df.columns])
    print(f"  Final rows (after dropna): {len(df)}")

    return df


if __name__ == "__main__":
    df = build_dataset()
    print("\nSample (last 3 rows):")
    print(df[["Date", "Price", "USD_INR", "next_day_price", "rsi_14", "rolling_mean_7"]].tail(3))
    print(f"\nFeature columns available: {[c for c in get_feature_columns() if c in df.columns]}")
