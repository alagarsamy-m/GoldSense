"""
GoldSense prediction and public-market payload generation.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from market_data import (
    build_market_context,
    build_mumbai_price_breakdown,
    current_week_dates,
    is_trading_day,
    market_context_from_dataframe,
    next_trading_day,
)
from preprocess import add_features, build_dataset, get_feature_columns
from sentiment_service import get_gold_sentiment, sentiment_signal

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).parent / "model"
MODEL_PATH = MODEL_DIR / "gold_model.pkl"
MODEL_Q10_PATH = MODEL_DIR / "gold_model_q10.pkl"
MODEL_Q90_PATH = MODEL_DIR / "gold_model_q90.pkl"
DIR_MODEL_PATH = MODEL_DIR / "gold_direction_model.pkl"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
STABLE_BAND_PCT = 0.25


def load_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found at {MODEL_PATH}. Run `python train.py` first.")

    model = joblib.load(MODEL_PATH)
    model_q10 = joblib.load(MODEL_Q10_PATH) if MODEL_Q10_PATH.exists() else None
    model_q90 = joblib.load(MODEL_Q90_PATH) if MODEL_Q90_PATH.exists() else None
    dir_model = joblib.load(DIR_MODEL_PATH) if DIR_MODEL_PATH.exists() else None

    metadata: dict[str, Any] = {}
    if METADATA_PATH.exists():
        with open(METADATA_PATH, encoding="utf-8") as handle:
            metadata = json.load(handle)

    return model, model_q10, model_q90, dir_model, metadata


def _feature_columns(df: pd.DataFrame, metadata: Optional[dict[str, Any]]) -> list[str]:
    saved = (metadata or {}).get("features", [])
    if saved:
        return [column for column in saved if column in df.columns]
    return [column for column in get_feature_columns() if column in df.columns]


def _training_target(metadata: Optional[dict[str, Any]]) -> str:
    return (metadata or {}).get("training_target", "absolute_price")


def classify_move(reference_usd: float, target_usd: float, stable_band_pct: float = STABLE_BAND_PCT) -> tuple[str, float, float]:
    if not reference_usd:
        return "stable", 0.0, 0.0

    delta_usd = float(target_usd) - float(reference_usd)
    delta_pct = (delta_usd / float(reference_usd)) * 100
    if delta_pct > stable_band_pct:
        direction = "up"
    elif delta_pct < -stable_band_pct:
        direction = "down"
    else:
        direction = "stable"
    return direction, round(delta_pct, 3), round(delta_usd, 2)


def get_market_context(df: pd.DataFrame) -> dict[str, Any]:
    av_key = os.environ.get("ALPHAVANTAGE_KEY", "")
    return market_context_from_dataframe(df, alpha_vantage_key=av_key).to_dict()


def get_today_live_price() -> Optional[dict[str, Any]]:
    df = build_dataset(drop_target_na=False)
    market = market_context_from_dataframe(df, alpha_vantage_key=os.environ.get("ALPHAVANTAGE_KEY", ""))
    prices = build_mumbai_price_breakdown(market.usd_per_oz, market.usd_inr_rate)

    return {
        "date": str(date.today()),
        "reference_mode": "live_last",
        "quote_label": "Live last available price",
        "quote_note": "This is the latest live or delayed market quote, not the official open or final close.",
        "live_usd": round(market.usd_per_oz, 2),
        "usd_inr_rate": round(market.usd_inr_rate, 4),
        "verified_date": market.verified_date,
        "as_of": market.as_of,
        "source": market.source,
        "market_status": market.market_status,
        "is_live": market.is_live,
        **prices,
    }


def _predict_sequence(
    df: pd.DataFrame,
    model,
    feature_cols: list[str],
    metadata: Optional[dict[str, Any]] = None,
    model_q10=None,
    model_q90=None,
    dir_model=None,
    count: int = 7,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    work_df = df.copy()
    training_target = _training_target(metadata)
    market = market_context_from_dataframe(work_df, alpha_vantage_key=os.environ.get("ALPHAVANTAGE_KEY", ""))
    latest_verified_date = work_df["Date"].iloc[-1].date()
    last_verified_close = float(work_df["Price"].iloc[-1])

    if training_target == "log_return":
        work_df.iloc[-1, work_df.columns.get_loc("Price")] = market.usd_per_oz

    drift = 0.0
    if training_target != "log_return" and market.is_live and last_verified_close > 0:
        drift = market.usd_per_oz - last_verified_close

    entries: list[dict[str, Any]] = []
    forecast_date = next_trading_day(latest_verified_date)

    for horizon in range(1, count + 1):
        temp_df = add_features(work_df)
        available = [column for column in feature_cols if column in temp_df.columns]
        latest_row = temp_df[available].iloc[-1].values.reshape(1, -1)
        raw_pred = float(model.predict(latest_row)[0])

        current_price = float(work_df["Price"].iloc[-1])
        if training_target == "log_return":
            predicted_usd = current_price * np.exp(raw_pred)
        else:
            predicted_usd = raw_pred + drift

        breakdown = build_mumbai_price_breakdown(predicted_usd, market.usd_inr_rate)
        trend, pct_change, delta_usd = classify_move(current_price, predicted_usd)
        entry = {
            "horizon": f"D{horizon}",
            "target_date": str(forecast_date),
            "date": str(forecast_date),
            "day": forecast_date.strftime("%a"),
            "usd": round(predicted_usd, 2),
            "usd_inr_rate": round(market.usd_inr_rate, 4),
            "status": "forecast",
            "is_trading_day": True,
            "trend": trend,
            "pct_change": pct_change,
            "delta_usd": delta_usd,
            **breakdown,
        }

        if dir_model is not None and horizon == 1:
            try:
                direction_probability = float(dir_model.predict_proba(latest_row)[0][1])
                if direction_probability >= 0.58:
                    entry["trend"] = "up"
                elif direction_probability <= 0.42:
                    entry["trend"] = "down"
                else:
                    entry["trend"] = "stable"
                entry["direction_confidence"] = round(max(direction_probability, 1 - direction_probability) * 100, 1)
            except Exception:
                pass

        if model_q10 is not None and model_q90 is not None:
            lower_return = float(model_q10.predict(latest_row)[0])
            upper_return = float(model_q90.predict(latest_row)[0])
            if training_target == "log_return":
                ci_lower_usd = current_price * np.exp(lower_return)
                ci_upper_usd = current_price * np.exp(upper_return)
            else:
                ci_lower_usd = lower_return + drift
                ci_upper_usd = upper_return + drift

            lower_breakdown = build_mumbai_price_breakdown(ci_lower_usd, market.usd_inr_rate)
            upper_breakdown = build_mumbai_price_breakdown(ci_upper_usd, market.usd_inr_rate)
            entry["confidence_interval"] = {
                "lower_usd": round(ci_lower_usd, 2),
                "upper_usd": round(ci_upper_usd, 2),
                "lower_24k_per_gram": lower_breakdown["price_24k_per_gram"],
                "upper_24k_per_gram": upper_breakdown["price_24k_per_gram"],
                "lower_22k_per_gram": lower_breakdown["price_22k_per_gram"],
                "upper_22k_per_gram": upper_breakdown["price_22k_per_gram"],
                "interval_pct": round(((ci_upper_usd - ci_lower_usd) / predicted_usd) * 100, 2) if predicted_usd else None,
            }

        entries.append(entry)

        recent_ranges = work_df.tail(30)
        if "High" in recent_ranges.columns and "Low" in recent_ranges.columns:
            avg_range_pct = ((recent_ranges["High"] - recent_ranges["Low"]) / recent_ranges["Price"]).mean()
        else:
            avg_range_pct = 0.01
        avg_range_pct = float(avg_range_pct) if pd.notna(avg_range_pct) else 0.01
        half_range = predicted_usd * avg_range_pct / 2

        new_row = work_df.iloc[-1].copy()
        new_row["Date"] = pd.Timestamp(forecast_date)
        new_row["Price"] = predicted_usd
        new_row["Open"] = predicted_usd
        new_row["High"] = predicted_usd + half_range
        new_row["Low"] = predicted_usd - half_range
        new_row["Change %"] = ((predicted_usd - current_price) / current_price) * 100 if current_price else 0
        work_df = pd.concat([work_df, pd.DataFrame([new_row])], ignore_index=True)
        forecast_date = next_trading_day(forecast_date)

    return entries, market.to_dict()


def _carry_forward_entry(target_day: date, reference_usd: float, usd_inr_rate: float, status: str) -> dict[str, Any]:
    breakdown = build_mumbai_price_breakdown(reference_usd, usd_inr_rate)
    return {
        "date": str(target_day),
        "target_date": str(target_day),
        "day": target_day.strftime("%a"),
        "status": status,
        "market_status": status,
        "is_trading_day": False,
        "usd": round(float(reference_usd), 2),
        "usd_inr_rate": round(float(usd_inr_rate), 4),
        "trend": "stable",
        "pct_change": 0.0,
        "delta_usd": 0.0,
        **breakdown,
    }


def _decorate_against_today(entry: dict[str, Any], market: dict[str, Any]) -> dict[str, Any]:
    direction_vs_today, delta_pct, delta_usd = classify_move(float(market["usd_per_oz"]), float(entry["usd"]))
    entry["reference_live_usd"] = round(float(market["usd_per_oz"]), 2)
    entry["reference_live_price_24k_per_gram"] = build_mumbai_price_breakdown(
        float(market["usd_per_oz"]),
        float(market["usd_inr_rate"]),
    )["price_24k_per_gram"]
    entry["direction_vs_today"] = direction_vs_today
    entry["direction_delta_pct"] = delta_pct
    entry["direction_delta_usd"] = delta_usd
    return entry


def build_calendar_horizon_view(
    df: pd.DataFrame,
    trading_sequence: list[dict[str, Any]],
    market: dict[str, Any],
    count: int = 7,
) -> list[dict[str, Any]]:
    forecast_map = {date.fromisoformat(item["target_date"]): item for item in trading_sequence}
    reference_live_usd = float(market["usd_per_oz"])
    reference_fx = float(market["usd_inr_rate"])
    carry_forward = _carry_forward_entry(date.today(), reference_live_usd, reference_fx, "reference_live")
    entries: list[dict[str, Any]] = []

    for offset in range(1, count + 1):
        target_day = date.today() + timedelta(days=offset)
        if is_trading_day(target_day) and target_day in forecast_map:
            entry = dict(forecast_map[target_day])
            entry["market_status"] = "forecast"
            carry_forward = entry
        elif is_trading_day(target_day):
            entry = dict(carry_forward)
            entry.update(
                {
                    "date": str(target_day),
                    "target_date": str(target_day),
                    "day": target_day.strftime("%a"),
                    "status": "forecast",
                    "market_status": "forecast",
                    "is_trading_day": True,
                }
            )
            carry_forward = entry
        else:
            entry = dict(carry_forward)
            entry.update(
                {
                    "date": str(target_day),
                    "target_date": str(target_day),
                    "day": target_day.strftime("%a"),
                    "status": "market_closed",
                    "market_status": "market_closed",
                    "is_trading_day": False,
                    "trend": "stable",
                    "pct_change": 0.0,
                    "delta_usd": 0.0,
                }
            )
            entry.pop("direction_confidence", None)
            entry.pop("confidence_interval", None)

        entries.append(_decorate_against_today(entry, market))

    return entries


def _current_week_actual_rows(df: pd.DataFrame) -> dict[date, pd.Series]:
    week_dates = set(current_week_dates())
    actuals = df[df["Date"].dt.date.isin(week_dates)].copy()
    return {row["Date"].date(): row for _, row in actuals.iterrows()}


def build_current_week_view(
    df: pd.DataFrame,
    trading_sequence: list[dict[str, Any]],
    market: dict[str, Any],
) -> list[dict[str, Any]]:
    latest_verified_date = df["Date"].iloc[-1].date()
    actual_rows = _current_week_actual_rows(df)
    latest_fx = float(df["USD_INR"].iloc[-1])
    forecast_map = {date.fromisoformat(item["target_date"]): item for item in trading_sequence}

    week_entries: list[dict[str, Any]] = []
    carry_forward_entry: Optional[dict[str, Any]] = None

    for day in current_week_dates():
        if day in actual_rows:
            row = actual_rows[day]
            breakdown = build_mumbai_price_breakdown(float(row["Price"]), float(row["USD_INR"]))
            entry = {
                "date": str(day),
                "target_date": str(day),
                "day": day.strftime("%a"),
                "status": "actual",
                "market_status": "actual",
                "is_trading_day": is_trading_day(day),
                "usd": round(float(row["Price"]), 2),
                "usd_inr_rate": round(float(row["USD_INR"]), 4),
                **breakdown,
            }
            carry_forward_entry = entry
        elif is_trading_day(day) and day > latest_verified_date and day in forecast_map:
            entry = dict(forecast_map[day])
            entry["status"] = "forecast"
            entry["market_status"] = "forecast"
            carry_forward_entry = entry
        elif not is_trading_day(day):
            base = dict(carry_forward_entry or _carry_forward_entry(day, market["usd_per_oz"], latest_fx, "market_closed"))
            base.update(
                {
                    "date": str(day),
                    "target_date": str(day),
                    "day": day.strftime("%a"),
                    "status": "market_closed",
                    "market_status": "market_closed",
                    "is_trading_day": False,
                }
            )
            base.pop("direction_confidence", None)
            entry = base
        else:
            breakdown = build_mumbai_price_breakdown(float(df["Price"].iloc[-1]), latest_fx)
            entry = {
                "date": str(day),
                "target_date": str(day),
                "day": day.strftime("%a"),
                "status": "forecast",
                "market_status": "forecast",
                "is_trading_day": True,
                "usd": round(float(df["Price"].iloc[-1]), 2),
                "usd_inr_rate": round(latest_fx, 4),
                **breakdown,
            }
            carry_forward_entry = entry

        week_entries.append(_decorate_against_today(entry, market))

    return week_entries


def predict_tomorrow(
    df: pd.DataFrame,
    model,
    feature_cols: list[str],
    metadata: Optional[dict[str, Any]] = None,
    model_q10=None,
    model_q90=None,
    dir_model=None,
) -> dict[str, Any]:
    trading_sequence, market = _predict_sequence(
        df=df,
        model=model,
        feature_cols=feature_cols,
        metadata=metadata,
        model_q10=model_q10,
        model_q90=model_q90,
        dir_model=dir_model,
        count=7,
    )
    calendar_horizons = build_calendar_horizon_view(df, trading_sequence, market, count=7)
    tomorrow = dict(calendar_horizons[0])
    latest_verified_date = df["Date"].iloc[-1].date()
    latest_verified_close = float(df["Price"].iloc[-1])

    result = {
        "prediction_date": tomorrow["target_date"],
        "target_date": tomorrow["target_date"],
        "target_type": "calendar_close",
        "reference_mode": "live_last",
        "market_closed": not bool(tomorrow.get("is_trading_day", True)),
        "last_data_date": str(latest_verified_date),
        "last_actual_usd": round(latest_verified_close, 2),
        "reference_live_usd": tomorrow["reference_live_usd"],
        "reference_as_of": market["as_of"],
        "reference_source": market["source"],
        "reference_market_status": market["market_status"],
        "reference_is_live": market["is_live"],
        "today_quote_note": "Direction compares tomorrow's estimated close against today's live last price.",
        "tomorrow_usd": tomorrow["usd"],
        "usd_inr_rate": tomorrow["usd_inr_rate"],
        "trend": tomorrow.get("direction_vs_today", "stable"),
        "direction_vs_today": tomorrow.get("direction_vs_today", "stable"),
        "direction_delta_pct": tomorrow.get("direction_delta_pct", 0.0),
        "direction_delta_usd": tomorrow.get("direction_delta_usd", 0.0),
        "pct_change": tomorrow.get("direction_delta_pct", 0.0),
        **{
            f"tomorrow_{key}": value
            for key, value in tomorrow.items()
            if key.startswith("price_") or key == "pricing_formula"
        },
    }
    if "confidence_interval" in tomorrow:
        result["confidence_interval"] = tomorrow["confidence_interval"]
    if "direction_confidence" in tomorrow:
        result["direction_confidence"] = tomorrow["direction_confidence"]

    result["as_of"] = market["as_of"]
    result["source"] = "model_forecast"
    result["market_status"] = tomorrow.get("market_status", "forecast")
    result["is_live"] = False
    return result


def predict_week(
    df: pd.DataFrame,
    model,
    feature_cols: list[str],
    metadata: Optional[dict[str, Any]] = None,
    model_q10=None,
    model_q90=None,
) -> list[dict[str, Any]]:
    trading_sequence, market = _predict_sequence(
        df=df,
        model=model,
        feature_cols=feature_cols,
        metadata=metadata,
        model_q10=model_q10,
        model_q90=model_q90,
        count=7,
    )
    return build_current_week_view(df, trading_sequence, market)


def run_predictions() -> dict[str, Any]:
    model, model_q10, model_q90, dir_model, metadata = load_model()
    df = build_dataset(drop_target_na=False)
    feature_cols = _feature_columns(df, metadata)

    trading_horizons, market = _predict_sequence(df, model, feature_cols, metadata, model_q10, model_q90, dir_model, count=7)
    calendar_horizons = build_calendar_horizon_view(df, trading_horizons, market, count=7)
    tomorrow = predict_tomorrow(df, model, feature_cols, metadata, model_q10, model_q90, dir_model)
    week_forecast = build_current_week_view(df, trading_horizons, market)

    try:
        sentiment = get_gold_sentiment(
            alpha_vantage_key=os.environ.get("ALPHAVANTAGE_KEY", ""),
            newsapi_key=os.environ.get("NEWSAPI_KEY", ""),
        )
        tomorrow["sentiment"] = {
            "score": sentiment["score"],
            "label": sentiment["label"],
            "confidence": sentiment["confidence"],
            "signal": sentiment_signal(sentiment["score"], tomorrow.get("trend", "stable")),
            "article_count": sentiment["article_count"],
            "source": sentiment["source"],
            "top_headlines": sentiment["top_headlines"],
            "fetched_at": sentiment["fetched_at"],
        }
    except Exception as exc:
        logger.warning("Sentiment fetch failed: %s", exc)

    metrics = (metadata or {}).get("metrics", {})
    cv_metrics = (metadata or {}).get("cv_metrics", {})

    return {
        "today": get_today_live_price(),
        "tomorrow": tomorrow,
        "week_forecast": week_forecast,
        "trading_horizons": trading_horizons,
        "calendar_horizons": calendar_horizons,
        "market_context": market,
        "model_info": {
            "trained_at": metadata.get("trained_at", "unknown"),
            "rmse": metrics.get("rmse", 0),
            "mae": metrics.get("mae", 0),
            "mape": metrics.get("mape", 0),
            "direction_accuracy": metrics.get("direction_accuracy_pct", 0),
            "interval_coverage": metrics.get("interval_coverage_pct", 0),
            "cv_direction_accuracy": cv_metrics.get("cv_dir_accuracy", 0),
            "cv_mape": cv_metrics.get("cv_mape", 0),
            "macro_features": metadata.get("macro_features", False),
            "has_confidence_intervals": model_q10 is not None and model_q90 is not None,
            "target_type": "calendar_close",
            "stable_band_pct": STABLE_BAND_PCT,
        },
    }


if __name__ == "__main__":
    results = run_predictions()
    tomorrow = results["tomorrow"]

    print("=" * 64)
    print("GoldSense - Public Market Summary")
    print("=" * 64)
    print(f"Tomorrow target date: {tomorrow['prediction_date']}")
    print(f"Target type: {tomorrow['target_type']}")
    print(f"Reference live source: {tomorrow['reference_source']} ({tomorrow['reference_market_status']})")
    print(f"Estimated close USD/oz: ${tomorrow['tomorrow_usd']:,.2f}")
    print(f"24k/g estimate: Rs {tomorrow['tomorrow_price_24k_per_gram']:,.2f}")
    print(f"22k/g estimate: Rs {tomorrow['tomorrow_price_22k_per_gram']:,.2f}")
    print()
    print("Current week (Mon-Sun):")
    for row in results["week_forecast"]:
        print(
            f"{row['date']} {row['day']:<3} {row['status']:<13} "
            f"${row['usd']:>9,.2f} Rs {row['price_24k_per_gram']:>9,.2f}"
        )
