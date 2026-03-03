"""
GoldSense Backend — Prediction Router
Public endpoints for gold price predictions and accuracy logs.
"""

from fastapi import APIRouter, Query, HTTPException
from app.services.gold_service import GoldService

router = APIRouter()


@router.get("/tomorrow")
async def get_tomorrow_prediction():
    """
    Get tomorrow's gold price prediction.

    Returns USD price, India 24k/22k prices (per gram and per 10g),
    trend direction, and model accuracy metrics.
    """
    try:
        return GoldService.get_tomorrow_prediction()
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Model not ready: {str(e)}. Please wait for the model to be trained."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@router.get("/week")
async def get_week_forecast():
    """
    Get 7-day gold price forecast.

    Returns array of daily predictions with USD price and India INR conversions.
    Uses recursive multi-step XGBoost forecasting.
    """
    try:
        forecast = GoldService.get_week_forecast()
        return {"forecast": forecast}
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=f"Model not ready: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast error: {str(e)}")


@router.get("/accuracy")
async def get_accuracy_logs(limit: int = Query(default=30, ge=1, le=100)):
    """
    Get recent prediction accuracy logs.

    Returns comparison of predicted vs actual prices with error metrics.
    """
    try:
        logs = GoldService.get_accuracy_logs(limit=limit)
        return {"logs": logs, "count": len(logs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not load accuracy logs: {str(e)}")


@router.get("/model-info")
async def get_model_info():
    """Get model training metadata (training date, RMSE, MAE, feature list)."""
    info = GoldService.get_model_info()
    if not info:
        return {"status": "not_trained", "message": "Model has not been trained yet"}
    return info
