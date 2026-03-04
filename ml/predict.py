"""
GoldSense ML Pipeline — Price Prediction
Loads the trained XGBoost model and generates:
- Tomorrow's gold price (USD)
- 7-day forecast (recursive multi-step)
- India price conversions (24k and 22k per gram, Chennai)
"""

import json
import logging
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import date, timedelta
from typing import Optional

from preprocess import build_dataset, get_feature_columns, load_gold, load_usdinr

logger = logging.getLogger(__name__)

# ─── Paths ────────────────────────────────────────────────────────────────────
MODEL_DIR = Path(__file__).parent / "model"
MODEL_PATH = MODEL_DIR / "gold_model.pkl"
METADATA_PATH = MODEL_DIR / "model_metadata.json"

# ─── India Conversion Constants ───────────────────────────────────────────────
TROY_OZ_TO_GRAMS = 31.1035
IMPORT_DUTY = 0.15      # 15%
GST = 0.03              # 3%
DUTY_MULTIPLIER = (1 + IMPORT_DUTY) * (1 + GST)   # ≈ 1.1545


def fetch_live_gold_price() -> Optional[float]:
    """
    Fetch current live gold futures close price from Yahoo Finance.
    Corrects prediction drift when CSV dataset is behind the market.
    Returns None if fetch fails (network error, market closed, etc.).
    """
    try:
        import yfinance as yf
        hist = yf.Ticker("GC=F").history(period="2d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as e:
        logger.warning(f"Live gold price fetch failed: {e}")
    return None


def fetch_live_usd_inr() -> Optional[float]:
    """Fetch current USD/INR exchange rate from Yahoo Finance."""
    try:
        import yfinance as yf
        hist = yf.Ticker("USDINR=X").history(period="2d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as e:
        logger.warning(f"Live USD/INR fetch failed: {e}")
    return None


def get_today_live_price() -> Optional[dict]:
    """
    Fetch today's live gold price from Yahoo Finance (GC=F + USDINR=X).
    Returns USD price + India 24k/22k INR conversions with today's date.
    """
    live_usd = fetch_live_gold_price()
    live_usd_inr = fetch_live_usd_inr()

    if not live_usd or not live_usd_inr:
        return None

    india_prices = usd_to_inr_gold(live_usd, live_usd_inr)

    return {
        "date": str(date.today()),
        "live_usd": round(live_usd, 2),
        "usd_inr_rate": round(live_usd_inr, 3),
        "price_24k_per_gram": india_prices["price_24k_per_gram"],
        "price_22k_per_gram": india_prices["price_22k_per_gram"],
        "price_24k_per_10g": india_prices["price_24k_per_10g"],
        "price_22k_per_10g": india_prices["price_22k_per_10g"],
    }


def usd_to_inr_gold(usd_per_oz: float, usd_inr_rate: float) -> dict:
    """
    Convert gold price from USD/troy oz to INR/gram (Chennai market).

    Returns:
        dict with 24k and 22k prices per gram and per 10 grams
    """
    base_per_gram = (usd_per_oz * usd_inr_rate) / TROY_OZ_TO_GRAMS
    price_24k = base_per_gram * DUTY_MULTIPLIER
    price_22k = price_24k * (22 / 24)

    return {
        "base_per_gram": round(base_per_gram, 2),
        "price_24k_per_gram": round(price_24k, 2),
        "price_22k_per_gram": round(price_22k, 2),
        "price_24k_per_10g": round(price_24k * 10, 2),
        "price_22k_per_10g": round(price_22k * 10, 2),
    }


def _next_business_day(d: date) -> date:
    """Return next weekday (Mon–Fri) after given date."""
    d = d + timedelta(days=1)
    while d.weekday() >= 5:  # Sat=5, Sun=6
        d += timedelta(days=1)
    return d


def load_model():
    """Load saved XGBoost model and metadata."""
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_PATH}. Run `python train.py` first."
        )
    model = joblib.load(MODEL_PATH)

    metadata = {}
    if METADATA_PATH.exists():
        with open(METADATA_PATH) as f:
            metadata = json.load(f)

    return model, metadata


