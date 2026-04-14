"""
GoldSense daily evaluation loop.

This evaluates pending calendar-day forecasts against verified market data,
updates rolling status, and persists future prediction batches for daily use.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from market_data import build_mumbai_price_breakdown, is_trading_day, previous_trading_day
from predict import classify_move, run_predictions
from preprocess import load_gold, load_usdinr, merge_datasets

ROOT = Path(__file__).parent.parent
DATASET_DIR = ROOT / "dataset"
LOGS_CSV = DATASET_DIR / "prediction_logs.csv"
PENDING_BATCHES_FILE = ROOT / "ml" / "model" / "pending_prediction.json"
SYSTEM_STATUS_FILE = ROOT / "ml" / "model" / "system_status.json"

LOG_COLUMNS = [
    "prediction_date",
    "target_date",
    "predicted_on",
    "horizon",
    "predicted_price_usd",
    "actual_price_usd",
    "difference",
    "pct_error",
    "predicted_price_24k_per_gram",
    "actual_price_24k_per_gram",
    "difference_24k_per_gram",
    "pct_error_24k_per_gram",
    "predicted_price_22k_per_gram",
    "actual_price_22k_per_gram",
    "difference_22k_per_gram",
    "pct_error_22k_per_gram",
    "predicted_price_24k_per_10g",
    "actual_price_24k_per_10g",
    "predicted_price_22k_per_10g",
    "actual_price_22k_per_10g",
    "direction_correct",
    "predicted_trend",
    "actual_trend",
    "location",
    "status",
    "created_at",
]

DRIFT_MAPE_THRESHOLD = 2.0
DRIFT_DIR_THRESHOLD = 45.0
DRIFT_WINDOW = 7


def _float_or_default(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value in (None, "", "None"):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _horizon_rank(value: Any) -> int:
    try:
        return int(str(value).upper().replace("D", ""))
    except (TypeError, ValueError):
        return 99


def _verified_market_data() -> pd.DataFrame:
    gold = load_gold()
    fx = load_usdinr()
    merged = merge_datasets(gold, fx, macro_df=None)
    return merged[["Date", "Price", "USD_INR"]].sort_values("Date").reset_index(drop=True)


def _verified_market_row(target_date: date) -> Optional[dict[str, Any]]:
    merged = _verified_market_data()
    row = merged[merged["Date"].dt.date == target_date]
    if not row.empty:
        item = row.iloc[-1]
        return {
            "date": target_date,
            "reference_date": target_date,
            "usd": float(item["Price"]),
            "usd_inr": float(item["USD_INR"]),
            "market_closed": False,
        }

    if not is_trading_day(target_date):
        reference_date = previous_trading_day(target_date)
        row = merged[merged["Date"].dt.date == reference_date]
        if row.empty:
            return None
        item = row.iloc[-1]
        return {
            "date": target_date,
            "reference_date": reference_date,
            "usd": float(item["Price"]),
            "usd_inr": float(item["USD_INR"]),
            "market_closed": True,
        }

    return None


def _previous_actual_close(target_date: date) -> Optional[dict[str, Any]]:
    merged = _verified_market_data()
    probe = previous_trading_day(target_date)
    for _ in range(10):
        row = merged[merged["Date"].dt.date == probe]
        if not row.empty:
            item = row.iloc[-1]
            return {
                "date": probe,
                "usd": float(item["Price"]),
                "usd_inr": float(item["USD_INR"]),
            }
        probe = previous_trading_day(probe)
    return None


def _read_pending_store() -> dict[str, Any]:
    if not PENDING_BATCHES_FILE.exists():
        return {"pending_batches": []}

    with open(PENDING_BATCHES_FILE, encoding="utf-8") as handle:
        payload = json.load(handle)

    if "pending_batches" in payload:
        normalized_by_generated: dict[str, dict[str, Any]] = {}
        for batch in payload.get("pending_batches", []):
            if not isinstance(batch, dict):
                continue

            calendar_horizons = batch.get("calendar_horizons")
            if calendar_horizons is None:
                legacy_horizons = batch.get("week_horizons", [])
                calendar_horizons = []
                for entry in legacy_horizons:
                    if not isinstance(entry, dict) or not entry.get("target_date"):
                        continue
                    calendar_horizons.append(
                        {
                            "horizon": entry.get("horizon", f"D{len(calendar_horizons) + 1}"),
                            "target_date": entry["target_date"],
                            "usd": entry.get("usd"),
                            "usd_inr": entry.get("usd_inr") or entry.get("usd_inr_rate"),
                            "price_24k_per_gram": entry.get("price_24k_per_gram"),
                            "price_22k_per_gram": entry.get("price_22k_per_gram"),
                            "price_24k_per_10g": entry.get("price_24k_per_10g"),
                            "price_22k_per_10g": entry.get("price_22k_per_10g"),
                            "trend": entry.get("direction_vs_today", entry.get("trend", "stable")),
                            "market_status": entry.get("market_status", entry.get("status", "forecast")),
                        }
                    )

            if not calendar_horizons:
                continue

            generated_on = batch.get("generated_on") or (str(batch.get("generated_at", ""))[:10] or None)
            deduped_entries: dict[tuple[str, str], dict[str, Any]] = {}
            for entry in calendar_horizons:
                deduped_entries[(str(entry["target_date"]), str(entry["horizon"]))] = entry

            normalized_by_generated[str(generated_on)] = {
                "generated_at": batch.get("generated_at"),
                "generated_on": generated_on,
                "base_verified_date": batch.get("base_verified_date"),
                "calendar_horizons": sorted(
                    deduped_entries.values(),
                    key=lambda item: (_horizon_rank(item.get("horizon")), item.get("target_date", "")),
                ),
            }

        payload["pending_batches"] = sorted(
            normalized_by_generated.values(),
            key=lambda item: str(item.get("generated_at") or item.get("generated_on") or ""),
        )
        return payload

    return {"pending_batches": []}


def _save_pending_store(store: dict[str, Any]) -> None:
    PENDING_BATCHES_FILE.parent.mkdir(exist_ok=True)
    with open(PENDING_BATCHES_FILE, "w", encoding="utf-8") as handle:
        json.dump(store, handle, indent=2)


def load_logs() -> pd.DataFrame:
    if LOGS_CSV.exists():
        logs = pd.read_csv(LOGS_CSV)
    else:
        logs = pd.DataFrame(columns=LOG_COLUMNS)

    for column in LOG_COLUMNS:
        if column not in logs.columns:
            logs[column] = None

    logs = logs.dropna(subset=["target_date", "predicted_price_usd"], how="any")
    logs = logs.drop_duplicates(subset=["target_date", "predicted_on", "horizon"], keep="last")
    return logs.reset_index(drop=True)


def save_logs(logs: pd.DataFrame) -> None:
    ordered = logs[LOG_COLUMNS].copy()
    ordered = ordered.drop_duplicates(subset=["target_date", "predicted_on", "horizon"], keep="last")
    ordered = ordered.sort_values(
        ["target_date", "predicted_on", "horizon"],
        ascending=[False, False, True],
        kind="mergesort",
    ).reset_index(drop=True)
    ordered.to_csv(LOGS_CSV, index=False)


def canonical_accuracy_view(logs: pd.DataFrame) -> pd.DataFrame:
    if logs.empty:
        return logs

    work = logs.copy()
    work["target_date"] = pd.to_datetime(work["target_date"], errors="coerce")
    work["predicted_on"] = work["predicted_on"].astype(str)
    work["created_at"] = pd.to_datetime(work["created_at"], errors="coerce")
    work["_horizon_rank"] = work["horizon"].apply(_horizon_rank)
    work = work.sort_values(
        ["target_date", "_horizon_rank", "predicted_on", "created_at"],
        ascending=[False, True, False, False],
        kind="mergesort",
    )
    work = work.dropna(subset=["target_date"])
    work = work.drop_duplicates(subset=["target_date"], keep="first")
    work = work.sort_values("target_date", ascending=False).reset_index(drop=True)
    work["target_date"] = work["target_date"].dt.strftime("%Y-%m-%d")
    return work.drop(columns=["_horizon_rank"])


def _log_exists(logs: pd.DataFrame, target_date: str, predicted_on: str, horizon: str) -> bool:
    if logs.empty:
        return False
    mask = (
        logs["target_date"].astype(str) == str(target_date)
    ) & (
        logs["predicted_on"].astype(str) == str(predicted_on)
    ) & (
        logs["horizon"].astype(str) == str(horizon)
    )
    return bool(mask.any())


def _evaluate_entry(entry: dict[str, Any], predicted_on: str) -> Optional[dict[str, Any]]:
    target_date = date.fromisoformat(entry["target_date"])
    actual = _verified_market_row(target_date)
    previous_actual = _previous_actual_close(target_date)
    if not actual or not previous_actual:
        return None

    actual_breakdown = build_mumbai_price_breakdown(actual["usd"], actual["usd_inr"])
    predicted_usd = float(entry["usd"])
    actual_usd = float(actual["usd"])
    usd_difference = round(actual_usd - predicted_usd, 2)
    usd_pct_error = round(abs(usd_difference / actual_usd) * 100, 3) if actual_usd else None

    predicted_fx = _float_or_default(entry.get("usd_inr"), float(previous_actual["usd_inr"]))
    predicted_breakdown = build_mumbai_price_breakdown(predicted_usd, predicted_fx)

    predicted_24k = _float_or_default(
        entry.get("price_24k_per_gram"),
        float(predicted_breakdown["price_24k_per_gram"]),
    )
    actual_24k = float(actual_breakdown["price_24k_per_gram"])
    diff_24k = round(actual_24k - predicted_24k, 2)
    pct_24k = round(abs(diff_24k / actual_24k) * 100, 3) if actual_24k else None

    predicted_22k = _float_or_default(
        entry.get("price_22k_per_gram"),
        float(predicted_breakdown["price_22k_per_gram"]),
    )
    actual_22k = float(actual_breakdown["price_22k_per_gram"])
    diff_22k = round(actual_22k - predicted_22k, 2)
    pct_22k = round(abs(diff_22k / actual_22k) * 100, 3) if actual_22k else None

    prev_close = float(previous_actual["usd"])
    predicted_trend = entry.get("trend") or classify_move(prev_close, predicted_usd)[0]
    actual_trend = classify_move(prev_close, actual_usd)[0]
    direction_correct = int(predicted_trend == actual_trend)

    return {
        "prediction_date": entry["target_date"],
        "target_date": entry["target_date"],
        "predicted_on": predicted_on,
        "horizon": entry["horizon"],
        "predicted_price_usd": round(predicted_usd, 2),
        "actual_price_usd": round(actual_usd, 2),
        "difference": usd_difference,
        "pct_error": usd_pct_error,
        "predicted_price_24k_per_gram": round(predicted_24k, 2),
        "actual_price_24k_per_gram": round(actual_24k, 2),
        "difference_24k_per_gram": diff_24k,
        "pct_error_24k_per_gram": pct_24k,
        "predicted_price_22k_per_gram": round(predicted_22k, 2),
        "actual_price_22k_per_gram": round(actual_22k, 2),
        "difference_22k_per_gram": diff_22k,
        "pct_error_22k_per_gram": pct_22k,
        "predicted_price_24k_per_10g": round(
            _float_or_default(entry.get("price_24k_per_10g"), float(predicted_breakdown["price_24k_per_10g"])),
            2,
        ),
        "actual_price_24k_per_10g": round(float(actual_breakdown["price_24k_per_10g"]), 2),
        "predicted_price_22k_per_10g": round(
            _float_or_default(entry.get("price_22k_per_10g"), float(predicted_breakdown["price_22k_per_10g"])),
            2,
        ),
        "actual_price_22k_per_10g": round(float(actual_breakdown["price_22k_per_10g"]), 2),
        "direction_correct": direction_correct,
        "predicted_trend": predicted_trend,
        "actual_trend": actual_trend,
        "location": "India benchmark",
        "status": "evaluated",
        "created_at": datetime.utcnow().isoformat(),
    }


def evaluate_pending_batches() -> pd.DataFrame:
    logs = load_logs()
    save_logs(logs)
    logs = load_logs()
    pending = _read_pending_store()
    retained_batches: list[dict[str, Any]] = []
    added_rows: list[dict[str, Any]] = []

    for batch in pending.get("pending_batches", []):
        predicted_on = batch.get("generated_on") or (batch.get("generated_at") or "")[:10]
        remaining_entries: list[dict[str, Any]] = []

        for entry in batch.get("calendar_horizons", []):
            target_date = date.fromisoformat(entry["target_date"])
            if target_date >= date.today():
                remaining_entries.append(entry)
                continue
            if _log_exists(logs, entry["target_date"], predicted_on, entry["horizon"]):
                continue
            evaluated = _evaluate_entry(entry, predicted_on)
            if evaluated is None:
                remaining_entries.append(entry)
                continue
            added_rows.append(evaluated)

        if remaining_entries:
            batch["calendar_horizons"] = remaining_entries
            retained_batches.append(batch)

    if added_rows:
        logs = pd.concat([logs, pd.DataFrame(added_rows)], ignore_index=True)
        save_logs(logs)
        logs = load_logs()

    pending["pending_batches"] = retained_batches
    _save_pending_store(pending)
    return logs


def add_new_prediction_batch(results: dict[str, Any]) -> dict[str, Any]:
    pending = _read_pending_store()
    generated_at = datetime.utcnow().isoformat()
    generated_on = generated_at[:10]
    horizons = []
    for index, entry in enumerate(results.get("calendar_horizons", []), start=1):
        horizons.append(
            {
                "horizon": f"D{index}",
                "target_date": entry["target_date"],
                "usd": entry["usd"],
                "usd_inr": entry["usd_inr_rate"],
                "price_24k_per_gram": entry["price_24k_per_gram"],
                "price_22k_per_gram": entry["price_22k_per_gram"],
                "price_24k_per_10g": entry["price_24k_per_10g"],
                "price_22k_per_10g": entry["price_22k_per_10g"],
                "trend": entry.get("direction_vs_today", entry.get("trend", "stable")),
                "market_status": entry.get("market_status", "forecast"),
            }
        )

    pending["pending_batches"] = [
        batch
        for batch in pending.get("pending_batches", [])
        if str(batch.get("generated_on")) != generated_on
    ]
    pending["pending_batches"].append(
        {
            "generated_at": generated_at,
            "generated_on": generated_on,
            "base_verified_date": results["tomorrow"].get("last_data_date"),
            "calendar_horizons": horizons,
        }
    )
    pending["pending_batches"] = pending["pending_batches"][-30:]
    _save_pending_store(pending)
    return pending


def _rolling_slice(logs: pd.DataFrame, horizon: str, window: int) -> pd.DataFrame:
    scoped = logs[logs["horizon"].astype(str) == horizon].copy()
    if scoped.empty:
        return scoped
    scoped["target_date"] = pd.to_datetime(scoped["target_date"])
    return scoped.sort_values("target_date", ascending=False).head(window)


def check_drift(logs: pd.DataFrame) -> dict[str, Any]:
    d1 = _rolling_slice(logs, "D1", DRIFT_WINDOW)
    if len(d1) < 3:
        return {
            "drift_detected": False,
            "message": "Not enough D1 evaluations",
            "avg_mape": 0,
            "dir_accuracy": 0,
            "window": DRIFT_WINDOW,
            "retrain_recommended": False,
        }

    avg_mape = float(d1["pct_error"].astype(float).mean())
    dir_accuracy = float(d1["direction_correct"].astype(float).mean() * 100)
    drift_detected = avg_mape > DRIFT_MAPE_THRESHOLD or dir_accuracy < DRIFT_DIR_THRESHOLD

    messages = []
    if avg_mape > DRIFT_MAPE_THRESHOLD:
        messages.append(f"D1 MAPE {avg_mape:.2f}% > {DRIFT_MAPE_THRESHOLD:.2f}%")
    if dir_accuracy < DRIFT_DIR_THRESHOLD:
        messages.append(f"D1 direction {dir_accuracy:.1f}% < {DRIFT_DIR_THRESHOLD:.1f}%")

    return {
        "drift_detected": drift_detected,
        "message": " | ".join(messages) if messages else "Model within D1 thresholds",
        "avg_mape": round(avg_mape, 3),
        "dir_accuracy": round(dir_accuracy, 1),
        "window": DRIFT_WINDOW,
        "retrain_recommended": drift_detected,
    }


def analyze_error_patterns(logs: pd.DataFrame) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []
    if logs.empty:
        return insights

    grouped = []
    for horizon in sorted(set(logs["horizon"].dropna().astype(str))):
        scoped = _rolling_slice(logs, horizon, 30)
        if scoped.empty:
            continue
        grouped.append((horizon, float(scoped["pct_error"].astype(float).mean())))

    if grouped:
        worst_horizon, worst_mape = max(grouped, key=lambda item: item[1])
        best_horizon, best_mape = min(grouped, key=lambda item: item[1])
        insights.append(
            {
                "type": "weekly_horizon",
                "message": f"Best recent horizon {best_horizon} at {best_mape:.2f}% MAPE; worst {worst_horizon} at {worst_mape:.2f}% MAPE.",
                "action": "Keep public copy focused on realized daily logs while retaining horizon analytics internally.",
            }
        )

    d1 = _rolling_slice(logs, "D1", 7)
    if not d1.empty:
        direction_acc = float(d1["direction_correct"].astype(float).mean() * 100)
        if direction_acc < 50:
            insights.append(
                {
                    "type": "direction",
                    "message": f"D1 direction accuracy is {direction_acc:.1f}%, so price-level accuracy should be emphasized over directional claims.",
                    "action": "Use confidence language and avoid strong rise/fall marketing claims.",
                }
            )

    return insights


def write_system_status(logs: pd.DataFrame, drift: dict[str, Any], insights: list[dict[str, str]], pending_store: dict[str, Any]) -> dict[str, Any]:
    horizon_metrics: dict[str, Any] = {}
    for horizon in sorted(set(logs["horizon"].dropna().astype(str))) if not logs.empty else []:
        scoped = _rolling_slice(logs, horizon, 30)
        if scoped.empty:
            continue
        horizon_metrics[horizon] = {
            "avg_mape": round(float(scoped["pct_error"].astype(float).mean()), 3),
            "direction_accuracy": round(float(scoped["direction_correct"].astype(float).mean() * 100), 1),
            "count": int(len(scoped)),
        }

    public_history = canonical_accuracy_view(logs)
    status = {
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "pipeline": "healthy",
        "total_predictions_logged": int(len(logs)),
        "public_history_rows": int(len(public_history)),
        "rolling_metrics": {
            "last_7": {
                "avg_mape": drift.get("avg_mape"),
                "direction_accuracy": drift.get("dir_accuracy"),
                "count": int(len(_rolling_slice(logs, "D1", 7))),
            },
            "last_30": horizon_metrics.get("D1", {}),
        },
        "horizon_metrics": horizon_metrics,
        "drift": drift,
        "insights": insights,
        "pending_batches": len(pending_store.get("pending_batches", [])),
        "next_prediction": pending_store.get("pending_batches", [])[-1] if pending_store.get("pending_batches") else None,
    }

    with open(SYSTEM_STATUS_FILE, "w", encoding="utf-8") as handle:
        json.dump(status, handle, indent=2)
    return status


def run_evaluation() -> dict[str, Any]:
    print("=" * 64)
    print("GoldSense - Daily Evaluation Pipeline")
    print("=" * 64)

    logs = evaluate_pending_batches()

    print("[1/4] Pending forecasts evaluated")
    print(f"  Logged rows: {len(logs)}")

    print("[2/4] Generating fresh forecasts")
    results = run_predictions()
    pending_store = add_new_prediction_batch(results)

    print("[3/4] Computing drift and insights")
    drift = check_drift(logs)
    insights = analyze_error_patterns(logs)

    if logs.empty:
        print("  No evaluated rows yet.")
    else:
        latest_public = canonical_accuracy_view(logs).iloc[0]
        print(
            f"  Latest: {latest_public['target_date']} | "
            f"Pred ${float(latest_public['predicted_price_usd']):,.2f} | "
            f"Actual ${float(latest_public['actual_price_usd']):,.2f} | "
            f"MAPE {float(latest_public['pct_error']):.2f}%"
        )
        print(f"  D1 Drift: {drift['message']}")

    print("[4/4] Writing system status")
    status = write_system_status(logs, drift, insights, pending_store)

    print("=" * 64)
    print("Pipeline complete")
    print("=" * 64)
    return {"logs": logs, "status": status, "results": results}


if __name__ == "__main__":
    try:
        run_evaluation()
        sys.exit(0)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
