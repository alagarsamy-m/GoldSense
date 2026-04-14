"""
GoldSense ML Pipeline — XGBoost Model Training
Architecture:
  - Dual model: XGBClassifier (direction UP/DOWN) + XGBRegressor (magnitude)
  - Direction model is the primary output — most actionable for users
  - Magnitude model predicts |log_return| for price level estimation
  - Optuna hyperparameter tuning (30 trials)
  - Walk-forward cross-validation (5 folds)
  - Quantile models (q=0.1, q=0.9) for confidence intervals
  - Macro features: DXY, VIX, TNX, OIL
"""

import json
import sys
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

import optuna
optuna.logging.set_verbosity(optuna.logging.WARNING)

from xgboost import XGBRegressor, XGBClassifier
from sklearn.metrics import mean_squared_error, mean_absolute_error, accuracy_score
from sklearn.model_selection import TimeSeriesSplit

from preprocess import build_dataset, get_feature_columns

# ─── Paths ────────────────────────────────────────────────────────────────────
MODEL_DIR = Path(__file__).parent / "model"
MODEL_DIR.mkdir(exist_ok=True)
MODEL_PATH      = MODEL_DIR / "gold_model.pkl"
MODEL_Q10_PATH  = MODEL_DIR / "gold_model_q10.pkl"
MODEL_Q90_PATH  = MODEL_DIR / "gold_model_q90.pkl"
DIR_MODEL_PATH  = MODEL_DIR / "gold_direction_model.pkl"
METADATA_PATH   = MODEL_DIR / "model_metadata.json"

VALIDATION_DAYS = 365   # hold-out set (not used during tuning)
N_CV_FOLDS      = 5     # walk-forward folds
N_OPTUNA_TRIALS = 30    # hyperparameter search trials


# ─── Walk-forward cross-validation ────────────────────────────────────────────

