"""
GoldSense MLOps — Daily Prediction Evaluation & Feedback Loop

Daily cycle:
  1. Load yesterday's pending prediction
  2. Fetch actual price from market
  3. Log accuracy (predicted vs actual)
  4. Analyze error patterns and detect drift
  5. Generate tomorrow's prediction and save as pending
  6. Write system status report for the API

This runs every trading day via GitHub Actions (daily-evaluate.yml).
"""

import sys
import json
import pandas as pd
import numpy as np
import yfinance as yf
from pathlib import Path
from datetime import date, datetime, timedelta

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATASET_DIR = ROOT / "dataset"
LOGS_CSV = DATASET_DIR / "prediction_logs.csv"
PENDING_PREDICTION_FILE = ROOT / "ml" / "model" / "pending_prediction.json"
SYSTEM_STATUS_FILE = ROOT / "ml" / "model" / "system_status.json"

GOLD_TICKER = "GC=F"

LOGS_COLUMNS = [
    "prediction_date",
    "predicted_price_usd",
    "actual_price_usd",
    "difference",
    "pct_error",
    "direction_correct",
    "predicted_trend",
    "actual_trend",
    "market_volatility",
    "created_at",
]

# Drift thresholds
DRIFT_MAPE_THRESHOLD  = 2.0   # % average error over window
DRIFT_DIR_THRESHOLD   = 45.0  # % direction accuracy below this
DRIFT_WINDOW          = 7     # number of recent predictions to check


# ─── Data Fetching ───────────────────────────────────────────────────────────

def fetch_actual_price(target_date: date) -> float | None:
    """Fetch actual gold close price for a specific date via yfinance."""
    start = target_date
    end = target_date + timedelta(days=3)  # buffer for weekends

    try:
        ticker = yf.Ticker(GOLD_TICKER)
        hist = ticker.history(start=str(start), end=str(end))

        if hist.empty:
            print(f"  No price data for {target_date}")
            return None

        # Find the exact date or closest trading day
        hist.index = pd.to_datetime(hist.index).tz_localize(None)
        target_ts = pd.Timestamp(target_date)

        if target_ts in hist.index:
            close = float(hist.loc[target_ts, "Close"])
        else:
            close = float(hist["Close"].iloc[0])

        print(f"  Actual price for {target_date}: ${close:.2f}")
        return close
    except Exception as e:
        print(f"  Error fetching price for {target_date}: {e}")
        return None


# ─── Log Management ──────────────────────────────────────────────────────────

def load_logs() -> pd.DataFrame:
    """Load existing prediction logs."""
    if LOGS_CSV.exists():
        df = pd.read_csv(LOGS_CSV)
        df["prediction_date"] = pd.to_datetime(df["prediction_date"]).dt.date
        # Ensure all columns exist (backward compat)
        for col in LOGS_COLUMNS:
            if col not in df.columns:
                df[col] = None
        return df
    return pd.DataFrame(columns=LOGS_COLUMNS)


def save_logs(df: pd.DataFrame):
    """Save prediction logs to CSV."""
    df.to_csv(LOGS_CSV, index=False)
    print(f"  Logs saved to {LOGS_CSV}")


