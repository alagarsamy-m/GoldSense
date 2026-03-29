"""
GoldSense Backend — Prediction Router
Public endpoints for gold price predictions and accuracy logs.
"""

import asyncio
import logging
from fastapi import APIRouter, Query, HTTPException
from app.services.gold_service import GoldService
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/today")
async def get_today_price():
    """
    Get today's live gold price from Yahoo Finance (GC=F + USDINR=X).

    Returns current USD price, India 24k/22k prices (per gram and per 10g),
    USD/INR rate, and today's date.
    """
    try:
        return await asyncio.to_thread(GoldService.get_today_price)
    except Exception as e:
        logger.error(f"Live price fetch failed: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="Unable to fetch live gold price. Please try again later.")


@router.get("/tomorrow")
async def get_tomorrow_prediction():
    """
    Get tomorrow's gold price prediction.

    Returns USD price, India 24k/22k prices (per gram and per 10g),
    trend direction, and model accuracy metrics.
    """
    try:
        return await asyncio.to_thread(GoldService.get_tomorrow_prediction)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="Model is not ready yet. Please wait for the model to be trained."
        )
    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unable to generate prediction. Please try again later.")


@router.get("/week")
async def get_week_forecast():
    """
    Get 7-day gold price forecast.

    Returns array of daily predictions with USD price and India INR conversions.
    Uses recursive multi-step XGBoost forecasting.
    """
    try:
        forecast = await asyncio.to_thread(GoldService.get_week_forecast)
        return {"forecast": forecast}
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Model is not ready yet. Please wait for the model to be trained.")
    except Exception as e:
        logger.error(f"Forecast failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unable to generate forecast. Please try again later.")


@router.get("/accuracy")
async def get_accuracy_logs(limit: int = Query(default=30, ge=1, le=100)):
    """
    Get recent prediction accuracy logs.

    Returns comparison of predicted vs actual prices with error metrics.
    """
    try:
        logs = await asyncio.to_thread(GoldService.get_accuracy_logs, limit)
        return {"logs": logs, "count": len(logs)}
    except Exception as e:
        logger.error(f"Accuracy logs fetch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unable to load accuracy logs.")


@router.get("/status")
async def get_system_status():
    """
    Get MLOps system health: pipeline status, accuracy trends, drift detection,
    error pattern insights, and model metadata.

    Used by the frontend to show the system health dashboard.
    """
    try:
        return await asyncio.to_thread(GoldService.get_system_status)
    except Exception as e:
        logger.error(f"System status fetch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unable to fetch system status.")


@router.get("/model-info")
async def get_model_info():
    """Get model training metadata (training date, RMSE, MAE, feature list)."""
    info = GoldService.get_model_info()
    if not info:
        return {"status": "not_trained", "message": "Model has not been trained yet"}
    return info


@router.get("/sentiment")
async def get_market_sentiment(refresh: bool = Query(default=False)):
    """
    Get current global gold market sentiment from real-time news.

    Aggregates headlines from Alpha Vantage / NewsAPI / Google News RSS
    and scores them with VADER sentiment analysis.

    Returns:
    - score: float -1.0 (very bearish) to +1.0 (very bullish)
    - label: Bullish | Neutral | Bearish
    - confidence: high | medium | low
    - article_count: number of articles analysed
    - top_headlines: top 5 gold-relevant news items with individual scores
    - source: which data source was used (alpha_vantage / newsapi / rss)

    Set env vars ALPHAVANTAGE_KEY or NEWSAPI_KEY for richer data.
    Falls back to free RSS feeds (no key needed).
    """
    try:
        return await asyncio.to_thread(GoldService.get_sentiment, refresh)
    except Exception as e:
        logger.error(f"Sentiment fetch failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Unable to fetch market sentiment. Please try again later.")