def walk_forward_cv(X: pd.DataFrame, y: pd.Series, params: dict, n_splits: int = N_CV_FOLDS) -> dict:
    """Walk-forward CV for the regression model."""
    tscv = TimeSeriesSplit(n_splits=n_splits, test_size=max(60, len(X) // (n_splits * 4)))

    rmses, maes, mapes, dir_accs = [], [], [], []

    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_tr, X_vl = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_vl = y.iloc[train_idx], y.iloc[val_idx]

        model = XGBRegressor(**params, random_state=42, n_jobs=-1)
        model.fit(X_tr, y_tr, eval_set=[(X_vl, y_vl)], verbose=False)
        preds = model.predict(X_vl)

        pred_prices   = np.exp(np.cumsum(preds))
        actual_prices = np.exp(np.cumsum(y_vl.values))

        rmse = float(np.sqrt(mean_squared_error(actual_prices, pred_prices)))
        mae  = float(mean_absolute_error(actual_prices, pred_prices))
        mape = float(np.mean(np.abs((actual_prices - pred_prices) / actual_prices)) * 100)

        actual_dir = np.sign(y_vl.values)
        pred_dir   = np.sign(preds)
        non_flat   = actual_dir != 0
        dir_acc    = float(np.mean(actual_dir[non_flat] == pred_dir[non_flat]) * 100) if non_flat.any() else 0.0

        rmses.append(rmse); maes.append(mae); mapes.append(mape); dir_accs.append(dir_acc)

    return {
        "cv_rmse":  float(np.mean(rmses)),
        "cv_mae":   float(np.mean(maes)),
        "cv_mape":  float(np.mean(mapes)),
        "cv_dir_accuracy": float(np.mean(dir_accs)),
        "cv_rmse_std": float(np.std(rmses)),
        "cv_folds": n_splits,
    }


def walk_forward_cv_classifier(X: pd.DataFrame, y: pd.Series, params: dict, n_splits: int = N_CV_FOLDS) -> dict:
    """Walk-forward CV for direction classification model."""
    tscv = TimeSeriesSplit(n_splits=n_splits, test_size=max(60, len(X) // (n_splits * 4)))
    dir_accs = []

    for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
        X_tr, X_vl = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_vl = y.iloc[train_idx], y.iloc[val_idx]

        model = XGBClassifier(**params, random_state=42, n_jobs=-1, use_label_encoder=False)
        model.fit(X_tr, y_tr, eval_set=[(X_vl, y_vl)], verbose=False)
        preds = model.predict(X_vl)
        dir_accs.append(float(accuracy_score(y_vl, preds)) * 100)

    return {
        "cv_dir_accuracy": float(np.mean(dir_accs)),
        "cv_dir_std": float(np.std(dir_accs)),
        "cv_folds": n_splits,
    }


# ─── Optuna hyperparameter tuning ─────────────────────────────────────────────

def tune_hyperparams(X_train: pd.DataFrame, y_train: pd.Series, n_trials: int = N_OPTUNA_TRIALS) -> dict:
    """Tune XGBRegressor hyperparameters using Optuna."""
    split = int(len(X_train) * 0.8)
    X_tr, X_vl = X_train.iloc[:split], X_train.iloc[split:]
    y_tr, y_vl = y_train.iloc[:split], y_train.iloc[split:]

    def objective(trial):
        params = {
            "n_estimators":      trial.suggest_int("n_estimators", 200, 1000),
            "max_depth":         trial.suggest_int("max_depth", 3, 8),
            "learning_rate":     trial.suggest_float("learning_rate", 0.005, 0.05, log=True),
            "subsample":         trial.suggest_float("subsample", 0.6, 0.95),
            "colsample_bytree":  trial.suggest_float("colsample_bytree", 0.3, 0.8),
            "min_child_weight":  trial.suggest_int("min_child_weight", 5, 50),
            "gamma":             trial.suggest_float("gamma", 0.0, 1.0),
            "reg_alpha":         trial.suggest_float("reg_alpha", 0.01, 5.0, log=True),
            "reg_lambda":        trial.suggest_float("reg_lambda", 0.5, 5.0),
        }
        model = XGBRegressor(**params, random_state=42, n_jobs=-1)
        model.fit(X_tr, y_tr, eval_set=[(X_vl, y_vl)], verbose=False)
        preds = model.predict(X_vl)
        return float(np.sqrt(mean_squared_error(y_vl, preds)))

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    best = study.best_params
    print(f"\n  Optuna best trial: RMSE={study.best_value:.6f}")
    print(f"  max_depth={best['max_depth']}, lr={best['learning_rate']:.4f}, "
          f"n_est={best['n_estimators']}, subsample={best['subsample']:.2f}")
    return best


def tune_direction_model(X_train: pd.DataFrame, y_train: pd.Series, n_trials: int = N_OPTUNA_TRIALS) -> dict:
    """Tune XGBClassifier for direction prediction."""
    split = int(len(X_train) * 0.8)
    X_tr, X_vl = X_train.iloc[:split], X_train.iloc[split:]
    y_tr, y_vl = y_train.iloc[:split], y_train.iloc[split:]

    def objective(trial):
        params = {
            "n_estimators":      trial.suggest_int("n_estimators", 100, 800),
            "max_depth":         trial.suggest_int("max_depth", 2, 6),
            "learning_rate":     trial.suggest_float("learning_rate", 0.005, 0.1, log=True),
            "subsample":         trial.suggest_float("subsample", 0.5, 0.95),
            "colsample_bytree":  trial.suggest_float("colsample_bytree", 0.3, 0.8),
            "min_child_weight":  trial.suggest_int("min_child_weight", 10, 100),
            "gamma":             trial.suggest_float("gamma", 0.0, 2.0),
            "reg_alpha":         trial.suggest_float("reg_alpha", 0.01, 10.0, log=True),
            "reg_lambda":        trial.suggest_float("reg_lambda", 1.0, 10.0),
            "scale_pos_weight":  trial.suggest_float("scale_pos_weight", 0.8, 1.2),
            "objective":         "binary:logistic",
            "eval_metric":       "logloss",
        }
        model = XGBClassifier(**params, random_state=42, n_jobs=-1, use_label_encoder=False)
        model.fit(X_tr, y_tr, eval_set=[(X_vl, y_vl)], verbose=False)
        preds = model.predict(X_vl)
        return 1.0 - float(accuracy_score(y_vl, preds))  # minimize error

    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    best = study.best_params
    best_acc = (1.0 - study.best_value) * 100
    print(f"\n  Direction model Optuna best: accuracy={best_acc:.1f}%")
    print(f"  max_depth={best['max_depth']}, lr={best['learning_rate']:.4f}, "
          f"n_est={best['n_estimators']}")
    return best


# ─── Model training ───────────────────────────────────────────────────────────

def train(tune: bool = True):
    print("=" * 60)
    print("GoldSense - Dual Model Training")
    print("  1. Direction classifier (UP/DOWN)")
    print("  2. Magnitude regressor (log return)")
    print("=" * 60)

    # ── Build dataset ──────────────────────────────────────────────
    df = build_dataset(use_macro=True)
    feature_cols = [c for c in get_feature_columns() if c in df.columns]
    X = df[feature_cols]
    y_return = df["next_day_return"]

    # Binary direction target: 1 = UP, 0 = DOWN (exclude flat days)
    y_direction = (y_return > 0).astype(int)

    # ── Time-based train/validation split ─────────────────────────
    split_idx = len(df) - VALIDATION_DAYS
    X_train, X_val = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train_ret, y_val_ret = y_return.iloc[:split_idx], y_return.iloc[split_idx:]
    y_train_dir, y_val_dir = y_direction.iloc[:split_idx], y_direction.iloc[split_idx:]

    train_dates = df["Date"].iloc[:split_idx]
    val_dates   = df["Date"].iloc[split_idx:]

    print(f"\nTrain: {train_dates.iloc[0].date()} -> {train_dates.iloc[-1].date()} ({len(X_train)} rows)")
    print(f"Valid: {val_dates.iloc[0].date()} -> {val_dates.iloc[-1].date()} ({len(X_val)} rows)")
    print(f"Features: {len(feature_cols)} (macro: {any(c.startswith(('dxy','vix','tnx','oil')) for c in feature_cols)})")
    print(f"Target distribution: UP={y_train_dir.sum()}/{len(y_train_dir)} ({y_train_dir.mean()*100:.1f}%)")

    # ══════════════════════════════════════════════════════════════
    # MODEL 1: DIRECTION CLASSIFIER (primary — most actionable)
    # ══════════════════════════════════════════════════════════════
    print(f"\n{'-' * 50}")
    print("Training Direction Classifier (XGBClassifier)...")
    print(f"{'-' * 50}")

    if tune:
        print(f"  Running Optuna search ({N_OPTUNA_TRIALS} trials)...")
        dir_params = tune_direction_model(X_train, y_train_dir, n_trials=N_OPTUNA_TRIALS)
    else:
        dir_params = {
            "n_estimators": 300, "max_depth": 4, "learning_rate": 0.02,
            "subsample": 0.7, "colsample_bytree": 0.6,
            "min_child_weight": 20, "gamma": 0.5,
            "reg_alpha": 1.0, "reg_lambda": 3.0,
            "scale_pos_weight": 1.0,
            "objective": "binary:logistic", "eval_metric": "logloss",
        }

    # Walk-forward CV for direction model
    print(f"\n  Running {N_CV_FOLDS}-fold walk-forward CV for direction model...")
    dir_cv = walk_forward_cv_classifier(X_train, y_train_dir, dir_params)
    print(f"  CV Direction Accuracy: {dir_cv['cv_dir_accuracy']:.1f}% (+/-{dir_cv['cv_dir_std']:.1f}%)")

    # Train final direction model
    dir_model = XGBClassifier(**dir_params, random_state=42, n_jobs=-1, use_label_encoder=False)
    dir_model.fit(X_train, y_train_dir, eval_set=[(X_val, y_val_dir)], verbose=False)

    dir_val_preds = dir_model.predict(X_val)
    dir_val_acc = float(accuracy_score(y_val_dir, dir_val_preds)) * 100
    dir_val_proba = dir_model.predict_proba(X_val)[:, 1]

    print(f"\n  Hold-out Direction Accuracy: {dir_val_acc:.1f}%")
    print(f"  (baseline = {max(y_val_dir.mean(), 1-y_val_dir.mean())*100:.1f}% by always predicting majority class)")

    # ══════════════════════════════════════════════════════════════
    # MODEL 2: MAGNITUDE REGRESSOR (for price level estimation)
    # ══════════════════════════════════════════════════════════════
    print(f"\n{'-' * 50}")
    print("Training Magnitude Regressor (XGBRegressor)...")
    print(f"{'-' * 50}")

    if tune:
        print(f"  Running Optuna search ({N_OPTUNA_TRIALS} trials)...")
        best_params = tune_hyperparams(X_train, y_train_ret, n_trials=N_OPTUNA_TRIALS)
    else:
        best_params = {
            "n_estimators": 500, "max_depth": 4, "learning_rate": 0.01,
            "subsample": 0.7, "colsample_bytree": 0.5,
            "min_child_weight": 20, "gamma": 0.5,
            "reg_alpha": 1.0, "reg_lambda": 3.0,
        }

    # Walk-forward CV for regression model
    print(f"\n  Running {N_CV_FOLDS}-fold walk-forward CV for regression model...")
    reg_cv_params = {**best_params}
    cv_results = walk_forward_cv(X_train, y_train_ret, reg_cv_params, n_splits=N_CV_FOLDS)
    print(f"  CV MAPE: {cv_results['cv_mape']:.2f}% | CV Direction: {cv_results['cv_dir_accuracy']:.1f}%")

    # Train final regression model (no early stopping — let it train fully)
    print("\n  Training final regression model...")
    model = XGBRegressor(**best_params, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train_ret)

    # ── Train quantile models for confidence intervals ─────────────
    print("  Training quantile models (q=0.10 and q=0.90)...")
    q_params = {**best_params}
    # Reduce estimators for quantile to avoid overfitting
    q_params["n_estimators"] = min(q_params.get("n_estimators", 500), 500)

    model_q10 = XGBRegressor(
        **q_params,
        objective="reg:quantileerror",
        quantile_alpha=0.10,
        random_state=42, n_jobs=-1,
    )
    model_q10.fit(X_train, y_train_ret)

    model_q90 = XGBRegressor(
        **q_params,
        objective="reg:quantileerror",
        quantile_alpha=0.90,
        random_state=42, n_jobs=-1,
    )
    model_q90.fit(X_train, y_train_ret)

    # ── Validation metrics on hold-out set ────────────────────────
    val_preds = model.predict(X_val)
    val_current = df["Price"].iloc[split_idx:split_idx + len(y_val_ret)].values
    pred_next   = val_current * np.exp(val_preds)
    actual_next = val_current * np.exp(y_val_ret.values)

    rmse = float(np.sqrt(mean_squared_error(actual_next, pred_next)))
    mae  = float(mean_absolute_error(actual_next, pred_next))
    mape = float(np.mean(np.abs((actual_next - pred_next) / actual_next)) * 100)

    # Use direction classifier's accuracy (primary metric)
    reg_dir = np.sign(val_preds)
    actual_dir = np.sign(y_val_ret.values)
    non_flat = actual_dir != 0
    reg_dir_acc = float(np.mean(actual_dir[non_flat] == reg_dir[non_flat]) * 100) if non_flat.any() else 0.0

    # Quantile coverage check
    q10_preds = val_current * np.exp(model_q10.predict(X_val))
    q90_preds = val_current * np.exp(model_q90.predict(X_val))
    coverage  = float(np.mean((actual_next >= q10_preds) & (actual_next <= q90_preds)) * 100)

    print(f"\n{'=' * 55}")
    print(f"  FINAL RESULTS (Hold-out: last {VALIDATION_DAYS} days)")
    print(f"{'=' * 55}")
    print(f"\n  Direction Classifier:")
    print(f"    Hold-out accuracy:    {dir_val_acc:.1f}%")
    print(f"    CV accuracy:          {dir_cv['cv_dir_accuracy']:.1f}% (+/-{dir_cv['cv_dir_std']:.1f}%)")
    print(f"\n  Regression Model:")
    print(f"    RMSE:                 ${rmse:.2f}")
    print(f"    MAE:                  ${mae:.2f}")
    print(f"    MAPE:                 {mape:.2f}%")
    print(f"    Reg direction acc:    {reg_dir_acc:.1f}%")
    print(f"    Interval Coverage:    {coverage:.1f}% (target >=80%)")
    print(f"{'=' * 55}")

    # ── Feature importance (from direction model — most meaningful) ──
    dir_importance = dict(zip(feature_cols, dir_model.feature_importances_.tolist()))
    top_features = sorted(dir_importance.items(), key=lambda x: x[1], reverse=True)[:15]
    print("\nTop 15 Important Features (Direction Model):")
    for feat, imp in top_features:
        print(f"  {feat:<38} {imp:.4f}")

    # ── Save models ───────────────────────────────────────────────
    joblib.dump(model,     MODEL_PATH)
    joblib.dump(model_q10, MODEL_Q10_PATH)
    joblib.dump(model_q90, MODEL_Q90_PATH)
    joblib.dump(dir_model, DIR_MODEL_PATH)
    print(f"\nModels saved: {MODEL_PATH.name}, {MODEL_Q10_PATH.name}, {MODEL_Q90_PATH.name}, {DIR_MODEL_PATH.name}")

    # ── Save metadata ─────────────────────────────────────────────
    metadata = {
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "training_rows": len(X_train),
        "validation_rows": len(X_val),
        "train_date_range": {
            "start": str(train_dates.iloc[0].date()),
            "end":   str(train_dates.iloc[-1].date()),
        },
        "val_date_range": {
            "start": str(val_dates.iloc[0].date()),
            "end":   str(val_dates.iloc[-1].date()),
        },
        "metrics": {
            "rmse": rmse,
            "mae":  mae,
            "mape": mape,
            "direction_accuracy_pct": dir_val_acc,
            "direction_cv_accuracy_pct": dir_cv["cv_dir_accuracy"],
            "regression_direction_pct": reg_dir_acc,
            "interval_coverage_pct": coverage,
        },
        "cv_metrics": cv_results,
        "direction_cv_metrics": dir_cv,
        "model_params": best_params,
        "direction_model_params": dir_params,
        "hyperparameter_tuning": "optuna" if tune else "default",
        "optuna_trials": N_OPTUNA_TRIALS if tune else 0,
        "training_target": "log_return",
        "has_direction_model": True,
        "macro_features": any(c.startswith(("dxy", "vix", "tnx", "oil")) for c in feature_cols),
        "features": feature_cols,
        "top_features": [f[0] for f in top_features],
        "quantile_models": {
            "q10": str(MODEL_Q10_PATH.name),
            "q90": str(MODEL_Q90_PATH.name),
        },
        "direction_model": str(DIR_MODEL_PATH.name),
    }

    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata saved: {METADATA_PATH}")

    return model, dir_model, metadata


if __name__ == "__main__":
    tune_flag = "--no-tune" not in sys.argv
    model, dir_model, metadata = train(tune=tune_flag)
    m = metadata["metrics"]
    dcv = metadata.get("direction_cv_metrics", {})
    print(f"\nTraining complete!")
    print(f"  Direction accuracy: {m['direction_accuracy_pct']:.1f}% (CV: {dcv.get('cv_dir_accuracy',0):.1f}%)")
    print(f"  Regression: RMSE=${m['rmse']:.2f} | MAPE={m['mape']:.2f}%")
    print(f"  Interval Coverage: {m.get('interval_coverage_pct',0):.1f}% (q10-q90)")
