"""
GoldSense ML Pipeline — XGBoost Model Training
Trains on merged gold price + USD/INR dataset, saves model and metadata.
"""

import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error

from preprocess import build_dataset, get_feature_columns

# ─── Paths ────────────────────────────────────────────────────────────────────
MODEL_DIR = Path(__file__).parent / "model"
MODEL_DIR.mkdir(exist_ok=True)
MODEL_PATH = MODEL_DIR / "gold_model.pkl"
METADATA_PATH = MODEL_DIR / "model_metadata.json"

VALIDATION_DAYS = 365  # Last 365 trading days as validation set


def train():
    print("=" * 60)
    print("GoldSense — XGBoost Training")
    print("=" * 60)

    # ── Build dataset ─────────────────────────────────────────────
    df = build_dataset()

    feature_cols = [c for c in get_feature_columns() if c in df.columns]
    X = df[feature_cols]
    y = df["next_day_price"]

    # ── Time-based train/validation split ─────────────────────────
    split_idx = len(df) - VALIDATION_DAYS
    X_train, X_val = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_val = y.iloc[:split_idx], y.iloc[split_idx:]

    train_dates = df["Date"].iloc[:split_idx]
    val_dates = df["Date"].iloc[split_idx:]

    print(f"\nTrain: {train_dates.iloc[0].date()} → {train_dates.iloc[-1].date()} ({len(X_train)} rows)")
    print(f"Valid: {val_dates.iloc[0].date()} → {val_dates.iloc[-1].date()} ({len(X_val)} rows)")
    print(f"Features: {len(feature_cols)}")

    # ── Model definition ──────────────────────────────────────────
    model = XGBRegressor(
        n_estimators=1000,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        early_stopping_rounds=50,
        eval_metric="rmse",
        random_state=42,
        n_jobs=-1,
    )

    # ── Training ──────────────────────────────────────────────────
    print("\nTraining XGBoost model...")
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=100,
    )

    # ── Evaluation ────────────────────────────────────────────────
    val_preds = model.predict(X_val)

    rmse = float(np.sqrt(mean_squared_error(y_val, val_preds)))
    mae = float(mean_absolute_error(y_val, val_preds))
    mape = float(np.mean(np.abs((y_val.values - val_preds) / y_val.values)) * 100)

    # Direction accuracy (did we predict up/down correctly?)
    actual_direction = np.sign(y_val.values - df["Price"].iloc[split_idx:].values)
    pred_direction = np.sign(val_preds - df["Price"].iloc[split_idx:].values)
    direction_accuracy = float(np.mean(actual_direction == pred_direction) * 100)

    print(f"\n{'─' * 40}")
    print(f"Validation Metrics:")
    print(f"  RMSE:               ${rmse:.2f}")
    print(f"  MAE:                ${mae:.2f}")
    print(f"  MAPE:               {mape:.2f}%")
    print(f"  Direction Accuracy: {direction_accuracy:.1f}%")
    print(f"  Best iteration:     {model.best_iteration}")
    print(f"{'─' * 40}")

    # ── Feature importance ────────────────────────────────────────
    importance = dict(zip(feature_cols, model.feature_importances_.tolist()))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
    print("\nTop 10 Important Features:")
    for feat, imp in top_features:
        print(f"  {feat:<35} {imp:.4f}")

    # ── Save model ────────────────────────────────────────────────
    joblib.dump(model, MODEL_PATH)
    print(f"\nModel saved: {MODEL_PATH}")

    # ── Save metadata ─────────────────────────────────────────────
    metadata = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "training_rows": len(X_train),
        "validation_rows": len(X_val),
        "train_date_range": {
            "start": str(train_dates.iloc[0].date()),
            "end": str(train_dates.iloc[-1].date()),
        },
        "val_date_range": {
            "start": str(val_dates.iloc[0].date()),
            "end": str(val_dates.iloc[-1].date()),
        },
        "metrics": {
            "rmse": rmse,
            "mae": mae,
            "mape": mape,
            "direction_accuracy_pct": direction_accuracy,
        },
        "model_params": {
            "n_estimators": model.best_iteration,
            "max_depth": 6,
            "learning_rate": 0.05,
        },
        "features": feature_cols,
        "top_features": [f[0] for f in top_features],
    }

    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved: {METADATA_PATH}")

    return model, metadata


if __name__ == "__main__":
    model, metadata = train()
    print(f"\nTraining complete!")
    print(f"RMSE: ${metadata['metrics']['rmse']:.2f} | MAE: ${metadata['metrics']['mae']:.2f} | MAPE: {metadata['metrics']['mape']:.2f}%")
