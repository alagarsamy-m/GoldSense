"""
GoldSense Backend — Gold Prediction Service
Interfaces with the ML pipeline to serve predictions.
"""

import sys
import json
import logging
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Add ml/ directory to path so we can import from it
ML_DIR = Path(__file__).parent.parent.parent.parent / "ml"
sys.path.insert(0, str(ML_DIR))

from app.config import settings

# Prediction cache TTL in seconds (15 minutes)
PREDICTION_CACHE_TTL = 900
TODAY_PRICE_CACHE_TTL = 5


class GoldService:
    _model      = None
    _model_q10  = None
    _model_q90  = None
    _dir_model  = None
    _metadata: dict = {}
    _df = None  # Cached dataset

    # Prediction result caches with timestamps
    _tomorrow_cache: dict = None
    _tomorrow_cache_time: float = 0
    _week_cache: list = None
    _week_cache_time: float = 0
    _today_cache: dict = None
    _today_cache_time: float = 0
    _sentiment_cache: dict = None
    _sentiment_cache_time: float = 0

    @classmethod
    def preload(cls):
        """Preload model, quantile models, and dataset on startup."""
        import joblib
        from preprocess import build_dataset

        model_path = Path(settings.model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")

        cls._model = joblib.load(model_path)
        logger.info(f"Model loaded from {model_path}")

        # Load quantile models if available
        q10_path = model_path.parent / "gold_model_q10.pkl"
        q90_path = model_path.parent / "gold_model_q90.pkl"
        if q10_path.exists() and q90_path.exists():
            cls._model_q10 = joblib.load(q10_path)
            cls._model_q90 = joblib.load(q90_path)
            logger.info("Quantile models (q10, q90) loaded")

        # Load direction classifier if available
        dir_path = model_path.parent / "gold_direction_model.pkl"
        if dir_path.exists():
            cls._dir_model = joblib.load(dir_path)
            logger.info("Direction classifier loaded")

        metadata_path = Path(settings.metadata_path)
        if metadata_path.exists():
            with open(metadata_path) as f:
                cls._metadata = json.load(f)
            cls._metadata["loaded"] = True

        cls._df = build_dataset(drop_target_na=False)
        logger.info(f"Dataset loaded: {len(cls._df)} rows")

    @classmethod
    def _ensure_loaded(cls):
        if cls._model is None:
            cls.preload()

    @classmethod
    def get_model_info(cls) -> dict:
        if not cls._metadata:
            try:
                metadata_path = Path(settings.metadata_path)
                if metadata_path.exists():
                    with open(metadata_path) as f:
                        cls._metadata = json.load(f)
                    cls._metadata["loaded"] = cls._model is not None
            except Exception:
                pass
        return cls._metadata

    @classmethod
    def _get_feature_cols(cls) -> list:
        """Get feature columns from saved metadata (most reliable source at inference time)."""
        meta = cls.get_model_info()
        saved_features = meta.get("features", [])
        if saved_features:
            return [c for c in saved_features if c in cls._df.columns]
        # Fallback: derive from preprocess if metadata missing
        from preprocess import get_feature_columns
        return [c for c in get_feature_columns() if c in cls._df.columns]

    @classmethod
    def get_tomorrow_prediction(cls) -> dict:
        """Return tomorrow's gold price prediction with confidence intervals. Cached for 15 min."""
        now = time.time()
        if cls._tomorrow_cache and (now - cls._tomorrow_cache_time) < PREDICTION_CACHE_TTL:
            return cls._tomorrow_cache

        cls._ensure_loaded()

        from predict import predict_tomorrow

        meta = cls.get_model_info()
        feature_cols = cls._get_feature_cols()
        result = predict_tomorrow(
            cls._df, cls._model, feature_cols, meta,
            cls._model_q10, cls._model_q90, cls._dir_model,
        )

        metrics = meta.get("metrics", {})
        result["model_rmse"]               = metrics.get("rmse", 0)
        result["model_mae"]                = metrics.get("mae", 0)
        result["model_mape"]               = metrics.get("mape", 0)
        result["model_direction_accuracy"] = metrics.get("direction_accuracy_pct", 0)
        result["model_cv_direction_accuracy"] = meta.get("direction_cv_metrics", {}).get("cv_dir_accuracy", 0)
        result["macro_features_active"]    = meta.get("macro_features", False)

        cls._tomorrow_cache = result
        cls._tomorrow_cache_time = now
        return result

    @classmethod
    def get_week_forecast(cls) -> list:
        """Return 7-day price forecast with per-day confidence intervals. Cached for 15 min."""
        now = time.time()
        if cls._week_cache and (now - cls._week_cache_time) < PREDICTION_CACHE_TTL:
            return cls._week_cache

        cls._ensure_loaded()

        from predict import predict_week

        meta = cls.get_model_info()
        feature_cols = cls._get_feature_cols()
        result = predict_week(
            cls._df, cls._model, feature_cols, meta,
            cls._model_q10, cls._model_q90,
        )

        cls._week_cache = result
        cls._week_cache_time = now
        return result

    @classmethod
    def _load_logs_frame(cls):
        import pandas as pd

        logs_path = Path(settings.logs_csv_path)
        if not logs_path.exists():
            return pd.DataFrame()

        df = pd.read_csv(logs_path)
        if df.empty:
            return df

        for column in ("target_date", "predicted_on", "horizon", "created_at", "status"):
            if column not in df.columns:
                df[column] = ""

        df = df.drop_duplicates(subset=["target_date", "predicted_on", "horizon"], keep="last")
        return df

    @staticmethod
    def _horizon_rank(value: str) -> int:
        try:
            return int(str(value).upper().replace("D", ""))
        except (TypeError, ValueError):
            return 99

    @classmethod
    def _canonical_accuracy_view(cls, df):
        import pandas as pd

        if df.empty:
            return df

        work = df.copy()
        work["target_date"] = pd.to_datetime(work["target_date"], errors="coerce")
        work["predicted_on"] = work["predicted_on"].astype(str)
        work["created_at"] = pd.to_datetime(work["created_at"], errors="coerce")
        work["_horizon_rank"] = work["horizon"].apply(cls._horizon_rank)
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

    @classmethod
    def get_accuracy_logs(cls, limit: int = 30, horizon: Optional[str] = None) -> list:
        """Return recent prediction accuracy logs."""
        df = cls._load_logs_frame()
        if df.empty:
            return []

        if horizon:
            df = df[df["horizon"].astype(str) == str(horizon)]
            sort_column = "target_date" if "target_date" in df.columns else "prediction_date"
            df = df.sort_values(sort_column, ascending=False).head(limit)
        else:
            df = cls._canonical_accuracy_view(df).head(limit)

        return df.fillna("").to_dict(orient="records")

    @classmethod
    def get_accuracy_payload(cls, limit: int = 5000, horizon: Optional[str] = None) -> dict:
        df = cls._load_logs_frame()
        if df.empty:
            return {"latest_7": [], "full_history": [], "count": 0}

        if horizon:
            work = df[df["horizon"].astype(str) == str(horizon)].copy()
            sort_column = "target_date" if "target_date" in work.columns else "prediction_date"
            work = work.sort_values(sort_column, ascending=False)
        else:
            work = cls._canonical_accuracy_view(df)

        work = work.head(limit).fillna("")
        records = work.to_dict(orient="records")
        return {
            "latest_7": records[:7],
            "full_history": records,
            "rows": records,
            "count": len(records),
            "horizon": horizon,
        }

    @classmethod
    def get_today_price(cls) -> dict:
        """Return today's live or delayed gold price with a short cache."""
        now = time.time()
        if cls._today_cache and (now - cls._today_cache_time) < TODAY_PRICE_CACHE_TTL:
            return cls._today_cache

        from predict import get_today_live_price
        result = get_today_live_price()
        if not result:
            raise Exception("Unable to fetch today's market price from the live provider stack")
        cls._today_cache = result
        cls._today_cache_time = now
        return result

    @classmethod
    def get_sentiment(cls, force_refresh: bool = False) -> dict:
        """
        Return current gold market news sentiment from global sources.
        Reads ALPHAVANTAGE_KEY and NEWSAPI_KEY from environment if set.
        Falls back to free RSS feeds (Google News, Yahoo Finance) with VADER scoring.
        """
        from sentiment_service import get_gold_sentiment
        import os
        return get_gold_sentiment(
            alpha_vantage_key=os.environ.get("ALPHAVANTAGE_KEY", ""),
            newsapi_key=os.environ.get("NEWSAPI_KEY", ""),
            force_refresh=force_refresh,
        )

    @classmethod
    def get_system_status(cls) -> dict:
        """Return MLOps system status: pipeline health, accuracy trends, drift, insights."""
        status_path = Path(settings.model_path).parent / "system_status.json"
        if status_path.exists():
            with open(status_path) as f:
                status = json.load(f)
        else:
            status = {"pipeline": "no_data", "message": "No evaluation has run yet"}

        # Enrich with model metadata
        meta = cls.get_model_info()
        status["model"] = {
            "trained_at": meta.get("trained_at"),
            "has_direction_model": meta.get("has_direction_model", False),
            "macro_features": meta.get("macro_features", False),
            "mape": meta.get("metrics", {}).get("mape"),
            "direction_accuracy": meta.get("metrics", {}).get("direction_accuracy_pct"),
        }

        return status

    @classmethod
    def reload_dataset(cls):
        """Reload dataset from disk (called after data update)."""
        from preprocess import build_dataset
        cls._df = build_dataset(drop_target_na=False)
        logger.info(f"Dataset reloaded: {len(cls._df)} rows")