def get_latest_features(df: pd.DataFrame, feature_cols: list) -> pd.Series:
    """Extract feature row for the most recent data point."""
    return df[feature_cols].iloc[-1]


def predict_tomorrow(df: pd.DataFrame, model, feature_cols: list, metadata: dict = None) -> dict:
    """
    Predict tomorrow's gold price using the last available row.

    For log_return models (training_target == "log_return"):
      - Model predicts log(next_price / current_price)
      - pred_price = live_price * exp(predicted_log_return)
      - Live price IS the anchor — no drift correction needed

    For legacy absolute-price models:
      - Applies additive drift to anchor prediction to live market price

    Returns:
        dict with USD price + India INR conversions
    """
    latest_features = get_latest_features(df, feature_cols)
    X = latest_features.values.reshape(1, -1)
    raw_pred = float(model.predict(X)[0])

    latest_usd_inr = float(df["USD_INR"].iloc[-1])
    csv_last_price = float(df["Price"].iloc[-1])

    live_price = fetch_live_gold_price()
    last_actual = live_price if live_price else csv_last_price

    training_target = (metadata or {}).get("training_target", "absolute_price")

    if training_target == "log_return":
        # raw_pred is log(next/current); apply to live anchor for market accuracy
        anchor = live_price if live_price else csv_last_price
        pred_usd = anchor * np.exp(raw_pred)
    else:
        # Legacy: raw_pred is absolute price; apply additive drift
        if live_price and csv_last_price > 0:
            drift = live_price - csv_last_price
            pred_usd = raw_pred + drift
        else:
            pred_usd = raw_pred

    india_prices = usd_to_inr_gold(pred_usd, latest_usd_inr)

    trend = "up" if pred_usd > last_actual else "down" if pred_usd < last_actual else "stable"
    pct_change = ((pred_usd - last_actual) / last_actual) * 100

    pred_date = _next_business_day(date.today())
    last_date = df["Date"].iloc[-1]

    return {
        "prediction_date": str(pred_date),
        "last_data_date": str(last_date.date()),
        "tomorrow_usd": round(pred_usd, 2),
        "last_actual_usd": round(last_actual, 2),
        "trend": trend,
        "pct_change": round(pct_change, 3),
        "usd_inr_rate": round(latest_usd_inr, 3),
        **{f"tomorrow_{k}": v for k, v in india_prices.items()},
    }


def predict_week(df: pd.DataFrame, model, feature_cols: list, metadata: dict = None) -> list:
    """
    Generate 7-day price forecast using recursive multi-step prediction.

    For log_return models:
      - Model predicts log return at each step
      - pred_price = prev_price * exp(log_return), anchored to live price
      - Recursive: each step feeds the live-anchored predicted price back in

    For legacy absolute-price models:
      - Applies additive drift from live price to all predictions
    """
    work_df = df.copy()
    latest_usd_inr = float(work_df["USD_INR"].iloc[-1])
    csv_last_price = float(work_df["Price"].iloc[-1])

    live_price = fetch_live_gold_price()
    training_target = (metadata or {}).get("training_target", "absolute_price")

    # For log_return model: seed work_df with live price so recursion uses real market level
    if training_target == "log_return" and live_price and csv_last_price > 0:
        work_df.iloc[-1, work_df.columns.get_loc("Price")] = live_price

    # For legacy model: compute additive drift
    drift = (live_price - csv_last_price) if (training_target != "log_return" and live_price and csv_last_price > 0) else 0

    today = date.today()
    forecast = []

    for step in range(1, 8):
        from preprocess import add_features
        temp_df = add_features(work_df)
        available = [c for c in feature_cols if c in temp_df.columns]

        latest_row = temp_df[available].iloc[-1].values.reshape(1, -1)
        raw_pred = float(model.predict(latest_row)[0])

        if training_target == "log_return":
            # Apply log return to current price in work_df (already live-anchored)
            current_price = float(work_df["Price"].iloc[-1])
            pred_usd = current_price * np.exp(raw_pred)
        else:
            pred_usd = raw_pred + drift

        if step == 1:
            pred_date = _next_business_day(today)
        else:
            pred_date = _next_business_day(forecast[-1]["date_obj"])

        india = usd_to_inr_gold(pred_usd, latest_usd_inr)

        forecast.append({
            "date_obj": pred_date,
            "date": str(pred_date),
            "day": pred_date.strftime("%a"),
            "usd": round(pred_usd, 2),
            "price_24k_per_gram": india["price_24k_per_gram"],
            "price_22k_per_gram": india["price_22k_per_gram"],
            "price_24k_per_10g": india["price_24k_per_10g"],
            "price_22k_per_10g": india["price_22k_per_10g"],
        })

        # Append predicted row to work_df for recursive feature engineering
        new_row = work_df.iloc[-1].copy()
        new_row["Date"] = pd.Timestamp(pred_date)
        new_row["Price"] = pred_usd       # live-anchored price for next step
        new_row["Open"] = pred_usd
        new_row["High"] = pred_usd * 1.002
        new_row["Low"] = pred_usd * 0.998
        new_row["Change %"] = ((pred_usd - float(work_df["Price"].iloc[-1])) / float(work_df["Price"].iloc[-1])) * 100

        work_df = pd.concat(
            [work_df, pd.DataFrame([new_row])],
            ignore_index=True
        )

    for f in forecast:
        del f["date_obj"]

    return forecast