def log_prediction(prediction_date: date, predicted_usd: float, actual_usd: float,
                   predicted_trend: str = None) -> pd.DataFrame:
    """Add a new accuracy log entry with enhanced metrics."""
    logs = load_logs()

    if not logs.empty and prediction_date in logs["prediction_date"].values:
        print(f"  Entry for {prediction_date} already exists — skipping.")
        return logs

    difference = actual_usd - predicted_usd
    pct_error  = abs(difference / actual_usd) * 100

    # Direction correctness: compare against previous actual price
    if not logs.empty:
        prev_actual = float(logs["actual_price_usd"].iloc[0])
        predicted_direction = np.sign(predicted_usd - prev_actual)
        actual_direction = np.sign(actual_usd - prev_actual)
        direction_correct = int(predicted_direction == actual_direction) if actual_direction != 0 else 0
        actual_trend = "up" if actual_usd > prev_actual else "down"
    else:
        direction_correct = 0
        actual_trend = "unknown"

    # Market volatility (daily range as % of price)
    try:
        hist = yf.Ticker(GOLD_TICKER).history(start=str(prediction_date), end=str(prediction_date + timedelta(days=1)))
        if not hist.empty:
            high, low = float(hist["High"].iloc[0]), float(hist["Low"].iloc[0])
            volatility = round((high - low) / actual_usd * 100, 3)
        else:
            volatility = None
    except Exception:
        volatility = None

    new_row = pd.DataFrame([{
        "prediction_date":     prediction_date,
        "predicted_price_usd": round(predicted_usd, 2),
        "actual_price_usd":    round(actual_usd, 2),
        "difference":          round(difference, 2),
        "pct_error":           round(pct_error, 3),
        "direction_correct":   direction_correct,
        "predicted_trend":     predicted_trend or "unknown",
        "actual_trend":        actual_trend,
        "market_volatility":   volatility,
        "created_at":          datetime.utcnow().isoformat(),
    }])

    logs = pd.concat([logs, new_row], ignore_index=True)
    logs = logs.sort_values("prediction_date", ascending=False).reset_index(drop=True)
    save_logs(logs)

    status_icon = "+" if direction_correct else "-"
    print(f"  [{status_icon}] {prediction_date} | Pred=${predicted_usd:.2f} | Actual=${actual_usd:.2f} | "
          f"Err={pct_error:.2f}% | Dir={'OK' if direction_correct else 'MISS'}")
    return logs


# ─── Pending Prediction ─────────────────────────────────────────────────────

