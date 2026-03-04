"""
GoldSense Backend — Gold Prediction Service
Interfaces with the ML pipeline to serve predictions.
"""

import sys
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Add ml/ directory to path so we can import from it
ML_DIR = Path(__file__).parent.parent.parent.parent / "ml"
sys.path.insert(0, str(ML_DIR))

from app.config import settings


class GoldService:
    _model = None
    _metadata: dict = {}
    _df = None  # Cached dataset

    @classmethod
    def preload(cls):
        """Preload model and dataset on startup."""
        import joblib
        from preprocess import build_dataset

        model_path = Path(settings.model_path)
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")

        cls._model = joblib.load(model_path)
        logger.info(f"Model loaded from {model_path}")

        metadata_path = Path(settings.metadata_path)
        if metadata_path.exists():
            with open(metadata_path) as f:
                cls._metadata = json.load(f)
            cls._metadata["loaded"] = True

        cls._df = build_dataset()
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
        """Return tomorrow's gold price prediction with India conversions."""
        cls._ensure_loaded()

        from predict import predict_tomorrow

        meta = cls.get_model_info()
        feature_cols = cls._get_feature_cols()
        result = predict_tomorrow(cls._df, cls._model, feature_cols, meta)

        result["model_rmse"] = meta.get("metrics", {}).get("rmse", 0)
        result["model_mae"] = meta.get("metrics", {}).get("mae", 0)
        result["model_mape"] = meta.get("metrics", {}).get("mape", 0)
        result["model_direction_accuracy"] = meta.get("metrics", {}).get("direction_accuracy_pct", 0)

        return result

    @classmethod
    def get_week_forecast(cls) -> list:
        """Return 7-day price forecast."""
        cls._ensure_loaded()

        from predict import predict_week

        meta = cls.get_model_info()
        feature_cols = cls._get_feature_cols()
        return predict_week(cls._df, cls._model, feature_cols, meta)

    @classmethod
    def get_accuracy_logs(cls, limit: int = 30) -> list:
        """Return recent prediction accuracy logs."""
        import pandas as pd

        logs_path = Path(settings.logs_csv_path)
        if not logs_path.exists():
            return []

        df = pd.read_csv(logs_path)
        df = df.sort_values("prediction_date", ascending=False).head(limit)

        return df.to_dict(orient="records")

    @classmethod
    def get_today_price(cls) -> dict:
        """Return today's live gold price fetched from Yahoo Finance."""
        from predict import get_today_live_price
        result = get_today_live_price()
        if not result:
            raise Exception("Unable to fetch live gold price from Yahoo Finance")
        return result

    @classmethod
    def reload_dataset(cls):
        """Reload dataset from disk (called after data update)."""
        from preprocess import build_dataset
        cls._df = build_dataset()
        logger.info(f"Dataset reloaded: {len(cls._df)} rows")
