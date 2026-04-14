"""
GoldSense Backend — User Router
Protected endpoints for user profile and personalized recommendations.
"""

import asyncio
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from app.services.supabase_service import get_current_user, UserProfileService, PushSubscriptionService
from app.services.groq_service import get_investment_recommendation
from app.services.gold_service import GoldService

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    city: Optional[str] = "Mumbai"
    gold_holdings_grams: Optional[float] = Field(None, ge=0)
    gold_holdings_value_inr: Optional[float] = Field(None, ge=0)
    monthly_budget_inr: Optional[float] = Field(None, ge=0)
    investment_goal: Optional[str] = Field(
        None, pattern="^(short_term|long_term|both)$"
    )
    risk_appetite: Optional[str] = Field(
        None, pattern="^(conservative|moderate|aggressive)$"
    )
    preferred_gold_forms: Optional[List[str]] = None
    target_savings_inr: Optional[float] = Field(None, ge=0)
    profile_complete: Optional[bool] = None


class PushSubscriptionUpsert(BaseModel):
    fcm_token: str = Field(..., min_length=20)
    enabled: bool = True
    device_label: Optional[str] = None
    browser: Optional[str] = None
    notification_time_utc: Optional[str] = "03:00"


class PushSubscriptionDelete(BaseModel):
    fcm_token: str = Field(..., min_length=20)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get the authenticated user's investment profile."""
    profile = UserProfileService.get_profile(current_user["id"])
    if not profile:
        # Return empty profile template
        return {
            "id": current_user["id"],
            "email": current_user["email"],
            "profile_complete": False,
        }
    return profile


@router.put("/profile")
async def update_profile(
    profile_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Create or update the authenticated user's investment profile."""
    update_dict = profile_data.model_dump(exclude_none=True)

    # Mark profile as complete only when ALL required fields are actually present
    # (either in this update or already saved in DB — fetch existing once, not per field)
    required_fields = ["investment_goal", "risk_appetite", "monthly_budget_inr"]
    existing = UserProfileService.get_profile(current_user["id"]) or {}
    if all(update_dict.get(f) or existing.get(f) for f in required_fields):
        update_dict["profile_complete"] = True

    updated = UserProfileService.upsert_profile(current_user["id"], update_dict)
    return updated


@router.get("/recommendations")
async def get_recommendations(current_user: dict = Depends(get_current_user)):
    """
    Get personalized buy/sell/hold recommendation based on:
    - Current gold price prediction
    - User's investment profile (risk appetite, budget, goal, holdings)
    Powered by Groq LLM (Llama 3.3 70B).
    """
    profile = UserProfileService.get_profile(current_user["id"])
    if not profile or not profile.get("profile_complete"):
        raise HTTPException(
            status_code=400,
            detail="Please complete your investment profile first to get personalized recommendations."
        )

    try:
        prediction = await asyncio.to_thread(GoldService.get_tomorrow_prediction)
        forecast = await asyncio.to_thread(GoldService.get_week_forecast)
        recommendation = await asyncio.to_thread(
            get_investment_recommendation, prediction, forecast, profile
        )
        return {
            "recommendation": recommendation,
            "prediction_used": {
                "date": prediction.get("prediction_date"),
                "usd": prediction.get("tomorrow_usd"),
                "trend": prediction.get("trend"),
            }
        }
    except Exception as e:
        logger.error(f"Recommendation generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Unable to generate recommendation. Please try again later."
        )


@router.get("/dashboard")
async def get_dashboard(current_user: dict = Depends(get_current_user)):
    """
    Get all dashboard data in one request:
    - User profile
    - Tomorrow's prediction (personalized context)
    - Recent accuracy logs
    """
    profile = UserProfileService.get_profile(current_user["id"])

    try:
        prediction = await asyncio.to_thread(GoldService.get_tomorrow_prediction)
        today_price = await asyncio.to_thread(GoldService.get_today_price)
        accuracy_logs = (await asyncio.to_thread(GoldService.get_accuracy_payload, 10)).get("latest_7", [])
    except Exception:
        prediction = None
        today_price = None
        accuracy_logs = []

    # Calculate portfolio value if user has holdings
    portfolio_value_inr = None
    if profile and profile.get("gold_holdings_grams") and prediction:
        grams = profile["gold_holdings_grams"]
        price_24k = prediction.get("tomorrow_price_24k_per_gram", 0)
        portfolio_value_inr = round(grams * price_24k, 2)

    return {
        "profile": profile,
        "today": today_price,
        "prediction": prediction,
        "portfolio_value_inr": portfolio_value_inr,
        "recent_accuracy": accuracy_logs,
    }


@router.get("/notifications")
async def get_notification_settings(current_user: dict = Depends(get_current_user)):
    subscriptions = PushSubscriptionService.list_user_subscriptions(current_user["id"])
    return {"subscriptions": subscriptions}


@router.post("/notifications/subscribe")
async def upsert_notification_subscription(
    payload: PushSubscriptionUpsert,
    current_user: dict = Depends(get_current_user),
):
    subscription = PushSubscriptionService.upsert_subscription(
        current_user["id"],
        payload.fcm_token,
        payload.model_dump(),
    )
    return {"subscription": subscription}


@router.delete("/notifications/subscribe")
async def disable_notification_subscription(
    payload: PushSubscriptionDelete,
    current_user: dict = Depends(get_current_user),
):
    PushSubscriptionService.disable_subscription(current_user["id"], payload.fcm_token)
    return {"message": "Notification subscription disabled"}