def save_pending_prediction(prediction_date: date, predicted_usd: float,
                            predicted_trend: str = "unknown", confidence: float = 0):
    """Save today's prediction for next-day evaluation."""
    data = {
        "prediction_date": str(prediction_date),
        "predicted_price_usd": round(predicted_usd, 2),
        "predicted_trend": predicted_trend,
        "direction_confidence": confidence,
        "created_at": datetime.utcnow().isoformat(),
    }
    PENDING_PREDICTION_FILE.parent.mkdir(exist_ok=True)
    with open(PENDING_PREDICTION_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  Pending: {prediction_date} → ${predicted_usd:.2f} ({predicted_trend})")


def load_pending_prediction() -> dict | None:
    """Load the most recently saved pending prediction."""
    if not PENDING_PREDICTION_FILE.exists():
        return None
    with open(PENDING_PREDICTION_FILE) as f:
        return json.load(f)


# ─── Drift Detection & Error Analysis ────────────────────────────────────────

def check_drift(logs: pd.DataFrame, window: int = DRIFT_WINDOW) -> dict:
    """Detect model drift with multi-signal analysis."""
    if logs.empty or len(logs) < 3:
        return {
            "drift_detected": False, "message": "Not enough data",
            "avg_mape": 0, "dir_accuracy": 0, "mape_trend": 0,
            "worsening": False, "window": window, "retrain_recommended": False,
        }

    recent = logs.head(window)
    avg_mape = recent["pct_error"].mean()
    dir_accuracy = recent["direction_correct"].mean() * 100

    # Check individual signals
    mape_drift = avg_mape > DRIFT_MAPE_THRESHOLD
    dir_drift = dir_accuracy < DRIFT_DIR_THRESHOLD

    # Trend analysis: is error getting worse?
    if len(logs) >= window * 2:
        older = logs.iloc[window:window * 2]
        mape_trend = avg_mape - older["pct_error"].mean()
        worsening = mape_trend > 0.5  # error increasing by >0.5%
    else:
        mape_trend = 0
        worsening = False

    messages = []
    if mape_drift:
        messages.append(f"MAPE {avg_mape:.2f}% > {DRIFT_MAPE_THRESHOLD}%")
    if dir_drift:
        messages.append(f"Direction {dir_accuracy:.1f}% < {DRIFT_DIR_THRESHOLD}%")
    if worsening:
        messages.append(f"Error trend worsening (+{mape_trend:.2f}%)")

    drift_detected = mape_drift or dir_drift

    return {
        "drift_detected": drift_detected,
        "avg_mape": round(avg_mape, 3),
        "dir_accuracy": round(dir_accuracy, 1),
        "mape_trend": round(mape_trend, 3),
        "worsening": worsening,
        "window": window,
        "message": " | ".join(messages) if messages else "Model within thresholds",
        "retrain_recommended": drift_detected,
    }


def analyze_error_patterns(logs: pd.DataFrame) -> dict:
    """Analyze when and why the model makes errors. Returns insights."""
    if len(logs) < 5:
        return {"insights": [], "enough_data": False}

    recent = logs.head(30).copy()
    insights = []

    # 1. High-volatility error correlation
    if "market_volatility" in recent.columns:
        vol_data = recent.dropna(subset=["market_volatility"])
        if len(vol_data) >= 3:
            high_vol = vol_data[vol_data["market_volatility"] > vol_data["market_volatility"].median()]
            low_vol = vol_data[vol_data["market_volatility"] <= vol_data["market_volatility"].median()]
            if len(high_vol) > 0 and len(low_vol) > 0:
                hv_err = high_vol["pct_error"].mean()
                lv_err = low_vol["pct_error"].mean()
                if hv_err > lv_err * 1.5:
                    insights.append({
                        "type": "volatility",
                        "message": f"Model errors {hv_err/lv_err:.1f}x higher on volatile days "
                                   f"({hv_err:.2f}% vs {lv_err:.2f}%)",
                        "action": "Consider wider confidence intervals on high-vol days",
                    })

    # 2. Directional bias
    if "direction_correct" in recent.columns:
        dir_data = recent.dropna(subset=["direction_correct"])
        if len(dir_data) >= 5:
            dir_acc = dir_data["direction_correct"].mean() * 100
            if dir_acc < 50:
                insights.append({
                    "type": "direction_bias",
                    "message": f"Direction accuracy {dir_acc:.1f}% (below 50% = worse than coin flip)",
                    "action": "Direction model may need retraining with recent data",
                })

    # 3. Consecutive misses
    if "direction_correct" in recent.columns:
        streak = 0
        for _, row in recent.iterrows():
            if row.get("direction_correct") == 0:
                streak += 1
            else:
                break
        if streak >= 3:
            insights.append({
                "type": "losing_streak",
                "message": f"{streak} consecutive direction misses",
                "action": "Model may be stuck in wrong regime — retrain recommended",
            })

    # 4. Average error by day of week
    recent_with_dates = recent.copy()
    recent_with_dates["prediction_date"] = pd.to_datetime(recent_with_dates["prediction_date"])
    recent_with_dates["dow"] = recent_with_dates["prediction_date"].dt.day_name()
    dow_errors = recent_with_dates.groupby("dow")["pct_error"].mean()
    if len(dow_errors) >= 3:
        worst_day = dow_errors.idxmax()
        best_day = dow_errors.idxmin()
        if dow_errors[worst_day] > dow_errors[best_day] * 2:
            insights.append({
                "type": "day_pattern",
                "message": f"Worst accuracy on {worst_day}s ({dow_errors[worst_day]:.2f}%), "
                           f"best on {best_day}s ({dow_errors[best_day]:.2f}%)",
                "action": "May indicate weekly pattern model isn't capturing",
            })

    return {"insights": insights, "enough_data": True}


# ─── System Status Report ────────────────────────────────────────────────────

def write_system_status(logs: pd.DataFrame, drift: dict, pending: dict,
                        insights: list):
    """Write a comprehensive system status JSON consumed by the API."""
    now = datetime.utcnow()

    # Rolling metrics
    if not logs.empty:
        r7 = logs.head(7)
        r30 = logs.head(30)
        rolling = {
            "last_7": {
                "avg_mape": round(r7["pct_error"].mean(), 3) if len(r7) > 0 else None,
                "direction_accuracy": round(r7["direction_correct"].mean() * 100, 1) if len(r7) > 0 else None,
                "count": len(r7),
            },
            "last_30": {
                "avg_mape": round(r30["pct_error"].mean(), 3) if len(r30) > 0 else None,
                "direction_accuracy": round(r30["direction_correct"].mean() * 100, 1) if len(r30) > 0 else None,
                "count": len(r30),
            },
        }
        last_eval = {
            "date": str(logs["prediction_date"].iloc[0]),
            "predicted": float(logs["predicted_price_usd"].iloc[0]),
            "actual": float(logs["actual_price_usd"].iloc[0]),
            "error_pct": float(logs["pct_error"].iloc[0]),
            "direction_correct": bool(logs["direction_correct"].iloc[0]),
        }

        # Streak: count consecutive correct/incorrect directions
        streak_type = "correct" if logs["direction_correct"].iloc[0] == 1 else "incorrect"
        streak_count = 0
        for _, row in logs.iterrows():
            if (streak_type == "correct" and row["direction_correct"] == 1) or \
               (streak_type == "incorrect" and row["direction_correct"] == 0):
                streak_count += 1
            else:
                break
    else:
        rolling = {"last_7": {}, "last_30": {}}
        last_eval = None
        streak_type = None
        streak_count = 0

    status = {
        "updated_at": now.isoformat() + "Z",
        "pipeline": "healthy",
        "total_predictions_logged": len(logs),
        "last_evaluation": last_eval,
        "streak": {"type": streak_type, "count": streak_count},
        "rolling_metrics": rolling,
        "drift": drift,
        "insights": insights,
        "next_prediction": pending,
        "data_freshness": {
            "logs_csv": str(LOGS_CSV),
            "last_modified": datetime.fromtimestamp(LOGS_CSV.stat().st_mtime).isoformat() if LOGS_CSV.exists() else None,
        },
    }

    SYSTEM_STATUS_FILE.parent.mkdir(exist_ok=True)
    with open(SYSTEM_STATUS_FILE, "w") as f:
        json.dump(status, f, indent=2)
    print(f"  System status written to {SYSTEM_STATUS_FILE}")
    return status


# ─── Main Evaluation Pipeline ────────────────────────────────────────────────

def run_evaluation():
    """
    Daily MLOps evaluation pipeline:
    1. Evaluate yesterday's prediction against actual
    2. Analyze error patterns
    3. Detect drift
    4. Generate tomorrow's prediction
    5. Write system status
    """
    print("=" * 60)
    print("  GoldSense — Daily Evaluation Pipeline")
    print(f"  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    # ── Step 1: Evaluate pending prediction ────────────────────────
    pending = load_pending_prediction()
    predicted_trend = None

    if pending:
        pred_date = date.fromisoformat(pending["prediction_date"])
        predicted_usd = pending["predicted_price_usd"]
        predicted_trend = pending.get("predicted_trend", "unknown")

        # Only evaluate if the prediction date is in the past
        if pred_date < date.today():
            print(f"\n[Step 1] Evaluating prediction for {pred_date}...")
            actual_usd = fetch_actual_price(pred_date)

            if actual_usd is not None:
                log_prediction(pred_date, predicted_usd, actual_usd, predicted_trend)
            else:
                print(f"  Could not fetch actual price (market may have been closed)")
                # Try previous trading day
                for offset in range(1, 4):
                    alt_date = pred_date - timedelta(days=offset)
                    print(f"  Trying {alt_date}...")
                    actual_usd = fetch_actual_price(alt_date)
                    if actual_usd:
                        log_prediction(pred_date, predicted_usd, actual_usd, predicted_trend)
                        break
        else:
            print(f"\n[Step 1] Prediction for {pred_date} is for today/future — skipping evaluation")
    else:
        print("\n[Step 1] No pending prediction found — first run")

    # ── Step 2: Generate new prediction ────────────────────────────
    print(f"\n[Step 2] Generating tomorrow's prediction...")
    new_pending = None
    try:
        from predict import run_predictions
        result = run_predictions()
        tomorrow = result["tomorrow"]

        new_pred_date = date.fromisoformat(tomorrow["prediction_date"])
        new_pred_usd = tomorrow["tomorrow_usd"]
        new_trend = tomorrow.get("trend", "unknown")
        new_confidence = tomorrow.get("direction_confidence", 0)

        save_pending_prediction(new_pred_date, new_pred_usd, new_trend, new_confidence)
        new_pending = {
            "date": str(new_pred_date),
            "usd": new_pred_usd,
            "trend": new_trend,
            "confidence": new_confidence,
        }
    except Exception as e:
        print(f"  Warning: Could not generate prediction: {e}")
        import traceback
        traceback.print_exc()

    # ── Step 3: Analyze & report ───────────────────────────────────
    logs = load_logs()

    print(f"\n[Step 3] Accuracy Analysis")
    print(f"{'─' * 50}")

    drift = check_drift(logs)

    if not logs.empty:
        r7 = logs.head(7)
        r30 = logs.head(30)

        print(f"  Total predictions logged: {len(logs)}")
        print(f"\n  Last 7 predictions:")
        print(f"    MAPE:      {r7['pct_error'].mean():.2f}%")
        print(f"    Direction: {r7['direction_correct'].mean() * 100:.1f}%")
        print(f"\n  Last 30 predictions:")
        print(f"    MAPE:      {r30['pct_error'].mean():.2f}%")
        print(f"    Direction: {r30['direction_correct'].mean() * 100:.1f}%")

        # Recent predictions table
        print(f"\n  Recent Predictions:")
        print(f"  {'Date':<12} {'Predicted':>10} {'Actual':>10} {'Error':>7} {'Dir':>5}")
        print(f"  {'─' * 48}")
        for _, row in logs.head(7).iterrows():
            dir_mark = "OK" if row["direction_correct"] == 1 else "--"
            print(f"  {str(row['prediction_date']):<12} "
                  f"${row['predicted_price_usd']:>9,.2f} "
                  f"${row['actual_price_usd']:>9,.2f} "
                  f"{row['pct_error']:>6.2f}% "
                  f"{dir_mark:>4}")

    # ── Step 4: Error pattern analysis ─────────────────────────────
    print(f"\n[Step 4] Error Pattern Analysis")
    print(f"{'─' * 50}")

    analysis = analyze_error_patterns(logs)
    insights = analysis.get("insights", [])

    if insights:
        for i, insight in enumerate(insights, 1):
            print(f"  {i}. [{insight['type'].upper()}] {insight['message']}")
            print(f"     Action: {insight['action']}")
    else:
        print("  No significant patterns detected")

    # ── Step 5: Drift check ────────────────────────────────────────
    print(f"\n[Step 5] Drift Detection")
    print(f"{'─' * 50}")

    if drift["drift_detected"]:
        print(f"  *** DRIFT DETECTED ***")
    else:
        print(f"  Status: OK")

    print(f"  MAPE:      {drift['avg_mape']:.2f}% (threshold: {DRIFT_MAPE_THRESHOLD}%)")
    print(f"  Direction: {drift.get('dir_accuracy', 'N/A')}% (threshold: {DRIFT_DIR_THRESHOLD}%)")
    print(f"  Message:   {drift['message']}")

    if drift["retrain_recommended"]:
        print(f"\n  >>> RETRAIN RECOMMENDED <<<")

    # ── Step 6: Write system status ────────────────────────────────
    print(f"\n[Step 6] Writing system status...")
    write_system_status(logs, drift, new_pending, insights)

    print(f"\n{'=' * 60}")
    print(f"  Pipeline complete.")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    try:
        run_evaluation()
        sys.exit(0)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
