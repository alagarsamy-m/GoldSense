"""
GoldSense ML Pipeline — Prediction Accuracy Logger
Compares yesterday's stored prediction with actual price.
Appends results to dataset/prediction_logs.csv.
"""

import sys
import json
import pandas as pd
import numpy as np
import yfinance as yf
from pathlib import Path
from datetime import date, timedelta

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATASET_DIR = ROOT / "dataset"
LOGS_CSV = DATASET_DIR / "prediction_logs.csv"
PENDING_PREDICTION_FILE = ROOT / "ml" / "model" / "pending_prediction.json"

GOLD_TICKER = "GC=F"

LOGS_COLUMNS = [
    "prediction_date",
    "predicted_price_usd",
    "actual_price_usd",
    "difference",
    "pct_error",
    "created_at",
]


def fetch_actual_price(target_date: date) -> float | None:
    """Fetch actual gold close price for a specific date via yfinance."""
    start = target_date
    end = target_date + timedelta(days=1)

    ticker = yf.Ticker(GOLD_TICKER)
    hist = ticker.history(start=str(start), end=str(end))

    if hist.empty:
        print(f"  No actual price data found for {target_date}")
        return None

    close = float(hist["Close"].iloc[-1])
    print(f"  Actual price for {target_date}: ${close:.2f}")
    return close


def load_logs() -> pd.DataFrame:
    """Load existing prediction logs, or create empty DataFrame."""
    if LOGS_CSV.exists():
        df = pd.read_csv(LOGS_CSV)
        df["prediction_date"] = pd.to_datetime(df["prediction_date"]).dt.date
        return df
    return pd.DataFrame(columns=LOGS_COLUMNS)


def save_logs(df: pd.DataFrame):
    """Save prediction logs to CSV."""
    df.to_csv(LOGS_CSV, index=False)
    print(f"  Logs saved to {LOGS_CSV}")


def log_prediction(prediction_date: date, predicted_usd: float, actual_usd: float):
    """
    Add a new accuracy log entry.
    Skips if entry for this date already exists.
    """
    logs = load_logs()

    # Skip if already logged
    if not logs.empty and prediction_date in logs["prediction_date"].values:
        print(f"  Entry for {prediction_date} already exists — skipping.")
        return logs

    difference = actual_usd - predicted_usd
    pct_error = abs(difference / actual_usd) * 100

    new_row = pd.DataFrame([{
        "prediction_date": prediction_date,
        "predicted_price_usd": round(predicted_usd, 2),
        "actual_price_usd": round(actual_usd, 2),
        "difference": round(difference, 2),
        "pct_error": round(pct_error, 3),
        "created_at": pd.Timestamp.utcnow().isoformat(),
    }])

    logs = pd.concat([logs, new_row], ignore_index=True)
    logs = logs.sort_values("prediction_date", ascending=False).reset_index(drop=True)
    save_logs(logs)

    print(f"  Logged: {prediction_date} | Predicted=${predicted_usd:.2f} | Actual=${actual_usd:.2f} | Error={pct_error:.2f}%")
    return logs


def save_pending_prediction(prediction_date: date, predicted_usd: float):
    """
    Save today's prediction so it can be evaluated next run.
    Called after each prediction is made.
    """
    data = {
        "prediction_date": str(prediction_date),
        "predicted_price_usd": predicted_usd,
        "created_at": pd.Timestamp.utcnow().isoformat(),
    }
    PENDING_PREDICTION_FILE.parent.mkdir(exist_ok=True)
    with open(PENDING_PREDICTION_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  Pending prediction saved: {prediction_date} → ${predicted_usd:.2f}")


def load_pending_prediction() -> dict | None:
    """Load the most recently saved pending prediction."""
    if not PENDING_PREDICTION_FILE.exists():
        return None
    with open(PENDING_PREDICTION_FILE) as f:
        return json.load(f)


def run_evaluation():
    """
    Main evaluation loop:
    1. Load pending prediction from last run
    2. Fetch actual price for that date
    3. Log the comparison
    4. Run new prediction and save as pending for next evaluation
    """
    print("=" * 55)
    print("GoldSense — Prediction Accuracy Evaluation")
    print("=" * 55)

    # ── Evaluate pending prediction ────────────────────────────────
    pending = load_pending_prediction()
    if pending:
        pred_date = date.fromisoformat(pending["prediction_date"])
        predicted_usd = pending["predicted_price_usd"]

        print(f"\nEvaluating prediction for {pred_date}...")
        actual_usd = fetch_actual_price(pred_date)

        if actual_usd is not None:
            log_prediction(pred_date, predicted_usd, actual_usd)
        else:
            print(f"  Could not fetch actual price for {pred_date} (market may have been closed)")
    else:
        print("\nNo pending prediction found — first run.")

    # ── Generate new prediction and save as pending ────────────────
    print("\nGenerating new prediction...")
    try:
        from predict import run_predictions
        result = run_predictions()
        tomorrow_data = result["tomorrow"]

        new_pred_date = date.fromisoformat(tomorrow_data["prediction_date"])
        new_pred_usd = tomorrow_data["tomorrow_usd"]

        save_pending_prediction(new_pred_date, new_pred_usd)
        print(f"  New prediction: {new_pred_date} → ${new_pred_usd:.2f}")
    except Exception as e:
        print(f"  Warning: Could not generate new prediction: {e}")

    # ── Print summary ──────────────────────────────────────────────
    logs = load_logs()
    if not logs.empty:
        recent = logs.head(30)
        avg_mape = recent["pct_error"].mean()
        avg_mae = recent["difference"].abs().mean()
        print(f"\nAccuracy Summary (last {len(recent)} predictions):")
        print(f"  Average MAPE: {avg_mape:.2f}%")
        print(f"  Average MAE:  ${avg_mae:.2f}")
        print(f"  Total logged: {len(logs)} predictions")

    print("\nEvaluation complete.")


if __name__ == "__main__":
    try:
        run_evaluation()
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
