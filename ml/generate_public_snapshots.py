"""
Generate static public snapshot JSON files consumed by the Vercel frontend.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from evaluate import canonical_accuracy_view, load_logs
from predict import run_predictions

ROOT = Path(__file__).parent.parent
SNAPSHOT_DIR = ROOT / "frontend" / "public" / "snapshots"


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def _json_safe_records(frame) -> list[dict]:
    safe = frame.copy()
    for column in safe.columns:
        if pd.api.types.is_datetime64_any_dtype(safe[column]):
            safe[column] = safe[column].dt.strftime("%Y-%m-%dT%H:%M:%SZ").fillna("")
    safe = safe.fillna("")
    return safe.to_dict(orient="records")


def generate_public_snapshots() -> dict:
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    results = run_predictions()
    logs = load_logs()
    public_history = canonical_accuracy_view(logs)
    preview = _json_safe_records(public_history.head(7))
    all_rows = _json_safe_records(public_history)

    today_payload = {"generated_at": generated_at, **results["today"]}
    tomorrow_payload = {
        "generated_at": generated_at,
        **results["tomorrow"],
        "model_info": results["model_info"],
    }
    week_payload = {
        "generated_at": generated_at,
        "forecast": results["week_forecast"],
        "market_context": results["market_context"],
    }
    accuracy_payload = {
        "generated_at": generated_at,
        "latest_7": preview,
        "full_history": all_rows,
        "preview": preview,
        "rows": all_rows,
        "count": len(all_rows),
    }
    home_payload = {
        "generated_at": generated_at,
        "today": today_payload,
        "tomorrow": tomorrow_payload,
        "week": week_payload,
        "accuracy": {
            "preview": preview,
            "count": len(all_rows),
        },
        "model_info": results["model_info"],
    }

    _write_json(SNAPSHOT_DIR / "today.json", today_payload)
    _write_json(SNAPSHOT_DIR / "tomorrow.json", tomorrow_payload)
    _write_json(SNAPSHOT_DIR / "week.json", week_payload)
    _write_json(SNAPSHOT_DIR / "accuracy.json", accuracy_payload)
    _write_json(SNAPSHOT_DIR / "home.json", home_payload)
    return home_payload


if __name__ == "__main__":
    generate_public_snapshots()