def run_predictions() -> dict:
    """Full prediction pipeline — load model + run tomorrow + 7-day forecast."""
    model, metadata = load_model()

    print("Building dataset for prediction...")
    df = build_dataset()

    feature_cols = [c for c in get_feature_columns() if c in df.columns]

    print("Predicting tomorrow...")
    tomorrow = predict_tomorrow(df, model, feature_cols, metadata)

    print("Generating 7-day forecast...")
    week_forecast = predict_week(df, model, feature_cols, metadata)

    result = {
        "tomorrow": tomorrow,
        "week_forecast": week_forecast,
        "model_info": {
            "trained_at": metadata.get("trained_at", "unknown"),
            "rmse": metadata.get("metrics", {}).get("rmse", 0),
            "mae": metadata.get("metrics", {}).get("mae", 0),
            "mape": metadata.get("metrics", {}).get("mape", 0),
            "direction_accuracy": metadata.get("metrics", {}).get("direction_accuracy_pct", 0),
        },
    }

    return result


if __name__ == "__main__":
    result = run_predictions()
    tomorrow = result["tomorrow"]

    print("\n" + "=" * 55)
    print("GoldSense — Price Predictions")
    print("=" * 55)
    print(f"Prediction for: {tomorrow['prediction_date']}")
    print(f"Last data date: {tomorrow['last_data_date']}")
    print(f"\nGold Price (USD/oz):     ${tomorrow['tomorrow_usd']:,.2f}")
    print(f"Last actual (USD/oz):    ${tomorrow['last_actual_usd']:,.2f}")
    print(f"Trend:                   {tomorrow['trend'].upper()} ({tomorrow['pct_change']:+.2f}%)")
    print(f"\nIndia — Chennai Market:")
    print(f"  USD/INR Rate:          ₹{tomorrow['usd_inr_rate']:.3f}")
    print(f"  24k per gram:          ₹{tomorrow['tomorrow_price_24k_per_gram']:,.2f}")
    print(f"  22k per gram:          ₹{tomorrow['tomorrow_price_22k_per_gram']:,.2f}")
    print(f"  24k per 10g:           ₹{tomorrow['tomorrow_price_24k_per_10g']:,.2f}")
    print(f"  22k per 10g:           ₹{tomorrow['tomorrow_price_22k_per_10g']:,.2f}")
    print(f"\nModel: RMSE=${result['model_info']['rmse']:.2f} | MAE=${result['model_info']['mae']:.2f}")

    print("\n7-Day Forecast:")
    print(f"{'Date':<14} {'Day':<5} {'USD/oz':>10} {'24k/g (INR)':>13} {'22k/g (INR)':>13}")
    print("─" * 60)
    for f in result["week_forecast"]:
        print(f"{f['date']:<14} {f['day']:<5} ${f['usd']:>9,.2f} ₹{f['price_24k_per_gram']:>12,.2f} ₹{f['price_22k_per_gram']:>12,.2f}")
